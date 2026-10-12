import { eq, and, desc, asc, isNull } from 'drizzle-orm'
import { post, user } from '#layers/feedlog/server/db/schemas'

// GET /api/posts — Public post list (cursor pagination)
export default defineEventHandler(async (event): Promise<CursorPaginatedList<PostListItem>> => {
  const session = await getUserSession(event)
  const query = getQuery(event)

  const sort = (query.sort as string) || 'createdAt'
  const order = (query.order as string) || 'desc'
  const pageSize = readPageSize(query.pageSize, 10, 100)

  const db = useDB()
  const orgId = event.context.orgId!

  const orderFn = order === 'desc' ? desc : asc
  const sortCol = sort === 'votes' ? post.voteCount : post.createdAt

  const result = await db
    .select(postListColumns)
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(publicPostListWhere(orgId, query, sort, order))
    .orderBy(orderFn(sortCol), orderFn(post.id))
    .limit(pageSize + 1)

  const { items, hasMore } = splitPage(result, pageSize)
  const voted = await findSessionVotedPostIds(db, session, result)
  const data = items.map((r) => toPostListItem(r, voted))
  const nextCursor = nextListCursor(items, hasMore, (last) => ({
    s: sort === 'votes' ? last.voteCount : last.createdAt,
    id: last.id,
  }))

  return { data, pagination: { nextCursor } }
})

// Merged posts are excluded; board, status and the cursor narrow the rest.
function publicPostListWhere(orgId: string, query: Record<string, unknown>, sort: string, order: string) {
  const conditions = [eq(post.orgId, orgId), isNull(post.mergedTo)]
  if (query.boardId) conditions.push(eq(post.boardId, query.boardId as string))
  if (query.status) conditions.push(eq(post.status, query.status as string))
  const cursor = decodeListCursor(query.cursor as string | undefined)
  if (cursor) conditions.push(postListCursorCondition(sort, order, cursor))
  return and(...conditions)
}
