import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import * as schema from '../server/db/schemas/index'
import { encodeListCursor } from '../server/utils/list-cursor'
import { createOrg, createPost, db, loadHandler, serve, settle } from './server-api-harness'

async function postRoutes() {
  return serve({
    'GET /api/posts': await loadHandler('posts/index.get'),
    'GET /api/posts/search': await loadHandler('posts/search.get'),
    'GET /api/roadmap': await loadHandler('roadmap.get'),
    'GET /api/posts/:postId': await loadHandler('posts/[postId]/index.get'),
    'PATCH /api/posts/:postId': await loadHandler('posts/[postId]/index.patch'),
    'POST /api/posts/:postId/vote': await loadHandler('posts/[postId]/vote.post'),
    'DELETE /api/posts/:postId/vote': await loadHandler('posts/[postId]/vote.delete'),
    'POST /api/posts/:postId/subscription': await loadHandler('posts/[postId]/subscription.post'),
    'DELETE /api/posts/:postId/subscription': await loadHandler('posts/[postId]/subscription.delete'),
    'GET /api/admin/posts': await loadHandler('admin/posts/index.get'),
    'GET /api/admin/posts/search': await loadHandler('admin/posts/search.get'),
    'PATCH /api/admin/posts/:id': await loadHandler('admin/posts/[id].patch'),
    'DELETE /api/admin/posts/:id': await loadHandler('admin/posts/[id].delete'),
    'POST /api/admin/posts/:id/notify-status': await loadHandler('admin/posts/[id]/notify-status.post'),
    'POST /api/admin/posts/merge': await loadHandler('admin/posts/merge.post'),
  })
}

test('the public list pages by date or votes, hides merged posts and marks own votes', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const board = uuidv7()
  const first = await createPost(orgId, people.user.user.id, { createdAt: new Date('2026-01-01'), voteCount: 3 })
  const second = await createPost(orgId, people.owner.user.id, {
    createdAt: new Date('2026-01-02'),
    voteCount: 5,
    boardId: board,
    status: 'planned',
  })
  const third = await createPost(orgId, people.user.user.id, { createdAt: new Date('2026-01-03'), voteCount: 1 })
  await createPost(orgId, people.user.user.id, { mergedTo: first.id })
  await db.insert(schema.vote).values({ postId: second.id, userId: people.user.user.id })

  const page1 = await call('/api/posts?pageSize=2', { org: orgId, session: token('user') })
  assert.equal(page1.status, 200)
  assert.deepEqual(
    page1.body.data.map((p: { id: string }) => p.id),
    [third.id, second.id],
  )
  assert.equal(page1.body.data[1].hasVoted, true)
  assert.equal(page1.body.data[1].author.name, 'owner name')
  assert.equal(page1.body.data[0].createdAt, '2026-01-03T00:00:00.000Z')
  const page2 = await call(`/api/posts?pageSize=2&cursor=${page1.body.pagination.nextCursor}`, { org: orgId })
  assert.deepEqual(
    page2.body.data.map((p: { id: string; hasVoted: boolean }) => [p.id, p.hasVoted]),
    [[first.id, false]],
  )
  assert.equal(page2.body.data[0].mergedCount, 1)
  assert.equal(page2.body.pagination.nextCursor, null)

  const byVotes = await call('/api/posts?sort=votes&order=asc&pageSize=1', { org: orgId })
  assert.deepEqual(
    byVotes.body.data.map((p: { id: string }) => p.id),
    [third.id],
  )
  const nextByVotes = await call(
    `/api/posts?sort=votes&order=asc&pageSize=1&cursor=${byVotes.body.pagination.nextCursor}`,
    {
      org: orgId,
    },
  )
  assert.deepEqual(
    nextByVotes.body.data.map((p: { id: string }) => p.id),
    [first.id],
  )
  const downByVotes = await call(
    `/api/posts?sort=votes&pageSize=5&cursor=${encodeListCursor({ s: 5, id: second.id })}`,
    { org: orgId },
  )
  assert.deepEqual(
    downByVotes.body.data.map((p: { id: string }) => p.id),
    [first.id, third.id],
  )
  const ascending = await call(
    `/api/posts?order=asc&cursor=${encodeListCursor({ s: '2026-01-01T00:00:00.000Z', id: first.id })}`,
    { org: orgId },
  )
  assert.deepEqual(
    ascending.body.data.map((p: { id: string }) => p.id),
    [second.id, third.id],
  )
  const filtered = await call(`/api/posts?boardId=${board}&status=planned&cursor=not-a-cursor`, { org: orgId })
  assert.deepEqual(
    filtered.body.data.map((p: { id: string }) => p.id),
    [second.id],
  )
})

