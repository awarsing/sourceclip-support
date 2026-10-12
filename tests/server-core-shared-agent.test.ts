import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createError, getQuery, getRouterParam, type H3Event } from 'h3'
import { uuidv7 } from 'uuidv7'
import { agentRuntime, widgetActor, type Actor } from '../server/lib/agent/runtime'
import { readConversationItems } from '../server/lib/agent/history'

assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname),
  'Integration tests require a local database',
)

let signedIn: { orgId: string; userId: string } = { orgId: '', userId: '' }
Object.assign(globalThis, {
  createError,
  getQuery,
  getRouterParam,
  createDomainEvent: (input: unknown) => input,
  publishDomainEvent: () => {},
  requireAuthInOrg: async () => ({ session: { user: { id: signedIn.userId } }, orgId: signedIn.orgId }),
})

function requestEvent(path = '/', params: Record<string, string> = {}) {
  return { path, context: { params }, waitUntil: (task: Promise<unknown>) => task } as unknown as H3Event
}
const { pool, close } = agentRuntime(requestEvent())
after(close)

async function seedOrg() {
  const orgId = uuidv7()
  await pool.query('INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$2,$3,now())', [
    orgId,
    'Org',
    `org-${orgId}`,
  ])
  return orgId
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    const { statusCode, data } = error as { statusCode: number; data?: { code?: string } }
    return { statusCode, code: data?.code }
  }
  assert.fail('expected a refusal')
}

test('widget actor carries the retention setting and refuses a disabled widget', async () => {
  const orgId = await seedOrg()
  signedIn = { orgId, userId: 'visitor' }
  const actor = await widgetActor(requestEvent())
  assert.equal(actor.orgId, orgId)
  assert.equal(actor.customerId, 'visitor')
  assert.equal(actor.retentionDays, 14)

  await pool.query('INSERT INTO organization_widget (org_id,conversation_retention_days) VALUES ($1,$2)', [orgId, 7])
  assert.equal((await widgetActor(requestEvent())).retentionDays, 7)

  await pool.query('UPDATE organization_widget SET enabled=false WHERE org_id=$1', [orgId])
  assert.deepEqual(await refusal(widgetActor(requestEvent())), { statusCode: 403, code: 'widget_disabled' })
})

test('conversation items page backwards and forwards with their runs', async () => {
  const orgId = await seedOrg()
  const conversationId = uuidv7()
  const customerId = uuidv7()
  await pool.query('INSERT INTO "user" (id,name,email) VALUES ($1,$2,$3)', [
    customerId,
    'C',
    `${customerId}@example.com`,
  ])
  const actor = { orgId, customerId, retentionDays: 30 } as Actor
  const key = (id: string) => `${conversationId}:${id}`
  await pool.query('INSERT INTO conversation (id,org_id,user_id,last_seq,title,status) VALUES ($1,$2,$3,5,$4,$5)', [
    conversationId,
    orgId,
    customerId,
    'Billing',
    'ai_handling',
  ])
  const runs = { a1: uuidv7(), a2: uuidv7() }
  const items = [
    ['c1', 'customer'],
    ['a1', 'agent'],
    ['c2', 'customer'],
    ['s1', 'system'],
    ['a2', 'agent'],
  ] as const
  for (const [index, [id, author]] of items.entries()) {
    const run = author === 'agent' ? runs[id as keyof typeof runs] : null
    if (run) {
      await pool.query(
        `INSERT INTO agent_run (id,conversation_id,trigger_item_id,idempotency_key,status,deadline_at,finished_at)
        VALUES ($1,$2,$3,$4,'completed',now()+interval '1 minute',now())`,
        [run, conversationId, key(items[index - 1]![0] === 's1' ? 'c2' : items[index - 1]![0]), id],
      )
    }
    await pool.query(
      `INSERT INTO conversation_item (id,conversation_id,seq,author_type,author_user_id,content,agent_run_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        key(id),
        conversationId,
        index + 1,
        author,
        author === 'customer' ? customerId : null,
        JSON.stringify(
          author === 'system'
            ? {
                parts: [
                  { type: 'system_event', kind: 'closed', reason: 'manual', fromStatus: 'open', toStatus: 'closed' },
                ],
              }
            : { parts: [{ type: 'text', text: id }] },
        ),
        run,
      ],
    )
  }

  const read = (query: string, id: string = conversationId) =>
    readConversationItems(requestEvent(`/api/widget/conversations/${id}/items${query}`, { id }), actor)

  const latest = await read('?limit=2')
  assert.deepEqual(latest.conversation, {
    id: conversationId,
    title: 'Billing',
    lastSeq: 5,
    unread: false,
    handling: 'ai',
  })
  // The system closing event has no public form.
  assert.deepEqual(
    latest.items.map((item) => item!.id),
    [key('a2')],
  )
  assert.equal(latest.nextBeforeSeq, 4)
  assert.equal(latest.nextAfterSeq, 5)
  assert.equal(latest.hasMore, true)

  const earlier = await read('?limit=3&beforeSeq=4')
  assert.deepEqual(
    earlier.items.map((item) => item!.id),
    ['c1', 'a1', 'c2'].map(key),
  )
  assert.deepEqual(
    earlier.runs.map((run) => run.id),
    [runs.a1, runs.a2],
  )
  assert.equal(earlier.nextBeforeSeq, null)
  assert.equal(earlier.hasMore, false)

  const newer = await read('?afterSeq=3')
  assert.deepEqual(
    newer.items.map((item) => item!.id),
    [key('a2')],
  )
  assert.deepEqual(
    newer.runs.map((run) => run.id),
    [runs.a2],
  )
  assert.equal(newer.nextBeforeSeq, null)
  assert.equal(newer.nextAfterSeq, 5)
  const none = await read('?afterSeq=5')
  assert.deepEqual(none.items, [])
  assert.equal(none.nextAfterSeq, 5)
  const empty = await read('?beforeSeq=1')
  assert.equal(empty.nextAfterSeq, 5)

  assert.deepEqual(await refusal(read('', 'not-a-uuid')), { statusCode: 404, code: 'conversation_not_found' })
  assert.deepEqual(await refusal(read('?limit=0')), { statusCode: 422, code: 'invalid_message' })
  assert.deepEqual(await refusal(read('', uuidv7())), { statusCode: 404, code: 'conversation_not_found' })
  assert.deepEqual(
    await refusal(
      readConversationItems(requestEvent('/items', { id: conversationId }), { ...actor, customerId: 'someone-else' }),
    ),
    { statusCode: 404, code: 'conversation_not_found' },
  )
})
