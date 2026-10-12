import { and, eq } from 'drizzle-orm'
import { postSubscription } from '#layers/feedlog/server/db/schemas'

// DELETE /api/posts/:postId/subscription — unsubscribe. Removes the row.
// Idempotent: deleting a non-existent row is a no-op.
export default defineEventHandler(async (event) => {
  const { session, orgId, postId, db } = await requirePostRoute(event)
  await requireOrgPost(db, orgId, postId)

  await db
    .delete(postSubscription)
    .where(and(eq(postSubscription.postId, postId), eq(postSubscription.userId, session.user.id)))

  return { subscribed: false }
})
