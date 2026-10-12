import { z } from 'zod'
import type { H3Event } from 'h3'
import { eq, and, asc, desc, sql } from 'drizzle-orm'
import { conversation, post, user } from '#layers/feedlog/server/db/schemas'

// GET /api/admin/posts — Admin post list (page pagination)
// Org-member gate only: the list itself is read-only and contributors need
// it to navigate the dashboard. Moderation actions (delete / merge /
// change-status / update:any) are gated on their own endpoints.
export default defineEventHandler(async (event): Promise<PagePaginatedList<PostListItem>> => {
  const { orgId } = await requireOrgMember(event)

  const query = getQuery(event)
  const page = readPageNumber(query.page)
  const pageSize = readPageSize(query.pageSize, 10, 100)

  const db = useDB()

  const filters = postFilterConditions(parsePostFilter(query, orgId))
  if (query.sourceConversationId !== undefined) {
    filters.push(await sourceConversationFilter(event, orgId, query.sourceConversationId))
  }
  const whereClause = and(...filters)

  // The id tiebreaker follows the same direction, or equal-value rows shift between pages.
  const orderFn = query.order === 'asc' ? asc : desc

  const [countResult] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(post).where(whereClause)

  const rows = await db
    .select(postListColumns)
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(whereClause)
    .orderBy(orderFn(adminPostSortColumn(query.sort)), orderFn(post.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    data: rows.map((r) => toPostListItem(r, NO_VOTED_POSTS)),
    pagination: { page, pageSize, total: countResult?.total ?? 0 },
  }
})

function adminPostSortColumn(sort: unknown) {
  if (sort === 'votes') return post.voteCount
  return sort === 'comments' ? post.commentCount : post.createdAt
}

// Posts filed from one inbox conversation: moderators only, and the
// conversation must belong to this org.
async function sourceConversationFilter(event: H3Event, orgId: string, value: unknown) {
  await requireOrgPermission(event, { feedlog: ['moderate'] })
  const parsed = z.uuid().safeParse(value)
  if (!parsed.success) throw createError({ statusCode: 422, message: 'Invalid source conversation' })
  const [source] = await useDB()
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.id, parsed.data), eq(conversation.orgId, orgId)))
    .limit(1)
  if (!source) throw createError({ statusCode: 404, message: 'Conversation not found' })
  return eq(post.sourceConversationId, parsed.data)
}
