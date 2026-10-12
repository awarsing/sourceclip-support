import { and, eq } from 'drizzle-orm'
import { changelog, changelogReaction } from '#layers/feedlog/server/db/schemas'

// DELETE /api/admin/changelogs/:id — Delete changelog (feedlog:moderate).
export default defineEventHandler(async (event) => {
  const { orgId, id, db } = await requireModeratedRoute(event)

  // Cascade delete reactions (no DB foreign keys)
  await db.delete(changelogReaction).where(eq(changelogReaction.changelogId, id))

  const [deleted] = await db
    .delete(changelog)
    .where(and(eq(changelog.id, id), eq(changelog.orgId, orgId)))
    .returning({ id: changelog.id })

  return respondDeleted(event, deleted, 'Changelog not found')
})
