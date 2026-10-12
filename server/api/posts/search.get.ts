import { eq, and, isNull } from 'drizzle-orm'
import { post } from '#layers/feedlog/server/db/schemas'

// GET /api/posts/search?q=&limit= — Public semantic search over an org's feedback.
//
// Fully consistent with the similar-posts search: embed the query and return the nearest N by
// pgvector cosine distance with NO threshold — always shows the closest posts (no
// empty-state cutoff). Anonymous callers are rate-limited; when embeddings are
// disabled / errored / over-limit it degrades to a pg_trgm nearest-N over post_search
// (the same whole-string `<->` distance searchSimilarByTrgm uses),
// never 5xx. post_search is sync-maintained on post create/update.
const PUBLIC_SEARCH_LIMIT = 30
const RATE_LIMIT = { limit: 20, windowSeconds: 60 }

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const query = getQuery(event)
  const orgId = event.context.orgId!

  const q = ((query.q as string | undefined) ?? '').trim()
  if (!q) return { data: [] as PostListItem[] }

  const db = useDB()

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const allowed = await checkRateLimit(`posts-search:${ip}`, RATE_LIMIT)
  const embedding = allowed ? await embedQueryOrNull(q) : null

  let rows
  if (embedding) {
    rows = await searchPostsBySemantic(embedding, {
      filter: { orgId, merged: 'canonical_only' },
      limit: PUBLIC_SEARCH_LIMIT,
    })
  } else {
    // Fallback (embeddings unavailable): pg_trgm nearest-N over post_search, matching
    // searchSimilarByTrgm — whole-string `<->` distance, no threshold,
    // global across boards. post_search is sync-written on post create/update.
    rows = await searchPostsByText(db, q, and(eq(post.orgId, orgId), isNull(post.mergedTo)), PUBLIC_SEARCH_LIMIT)
  }

  // Batch hasVoted when authenticated (same pattern as GET /api/posts).
  const voted = await findSessionVotedPostIds(db, session, rows)
  const data: PostListItem[] = rows.map((r) => toPostListItem(r, voted))

  return { data }
})
