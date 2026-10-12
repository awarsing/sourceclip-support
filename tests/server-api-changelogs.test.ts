import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import * as schema from '../server/db/schemas/index'
import { createOrg, createPost, db, loadHandler, serve } from './server-api-harness'

const THUMBS_UP = '\u{1F44D}'
const PARTY = '\u{1F389}'

async function changelogRoutes() {
  return serve({
    'GET /api/changelogs': await loadHandler('changelogs/index.get'),
    'GET /api/changelogs/:slug': await loadHandler('changelogs/[slug].get'),
    'POST /api/changelogs/:id/reactions': await loadHandler('changelogs/[id]/reactions.post'),
    'DELETE /api/changelogs/:id/reactions': await loadHandler('changelogs/[id]/reactions.delete'),
    'GET /api/admin/changelogs': await loadHandler('admin/changelogs/index.get'),
    'PATCH /api/admin/changelogs/:id': await loadHandler('admin/changelogs/[id].patch'),
    'POST /api/admin/changelogs/:id/publish': await loadHandler('admin/changelogs/[id]/publish.post'),
    'DELETE /api/admin/changelogs/:id': await loadHandler('admin/changelogs/[id].delete'),
    'POST /api/admin/changelogs/ai/generate': await loadHandler('admin/changelogs/ai/generate.post'),
  })
}

async function addChangelog(
  orgId: string,
  authorId: string,
  values: Partial<typeof schema.changelog.$inferInsert> = {},
) {
  const id = uuidv7()
  const [row] = await db
    .insert(schema.changelog)
    .values({ orgId, authorId, slug: `log-${id}`, title: `Title ${id}`, content: `Content ${id}`, ...values, id })
    .returning()
  return row!
}

function published(at: string, title: string) {
  return {
    status: 'published',
    publishedAt: new Date(at),
    publishedTitle: title,
    publishedContent: `${title} body`,
    publishedCategories: ['new'],
  }
}

test('visitors page published changelogs and react to them; drafts stay hidden', async () => {
  const call = await changelogRoutes()
  const { orgId, people, token } = await createOrg()
  const older = await addChangelog(orgId, people.owner.user.id, published('2026-02-01', 'Older'))
  const newer = await addChangelog(orgId, people.owner.user.id, { ...published('2026-03-01', 'Newer'), cover: null })
  const draft = await addChangelog(orgId, people.owner.user.id)
  const react = (method: string, who: Parameters<typeof token>[0], id: string, emoji = THUMBS_UP) =>
    method === 'POST'
      ? call(`/api/changelogs/${id}/reactions`, { method, org: orgId, session: token(who), body: { emoji } })
      : call(`/api/changelogs/${id}/reactions?emoji=${encodeURIComponent(emoji)}`, {
          method,
          org: orgId,
          session: token(who),
        })

  assert.deepEqual((await react('POST', 'user', newer.id)).body, {
    reacted: true,
    reactionCounts: { [THUMBS_UP]: 1 },
    userReactions: [THUMBS_UP],
  })
  await react('POST', 'user', newer.id)
  await react('POST', 'owner', newer.id)
  await react('POST', 'owner', newer.id, PARTY)
  assert.equal((await react('POST', 'user', draft.id)).status, 404)
  assert.equal((await react('DELETE', 'user', newer.id, 'nope')).status, 400)

  const page1 = await call('/api/changelogs?pageSize=1', { org: orgId, session: token('owner') })
  assert.deepEqual(
    page1.body.data.map((c: { id: string }) => c.id),
    [newer.id],
  )
  assert.deepEqual(page1.body.data[0].reactionCounts, { [THUMBS_UP]: 2, [PARTY]: 1 })
  assert.deepEqual(page1.body.data[0].userReactions.sort(), [PARTY, THUMBS_UP].sort())
  assert.equal(page1.body.data[0].title, 'Newer')
  assert.deepEqual(page1.body.data[0].categories, ['new'])
  const page2 = await call(`/api/changelogs?pageSize=1&cursor=${page1.body.pagination.nextCursor}`, { org: orgId })
  assert.deepEqual(
    page2.body.data.map((c: { id: string; userReactions: string[] }) => [c.id, c.userReactions]),
    [[older.id, []]],
  )
  assert.equal(page2.body.pagination.nextCursor, null)

  const detail = await call(`/api/changelogs/${newer.slug}`, { org: orgId })
  assert.equal(detail.body.content, 'Newer body')
  assert.deepEqual(detail.body.userReactions, [])
  assert.equal(detail.body.publishedAt, '2026-03-01T00:00:00.000Z')
  assert.equal((await call(`/api/changelogs/${draft.slug}`, { org: orgId })).status, 404)

  assert.deepEqual((await react('DELETE', 'user', newer.id)).body, {
    reacted: false,
    reactionCounts: { [THUMBS_UP]: 1, [PARTY]: 1 },
    userReactions: [],
  })
  assert.equal((await react('DELETE', 'user', draft.id)).status, 404)
})

