import { eq, and, desc, sql, inArray, isNull } from 'drizzle-orm'
import { post, user } from '#layers/feedlog/server/db/schemas'

const ROADMAP_STATUSES = ['planned', 'in_progress', 'done'] as const
const PAGE_SIZE = 10

interface RoadmapColumn {
  data: PostListItem[]
  total: number
  nextCursor: string | null
}

type RoadmapResponse = Record<(typeof ROADMAP_STATUSES)[number], RoadmapColumn>

// GET /api/roadmap — Roadmap view: posts grouped by status
export default defineEventHandler(async (event): Promise<RoadmapResponse> => {
  const session = await getUserSession(event)
  const orgId = event.context.orgId!
  const query = getQuery(event)
  const boardId = query.boardId as string | undefined

  const db = useDB()

  // Build board filter condition
  const boardCondition = boardId ? eq(post.boardId, boardId) : undefined

  // Query 1: UNION ALL — top 20 per status by votes
  const statusQueries = ROADMAP_STATUSES.map((status) => {
    const conditions: any[] = [eq(post.orgId, orgId), eq(post.status, status), isNull(post.mergedTo)]
    if (boardCondition) conditions.push(boardCondition)

    return db
      .select(postListColumns)
      .from(post)
      .leftJoin(user, eq(post.authorId, user.id))
      .where(and(...conditions))
      .orderBy(desc(post.createdAt), desc(post.id))
      .limit(PAGE_SIZE + 1)
  })

  // Query 2: counts per status
  const countConditions: any[] = [
    eq(post.orgId, orgId),
    inArray(post.status, [...ROADMAP_STATUSES]),
    isNull(post.mergedTo),
  ]
  if (boardCondition) countConditions.push(boardCondition)

  const [results, counts] = await Promise.all([
    Promise.all(statusQueries),
    db
      .select({
        status: post.status,
        count: sql<number>`count(*)::int`,
      })
      .from(post)
      .where(and(...countConditions))
      .groupBy(post.status),
  ])

  // Build count map
  const countMap = new Map(counts.map((c) => [c.status, c.count]))

  // Batch query hasVoted
  const voted = await findSessionVotedPostIds(db, session, results.flat())

  // Build response
  const response = {} as RoadmapResponse
  ROADMAP_STATUSES.forEach((status, i) => {
    const { items, hasMore } = splitPage(results[i]!, PAGE_SIZE)
    response[status] = {
      data: items.map((r) => toPostListItem(r, voted)),
      total: countMap.get(status) ?? 0,
      nextCursor: nextListCursor(items, hasMore, (last) => ({ s: last.createdAt, id: last.id })),
    }
  })

  return response
})
