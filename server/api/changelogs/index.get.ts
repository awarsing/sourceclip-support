import { and, desc, sql, isNotNull, eq } from 'drizzle-orm'
import { changelog } from '#layers/feedlog/server/db/schemas'

// GET /api/changelogs — Public changelog list (cursor pagination)
export default defineEventHandler(async (event): Promise<CursorPaginatedList<ChangelogListItem>> => {
  const session = await getUserSession(event)
  const orgId = event.context.orgId!
  const query = getQuery(event)

  const pageSize = readPageSize(query.pageSize, 10, 50)

  const conditions = [eq(changelog.orgId, orgId), isNotNull(changelog.publishedAt)]
  const cursor = decodeListCursor(query.cursor as string | undefined)
  if (cursor) {
    conditions.push(sql`(${changelog.publishedAt}, ${changelog.id}) < (${cursor.s}::timestamptz, ${cursor.id}::uuid)`)
  }

  const db = useDB()
  const rows = await db
    .select(publishedChangelogColumns)
    .from(changelog)
    .where(and(...conditions))
    .orderBy(desc(changelog.publishedAt), desc(changelog.id))
    .limit(pageSize + 1)

  const { items, hasMore } = splitPage(rows, pageSize)
  const reactions = await findChangelogReactions(
    db,
    items.map((r) => r.id),
    session?.user.id,
  )
  const data = items.map((r) => toChangelogListItem(r, reactions.get(r.id)!))
  const nextCursor = nextListCursor(items, hasMore, (last) => ({ s: last.publishedAt, id: last.id }))

  return { data, pagination: { nextCursor } }
})
