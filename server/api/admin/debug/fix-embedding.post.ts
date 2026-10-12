import { eq } from 'drizzle-orm'
import { post, postEmbedding, postSearch } from '#layers/feedlog/server/db/schemas'

// POST /api/admin/debug/fix-embedding — Backfill post_search and post_embedding
// Owner-only debug tool (gated on feedlog:moderate).
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgPermission(event, { feedlog: ['moderate'] })

  const body = (await readBody(event)) as { dryRun?: boolean } | null
  const dryRun = body?.dryRun ?? false

  // Fetch all posts in this org
  const posts = await useDB()
    .select({
      id: post.id,
      orgId: post.orgId,
      title: post.title,
      content: post.content,
      contentHash: post.contentHash,
    })
    .from(post)
    .where(eq(post.orgId, orgId))

  const embedding = { updated: 0, skipped: 0, failed: 0 }
  for (const p of posts) {
    const hash = computeContentHash(p.title, p.content)
    if (!dryRun) await backfillSearch(p, hash)
    // Embedding: check if needs update
    if (isEmbeddingEnabled()) embedding[await backfillEmbedding(p, hash, dryRun)]++
  }

  return {
    dryRun,
    total: posts.length,
    search: { updated: posts.length },
    embedding: { enabled: isEmbeddingEnabled(), ...embedding },
  }
})

interface BackfillPost {
  id: string
  orgId: string
  title: string
  content: string
  contentHash: string | null
}

// Always upsert post_search; update content_hash if missing or outdated.
async function backfillSearch(p: BackfillPost, hash: string): Promise<void> {
  const db = useDB()
  const searchText = stripMarkdown(p.title + '\n' + p.content)
  await db.insert(postSearch).values({ postId: p.id, orgId: p.orgId, searchText }).onConflictDoUpdate({
    target: postSearch.postId,
    set: { searchText },
  })
  if (p.contentHash !== hash) {
    await db.update(post).set({ contentHash: hash }).where(eq(post.id, p.id))
  }
}

// An embedding of the current text with the current model is kept; anything
// else is regenerated (or, in a dry run, counted as such).
async function backfillEmbedding(
  p: BackfillPost,
  hash: string,
  dryRun: boolean,
): Promise<'updated' | 'skipped' | 'failed'> {
  const [existing] = await useDB()
    .select({ contentHash: postEmbedding.contentHash, model: postEmbedding.model })
    .from(postEmbedding)
    .where(eq(postEmbedding.postId, p.id))
    .limit(1)
  if (existing?.contentHash === hash && existing.model === 'text-embedding-3-large') return 'skipped'
  if (dryRun) return 'updated'
  try {
    await generatePostEmbedding(p.id, p.orgId, p.title, p.content, hash)
    return 'updated'
  } catch (error) {
    console.error(`Failed to generate embedding for post ${p.id}:`, error)
    return 'failed'
  }
}
