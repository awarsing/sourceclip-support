import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import { comment, commentLike, member, post, user } from '../db/schemas'
import { decodeListCursor, nextListCursor, readPageSize, splitPage, type ListCursor } from './list-cursor'

// Read side of GET /api/posts/:postId/comments: top-level comments with
// optional eager children, the replies of one parent, and the inline preview of
// posts merged into this one.

type ThreadDB = ReturnType<typeof useDB>

export interface CommentListQuery {
  parentId?: string
  cursor?: string
  limit: number
  sort: string
  withChildren: boolean
  childrenLimit: number
}

export function parseCommentListQuery(query: Record<string, unknown>): CommentListQuery {
  return {
    parentId: query.parentId as string | undefined,
    cursor: query.cursor as string | undefined,
    limit: readPageSize(query.limit, 10, 100),
    sort: (query.sort as string) || 'oldest',
    withChildren: query.withChildren === 'true',
    childrenLimit: readPageSize(query.childrenLimit, 5, 20),
  }
}

interface ThreadContext {
  db: ThreadDB
  postId: string
  userId: string | undefined
  adminIds: Set<string>
  query: CommentListQuery
}

const replyColumns = {
  id: comment.id,
  parentId: comment.parentId,
  replyToId: comment.replyToId,
  likeCount: comment.likeCount,
  authorId: comment.authorId,
  authorName: user.name,
  authorImage: user.image,
  authorIsAnonymous: user.isAnonymous,
  content: comment.content,
  editedAt: comment.editedAt,
  createdAt: comment.createdAt,
}

const topLevelColumns = {
  ...replyColumns,
  replyCount: comment.replyCount,
  type: comment.type,
  metadata: comment.metadata,
}

interface CommentRow {
  id: string
  parentId: string | null
  replyToId: string | null
  replyCount?: number | null
  likeCount: number
  authorId: string
  authorName: string | null
  authorImage: string | null
  authorIsAnonymous: boolean | null
  content: string
  type?: string | null
  metadata?: unknown
  editedAt: Date | null
  createdAt: Date
}

const EMPTY_PAGE = { data: [], pagination: { nextCursor: null } }

// Comment authors who are owners or managers get the admin badge.
export async function findAdminAuthorIds(db: ThreadDB, orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, orgId), inArray(member.role, ['owner', 'manager'])))
  return new Set(rows.map((r) => r.userId))
}

export function formatComment(r: CommentRow & { hasLiked?: boolean }, adminIds: Set<string>) {
  return {
    id: r.id,
    parentId: r.parentId,
    replyToId: r.replyToId,
    replyCount: r.replyCount ?? undefined,
    likeCount: r.likeCount,
    hasLiked: r.hasLiked ?? false,
    author: {
      id: r.authorId,
      name: r.authorName,
      image: r.authorImage,
      isAnonymous: !!r.authorIsAnonymous,
      isAdmin: adminIds.has(r.authorId),
    },
    content: r.content,
    type: r.type ?? 'comment',
    editedAt: r.editedAt,
    createdAt: r.createdAt,
  }
}

type FormattedComment = ReturnType<typeof formatComment>

// Formats rows and marks the ones the viewer liked, in one batch query.
async function withLikeStatus(ctx: ThreadContext, items: CommentRow[]): Promise<FormattedComment[]> {
  if (!ctx.userId || items.length === 0) {
    return items.map((r) => formatComment(r, ctx.adminIds))
  }
  const likes = await ctx.db
    .select({ commentId: commentLike.commentId })
    .from(commentLike)
    .where(
      and(
        eq(commentLike.userId, ctx.userId),
        inArray(
          commentLike.commentId,
          items.map((r) => r.id),
        ),
      ),
    )
  const liked = new Set(likes.map((l) => l.commentId))
  return items.map((r) => ({ ...formatComment(r, ctx.adminIds), hasLiked: liked.has(r.id) }))
}

// The merged post a `mergedPost` comment points at, if any.
export function mergedPostIdOf(row: { type?: string | null; metadata?: unknown }): string | undefined {
  if (row.type !== 'mergedPost' || !row.metadata) return undefined
  return (row.metadata as { merged_post_id?: string }).merged_post_id || undefined
}

// Groups rows by `key`, keeping at most `limit` per group in order.
export function groupRows<T>(rows: T[], key: (row: T) => string, limit = Number.POSITIVE_INFINITY): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(key(row)) ?? []
    if (group.length < limit) group.push(row)
    groups.set(key(row), group)
  }
  return groups
}

// One page of replies under `parentId`, oldest first.
export async function listReplies(ctx: ThreadContext, parentId: string) {
  const conditions = [eq(comment.postId, ctx.postId), eq(comment.parentId, parentId)]
  const cursor = decodeListCursor(ctx.query.cursor)
  if (cursor) {
    conditions.push(sql`(${comment.createdAt}, ${comment.id}) > (${cursor.s}::timestamptz, ${cursor.id}::uuid)`)
  }
  const rows = await ctx.db
    .select(replyColumns)
    .from(comment)
    .leftJoin(user, eq(comment.authorId, user.id))
    .where(and(...conditions))
    .orderBy(asc(comment.createdAt), asc(comment.id))
    .limit(ctx.query.limit + 1)

  const { items, hasMore } = splitPage(rows, ctx.query.limit)
  return {
    data: await withLikeStatus(ctx, items),
    pagination: { nextCursor: nextListCursor(items, hasMore, (last) => ({ s: last.createdAt, id: last.id })) },
  }
}