test('search falls back to trigram distance and the roadmap groups statuses with totals', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const match = await createPost(orgId, people.user.user.id, { title: 'Dark mode toggle', status: 'planned' })
  const other = await createPost(orgId, people.user.user.id, { title: 'Export to CSV', status: 'done' })
  for (const p of [match, other]) {
    await db.insert(schema.postSearch).values({ postId: p.id, orgId, searchText: `${p.title}\n${p.content}` })
  }
  await db.insert(schema.vote).values({ postId: match.id, userId: people.user.user.id })

  assert.deepEqual((await call('/api/posts/search?q=%20', { org: orgId })).body, { data: [] })
  const found = await call('/api/posts/search?q=dark%20mode', { org: orgId, session: token('user') })
  assert.equal(found.body.data[0].id, match.id)
  assert.equal(found.body.data[0].hasVoted, true)
  assert.equal(found.body.data.length, 2)

  for (let i = 0; i < 11; i++) await createPost(orgId, people.user.user.id, { status: 'in_progress' })
  const roadmap = await call('/api/roadmap', { org: orgId, session: token('user') })
  assert.equal(roadmap.body.planned.total, 1)
  assert.equal(roadmap.body.planned.data[0].hasVoted, true)
  assert.equal(roadmap.body.planned.nextCursor, null)
  assert.equal(roadmap.body.in_progress.total, 11)
  assert.equal(roadmap.body.in_progress.data.length, 10)
  assert.notEqual(roadmap.body.in_progress.nextCursor, null)
  assert.equal(roadmap.body.done.data[0].id, other.id)
  const byBoard = await call(`/api/roadmap?boardId=${uuidv7()}`, { org: orgId })
  assert.deepEqual(byBoard.body.done, { data: [], total: 0, nextCursor: null })
})

test('post detail shows votes and subscriptions across the merge family and staff-only fields', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const canonical = await createPost(orgId, people.user.user.id)
  const merged = await createPost(orgId, people.guest.user.id, { mergedTo: canonical.id })
  await db.insert(schema.vote).values({ postId: merged.id, userId: people.user.user.id })
  await db.insert(schema.postSubscription).values({ postId: merged.id, userId: people.user.user.id })

  assert.equal((await call('/api/posts/missing', { org: orgId })).status, 404)
  const asUser = await call(`/api/posts/${canonical.slug}`, { org: orgId, session: token('user') })
  assert.equal(asUser.status, 200)
  assert.equal(asUser.headers.get('cache-control'), 'private, no-store')
  assert.equal(asUser.body.hasVoted, true)
  assert.equal(asUser.body.subscribed, true)
  assert.equal(asUser.body.mergedCount, 1)
  assert.equal(asUser.body.author.email, undefined)
  assert.equal('sourceConversationId' in asUser.body, false)

  const asOwner = await call(`/api/posts/${canonical.slug}`, { org: orgId, session: token('owner') })
  assert.equal(asOwner.body.hasVoted, false)
  assert.equal(asOwner.body.author.email, people.user.user.email)
  assert.equal(asOwner.body.sourceConversationId, null)
  assert.equal(asOwner.body.sourceConversationTitle, null)

  const mergedView = await call(`/api/posts/${merged.slug}`, { org: orgId, session: token('owner') })
  assert.deepEqual(mergedView.body.canonicalPost, { slug: canonical.slug, title: canonical.title })
  assert.equal(mergedView.body.author.email, undefined)
  const own = await call(`/api/posts/${merged.slug}`, { org: orgId, session: token('user') })
  assert.equal(own.body.hasVoted, true)
  const anonymous = await call(`/api/posts/${canonical.slug}`, { org: orgId })
  assert.equal(anonymous.body.hasVoted, false)
  assert.equal(anonymous.body.subscribed, false)
})

