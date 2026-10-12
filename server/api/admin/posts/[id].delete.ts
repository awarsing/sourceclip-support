import { and, eq, sql } from 'drizzle-orm'
import { post, comment, commentLike, vote } from '#layers/feedlog/server/db/schemas'

// DELETE /api/admin/posts/:id — Moderator-only hard delete. Once a post is
// public it belongs to the community (others' upvotes/comments/status); the
// author has no self-delete path, only edit via PATCH /api/posts/:id.
export default defineEventHandler(async (event) => {
  const { orgId, id, db } = await requireModeratedRoute(event)

  const existing = await requireOrgPost(db, orgId, id, ['mergedTo'])
  if (existing.mergedTo) {
    throw createError({ statusCode: 400, message: 'Cannot delete a merged post. Unmerge it first.' })
  }

  // Delete associated data (no DB foreign keys, cascade at application level)
  // 1. Delete all comment likes for this post
  await db
    .delete(commentLike)
    .where(sql`${commentLike.commentId} IN (SELECT ${comment.id} FROM ${comment} WHERE ${comment.postId} = ${id})`)
  // 2. Delete all comments for this post
  await db.delete(comment).where(eq(comment.postId, id))
  // 3. Delete votes for this post
  await db.delete(vote).where(eq(vote.postId, id))
  // 4. Delete the post itself (re-check org for safety)
  const [deleted] = await db
    .delete(post)
    .where(and(eq(post.id, id), eq(post.orgId, orgId)))
    .returning({ id: post.id })

  return respondDeleted(event, deleted, 'Post not found')
})
