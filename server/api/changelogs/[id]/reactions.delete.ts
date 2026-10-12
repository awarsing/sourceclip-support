import { eq, and } from 'drizzle-orm'
import { changelogReaction } from '#layers/feedlog/server/db/schemas'
import { reactionSchema } from '#layers/feedlog/shared/schemas/changelog'

// DELETE /api/changelogs/:id/reactions?emoji=<emoji> — Remove reaction (any authenticated user, idempotent).
export default defineEventHandler(async (event) => {
  const { session, orgId } = await requireAuthInOrg(event)
  const id = getRouterParam(event, 'id')!
  const parsed = reactionSchema.safeParse({ emoji: getQuery(event).emoji })
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Invalid emoji' })
  }

  const db = useDB()
  await requirePublishedChangelog(db, orgId, id)

  // Idempotent delete
  await db
    .delete(changelogReaction)
    .where(
      and(
        eq(changelogReaction.changelogId, id),
        eq(changelogReaction.userId, session.user.id),
        eq(changelogReaction.emoji, parsed.data.emoji),
      ),
    )

  return await changelogReactionState(db, id, session.user.id, false)
})