test('authors and moderators edit posts; text changes refresh search and the hash', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.user.user.id, { title: 'Old title', content: 'Old content' })

  const missing = await call(`/api/posts/${uuidv7()}`, {
    method: 'PATCH',
    org: orgId,
    session: token('user'),
    body: {},
  })
  assert.equal(missing.status, 404)
  const empty = await call(`/api/posts/${p.id}`, { method: 'PATCH', org: orgId, session: token('user'), body: {} })
  assert.equal(empty.status, 400)
  const stranger = await call(`/api/posts/${p.id}`, {
    method: 'PATCH',
    org: orgId,
    session: token('guest'),
    body: { title: 'Hijack' },
  })
  assert.equal(stranger.status, 403)

  const edited = await call(`/api/posts/${p.id}`, {
    method: 'PATCH',
    org: orgId,
    session: token('user'),
    body: { content: 'New **content**', status: 'done' },
  })
  assert.equal(edited.status, 200)
  assert.equal(edited.body.content, 'New **content**')
  assert.equal(edited.body.status, 'open')
  assert.equal(edited.body.excerpt, 'New content')
  assert.match(edited.body.contentHash, /^[0-9a-f]{64}$/)
  await settle()
  const [search] = await db.select().from(schema.postSearch).where(eq(schema.postSearch.postId, p.id))
  assert.equal(search?.searchText, 'Old title New content')

  const sameText = await call(`/api/admin/posts/${p.id}`, {
    method: 'PATCH',
    org: orgId,
    session: token('manager'),
    body: { title: 'Old title', status: 'planned', boardId: null },
  })
  assert.equal(sameText.body.status, 'planned')
  assert.equal(sameText.body.contentHash, edited.body.contentHash)
  const moderated = await call(`/api/admin/posts/${p.id}`, {
    method: 'PATCH',
    org: orgId,
    session: token('owner'),
    body: { title: 'Moderated title' },
  })
  assert.equal(moderated.body.title, 'Moderated title')
  assert.notEqual(moderated.body.contentHash, edited.body.contentHash)
  const byModerator = await call(`/api/posts/${p.id}`, {
    method: 'PATCH',
    org: orgId,
    session: token('owner'),
    body: { title: 'Moderator via public route' },
  })
  assert.equal(byModerator.body.title, 'Moderator via public route')
  const elsewhere = await call(`/api/admin/posts/${p.id}`, {
    method: 'PATCH',
    org: (await createOrg()).orgId,
    session: token('owner'),
    body: { title: 'x' },
  })
  assert.equal(elsewhere.status, 403)
  await settle()
})

