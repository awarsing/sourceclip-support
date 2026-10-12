import { and, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { comment, post } from '../db/schemas'

type ScopeDB = ReturnType<typeof useDB>

// The signed-in caller, the org and the :postId of a post write route.
export async function requirePostRoute(event: H3Event) {
  const { session, orgId } = await requireAuthInOrg(event)
  return { session, orgId, postId: getRouterParam(event, 'postId')!, db: useDB() }
}

// The post must exist in this org; anything else is a 404 that does not leak
// posts of other orgs. Returns the columns of `post` named in `columns`.
export async function requireOrgPost<K extends keyof typeof post.$inferSelect>(
  db: ScopeDB,
  orgId: string,
  postId: string,
  columns: readonly K[] = [],
): Promise<Pick<typeof post.$inferSelect, K>> {
  const selection: Record<string, AnyPgColumn> = Object.fromEntries(
    ['id', ...columns].map((key) => [key, post[key as K]]),
  )
  const [row] = await db
    .select(selection)
    .from(post)
    .where(and(eq(post.id, postId), eq(post.orgId, orgId)))
    .limit(1)
  if (!row) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }
  return row as unknown as Pick<typeof post.$inferSelect, K>
}

// A comment is org-scoped through its post.
export async function requireOrgComment(db: ScopeDB, orgId: string, commentId: string) {
  const [row] = await db
    .select({
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      replyCount: comment.replyCount,
      authorId: comment.authorId,
    })
    .from(comment)
    .leftJoin(post, eq(comment.postId, post.id))
    .where(and(eq(comment.id, commentId), eq(post.orgId, orgId)))
    .limit(1)
  if (!row) {
    throw createError({ statusCode: 404, message: 'Comment not found' })
  }
  return row
}

// The signed-in caller and the org-scoped :id comment of a comment route.
export async function requireCommentRoute(event: H3Event) {
  const { session, orgId } = await requireAuthInOrg(event)
  const id = getRouterParam(event, 'id')!
  const db = useDB()
  return { session, orgId, id, db, existing: await requireOrgComment(db, orgId, id) }
}

// Counter reads and updates for one-click reactions. A decrement never goes
// below zero, and a missing row reads as zero.
export async function postVoteCount(db: ScopeDB, postId: string, delta: -1 | 0 | 1 = 0): Promise<number> {
  const [row] =
    delta === 0
      ? await db.select({ voteCount: post.voteCount }).from(post).where(eq(post.id, postId))
      : await db
          .update(post)
          .set({ voteCount: delta > 0 ? sql`${post.voteCount} + 1` : sql`greatest(${post.voteCount} - 1, 0)` })
          .where(eq(post.id, postId))
          .returning({ voteCount: post.voteCount })
  return row?.voteCount ?? 0
}

export async function commentLikeCount(db: ScopeDB, commentId: string, delta: -1 | 0 | 1 = 0): Promise<number> {
  const [row] =
    delta === 0
      ? await db.select({ likeCount: comment.likeCount }).from(comment).where(eq(comment.id, commentId))
      : await db
          .update(comment)
          .set({ likeCount: delta > 0 ? sql`${comment.likeCount} + 1` : sql`greatest(${comment.likeCount} - 1, 0)` })
          .where(eq(comment.id, commentId))
          .returning({ likeCount: comment.likeCount })
  return row?.likeCount ?? 0
}
