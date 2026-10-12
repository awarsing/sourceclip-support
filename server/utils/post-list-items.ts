import { eq, sql, type SQL } from 'drizzle-orm'
import { post, postSearch, user } from '../db/schemas'
import type { PostListItem } from '../../shared/types/post'
import type { ListCursor } from './list-cursor'
import { findVotedPostIds, postListColumns } from './post-list'

// A row selected with postListColumns.
export interface PostListRow {
  id: string
  slug: string
  title: string
  excerpt: string | null
  status: string
  boardId: string | null
  voteCount: number
  commentCount: number
  mergedCount: number
  authorId: string
  authorName: string | null
  authorImage: string | null
  authorIsAnonymous: boolean | null
  createdAt: Date
}

// Admin lists never show the viewer's own votes.
export const NO_VOTED_POSTS: ReadonlySet<string> = new Set()

export function toPostListItem(row: PostListRow, voted: ReadonlySet<string>): PostListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    status: row.status,
    boardId: row.boardId,
    voteCount: row.voteCount,
    commentCount: row.commentCount,
    mergedCount: row.mergedCount,
    hasVoted: voted.has(row.id),
    author: { id: row.authorId, name: row.authorName, image: row.authorImage, isAnonymous: !!row.authorIsAnonymous },
    createdAt: row.createdAt.toISOString(),
  }
}

// hasVoted for a page of rows; nobody has voted when there is no session.
export function findSessionVotedPostIds(
  db: Parameters<typeof findVotedPostIds>[0],
  session: { user: { id: string } } | null,
  rows: { id: string }[],
): Promise<Set<string>> {
  if (!session) return Promise.resolve(new Set())
  return findVotedPostIds(
    db,
    session.user.id,
    rows.map((r) => r.id),
  )
}

// Keyset condition after `cursor` for the public list, matching its ORDER BY
// (sort column, then id, both in `order`).
export function postListCursorCondition(sort: string, order: string, cursor: ListCursor): SQL {
  const column = sort === 'votes' ? sql`${post.voteCount}` : sql`${post.createdAt}`
  const cast = sort === 'votes' ? sql`::int` : sql`::timestamptz`
  const compare = order === 'desc' ? sql`<` : sql`>`
  return sql`(${column}, ${post.id}) ${compare} (${cursor.s}${cast}, ${cursor.id}::uuid)`
}

// pg_trgm nearest-N over post_search: whole-string `<->` distance with no
// threshold, the fallback when embeddings are unavailable. post_search is
// sync-maintained on post create/update.
export function searchPostsByText(
  db: Parameters<typeof findVotedPostIds>[0],
  q: string,
  where: SQL | undefined,
  limit: number,
  ...tiebreak: SQL[]
) {
  return db
    .select(postListColumns)
    .from(post)
    .innerJoin(postSearch, eq(post.id, postSearch.postId))
    .leftJoin(user, eq(post.authorId, user.id))
    .where(where)
    .orderBy(sql`${postSearch.searchText} <-> ${q}`, ...tiebreak)
    .limit(limit)
}