export function topLevelCursorCondition(sort: string, cursor: ListCursor): SQL {
  if (sort === 'top') return sql`(${comment.likeCount}, ${comment.id}) < (${cursor.s}::int, ${cursor.id}::uuid)`
  const compare = sort === 'newest' ? sql`<` : sql`>`
  return sql`(${comment.createdAt}, ${comment.id}) ${compare} (${cursor.s}::timestamptz, ${cursor.id}::uuid)`
}

export function topLevelOrder(sort: string): SQL[] {
  if (sort === 'newest') return [desc(comment.createdAt), desc(comment.id)]
  if (sort === 'top') return [desc(comment.likeCount), desc(comment.id)]
  return [asc(comment.createdAt), asc(comment.id)]
}

// One page of top-level comments (plain comments and merged-post markers).
export async function listTopLevelComments(ctx: ThreadContext) {
  const { sort, limit } = ctx.query
  const conditions = [eq(comment.postId, ctx.postId), isNull(comment.parentId)]
  const cursor = decodeListCursor(ctx.query.cursor)
  if (cursor) conditions.push(topLevelCursorCondition(sort, cursor))

  const rows = await ctx.db
    .select(topLevelColumns)
    .from(comment)
    .leftJoin(user, eq(comment.authorId, user.id))
    .where(and(...conditions))
    .orderBy(...topLevelOrder(sort))
    .limit(limit + 1)
  const { items, hasMore } = splitPage(rows, limit)

  const children = ctx.query.withChildren ? await loadChildren(ctx, items) : undefined
  const topData = await withLikeStatus(ctx, items)
  const merged = await loadMergedPosts(ctx, items)

  const data = topData.map((item, i) => {
    const result: Record<string, unknown> = {
      ...item,
      type: items[i]!.type ?? 'comment',
      children: children ? (children.get(item.id) ?? []) : undefined,
    }
    const mergedPostId = mergedPostIdOf(items[i]!)
    if (mergedPostId) result.mergedPost = merged.get(mergedPostId)
    return result
  })

  const nextCursor = nextListCursor(items, hasMore, (last) => ({
    s: sort === 'top' ? last.likeCount : last.createdAt,
    id: last.id,
  }))
  return { data, pagination: { nextCursor } }
}

// The first `childrenLimit` replies of each top-level comment.
async function loadChildren(ctx: ThreadContext, topItems: CommentRow[]): Promise<Map<string, FormattedComment[]>> {
  const children = new Map<string, FormattedComment[]>()
  if (topItems.length === 0) return children
  const rows = await ctx.db
    .select(replyColumns)
    .from(comment)
    .leftJoin(user, eq(comment.authorId, user.id))
    .where(
      and(
        eq(comment.postId, ctx.postId),
        isNotNull(comment.parentId),
        inArray(
          comment.parentId,
          topItems.map((t) => t.id),
        ),
      ),
    )
    .orderBy(asc(comment.createdAt))
  for (const [parentId, group] of groupRows(rows, (r) => r.parentId!, ctx.query.childrenLimit)) {
    children.set(parentId, await withLikeStatus(ctx, group))
  }
  return children
}

const mergedPostInfoColumns = {
  id: post.id,
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  commentCount: post.commentCount,
  authorId: post.authorId,
  authorName: user.name,
  authorImage: user.image,
  authorIsAnonymous: user.isAnonymous,
}

async function findMergedPostInfo(ctx: ThreadContext, ids: string[], withCommentCount: boolean) {
  const info = new Map<string, Record<string, unknown>>()
  if (ids.length === 0) return info
  const rows = await ctx.db
    .select(mergedPostInfoColumns)
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(inArray(post.id, ids))
  for (const r of rows) {
    info.set(r.id, {
      id: r.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      ...(withCommentCount ? { commentCount: r.commentCount } : {}),
      author: { id: r.authorId, name: r.authorName, image: r.authorImage, isAnonymous: !!r.authorIsAnonymous },
    })
  }
  return info
}

// For each merged-post marker: the merged post and the first page of its own
// top-level comments. Markers inside those comments (a second merge level) get
// the post only, never its comments.
async function loadMergedPosts(ctx: ThreadContext, topItems: CommentRow[]) {
  const merged = new Map<string, unknown>()
  const ids = topItems.map(mergedPostIdOf).filter((id): id is string => !!id)
  if (ids.length === 0) return merged

  const { childrenLimit } = ctx.query
  const [info, subRows] = await Promise.all([
    findMergedPostInfo(ctx, ids, false),
    ctx.db
      .select({ ...topLevelColumns, postId: comment.postId })
      .from(comment)
      .leftJoin(user, eq(comment.authorId, user.id))
      .where(and(inArray(comment.postId, ids), isNull(comment.parentId)))
      .orderBy(asc(comment.createdAt), asc(comment.id))
      .limit((childrenLimit + 1) * ids.length),
  ])
  const grouped = groupRows(subRows, (r) => r.postId)
  const level2 = await findMergedPostInfo(
    ctx,
    subRows.map(mergedPostIdOf).filter((id): id is string => !!id),
    true,
  )

  for (const id of ids) {
    const { items, hasMore } = splitPage(grouped.get(id) ?? [], childrenLimit)
    const data = (await withLikeStatus(ctx, items)).map((c, i) => {
      const level2Info = level2.get(mergedPostIdOf(items[i]!) ?? '')
      return level2Info ? { ...c, type: 'mergedPost', mergedPost: { post: level2Info, comments: EMPTY_PAGE } } : c
    })
    merged.set(id, {
      post: info.get(id) ?? null,
      comments: {
        data,
        pagination: { nextCursor: nextListCursor(items, hasMore, (last) => ({ s: last.createdAt, id: last.id })) },
      },
    })
  }
  return merged
}