test('votes and subscriptions are idempotent, blocked on merged posts and for admins', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.owner.user.id)
  const merged = await createPost(orgId, people.owner.user.id, { mergedTo: p.id })
  const vote = (method: string, who: Parameters<typeof token>[0], id = p.id) =>
    call(`/api/posts/${id}/vote`, { method, org: orgId, session: token(who) })
  const subscription = (method: string, who: Parameters<typeof token>[0], id = p.id) =>
    call(`/api/posts/${id}/subscription`, { method, org: orgId, session: token(who) })

  assert.deepEqual((await vote('POST', 'user')).body, { voted: true, voteCount: 1 })
  assert.deepEqual((await vote('POST', 'user')).body, { voted: true, voteCount: 1 })
  assert.deepEqual((await vote('POST', 'owner')).body, { voted: true, voteCount: 2 })
  assert.equal((await vote('POST', 'user', merged.id)).status, 403)
  assert.equal((await vote('POST', 'user', uuidv7())).status, 404)
  assert.equal((await vote('POST', 'guest')).status, 403)
  const subscribers = await db
    .select({ userId: schema.postSubscription.userId })
    .from(schema.postSubscription)
    .where(eq(schema.postSubscription.postId, p.id))
  assert.deepEqual(
    subscribers.map((s) => s.userId),
    [people.user.user.id],
  )
  assert.deepEqual((await vote('DELETE', 'user')).body, { voted: false, voteCount: 1 })
  assert.deepEqual((await vote('DELETE', 'user')).body, { voted: false, voteCount: 1 })
  assert.equal((await vote('DELETE', 'user', uuidv7())).status, 404)

  assert.deepEqual((await subscription('DELETE', 'user')).body, { subscribed: false })
  assert.deepEqual((await subscription('POST', 'user')).body, { subscribed: true })
  assert.deepEqual((await subscription('POST', 'user')).body, { subscribed: true })
  assert.equal((await subscription('POST', 'manager')).status, 403)
  assert.equal((await subscription('POST', 'user', uuidv7())).status, 404)
  assert.equal((await subscription('DELETE', 'user', uuidv7())).status, 404)
  assert.equal((await call(`/api/posts/${p.id}/vote`, { method: 'POST', org: orgId })).status, 401)
})

test('the admin list filters, sorts and pages; search falls back to trigram within the filters', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const a = await createPost(orgId, people.user.user.id, { title: 'Alpha feature', voteCount: 2, commentCount: 9 })
  const b = await createPost(orgId, people.user.user.id, { title: 'Beta feature', voteCount: 7 })
  for (const p of [a, b]) {
    await db.insert(schema.postSearch).values({ postId: p.id, orgId, searchText: p.title })
  }

  assert.equal((await call('/api/admin/posts', { org: orgId, session: token('user') })).status, 403)
  const byVotes = await call('/api/admin/posts?sort=votes&pageSize=1', { org: orgId, session: token('contributor') })
  assert.deepEqual(byVotes.body.pagination, { page: 1, pageSize: 1, total: 2 })
  assert.equal(byVotes.body.data[0].id, b.id)
  assert.equal(byVotes.body.data[0].hasVoted, false)
  const byComments = await call('/api/admin/posts?sort=comments&page=2&pageSize=1&order=asc', {
    org: orgId,
    session: token('contributor'),
  })
  assert.equal(byComments.body.data[0].id, a.id)
  const byDate = await call('/api/admin/posts', { org: orgId, session: token('owner') })
  assert.deepEqual(
    byDate.body.data.map((p: { id: string }) => p.id),
    [b.id, a.id],
  )

  const source = (value: string, who: Parameters<typeof token>[0] = 'owner') =>
    call(`/api/admin/posts?sourceConversationId=${value}`, { org: orgId, session: token(who) })
  assert.equal((await source(uuidv7(), 'contributor')).status, 403)
  assert.equal((await source('not-a-uuid')).status, 422)
  assert.equal((await source(uuidv7())).status, 404)
  const [conversation] = await db.insert(schema.conversation).values({ orgId, userId: people.user.user.id }).returning()
  await db.update(schema.post).set({ sourceConversationId: conversation!.id }).where(eq(schema.post.id, a.id))
  const fromSource = await source(conversation!.id)
  assert.deepEqual(
    fromSource.body.data.map((p: { id: string }) => p.id),
    [a.id],
  )

  const search = await call('/api/admin/posts/search?q=beta', { org: orgId, session: token('owner') })
  assert.equal(search.body.data[0].id, b.id)
  assert.deepEqual(search.body.pagination, { page: 1, pageSize: 2, total: 2 })
})

