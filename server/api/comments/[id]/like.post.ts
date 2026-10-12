import { eq, and } from 'drizzle-orm'
import { commentLike } from '#layers/feedlog/server/db/schemas'

// POST /api/comments/:id/like — Like a comment (any authenticated user, idempotent).
export default defineEventHandler(async (event) => {
  const { session, orgId } = await requireAuthInOrg(event)
  // A like is a one-click reaction with no content, the same shape as a post
  // upvote — so it rides the voting switch, not the commenting one.
  await assertGuestMay(event, session, 'allowVote')
  const commentId = getRouterParam(event, 'id')!

  const db = useDB()
  // Confirm the comment lives in this org via its parent post.
  await requireOrgComment(db, orgId, commentId)

  const [existing] = await db
    .select({ commentId: commentLike.commentId })
    .from(commentLike)
    .where(and(eq(commentLike.commentId, commentId), eq(commentLike.userId, session.user.id)))
    .limit(1)
  if (existing) {
    return { liked: true, likeCount: await commentLikeCount(db, commentId) }
  }

  await db.insert(commentLike).values({ commentId, userId: session.user.id })
  return { liked: true, likeCount: await commentLikeCount(db, commentId, 1) }
})
