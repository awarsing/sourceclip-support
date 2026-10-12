import { eq, and } from 'drizzle-orm'
import { vote } from '#layers/feedlog/server/db/schemas'

// DELETE /api/posts/:id/vote — Remove own vote (any authenticated user, idempotent).
// Scoped to the caller's userId, so "own" is implicit — no row check needed.
export default defineEventHandler(async (event) => {
  const { session, orgId, postId, db } = await requirePostRoute(event)

  // Confirm post belongs to this org (defence in depth)
  await requireOrgPost(db, orgId, postId)

  const [deleted] = await db
    .delete(vote)
    .where(and(eq(vote.postId, postId), eq(vote.userId, session.user.id)))
    .returning({ postId: vote.postId })

  // Not voted: return the current count; otherwise decrement it.
  return { voted: false, voteCount: await postVoteCount(db, postId, deleted ? -1 : 0) }
})
