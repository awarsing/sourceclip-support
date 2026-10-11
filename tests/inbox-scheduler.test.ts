import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { Pool } from 'pg'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { uuidv7 } from 'uuidv7'
import {
  scheduleInbox,
  consumeInbox,
  wakeAt,
  isQuotaExhausted,
  type WakeMessage,
  type DelayTransport,
} from '../server/lib/inbox/scheduler'
import { markCustomerRead } from '../server/lib/inbox/read'
import { inboxTick } from '../server/lib/inbox/tick'
import { staffCommand } from '../server/lib/inbox/service'
import { automaticRetryDelayMs, retryReplyEmail, deliverReplyNow } from '../server/lib/inbox/email'
import { registerEmailProvider, type SendEmailOptions } from '../server/utils/email'
import { readInbox } from '../server/lib/inbox/queries'
import { pageInput } from '../shared/inbox/schemas'

const url = process.env.DATABASE_URL ?? ''
assert.match(url, /@(?:localhost|127\.0\.0\.1):\d+\/feedlog_inbox_mvp$/)
const admin = new Pool({ connectionString: url })
const database = `feedlog_inbox_mvp_scheduler_${Date.now()}`
const target = new URL(url)
target.pathname = `/${database}`
const pool = new Pool({ connectionString: target.toString(), max: 6 })
const runtime = { pool }
const deliveries: { message: WakeMessage; seconds: number }[] = []
const emails: SendEmailOptions[] = []
let failEmail = false
let failQueue: Error | undefined
const transport: DelayTransport = {
  maxDelaySeconds: 23 * 3600,
  async send(message, seconds) {
    if (failQueue) throw failQueue
    deliveries.push({ message, seconds })
  },
}
const oldProvider = process.env.EMAIL_PROVIDER
before(async () => {
  await admin.query(`CREATE DATABASE "${database}"`)
  const connection = postgres(target.toString(), { max: 1 })
  try {
    await migrate(drizzle(connection), { migrationsFolder: 'server/db/migrations' })
  } finally {
    await connection.end()
  }
  await pool.query(`INSERT INTO organization(id,name,slug) VALUES ('org','Org','org');
    INSERT INTO "user"(id,name,email) VALUES ('customer','Customer','customer@example.invalid'),('staff','Staff','staff@example.invalid'),('owner','Owner','owner@example.invalid');
    INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES ('owner','org','owner','owner',now())`)
  registerEmailProvider({
    name: 'scheduler-test',
    async send(email) {
      emails.push(email)
      if (failEmail) throw new Error('Synthetic mail failure')
    },
  })
  process.env.EMAIL_PROVIDER = 'scheduler-test'
})
after(async () => {
  if (oldProvider === undefined) delete process.env.EMAIL_PROVIDER
  else process.env.EMAIL_PROVIDER = oldProvider
  await pool.end()
  await admin.query(`DROP DATABASE "${database}"`)
  await admin.end()
})
async function reset() {
  await pool.query(
    'DELETE FROM scheduled_task; DELETE FROM delay_message; DELETE FROM conversation_item; DELETE FROM conversation',
  )
  deliveries.length = 0
  emails.length = 0
  failEmail = false
  failQueue = undefined
}
async function task(status = 'pending', seconds = 60) {
  const id = uuidv7()
  await pool.query(
    `INSERT INTO scheduled_task(id,kind,ref_id,status,schedule_at) VALUES ($1,'inbox_due',$2,$3,now()+make_interval(secs=>$4))`,
    [id, uuidv7(), status, seconds],
  )
  return id
}
async function ageMessages() {
  await pool.query("UPDATE delay_message SET sent_at=sent_at-interval '20 seconds'")
}
async function conversation() {
  const id = uuidv7()
  await pool.query(
    "INSERT INTO conversation(id,org_id,user_id,status,last_seq) VALUES ($1,'org','customer','open',1)",
    [id],
  )
  return id
}
async function reply(id: string, text: string) {
  const {
    rows: [row],
  } = await pool.query('SELECT last_seq FROM conversation WHERE id=$1', [id])
  return staffCommand(runtime, id, 'org', 'staff', {
    action: 'reply',
    requestId: uuidv7(),
    expectedLastSeq: Number(row.last_seq),
    content: { parts: [{ type: 'text', text }] },
  })
}

