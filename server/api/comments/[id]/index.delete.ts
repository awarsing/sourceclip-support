import { eq, sql } from 'drizzle-orm'
import { comment, commentLike, post } from '#layers/feedlog/server/db/schemas'

// DELETE /api/comments/:id — Delete comment. Author can delete own;
// moderators can delete anyone's (escalates via feedlog:moderate).
// Cascades children for top-level.
export default defineEventHandler(async (event) => {
  const { session, id, db, existing } = await requireCommentRoute(event)
  if (existing.authorId !== session.user.id) {
    await requireOrgPermission(event, { feedlog: ['moderate'] })
  }

  if (!existing.parentId) {
    // Deleting a top-level comment: cascade delete children + their likes
    await db
      .delete(commentLike)
      .where(sql`${commentLike.commentId} IN (SELECT ${comment.id} FROM ${comment} WHERE ${comment.parentId} = ${id})`)
    await db.delete(comment).where(eq(comment.parentId, id))
  }
  // Delete own likes, then self
  await db.delete(commentLike).where(eq(commentLike.commentId, id))
  await db.delete(comment).where(eq(comment.id, id))
  if (existing.parentId) {
    // Deleting a child comment: decrement the parent's replyCount
    await db
      .update(comment)
      .set({ replyCount: sql`greatest(${comment.replyCount} - 1, 0)` })
      .where(eq(comment.id, existing.parentId))
  }

  // A top-level comment takes its replies with it.
  const removed = existing.parentId ? 1 : 1 + existing.replyCount
  await db
    .update(post)
    .set({ commentCount: sql`greatest(${post.commentCount} - ${removed}, 0)` })
    .where(eq(post.id, existing.postId))

  setResponseStatus(event, 204)
  return null
})
