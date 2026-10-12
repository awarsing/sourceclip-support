import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import * as schema from '../server/db/schemas/index'
import { createOrg, createPost, db, loadHandler, serve, settle } from './server-api-harness'

async function commentRoutes() {
  return serve({
    'GET /api/posts/:postId/comments': await loadHandler('posts/[postId]/comments/index.get'),
    'POST /api/posts/:postId/comments': await loadHandler('posts/[postId]/comments/index.post'),
    'PATCH /api/comments/:id': await loadHandler('comments/[id]/index.patch'),
    'DELETE /api/comments/:id': await loadHandler('comments/[id]/index.delete'),
    'POST /api/comments/:id/like': await loadHandler('comments/[id]/like.post'),
    'DELETE /api/comments/:id/like': await loadHandler('comments/[id]/like.delete'),
  })
}

async function addComment(values: Partial<typeof schema.comment.$inferInsert> & { postId: string; authorId: string }) {
  const [row] = await db
    .insert(schema.comment)
    .values({ content: 'seeded', ...values })
    .returning()
  return row!
}

const ids = (page: { data: { id: string }[] }) => page.data.map((c) => c.id)

test('writing comments flattens replies, counts them and refuses merged or missing targets', async () => {
  const call = await commentRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.user.user.id)
  const merged = await createPost(orgId, people.user.user.id, { mergedTo: p.id })
  const write = (who: Parameters<typeof token>[0], body: Record<string, unknown>, postId = p.id) =>
    call(`/api/posts/${postId}/comments`, { method: 'POST', org: orgId, session: token(who), body })

  const top = await write('user', { content: 'First' })
  assert.equal(top.status, 201)
  assert.equal(top.body.parentId, null)
  assert.deepEqual(top.body.author, {
    id: people.user.user.id,
    name: 'user name',
    image: null,
    isAnonymous: false,
    isAdmin: false,
  })
  const reply = await write('owner', { content: 'Official', parentId: top.body.id, notifyVoters: false })
  assert.equal(reply.body.parentId, top.body.id)
  assert.equal(reply.body.replyToId, null)
  assert.equal(reply.body.author.isAdmin, true)
  const nested = await write('manager', { content: 'Nested', parentId: reply.body.id })
  assert.equal(nested.body.parentId, top.body.id)
  assert.equal(nested.body.replyToId, reply.body.id)

  assert.equal((await write('user', { content: 'x', parentId: uuidv7() })).status, 404)
  assert.equal((await write('user', { content: 'x' }, merged.id)).status, 403)
  assert.equal((await write('user', { content: 'x' }, uuidv7())).status, 404)
  assert.equal((await write('user', { content: '   ' })).status, 400)

  const [counted] = await db.select().from(schema.post).where(eq(schema.post.id, p.id))
  assert.equal(counted?.commentCount, 3)
  const [parent] = await db.select().from(schema.comment).where(eq(schema.comment.id, top.body.id))
  assert.equal(parent?.replyCount, 2)
  await settle()
})

test('the comment list sorts, pages, nests replies and inlines merged posts two levels deep', async () => {
  const call = await commentRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.user.user.id)
  const merged = await createPost(orgId, people.contributor.user.id, { mergedTo: p.id, title: 'Merged one' })
  const deeper = await createPost(orgId, people.user.user.id, { mergedTo: merged.id, title: 'Deeper' })
  const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute))

  const a = await addComment({ postId: p.id, authorId: people.user.user.id, createdAt: at(1), likeCount: 1 })
  const b = await addComment({ postId: p.id, authorId: people.owner.user.id, createdAt: at(2), likeCount: 5 })
  const marker = await addComment({
    postId: p.id,
    authorId: people.owner.user.id,
    createdAt: at(3),
    type: 'mergedPost',
    metadata: { merged_post_id: merged.id },
  })
  const replies = []
  for (let i = 0; i < 3; i++) {
    replies.push(
      await addComment({ postId: p.id, authorId: people.user.user.id, parentId: a.id, createdAt: at(10 + i) }),
    )
  }
  const sub = await addComment({ postId: merged.id, authorId: people.user.user.id, createdAt: at(4) })
  const subMarker = await addComment({
    postId: merged.id,
    authorId: people.owner.user.id,
    createdAt: at(5),
    type: 'mergedPost',
    metadata: { merged_post_id: deeper.id },
  })
  await addComment({ postId: merged.id, authorId: people.user.user.id, createdAt: at(6) })
  await db.insert(schema.commentLike).values({ commentId: a.id, userId: people.user.user.id })

  const list = (query: string, who?: Parameters<typeof token>[0]) =>
    call(`/api/posts/${p.id}/comments?${query}`, { org: orgId, session: who ? token(who) : undefined })

  const first = await list('limit=2&withChildren=true&childrenLimit=2', 'user')
  assert.deepEqual(ids(first.body), [a.id, b.id])
  assert.equal(first.body.data[0].hasLiked, true)
  assert.equal(first.body.data[1].hasLiked, false)
  assert.equal(first.body.data[1].author.isAdmin, true)
  assert.deepEqual(
    first.body.data[0].children.map((c: { id: string }) => c.id),
    [replies[0]!.id, replies[1]!.id],
  )
  assert.deepEqual(first.body.data[1].children, [])
  const second = await list(`limit=2&withChildren=true&cursor=${first.body.pagination.nextCursor}`)
  assert.deepEqual(ids(second.body), [marker.id])
  assert.equal(second.body.pagination.nextCursor, null)
  const inline = second.body.data[0]
  assert.equal(inline.type, 'mergedPost')
  assert.equal(inline.mergedPost.post.title, 'Merged one')
  assert.equal(inline.mergedPost.post.commentCount, undefined)
  assert.equal(inline.mergedPost.post.author.name, 'contributor name')

  const withInline = await list('childrenLimit=2')
  const inlined = withInline.body.data[2].mergedPost.comments
  assert.deepEqual(ids(inlined), [sub.id, subMarker.id])
  assert.equal(withInline.body.data[0].children, undefined)
  assert.equal(inlined.data[1].type, 'mergedPost')
  assert.equal(inlined.data[1].mergedPost.post.title, 'Deeper')
  assert.equal(inlined.data[1].mergedPost.post.commentCount, 0)
  assert.deepEqual(inlined.data[1].mergedPost.comments, { data: [], pagination: { nextCursor: null } })
  assert.notEqual(inlined.pagination.nextCursor, null)

  const newest = await list('sort=newest&limit=2')
  assert.deepEqual(ids(newest.body), [marker.id, b.id])
  const older = await list(`sort=newest&limit=2&cursor=${newest.body.pagination.nextCursor}`)
  assert.deepEqual(ids(older.body), [a.id])
  const top = await list('sort=top&limit=1')
  assert.deepEqual(ids(top.body), [b.id])
  const nextTop = await list(`sort=top&limit=1&cursor=${top.body.pagination.nextCursor}`)
  assert.deepEqual(ids(nextTop.body), [a.id])

  const replyPage = await list(`parentId=${a.id}&limit=2`, 'user')
  assert.deepEqual(ids(replyPage.body), [replies[0]!.id, replies[1]!.id])
  const replyRest = await list(`parentId=${a.id}&limit=2&cursor=${replyPage.body.pagination.nextCursor}`)
  assert.deepEqual(ids(replyRest.body), [replies[2]!.id])
  assert.equal(replyRest.body.pagination.nextCursor, null)
  assert.deepEqual((await list('cursor=not-a-cursor&limit=1')).body.data.length, 1)

  const empty = await call(`/api/posts/${deeper.id}/comments?withChildren=true`, { org: orgId, session: token('user') })
  assert.deepEqual(empty.body, { data: [], pagination: { nextCursor: null } })
  const elsewhere = await call(`/api/posts/${p.id}/comments`, { org: (await createOrg()).orgId })
  assert.equal(elsewhere.status, 404)
})