test('wake rounding is never early and respects queue limits', () => {
  const now = new Date('2026-09-28T00:00:01Z')
  assert.equal(wakeAt(new Date(+now - 1), now, 82800), now)
  assert.equal(wakeAt(new Date('2026-09-28T00:05:01Z'), now, 82800).toISOString(), '2026-09-28T00:10:00.000Z')
  assert.equal(+wakeAt(new Date(+now + 40 * 86400000), now, 82800) - +now, 82800000)
  assert.equal(isQuotaExhausted({ status: 429, message: 'Too many requests' }), false)
  assert.equal(isQuotaExhausted(new Error('Daily message limit exceeded')), true)
  assert.equal(isQuotaExhausted({ code: 10253 }), true)
  assert.equal(isQuotaExhausted(new Error('FreeTierLimitExceeded')), true)
})

test('concurrent public scheduling delivers once; covered work does not change business state', async () => {
  await reset()
  await task('pending', 3600)
  await Promise.all([scheduleInbox(runtime, transport), scheduleInbox(runtime, transport)])
  assert.equal(deliveries.length, 1)
  await pool.query("UPDATE delay_message SET expect_at=now()+interval '10 minutes',sent_at=now()-interval '20 seconds'")
  assert.deepEqual(await scheduleInbox(runtime, transport), { scheduled: false, expectAt: null })
  assert.equal((await pool.query('SELECT status FROM scheduled_task')).rows[0].status, 'pending')
})

test('expired processing and invalid states force a new delivery despite coverage', async () => {
  for (const status of ['processing', 'unexpected']) {
    await reset()
    const id = await task(status, 3600)
    await pool.query("UPDATE scheduled_task SET updated_at=now()-interval '11 minutes' WHERE id=$1", [id])
    const previous = uuidv7()
    await pool.query(
      "INSERT INTO delay_message(id,expect_at,sent_at) VALUES ($1,now()+interval '1 minute',now()-interval '20 seconds')",
      [previous],
    )
    assert.equal((await scheduleInbox(runtime, transport)).scheduled, true)
    assert.equal(
      (await pool.query('SELECT status FROM delay_message WHERE id=$1', [previous])).rows[0].status,
      'cancelled',
    )
  }
})

test('quota notices go once to owners, tasks survive errors, successful delivery resets the episode', async () => {
  await reset()
  await task()
  failQueue = new Error('quota_exhausted')
  assert.equal((await scheduleInbox(runtime, transport)).scheduled, false)
  assert.equal(emails.length, 1)
  assert.equal(emails[0]!.to, 'owner@example.invalid')
  await ageMessages()
  await scheduleInbox(runtime, transport)
  assert.equal(emails.length, 1)
  assert.equal((await pool.query('SELECT status FROM scheduled_task')).rows[0].status, 'pending')
  await ageMessages()
  failQueue = undefined
  assert.equal((await scheduleInbox(runtime, transport)).scheduled, true)
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM delay_message WHERE status='quota_exhausted'")).rows[0].n,
    0,
  )
  await reset()
  await task()
  failQueue = new Error('network unavailable')
  await scheduleInbox(runtime, transport)
  assert.equal((await pool.query('SELECT status FROM delay_message')).rows[0].status, 'cancelled')
  assert.equal(emails.length, 0)
})

test('consumer processes due work, renews itself, ignores duplicate generations and never revives cancelled wakes', async () => {
  await reset()
  await task('pending', -1)
  const later = await task('pending', 3600)
  await scheduleInbox(runtime, transport)
  const original = deliveries[0]!.message
  await consumeInbox(runtime, transport, original)
  assert.equal(deliveries.length, 2)
  assert.equal((await pool.query('SELECT status FROM delay_message')).rows[0].status, 'scheduled')
  await consumeInbox(runtime, transport, original)
  assert.equal(deliveries.length, 2)
  const current = deliveries[1]!.message
  await pool.query("UPDATE delay_message SET status='cancelled'")
  await pool.query("UPDATE scheduled_task SET schedule_at=now()-interval '1 second' WHERE id=$1", [later])
  await consumeInbox(runtime, transport, current)
  assert.equal((await pool.query('SELECT status FROM delay_message')).rows[0].status, 'cancelled')
  assert.equal((await pool.query('SELECT status FROM scheduled_task WHERE id=$1', [later])).rows[0].status, 'done')
  assert.equal(deliveries.length, 2)
})

