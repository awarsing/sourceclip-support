import { changelogReaction } from '#layers/feedlog/server/db/schemas'
import { reactionSchema } from '#layers/feedlog/shared/schemas/changelog'

// POST /api/changelogs/:id/reactions — Add reaction (any authenticated user, idempotent).
export default defineEventHandler(async (event) => {
  const { session, orgId } = await requireAuthInOrg(event)
  await assertGuestMay(event, session, 'allowVote')
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, reactionSchema.parse)

  const db = useDB()
  await requirePublishedChangelog(db, orgId, id)

  // Idempotent insert
  await db
    .insert(changelogReaction)
    .values({
      changelogId: id,
      userId: session.user.id,
      emoji: body.emoji,
    })
    .onConflictDoNothing()

  return await changelogReactionState(db, id, session.user.id, true)
})
