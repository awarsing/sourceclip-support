import { and, count, desc, eq, sql } from 'drizzle-orm'
import { post, postUnread } from '#layers/feedlog/server/db/schemas'
import type { CursorPaginatedList } from '#layers/feedlog/shared/types/pagination'

export interface WidgetFeedbackItem {
  id: string
  slug: string
  title: string
  status: string
  voteCount: number
  createdAt: Date
  unread: boolean
}

// The visitor's own feedback, newest first, each flagged with whether it has an
// unread admin update. requireAuthInOrg, not requireOrgMember: the caller is an
// end user of the customer's product, never a FeedLog staff member.
// `total` rides along so the header can count posts without paging to the end.
export default defineEventHandler(
  async (event): Promise<CursorPaginatedList<WidgetFeedbackItem> & { total: number }> => {
    const { session, orgId } = await requireAuthInOrg(event)
    const userId = session.user.id
    const query = getQuery(event)
    const pageSize = readPageSize(query.pageSize, 20, 50)

    const conditions = [eq(post.orgId, orgId), eq(post.authorId, userId)]

    const cursor = decodeTimestampCursor(query.cursor as string | undefined)
    if (cursor) {
      conditions.push(sql`(${post.createdAt}, ${post.id}) < (${cursor.s}::timestamptz, ${cursor.id}::uuid)`)
    }

    // Merged posts stay in the list: merging freezes a post but the author still
    // has updates on it worth reading, and the badge counts them, so hiding them
    // here would leave a count the list can't account for.
    const rows = await useDB()
      .select({
        id: post.id,
        slug: post.slug,
        title: post.title,
        status: post.status,
        voteCount: post.voteCount,
        createdAt: post.createdAt,
        unreadAt: postUnread.createdAt,
      })
      .from(post)
      .leftJoin(postUnread, and(eq(postUnread.postId, post.id), eq(postUnread.userId, userId)))
      .where(and(...conditions))
      .orderBy(desc(post.createdAt), desc(post.id))
      .limit(pageSize + 1)

    const { items, hasMore } = splitPage(rows, pageSize)
    const data = items.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      voteCount: r.voteCount,
      createdAt: r.createdAt,
      unread: r.unreadAt !== null,
    }))

    const nextCursor = nextListCursor(data, hasMore, (last) => ({ s: last.createdAt, id: last.id }))

    // Counted without the cursor condition, so it stays the same on every page.
    const [totalRow] = await useDB()
      .select({ value: count() })
      .from(post)
      .where(and(eq(post.orgId, orgId), eq(post.authorId, userId)))

    return { data, total: Number(totalRow?.value ?? 0), pagination: { nextCursor } }
  },
)