test('each reply has its own five-minute task; partial reads skip only the read reply', async () => {
  await reset()
  const id = await conversation()
  const first = await reply(id, 'First reply')
  const second = await reply(id, 'Second reply')
  const tasks = (await pool.query("SELECT * FROM scheduled_task WHERE kind='inbox_email' ORDER BY schedule_at")).rows
  assert.equal(tasks.length, 2)
  assert.equal(+new Date(tasks[0].schedule_at) - +new Date(first.item.createdAt), 300000)
  await inboxTick(runtime)
  assert.equal(emails.length, 0)
  assert.equal(await markCustomerRead(runtime, id, 'other-org', 'customer', 14, first.item.seq), undefined)
  assert.equal(await markCustomerRead(runtime, id, 'org', 'staff', 14, first.item.seq), undefined)
  assert.deepEqual(await markCustomerRead(runtime, id, 'org', 'customer', 14, first.item.seq), { cleared: false })
  await markCustomerRead(runtime, id, 'org', 'customer', 14, 1)
  assert.equal(
    Number(
      (await pool.query('SELECT customer_read_seq FROM conversation WHERE id=$1', [id])).rows[0].customer_read_seq,
    ),
    first.item.seq,
  )
  await pool.query("UPDATE scheduled_task SET schedule_at=now()-interval '1 second' WHERE kind='inbox_email'")
  await Promise.all([inboxTick(runtime), inboxTick(runtime)])
  assert.equal(emails.length, 1)
  assert.match(emails[0]!.text!, /Second reply/)
  assert.doesNotMatch(emails[0]!.text!, /First reply/)
  const detail = await readInbox(runtime, 'org', id, pageInput.parse({}))
  assert.equal(detail.emails[first.item.id].status, 'skipped')
  assert.equal(detail.emails[second.item.id].status, 'accepted')
  await inboxTick(runtime)
  assert.equal(emails.length, 1)
})

test('unread replies are never merged, and failed mail has exactly two automatic attempts plus one manual retry', async () => {
  await reset()
  const id = await conversation()
  await reply(id, 'Separate one')
  await reply(id, 'Separate two')
  await pool.query("UPDATE scheduled_task SET schedule_at=now()-interval '1 second' WHERE kind='inbox_email'")
  await inboxTick(runtime)
  assert.equal(emails.length, 2)
  assert.notEqual(emails[0]!.idempotencyKey, emails[1]!.idempotencyKey)
  const third = await reply(id, 'Retry me')
  failEmail = true
  await pool.query("UPDATE scheduled_task SET schedule_at=now()-interval '1 second' WHERE item_id=$1", [third.item.id])
  const started = Date.now()
  await inboxTick(runtime)
  assert.equal(emails.length, 4)
  assert.ok(Date.now() - started >= automaticRetryDelayMs)
  await inboxTick(runtime)
  assert.equal(emails.length, 4)
  await assert.rejects(retryReplyEmail(runtime, 'other-org', id, third.item.id))
  await retryReplyEmail(runtime, 'org', id, third.item.id)
  await assert.rejects(retryReplyEmail(runtime, 'org', id, third.item.id))
  await inboxTick(runtime)
  assert.equal(emails.length, 5)
  assert.equal(emails[2]!.idempotencyKey, emails[4]!.idempotencyKey)
  await assert.rejects(retryReplyEmail(runtime, 'org', id, third.item.id))
})

test('stale leases are recovered and fresh leases are not stolen', async () => {
  await reset()
  const id = await task('processing', -1)
  await inboxTick(runtime)
  assert.equal((await pool.query('SELECT status FROM scheduled_task WHERE id=$1', [id])).rows[0].status, 'processing')
  await pool.query("UPDATE scheduled_task SET updated_at=now()-interval '11 minutes' WHERE id=$1", [id])
  await inboxTick(runtime)
  assert.equal((await pool.query('SELECT status FROM scheduled_task WHERE id=$1', [id])).rows[0].status, 'done')
})

