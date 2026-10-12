import { eq, and, isNotNull } from 'drizzle-orm'
import { changelog } from '#layers/feedlog/server/db/schemas'

// GET /api/changelogs/:slug — Public changelog detail
export default defineEventHandler(async (event): Promise<ChangelogListItem> => {
  const session = await getUserSession(event)
  const orgId = event.context.orgId!
  const slug = getRouterParam(event, 'slug')!

  const db = useDB()

  const [entry] = await db
    .select(publishedChangelogColumns)
    .from(changelog)
    .where(and(eq(changelog.slug, slug), eq(changelog.orgId, orgId), isNotNull(changelog.publishedAt)))
    .limit(1)

  if (!entry) {
    throw createError({ statusCode: 404, message: 'Changelog not found' })
  }

  const reactions = await findChangelogReactions(db, [entry.id], session?.user.id)
  return toChangelogListItem(entry, reactions.get(entry.id)!)
})