test('moderators delete unmerged posts with their data and announce a status they saw', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.user.user.id, { status: 'planned' })
  const merged = await createPost(orgId, people.user.user.id, { mergedTo: p.id })
  const [c] = await db
    .insert(schema.comment)
    .values({ postId: p.id, authorId: people.user.user.id, content: 'x' })
    .returning()
  await db.insert(schema.commentLike).values({ commentId: c!.id, userId: people.owner.user.id })
  await db.insert(schema.vote).values({ postId: p.id, userId: people.owner.user.id })
  await db.insert(schema.postSubscription).values({ postId: p.id, userId: people.user.user.id })

  const notify = (status: string, id = p.id) =>
    call(`/api/admin/posts/${id}/notify-status`, {
      method: 'POST',
      org: orgId,
      session: token('owner'),
      body: { status },
    })
  assert.equal((await notify('done')).status, 409)
  assert.equal((await notify('planned', uuidv7())).status, 404)
  const notified = await notify('planned')
  assert.deepEqual(notified.body, { ok: true, recipients: 1 })
  await settle()
  const unread = await db.select().from(schema.postUnread).where(eq(schema.postUnread.postId, p.id))
  assert.equal(unread.length, 1)

  const remove = (id: string) =>
    call(`/api/admin/posts/${id}`, { method: 'DELETE', org: orgId, session: token('manager') })
  assert.equal((await remove(merged.id)).status, 400)
  assert.equal((await remove(uuidv7())).status, 404)
  assert.equal((await remove(p.id)).status, 204)
  assert.deepEqual(await db.select().from(schema.comment).where(eq(schema.comment.postId, p.id)), [])
  assert.deepEqual(await db.select().from(schema.vote).where(eq(schema.vote.postId, p.id)), [])
  assert.deepEqual(await db.select().from(schema.commentLike).where(eq(schema.commentLike.commentId, c!.id)), [])
})

test('merging recounts distinct voters, records a merge comment and refuses bad pairs', async () => {
  const call = await postRoutes()
  const { orgId, people, token } = await createOrg()
  const canonical = await createPost(orgId, people.user.user.id)
  const duplicate = await createPost(orgId, people.user.user.id)
  const other = await createPost(orgId, people.user.user.id)
  const elsewhere = await createPost((await createOrg()).orgId, people.user.user.id)
  await db.insert(schema.vote).values([
    { postId: canonical.id, userId: people.user.user.id },
    { postId: duplicate.id, userId: people.user.user.id },
    { postId: duplicate.id, userId: people.owner.user.id },
  ])
  const merge = (canonicalPostId: string, mergedPostId: string) =>
    call('/api/admin/posts/merge', {
      method: 'POST',
      org: orgId,
      session: token('owner'),
      body: { canonicalPostId, mergedPostId },
    })

  assert.equal((await merge(canonical.id, canonical.id)).status, 400)
  assert.equal((await merge(elsewhere.id, duplicate.id)).status, 400)
  assert.equal((await merge(canonical.id, elsewhere.id)).status, 400)
  assert.deepEqual((await merge(canonical.id, duplicate.id)).body, { success: true })
  assert.deepEqual((await merge(canonical.id, duplicate.id)).body, { success: true })
  assert.equal((await merge(duplicate.id, other.id)).status, 400)
  const [after] = await db.select().from(schema.post).where(eq(schema.post.id, canonical.id))
  assert.equal(after?.voteCount, 2)
  assert.equal(after?.commentCount, 1)
  const [marker] = await db.select().from(schema.comment).where(eq(schema.comment.postId, canonical.id))
  assert.deepEqual(marker?.metadata, { merged_post_id: duplicate.id })
})