test('an earlier new task replaces a later wake immediately, without reposting equivalent rounded wakes', async () => {
  await reset()
  await task('pending', 3600)
  await scheduleInbox(runtime, transport)
  await scheduleInbox(runtime, transport)
  assert.equal(deliveries.length, 1)
  await task('pending', 60)
  await scheduleInbox(runtime, transport)
  assert.equal(deliveries.length, 2)
  assert.ok(deliveries[1]!.seconds < deliveries[0]!.seconds)
  await scheduleInbox(runtime, transport)
  assert.equal(deliveries.length, 2)
})

test('an HTTP schedule does not cancel or repost a wake that is already waiting', async () => {
  await reset()
  await task('pending', 3600)
  await scheduleInbox(runtime, transport, 'external')
  assert.equal(deliveries.length, 1)
  await task('pending', 60)
  await scheduleInbox(runtime, transport, 'external')
  assert.equal(deliveries.length, 1)
  await scheduleInbox(runtime, transport)
  assert.equal(deliveries.length, 2)
})

test('late wakes are reused, stalled wakes recover once, and cancelled deliveries cannot renew', async () => {
  await reset()
  await task('pending', -60)
  await scheduleInbox(runtime, transport, 'external')
  const original = deliveries[0]!.message
  for (const access of ['external', 'internal', 'external'] as const) await scheduleInbox(runtime, transport, access)
  assert.equal(deliveries.length, 1)
  await pool.query("UPDATE delay_message SET expect_at=now()-interval '11 minutes',sent_at=now()-interval '11 minutes'")
  // Keep the old delivery's generation aligned with the simulated send time.
  original.sentAt = new Date((await pool.query('SELECT sent_at FROM delay_message')).rows[0].sent_at).toISOString()
  await scheduleInbox(runtime, transport, 'external')
  await scheduleInbox(runtime, transport, 'external')
  await scheduleInbox(runtime, transport)
  assert.equal(deliveries.length, 2)
  assert.equal(
    (await pool.query('SELECT status FROM delay_message WHERE id=$1', [original.id])).rows[0].status,
    'cancelled',
  )
  await consumeInbox(runtime, transport, original)
  assert.equal(deliveries.length, 2)
  assert.equal((await pool.query('SELECT status FROM scheduled_task')).rows[0].status, 'done')
  await consumeInbox(runtime, transport, deliveries[1]!.message)
  assert.equal(
    (await pool.query('SELECT status FROM delay_message WHERE id=$1', [deliveries[1]!.message.id])).rows[0].status,
    'fired',
  )
})

test('invalid future email status cannot make a reply send early; missing email does not retry forever', async () => {
  await reset()
  const id = await conversation()
  const saved = await reply(id, 'Future reply')
  await pool.query("UPDATE scheduled_task SET status='unexpected' WHERE item_id=$1", [saved.item.id])
  await inboxTick(runtime)
  assert.equal(emails.length, 0)
  await pool.query("UPDATE scheduled_task SET schedule_at=now()-interval '1 second' WHERE item_id=$1", [saved.item.id])
  await pool.query('UPDATE "user" SET is_anonymous=true WHERE id=\'customer\'')
  try {
    await inboxTick(runtime)
    assert.equal(emails.length, 0)
    assert.equal(
      (await pool.query('SELECT result FROM scheduled_task WHERE item_id=$1', [saved.item.id])).rows[0].result,
      'unavailable',
    )
  } finally {
    await pool.query('UPDATE "user" SET is_anonymous=false WHERE id=\'customer\'')
  }
})

test('a callback arriving before the wake transaction commits retries instead of losing the task', async () => {
  await reset()
  await task('pending', -1)
  const early: DelayTransport = {
    ...transport,
    async send(message, seconds) {
      await assert.rejects(consumeInbox(runtime, transport, message), /not committed/)
      deliveries.push({ message, seconds })
    },
  }
  assert.equal((await scheduleInbox(runtime, early)).scheduled, true)
  await consumeInbox(runtime, transport, deliveries[0]!.message)
  assert.equal((await pool.query('SELECT status FROM scheduled_task')).rows[0].status, 'done')
  assert.equal((await pool.query('SELECT status FROM delay_message')).rows[0].status, 'fired')
})

