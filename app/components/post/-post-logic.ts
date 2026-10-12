// Pure rules for the post components. The leading dash keeps Nuxt from
// registering this module as a component (ignorePrefix).
import { STATUS_CONFIG } from '../../../shared/types/post'
import type { CommentItem } from '../../../shared/types/comment'

export type MergeDirection = 'bring' | 'push'

/** The i18n key of the first problem with an edited post, or null when it can be saved. */
export function postEditError(title: string, content: string): string | null {
  if (!title) return 'post.detail.errors.titleRequired'
  if (!content) return 'post.detail.errors.contentRequired'
  return null
}

/** The server's message for a failed request, or the fallback when it sent none. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { message?: string } } | null)?.data?.message || fallback
}

export function statusCodeOf(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode
}

/** `bring` merges the other post into this one; `push` merges this one into the other. */
export function mergeBody(direction: MergeDirection, currentId: string, otherId: string) {
  return direction === 'bring'
    ? { canonicalPostId: currentId, mergedPostId: otherId }
    : { canonicalPostId: otherId, mergedPostId: currentId }
}

export function statusNotifyBody(status: string, note: string) {
  return { status, note: note || undefined }
}

/** The status color variable, falling back to the open status for unknown values. */
export function statusCssVar(status: string): string {
  return (STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open).cssVar
}

export function statusBadgeStyle(status: string) {
  const cssVar = statusCssVar(status)
  return { color: `var(${cssVar})`, backgroundColor: `var(${cssVar}-bg)`, borderColor: `var(${cssVar}-border)` }
}

/** A comment by id among the top-level comments and their loaded replies. */
export function findComment(comments: CommentItem[], id: string): CommentItem | undefined {
  return (
    comments.find((comment) => comment.id === id) ||
    comments.flatMap((comment) => comment.children ?? []).find((child) => child.id === id)
  )
}

/** Where a reply to a comment goes: the comment itself when top-level, else its parent thread. */
export function replyTargetFor(
  comments: CommentItem[],
  commentId: string,
): { commentId: string; parentId: string } | null {
  if (comments.some((comment) => comment.id === commentId)) return { commentId, parentId: commentId }
  const parent = comments.find((comment) => comment.children?.some((child) => child.id === commentId))
  return parent ? { commentId, parentId: parent.id } : null
}

export function replyIds(target: { commentId: string; parentId: string }) {
  const { parentId, commentId } = target
  return { parentId, replyToId: commentId !== parentId ? commentId : undefined }
}

/** The i18n key of the first problem with a new post, or null when it can be submitted. */
export function submitError(boardId: string | null, title: string, content: string): string | null {
  if (!boardId) return 'post.submit.errors.selectBoard'
  if (!title.trim()) return 'post.submit.errors.titleRequired'
  if (!content.trim()) return 'post.submit.errors.contentRequired'
  return null
}

/** Board and prefilled draft applied when the submit modal opens. */
export function submitDefaults(
  defaultBoardId: string | undefined,
  boards: { id: string }[],
  prefill: { title?: string; body?: string } | undefined,
): { boardId: string | null; title?: string; body?: string } {
  return { boardId: defaultBoardId ?? boards[0]?.id ?? null, title: prefill?.title, body: prefill?.body }
}

export function similarSearchBody(title: string, content: string): Record<string, string> {
  const body: Record<string, string> = { title }
  if (content.trim()) body.content = content.trim()
  return body
}

/** Waits longer once a body is being written, so the hint does not interrupt it. */
export function similarSearchDelay(content: string): number {
  return content.trim() ? 1000 : 500
}
