import { eq, sql } from 'drizzle-orm'
import { createError, getRequestURL } from 'h3'
import type { H3Event } from 'h3'
import { comment, post, user } from '../db/schemas'

type CommentDB = ReturnType<typeof useDB>

// Replies are one level deep. Replying to a child comment files the reply under
// that child's parent and remembers the child as `replyToId`.
export async function resolveReplyTarget(
  db: CommentDB,
  parentId: string | undefined,
  replyToId: string | undefined,
): Promise<{ parentId: string | null; replyToId: string | null }> {
  if (!parentId) return { parentId: null, replyToId: replyToId ?? null }
  // Verify parent comment exists
  const [parent] = await db
    .select({ id: comment.id, parentId: comment.parentId })
    .from(comment)
    .where(eq(comment.id, parentId))
    .limit(1)
  if (!parent) {
    throw createError({ statusCode: 404, message: 'Parent comment not found' })
  }
  if (parent.parentId) return { parentId: parent.parentId, replyToId: parentId }
  return { parentId, replyToId: replyToId ?? null }
}

// A reply bumps its parent's replyCount; every comment bumps the post's count.
export async function countNewComment(db: CommentDB, postId: string, parentId: string | null): Promise<void> {
  if (parentId) {
    await db
      .update(comment)
      .set({ replyCount: sql`${comment.replyCount} + 1` })
      .where(eq(comment.id, parentId))
  }
  await db
    .update(post)
    .set({ commentCount: sql`${post.commentCount} + 1` })
    .where(eq(post.id, postId))
}

export interface NewCommentNotice {
  orgId: string
  postId: string
  postSlug: string
  postTitle: string
  content: string
  actorId: string
  actorIsAdmin: boolean
  isTopLevel: boolean
  notifyVoters: boolean
}

// Best-effort, after the write. Subscribers only hear from an admin's top-level
// comment (resolveCommentEvents no-ops for replies / non-admins). Author +
// manual subscribers always get it; upvoters only when notifyVoters isn't false.
// Admins hear about comments from everyone else.
export function queueCommentNotifications(event: H3Event, notice: NewCommentNotice): void {
  const requestOrigin = getRequestURL(event).origin
  event.waitUntil(
    emitCommentNotifications({
      orgId: notice.orgId,
      postId: notice.postId,
      snippet: notice.content,
      actorId: notice.actorId,
      authorIsAdmin: notice.actorIsAdmin,
      isTopLevel: notice.isTopLevel,
      notifyVoters: notice.notifyVoters,
      requestOrigin,
    }).catch((err: unknown) => console.error('[notifications] comment emit failed', err)),
  )
  if (notice.actorIsAdmin) return
  event.waitUntil(
    emitAdminNotification({
      orgId: notice.orgId,
      typeKey: 'post.user_commented',
      postSlug: notice.postSlug,
      postTitle: notice.postTitle,
      snippet: notice.content,
      actorId: notice.actorId,
      requestOrigin,
    }).catch((err: unknown) => console.error('[notifications] comment admin emit failed', err)),
  )
}

// The new comment as the comment list shows it.
export async function toCreatedComment(
  db: CommentDB,
  created: typeof comment.$inferSelect,
  actorId: string,
  actorIsAdmin: boolean,
) {
  const [author] = await db
    .select({ id: user.id, name: user.name, image: user.image, isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, actorId))
  return {
    id: created.id,
    parentId: created.parentId,
    replyToId: created.replyToId,
    replyCount: created.replyCount,
    likeCount: created.likeCount,
    hasLiked: false,
    author: {
      ...(author ?? { id: actorId, name: null, image: null }),
      isAnonymous: !!author?.isAnonymous,
      isAdmin: actorIsAdmin,
    },
    content: created.content,
    editedAt: created.editedAt,
    createdAt: created.createdAt,
  }
}