test('immediate email sends even after reading, while automatic replies wait and skip read messages', async () => {
  await reset()
  const id = await conversation()
  const automatic = await reply(id, 'Automatic reply')
  const command = {
    action: 'reply' as const,
    requestId: uuidv7(),
    expectedLastSeq: automatic.item.seq,
    notifyByEmail: true,
    content: { parts: [{ type: 'text' as const, text: 'Immediate reply' }] },
  }
  const immediate = await staffCommand(runtime, id, 'org', 'staff', command)
  assert.equal((await staffCommand(runtime, id, 'org', 'staff', command)).replayed, true)
  await assert.rejects(staffCommand(runtime, id, 'org', 'staff', { ...command, notifyByEmail: false }))
  const { rows: tasks } = await pool.query(
    "SELECT delivery_mode,schedule_at<=clock_timestamp() AS due FROM scheduled_task WHERE kind='inbox_email' ORDER BY schedule_at",
  )
  assert.deepEqual(tasks, [
    { delivery_mode: 'immediate', due: true },
    { delivery_mode: 'auto', due: false },
  ])
  await markCustomerRead(runtime, id, 'org', 'customer', 14, immediate.item.seq)
  assert.equal((await deliverReplyNow(runtime, 'org', id, immediate.item.id))?.status, 'accepted')
  assert.equal(emails.length, 1)
  assert.match(emails[0]!.text!, /Immediate reply/)
  await pool.query("UPDATE scheduled_task SET schedule_at=now()-interval '1 second' WHERE kind='inbox_email'")
  await inboxTick(runtime)
  await inboxTick(runtime)
  assert.equal(emails.length, 1)
  const detail = await readInbox(runtime, 'org', id, pageInput.parse({}))
  assert.equal(detail.emails[immediate.item.id].deliveryMode, 'immediate')
  assert.equal(detail.emails[immediate.item.id].status, 'accepted')
  assert.equal(detail.emails[automatic.item.id].status, 'skipped')
})

test('immediate delivery keeps its policy through automatic and manual retries', async () => {
  await reset()
  const id = await conversation()
  const result = await staffCommand(runtime, id, 'org', 'staff', {
    action: 'reply',
    requestId: uuidv7(),
    expectedLastSeq: 1,
    notifyByEmail: true,
    content: { parts: [{ type: 'text', text: 'Immediate retry test' }] },
  })
  await markCustomerRead(runtime, id, 'org', 'customer', 14, result.item.seq)
  failEmail = true
  assert.equal((await deliverReplyNow(runtime, 'org', id, result.item.id))?.status, 'failed')
  assert.equal(emails.length, 2)
  failEmail = false
  const retry = await retryReplyEmail(runtime, 'org', id, result.item.id)
  assert.equal(retry.deliveryMode, 'immediate')
  assert.equal((await deliverReplyNow(runtime, 'org', id, result.item.id))?.status, 'accepted')
  assert.equal(emails.length, 3)
  assert.equal(emails[0]!.idempotencyKey, emails[2]!.idempotencyKey)
  await assert.rejects(retryReplyEmail(runtime, 'org', id, result.item.id))
})

test('anonymous and empty-email customers do not queue either reply email mode', async () => {
  await reset()
  try {
    for (const recipient of [
      { anonymous: true, email: 'placeholder@example.invalid' },
      { anonymous: false, email: '   ' },
    ]) {
      await pool.query('UPDATE "user" SET is_anonymous=$1,email=$2 WHERE id=\'customer\'', [
        recipient.anonymous,
        recipient.email,
      ])
      const id = await conversation()
      for (const notifyByEmail of [false, true]) {
        const {
          rows: [row],
        } = await pool.query('SELECT last_seq FROM conversation WHERE id=$1', [id])
        const saved = await staffCommand(runtime, id, 'org', 'staff', {
          action: 'reply',
          requestId: uuidv7(),
          expectedLastSeq: Number(row.last_seq),
          notifyByEmail,
          content: { parts: [{ type: 'text', text: 'Reply without a deliverable email' }] },
        })
        assert.ok(saved.item.id)
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS count FROM scheduled_task WHERE kind='inbox_email' AND item_id=$1",
              [saved.item.id],
            )
          ).rows[0].count,
          0,
        )
      }
    }
    assert.equal(emails.length, 0)
  } finally {
    await pool.query("UPDATE \"user\" SET is_anonymous=false,email='customer@example.invalid' WHERE id='customer'")
  }
})

