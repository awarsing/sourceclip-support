import { and, desc } from 'drizzle-orm'
import { post } from '#layers/feedlog/server/db/schemas'
import type { PostListRow } from '#layers/feedlog/server/utils/post-list-items'

// GET /api/admin/posts/search — Admin feedback search, semantic within the active
// filters (no threshold → nearest-N, consistent with the similar-posts search), with a pg_trgm
// nearest-N fallback (post_search `<->`) when embeddings are unavailable. While a query
// is active this returns a flat top-N (no offset pagination; the sort dropdown is inert),
// mirroring the changelog list. Empty query → the caller uses /api/admin/posts instead.
const ADMIN_SEARCH_LIMIT = 50

export default defineEventHandler(async (event): Promise<PagePaginatedList<PostListItem>> => {
  const { orgId } = await requireOrgMember(event)

  const query = getQuery(event)
  const q = ((query.q as string | undefined) ?? '').trim()
  const filter = parsePostFilter(query, orgId)

  const db = useDB()

  const embedding = q ? await embedQueryOrNull(q) : null

  if (q && embedding) {
    const rows = await searchPostsBySemantic(embedding, {
      filter,
      limit: ADMIN_SEARCH_LIMIT,
    })
    return flat(rows)
  }

  // Fallback (embeddings unavailable): pg_trgm nearest-N over post_search — whole-string
  // `<->` distance, no text threshold, WITHIN the active filters — matching
  // searchSimilarByTrgm. post_search is sync-maintained on post create/update.
  const whereClause = and(...postFilterConditions(filter))

  const rows = await searchPostsByText(db, q, whereClause, ADMIN_SEARCH_LIMIT, desc(post.id))

  return flat(rows)
})

function flat(rows: PostListRow[]): PagePaginatedList<PostListItem> {
  return {
    data: rows.map((r) => toPostListItem(r, NO_VOTED_POSTS)),
    pagination: { page: 1, pageSize: rows.length, total: rows.length },
  }
}
