import { eq, and } from 'drizzle-orm'
import { commentLike } from '#layers/feedlog/server/db/schemas'

// DELETE /api/comments/:id/like — Unlike a comment (any authenticated user, idempotent).
export default defineEventHandler(async (event) => {
  const { session, orgId } = await requireAuthInOrg(event)
  const commentId = getRouterParam(event, 'id')!

  const db = useDB()
  await requireOrgComment(db, orgId, commentId)

  const [deleted] = await db
    .delete(commentLike)
    .where(and(eq(commentLike.commentId, commentId), eq(commentLike.userId, session.user.id)))
    .returning({ commentId: commentLike.commentId })

  // Not liked: return the current count; otherwise decrement it.
  return { liked: false, likeCount: await commentLikeCount(db, commentId, deleted ? -1 : 0) }
})
