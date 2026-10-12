import { eq, and } from 'drizzle-orm'
import { vote, postSubscription } from '#layers/feedlog/server/db/schemas'
import { isActorAdmin } from '#layers/feedlog/shared/utils/notifications'

// POST /api/posts/:id/vote — Vote on a post (any authenticated user, idempotent).
export default defineEventHandler(async (event) => {
  const { session, orgId, postId, db } = await requirePostRoute(event)
  await assertGuestMay(event, session, 'allowVote')

  // Block voting on merged posts; also confirms the post belongs to this org.
  const p = await requireOrgPost(db, orgId, postId, ['mergedTo'])
  if (p.mergedTo) {
    throw createError({ statusCode: 403, message: 'Cannot vote on a merged post' })
  }

  // Check if already voted
  const [existing] = await db
    .select({ postId: vote.postId })
    .from(vote)
    .where(and(eq(vote.postId, postId), eq(vote.userId, session.user.id)))
    .limit(1)

  if (existing) {
    // Already voted, return current state
    return { voted: true, voteCount: await postVoteCount(db, postId) }
  }

  await db.insert(vote).values({ postId, userId: session.user.id })
  const voteCount = await postVoteCount(db, postId, 1)

  // Voting subscribes you to the post — unless you're an admin (admins don't
  // receive post-thread mail). Un-voting does NOT unsubscribe.
  if (!isActorAdmin(session, orgId)) {
    await db.insert(postSubscription).values({ postId, userId: session.user.id }).onConflictDoNothing()
  }

  return { voted: true, voteCount }
})
