import { and, eq, sql } from 'drizzle-orm'
import { conversation, post, vote } from '../db/schemas'

// Viewer-specific parts of GET /api/posts/:slug.

type DetailDB = ReturnType<typeof useDB>

// Whether a row exists in `table` for the user on this post or, for a canonical
// post, on any post merged into it (recursively).
async function existsInMergeFamily(db: DetailDB, postId: string, userId: string, table: 'vote' | 'post_subscription') {
  const [result] = await db.execute(sql`
    WITH RECURSIVE family AS (
      SELECT id FROM post WHERE id = ${postId}
      UNION ALL
      SELECT p.id FROM post p JOIN family f ON p.merged_to = f.id
    )
    SELECT EXISTS(
      SELECT 1 FROM ${sql.identifier(table)} WHERE user_id = ${userId} AND post_id IN (SELECT id FROM family)
    ) as found
  `)
  return !!(result as { found?: boolean } | undefined)?.found
}

// hasVoted: for a canonical post with merged posts, a vote anywhere in the merge
// family counts; otherwise only a vote on this post.
export async function findPostHasVoted(
  db: DetailDB,
  row: { id: string; mergedTo: string | null; mergedCount: number },
  userId: string,
): Promise<boolean> {
  if (!row.mergedTo && row.mergedCount > 0) return existsInMergeFamily(db, row.id, userId, 'vote')
  const [v] = await db
    .select({ postId: vote.postId })
    .from(vote)
    .where(and(eq(vote.postId, row.id), eq(vote.userId, userId)))
    .limit(1)
  return !!v
}

// subscribed: is the user on this post's notification list, across the whole
// merge family. Drives the sidebar subscribe card's button state.
export function findPostSubscribed(db: DetailDB, postId: string, userId: string): Promise<boolean> {
  return existsInMergeFamily(db, postId, userId, 'post_subscription')
}

// The inbox conversation a post was filed from, by title. Only owners and
// managers (who can read the inbox) see it.
export async function findSourceConversation(
  db: DetailDB,
  orgId: string,
  sourceConversationId: string | null,
): Promise<{ sourceConversationId: string | null; sourceConversationTitle: string | null }> {
  if (!sourceConversationId) return { sourceConversationId, sourceConversationTitle: null }
  const [source] = await db
    .select({ title: conversation.title })
    .from(conversation)
    .where(and(eq(conversation.id, sourceConversationId), eq(conversation.orgId, orgId)))
    .limit(1)
  return { sourceConversationId, sourceConversationTitle: source?.title ?? null }
}

// Where a merged post now lives.
export async function findCanonicalPost(
  db: DetailDB,
  mergedTo: string | null,
): Promise<{ slug: string; title: string } | undefined> {
  if (!mergedTo) return undefined
  const [canonical] = await db
    .select({ slug: post.slug, title: post.title })
    .from(post)
    .where(eq(post.id, mergedTo))
    .limit(1)
  return canonical
}