test('reply deadlines remain 48 hours even with a stale test environment flag', async () => {
  await reset()
  const previous = process.env.NUXT_PUBLIC_INBOX_TEST_SHORT_TIMERS
  try {
    for (const enabled of [true, false]) {
      process.env.NUXT_PUBLIC_INBOX_TEST_SHORT_TIMERS = String(enabled)
      const saved = await reply(await conversation(), 'Check closing deadline')
      assert.equal(+new Date(saved.conversation.stateDueAt!) - +new Date(saved.item.createdAt), 48 * 3600000)
    }
  } finally {
    if (previous === undefined) delete process.env.NUXT_PUBLIC_INBOX_TEST_SHORT_TIMERS
    else process.env.NUXT_PUBLIC_INBOX_TEST_SHORT_TIMERS = previous
  }
})

test('Node wake resolution preserves five-minute deadlines without queue rounding', async () => {
  await reset()
  const now = new Date('2026-09-29T10:02:30.123Z')
  const due = new Date(+now + 5 * 60000)
  assert.equal(+wakeAt(due, now, 23 * 3600, 1000) - +due, 877)
  assert.equal(wakeAt(due, now, 23 * 3600).toISOString(), '2026-09-29T10:10:00.000Z')
  await task('pending', 300)
  await scheduleInbox(runtime, { ...transport, wakeResolutionMs: 1000 })
  assert.equal(deliveries.length, 1)
  assert.ok(deliveries[0]!.seconds >= 299 && deliveries[0]!.seconds <= 301)
})

test('direct delivery sends without a scheduler, respects tenancy and does not duplicate with recovery', async () => {
  await reset()
  const id = await conversation()
  const automatic = await reply(id, 'Still waits five minutes')
  assert.equal((await deliverReplyNow(runtime, 'org', id, automatic.item.id))?.status, 'pending')
  const saved = await staffCommand(runtime, id, 'org', 'staff', {
    action: 'reply',
    requestId: uuidv7(),
    expectedLastSeq: automatic.item.seq,
    notifyByEmail: true,
    content: { parts: [{ type: 'text', text: 'Direct delivery' }] },
  })
  assert.equal(await deliverReplyNow(runtime, 'other-org', id, saved.item.id), null)
  assert.equal(emails.length, 0)
  await Promise.all([
    deliverReplyNow(runtime, 'org', id, saved.item.id),
    deliverReplyNow(runtime, 'org', id, saved.item.id),
  ])
  assert.equal(emails.length, 1)
  await inboxTick(runtime)
  assert.equal((await deliverReplyNow(runtime, 'org', id, saved.item.id))?.status, 'accepted')
  assert.equal(emails.length, 1)
})

test('reply email uses preceding customer source and never copies the conversation title into its subject', async () => {
  await reset()
  const id = await conversation()
  await pool.query("UPDATE conversation SET title='Private order SYNTHETIC-123 customer@example.invalid' WHERE id=$1", [
    id,
  ])
  await pool.query(
    `INSERT INTO conversation_item(id,conversation_id,seq,author_type,author_user_id,content,context)
    VALUES($1,$2,1,'customer','customer',$3,$4)`,
    [
      uuidv7(),
      id,
      JSON.stringify({ parts: [{ type: 'text', text: 'Help with a refund' }] }),
      JSON.stringify({ origin: 'https://product.example', pathname: '/support' }),
    ],
  )
  const saved = await staffCommand(runtime, id, 'org', 'staff', {
    action: 'reply',
    requestId: uuidv7(),
    expectedLastSeq: 1,
    notifyByEmail: true,
    content: { parts: [{ type: 'text', text: 'Here is our reply' }] },
  })
  await pool.query(
    `INSERT INTO conversation_item(id,conversation_id,seq,author_type,author_user_id,content,context)
    VALUES($1,$2,3,'customer','customer',$3,$4)`,
    [
      uuidv7(),
      id,
      JSON.stringify({ parts: [{ type: 'text', text: 'Later question' }] }),
      JSON.stringify({ origin: 'https://later.example', pathname: '/other' }),
    ],
  )
  await deliverReplyNow(runtime, 'org', id, saved.item.id)
  assert.equal(emails.length, 1)
  assert.match(emails[0]!.html, /https:\/\/product.example\/support/)
  assert.doesNotMatch(emails[0]!.html, /later.example/)
  assert.doesNotMatch(emails[0]!.subject, /SYNTHETIC|customer@example|Private order/)
})
