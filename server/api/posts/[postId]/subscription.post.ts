import { postSubscription } from '#layers/feedlog/server/db/schemas'
import { isActorAdmin } from '#layers/feedlog/shared/utils/notifications'

// POST /api/posts/:postId/subscription — subscribe to this post. A row means
// subscribed. Idempotent. Admins are refused: they don't receive post-thread
// mail, so a row would only become dead data skipped at send time.
export default defineEventHandler(async (event) => {
  const { session, orgId, postId, db } = await requirePostRoute(event)
  await requireOrgPost(db, orgId, postId)
  if (isActorAdmin(session, orgId)) {
    throw createError({ statusCode: 403, message: 'Admins do not subscribe to posts' })
  }

  await db.insert(postSubscription).values({ postId, userId: session.user.id }).onConflictDoNothing()

  return { subscribed: true }
})