test('moderators list, edit, publish and delete changelogs', async () => {
  const call = await changelogRoutes()
  const { orgId, people, token } = await createOrg()
  const live = await addChangelog(orgId, people.owner.user.id, {
    ...published('2026-01-01', 'Live'),
    title: 'Dark mode arrives',
    content: 'Switch themes',
    updatedAt: new Date('2026-01-02'),
  })
  const draft = await addChangelog(orgId, people.manager.user.id, {
    title: 'Faster search',
    content: '',
    updatedAt: new Date('2026-01-03'),
  })
  await db.insert(schema.changelogReaction).values({ changelogId: live.id, userId: people.user.user.id, emoji: PARTY })
  const admin = (path: string, init: { method?: string; body?: unknown } = {}, who = token('manager')) =>
    call(`/api/admin/changelogs${path}`, { ...init, org: orgId, session: who })

  const all = await admin('')
  assert.deepEqual(
    all.body.data.map((c: { id: string }) => c.id),
    [draft.id, live.id],
  )
  assert.equal(all.body.data[0].author.name, 'manager name')
  assert.deepEqual(all.body.pagination, { page: 1, pageSize: 10, total: 2 })
  const drafts = await admin('?status=draft&page=1&pageSize=1')
  assert.deepEqual(
    drafts.body.data.map((c: { id: string }) => c.id),
    [draft.id],
  )
  const found = await admin('?search=dark%20mode')
  assert.deepEqual(
    found.body.data.map((c: { id: string }) => c.id),
    [live.id],
  )
  assert.equal((await admin('', {}, token('user'))).status, 403)

  assert.equal((await admin(`/${draft.id}/publish`, { method: 'POST' })).status, 400)
  const saved = await admin(`/${draft.id}`, { method: 'PATCH', body: { content: 'Twice as fast' } })
  assert.equal(saved.body.status, 'draft')
  const publishedDraft = await admin(`/${draft.id}/publish`, { method: 'POST' })
  assert.equal(publishedDraft.body.status, 'published')
  assert.equal(publishedDraft.body.publishedContent, 'Twice as fast')
  const reedited = await admin(`/${draft.id}`, { method: 'PATCH', body: { title: 'Much faster search' } })
  assert.equal(reedited.body.status, 'needs_update')
  assert.equal(reedited.body.publishedTitle, 'Faster search')
  assert.equal((await admin(`/${uuidv7()}`, { method: 'PATCH', body: { title: 'x' } })).status, 404)

  assert.equal((await admin(`/${live.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await admin(`/${live.id}`, { method: 'DELETE' })).status, 404)
  const reactions = await db
    .select()
    .from(schema.changelogReaction)
    .where(eq(schema.changelogReaction.changelogId, live.id))
  assert.equal(reactions.length, 0)
})

test('AI drafts come from the configured OpenAI-compatible endpoint and map its failures', async (t) => {
  const call = await changelogRoutes()
  const { orgId, people, token } = await createOrg()
  const feedback = await createPost(orgId, people.user.user.id, { title: 'Export to CSV', content: 'Please' })
  const requests: { model: string; messages: { content: string }[] }[] = []
  let reply: { status: number; body: unknown } = { status: 200, body: {} }
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      requests.push(JSON.parse(raw))
      res.writeHead(reply.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(reply.body))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const completion = (content: string) => ({
    id: 'c1',
    object: 'chat.completion',
    created: 0,
    model: 'test-model',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  })
  const generate = (body: unknown) =>
    call('/api/admin/changelogs/ai/generate', { method: 'POST', org: orgId, session: token('owner'), body })
  const request = { feedbackIds: [feedback.id], style: 'concise' }

  delete process.env.OPENAI_API_KEY
  assert.equal((await generate(request)).status, 503)

  process.env.OPENAI_API_KEY = 'test-key'
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`
  process.env.OPENAI_TEXT_MODEL = 'test-model'
  t.after(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_TEXT_MODEL
  })

  reply = {
    status: 200,
    body: completion(
      JSON.stringify({
        title: 'A'.repeat(80),
        suggested_tags: ['new', 'bogus'],
        content_markdown: 'You can export to CSV.',
      }),
    ),
  }
  const drafted = await generate(request)
  assert.equal(drafted.status, 200)
  assert.deepEqual(drafted.body, { title: 'A'.repeat(70), categories: ['new'], content: 'You can export to CSV.' })
  assert.equal(requests[0]?.model, 'test-model')
  assert.match(requests[0]?.messages[1]?.content ?? '', /Export to CSV/)

  const fromText = await generate({ changeContent: 'Added dark mode', style: 'witty' })
  assert.equal(fromText.status, 200)
  assert.doesNotMatch(requests[1]?.messages[1]?.content ?? '', /Export to CSV/)

  reply = { status: 200, body: completion('not json at all') }
  // The parser's own error passes through unwrapped.
  const unreadable = await generate(request)
  assert.equal(unreadable.status, 502)
  assert.equal(unreadable.body.message, 'AI returned invalid response format')

  reply = { status: 400, body: { error: { message: 'model not found', type: 'invalid_request_error' } } }
  const refused = await generate(request)
  assert.equal(refused.status, 502)
  assert.match(refused.body.message, /^AI generation failed: /)
})
