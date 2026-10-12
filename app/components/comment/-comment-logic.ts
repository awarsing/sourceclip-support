// Pure rules for the comment components. The leading dash keeps Nuxt from
// registering this module as a component (ignorePrefix).
import type { CommentItem } from '../../../shared/types/comment'

type MergedPost = NonNullable<CommentItem['mergedPost']>

/** Classes and icon sizes for a top-level comment or a nested reply. */
export function commentSizing(nested: boolean) {
  return nested
    ? {
        row: 'ml-10',
        avatar: 8 as const,
        bubble: 'bg-secondary/30 border border-primary/10 p-3',
        name: 'text-xs',
        meta: 'text-[10px]',
        replyIcon: '10',
        menuIcon: '14',
        actions: 'mt-3',
        actionText: 'text-[11px]',
        actionIcon: '12',
      }
    : {
        row: '',
        avatar: 10 as const,
        bubble: 'bg-card border border-border p-4',
        name: 'text-sm',
        meta: 'text-xs',
        replyIcon: '12',
        menuIcon: '16',
        actions: 'mt-4',
        actionText: '',
        actionIcon: '14',
      }
}

export type CommentSizing = ReturnType<typeof commentSizing>

/** Replies not loaded yet under a top-level comment. */
export function remainingReplies(comment: Pick<CommentItem, 'replyCount' | 'children'>): number {
  return (comment.replyCount ?? 0) - (comment.children?.length ?? 0)
}

export function hasMoreReplies(comment: Pick<CommentItem, 'replyCount' | 'children'>, depth?: number): boolean {
  return !depth && remainingReplies(comment) > 0
}

/** Reply id to author name, so flattened replies can show who they answer. */
export function buildReplyAuthorMap(
  children: CommentItem[] | undefined,
  authorName: (author: CommentItem['author']) => string,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const child of children ?? []) {
    if (child.author) map.set(child.id, authorName(child.author))
  }
  return map
}

export function replyToName(
  comment: Pick<CommentItem, 'replyToId' | 'parentId'>,
  authors: Map<string, string> | undefined,
): string | null {
  const { replyToId, parentId } = comment
  if (!replyToId || replyToId === parentId) return null
  return authors?.get(replyToId) ?? null
}

export interface CommentPage {
  data: any[]
  cursor: string | null
}

export interface LoadingCommentPage extends CommentPage {
  loading: boolean
}

/** First-level comments of a merged post plus the pages loaded after them. */
export function mergedSubComments(mp: MergedPost | undefined, extra: Record<string, CommentPage>): any[] {
  if (!mp) return []
  return [...mp.comments.data, ...(extra[mp.post.id]?.data ?? [])]
}

export function hasMoreMergedComments(mp: MergedPost | undefined, extra: Record<string, CommentPage>): boolean {
  if (!mp) return false
  const loaded = extra[mp.post.id]
  // Once paging has started, its cursor wins over the initial pagination.
  if (loaded) return loaded.cursor !== null
  return !!mp.comments.pagination.nextCursor
}

/** The next page to request for a merged post, or null when there is none or one is in flight. */
export function nextMergedPage(
  mp: MergedPost | undefined,
  extra: Record<string, CommentPage>,
  loading: boolean,
): { postId: string; cursor: string; previous: any[] } | null {
  if (!mp || loading) return null
  const loaded = extra[mp.post.id]
  const cursor = loaded?.cursor ?? mp.comments.pagination.nextCursor
  return cursor ? { postId: mp.post.id, cursor, previous: loaded?.data ?? [] } : null
}

export function appendCommentPage(
  previous: any[],
  page: { data: any[]; pagination: { nextCursor: string | null } },
): CommentPage {
  return { data: [...previous, ...page.data], cursor: page.pagination.nextCursor }
}

export function commentPageParams(cursor: string | null | undefined) {
  return { sort: 'oldest', limit: 5, withChildren: 'false', ...(cursor ? { cursor } : {}) }
}

/** Starts loading a second-level merged post's comments; null while a load is already running. */
export function startCommentLoad(
  state: LoadingCommentPage | undefined,
): { state: LoadingCommentPage; cursor: string | undefined } | null {
  if (state?.loading) return null
  return {
    state: { data: state?.data ?? [], loading: true, cursor: state?.cursor ?? null },
    cursor: state?.cursor ?? undefined,
  }
}

export function canLoadMergedComments(commentCount: number | undefined, state: LoadingCommentPage | undefined) {
  if (!((commentCount ?? 0) > 0)) return false
  return !state || state.loading || state.cursor !== null
}

export function isMergedSubPost(comment: CommentItem): boolean {
  return comment.type === 'mergedPost' && !!comment.mergedPost?.post
}
