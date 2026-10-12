import { eq, and, isNull, sql } from 'drizzle-orm'
import { post, postSearch, user } from '#layers/feedlog/server/db/schemas'

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
    rows = await db
      .select(postListColumns)
      .from(post)
      .innerJoin(postSearch, eq(post.id, postSearch.postId))
      .leftJoin(user, eq(post.authorId, user.id))
      .where(and(eq(post.orgId, orgId), isNull(post.mergedTo)))
      .orderBy(sql`${postSearch.searchText} <-> ${q}`)
      .limit(PUBLIC_SEARCH_LIMIT)
  }

  // Batch hasVoted when authenticated (same pattern as GET /api/posts).
  const voted = session
    ? await findVotedPostIds(
        db,
        session.user.id,
        rows.map((r) => r.id),
      )
    : new Set<string>()

  const data: PostListItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    status: r.status,
    boardId: r.boardId,
    voteCount: r.voteCount,
    commentCount: r.commentCount,
    mergedCount: r.mergedCount,
    hasVoted: voted.has(r.id),
    author: { id: r.authorId, name: r.authorName, image: r.authorImage, isAnonymous: !!r.authorIsAnonymous },
    createdAt: r.createdAt.toISOString(),
  }))

  return { data }
})
