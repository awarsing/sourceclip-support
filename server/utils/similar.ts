import { sql, eq, and, ne, isNull, type SQL } from 'drizzle-orm'
import { post, postEmbedding, postSearch } from '../db/schemas'
import { user } from '../db/schemas/auth'
import { findVotedPostIds } from './post-list'

interface SimilarSearchOptions {
  orgId: string
  excludePostId?: string
  limit?: number
  userId?: string // for hasVoted check
}

export interface SimilarPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  status: string
  voteCount: number
  commentCount: number
  hasVoted: boolean
  author: { id: string; name: string | null; image: string | null; isAnonymous: boolean }
}

export async function searchSimilarByText(text: string, options: SimilarSearchOptions): Promise<SimilarPost[]> {
  const plainText = stripMarkdown(text)
  if (isEmbeddingEnabled()) {
    try {
      const embedding = await generateEmbedding(plainText)
      const matches = await searchSimilarByEmbedding(embedding, options)
      // Feedback can exist before its derived vector index has been populated.
      if (matches.length) return matches
    } catch {
      // Keep search available when the embedding provider or vector query fails.
    }
  }
  return searchSimilarByTrgm(plainText, options)
}

const similarColumns = {
  id: post.id,
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  status: post.status,
  voteCount: post.voteCount,
  commentCount: post.commentCount,
  authorId: post.authorId,
  authorName: user.name,
  authorImage: user.image,
  authorIsAnonymous: user.isAnonymous,
}

// Nearest canonical posts of the org by `distance`, over the posts that have a
// row in the index table `source`.
async function searchSimilar(
  options: SimilarSearchOptions,
  source: typeof postEmbedding | typeof postSearch,
  distance: SQL,
): Promise<SimilarPost[]> {
  const { orgId, excludePostId, limit = 3, userId } = options
  const db = useDB()

  const conditions = [eq(post.orgId, orgId), isNull(post.mergedTo)]
  if (excludePostId) conditions.push(ne(post.id, excludePostId))

  const rows = await db
    .select(similarColumns)
    .from(post)
    .innerJoin(source, eq(post.id, source.postId))
    .innerJoin(user, eq(post.authorId, user.id))
    .where(and(...conditions))
    .orderBy(distance)
    .limit(limit)

  const voted = userId
    ? await findVotedPostIds(
        db,
        userId,
        rows.map((r) => r.id),
      )
    : new Set<string>()
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    status: r.status,
    voteCount: r.voteCount,
    commentCount: r.commentCount,
    hasVoted: voted.has(r.id),
    author: { id: r.authorId, name: r.authorName, image: r.authorImage, isAnonymous: !!r.authorIsAnonymous },
  }))
}

// Search similar posts using pgvector cosine distance
export async function searchSimilarByEmbedding(
  embedding: number[],
  options: SimilarSearchOptions,
): Promise<SimilarPost[]> {
  const vectorStr = `[${embedding.join(',')}]`
  return searchSimilar(options, postEmbedding, sql`${postEmbedding.embedding} <=> ${vectorStr}::vector`)
}

// Search similar posts using pg_trgm text distance
export async function searchSimilarByTrgm(text: string, options: SimilarSearchOptions): Promise<SimilarPost[]> {
  return searchSimilar(options, postSearch, sql`${postSearch.searchText} <-> ${text}`)
}

// Search similar posts by existing post ID (uses stored embedding or fallback to trgm)
export async function searchSimilarByPostId(
  postId: string,
  options: Omit<SimilarSearchOptions, 'excludePostId'>,
): Promise<SimilarPost[]> {
  const db = useDB()

  // Try embedding first
  if (isEmbeddingEnabled()) {
    const [emb] = await db
      .select({ embedding: postEmbedding.embedding })
      .from(postEmbedding)
      .where(eq(postEmbedding.postId, postId))
      .limit(1)

    if (emb) {
      return searchSimilarByEmbedding(emb.embedding, { ...options, excludePostId: postId })
    }
  }

  // Fallback to trgm
  const [search] = await db
    .select({ searchText: postSearch.searchText })
    .from(postSearch)
    .where(eq(postSearch.postId, postId))
    .limit(1)

  if (search) {
    return searchSimilarByTrgm(search.searchText, { ...options, excludePostId: postId })
  }

  return []
}
