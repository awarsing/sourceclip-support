import { z } from 'zod'
import { eq, and, asc, desc, sql } from 'drizzle-orm'
import { conversation, post, user } from '#layers/feedlog/server/db/schemas'

// GET /api/admin/posts — Admin post list (page pagination)
// Org-member gate only: the list itself is read-only and contributors need
// it to navigate the dashboard. Moderation actions (delete / merge /
// change-status / update:any) are gated on their own endpoints.
export default defineEventHandler(async (event): Promise<PagePaginatedList<PostListItem>> => {
  const { orgId } = await requireOrgMember(event)

  const query = getQuery(event)
  const sort = (query.sort as string) || 'createdAt'
  const order = query.order === 'asc' ? 'asc' : 'desc'
  const page = Math.max(Number(query.page) || 1, 1)
  const pageSize = Math.min(Number(query.pageSize) || 10, 100)
  const offset = (page - 1) * pageSize

  const db = useDB()

  const filters = postFilterConditions(parsePostFilter(query, orgId))
  if (query.sourceConversationId !== undefined) {
    await requireOrgPermission(event, { feedlog: ['moderate'] })
    const parsed = z.uuid().safeParse(query.sourceConversationId)
    if (!parsed.success) throw createError({ statusCode: 422, message: 'Invalid source conversation' })
    const [source] = await db
      .select({ id: conversation.id })
      .from(conversation)
      .where(and(eq(conversation.id, parsed.data), eq(conversation.orgId, orgId)))
      .limit(1)
    if (!source) throw createError({ statusCode: 404, message: 'Conversation not found' })
    filters.push(eq(post.sourceConversationId, parsed.data))
  }
  const whereClause = and(...filters)

  const sortCol = sort === 'votes' ? post.voteCount : sort === 'comments' ? post.commentCount : post.createdAt
  // The id tiebreaker follows the same direction, or equal-value rows shift between pages.
  const orderFn = order === 'asc' ? asc : desc

  const [countResult] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(post).where(whereClause)

  const rows = await db
    .select({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      status: post.status,
      boardId: post.boardId,
      voteCount: post.voteCount,
      commentCount: post.commentCount,
      mergedCount: sql<number>`(SELECT count(*)::int FROM post p2 WHERE p2.merged_to = ${post.id})`,
      authorId: post.authorId,
      authorName: user.name,
      authorImage: user.image,
      authorIsAnonymous: user.isAnonymous,
      createdAt: post.createdAt,
    })
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(whereClause)
    .orderBy(orderFn(sortCol), orderFn(post.id))
    .limit(pageSize)
    .offset(offset)

  return {
    data: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      status: r.status,
      boardId: r.boardId,
      voteCount: r.voteCount,
      commentCount: r.commentCount,
      mergedCount: r.mergedCount,
      hasVoted: false,
      author: { id: r.authorId, name: r.authorName, image: r.authorImage, isAnonymous: !!r.authorIsAnonymous },
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { page, pageSize, total: countResult?.total ?? 0 },
  }
})