test('likes are idempotent per user and scoped to the org', async () => {
  const call = await commentRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.user.user.id)
  const c = await addComment({ postId: p.id, authorId: people.owner.user.id })
  const like = (method: string, who: Parameters<typeof token>[0], org = orgId, id = c.id) =>
    call(`/api/comments/${id}/like`, { method, org, session: token(who) })

  assert.deepEqual((await like('POST', 'user')).body, { liked: true, likeCount: 1 })
  assert.deepEqual((await like('POST', 'user')).body, { liked: true, likeCount: 1 })
  assert.deepEqual((await like('POST', 'owner')).body, { liked: true, likeCount: 2 })
  assert.deepEqual((await like('DELETE', 'user')).body, { liked: false, likeCount: 1 })
  assert.deepEqual((await like('DELETE', 'user')).body, { liked: false, likeCount: 1 })
  assert.equal((await like('POST', 'user', orgId, uuidv7())).status, 404)
  assert.equal((await like('DELETE', 'user', (await createOrg()).orgId)).status, 404)
})

test('authors edit their own comments; deletes cascade replies and keep the counts right', async () => {
  const call = await commentRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.user.user.id, { commentCount: 4 })
  const top = await addComment({ postId: p.id, authorId: people.user.user.id, replyCount: 2 })
  const r1 = await addComment({ postId: p.id, authorId: people.user.user.id, parentId: top.id })
  const r2 = await addComment({ postId: p.id, authorId: people.contributor.user.id, parentId: top.id })
  const other = await addComment({ postId: p.id, authorId: people.contributor.user.id })
  await db.insert(schema.commentLike).values([
    { commentId: r2.id, userId: people.user.user.id },
    { commentId: top.id, userId: people.owner.user.id },
  ])
  const send = (method: string, id: string, who: Parameters<typeof token>[0], body?: unknown) =>
    call(`/api/comments/${id}`, { method, org: orgId, session: token(who), body })

  const edited = await send('PATCH', r1.id, 'user', { content: ' Edited ' })
  assert.equal(edited.status, 200)
  assert.equal(edited.body.content, 'Edited')
  assert.ok(edited.body.editedAt)
  assert.equal((await send('PATCH', r1.id, 'owner', { content: 'Rewrite' })).status, 403)
  assert.equal((await send('PATCH', uuidv7(), 'user', { content: 'x' })).status, 404)

  assert.equal((await send('DELETE', other.id, 'user')).status, 403)
  assert.equal((await send('DELETE', r1.id, 'user')).status, 204)
  const [afterReply] = await db.select().from(schema.comment).where(eq(schema.comment.id, top.id))
  assert.equal(afterReply?.replyCount, 1)
  let [counted] = await db.select().from(schema.post).where(eq(schema.post.id, p.id))
  assert.equal(counted?.commentCount, 3)

  assert.equal((await send('DELETE', top.id, 'manager')).status, 204)
  const left = await db.select().from(schema.comment).where(eq(schema.comment.postId, p.id))
  assert.deepEqual(
    left.map((c) => c.id),
    [other.id],
  )
  assert.equal((await db.select().from(schema.commentLike).where(eq(schema.commentLike.commentId, r2.id))).length, 0)
  ;[counted] = await db.select().from(schema.post).where(eq(schema.post.id, p.id))
  assert.equal(counted?.commentCount, 1)
})
