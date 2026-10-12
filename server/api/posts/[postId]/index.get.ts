import { eq, and, sql } from 'drizzle-orm'
import { post, user } from '#layers/feedlog/server/db/schemas'

// GET /api/posts/:slug — Get post detail
export default defineEventHandler(async (event): Promise<PostDetail> => {
  const session = await getUserSession(event)
  const orgId = event.context.orgId!
  const slug = getRouterParam(event, 'postId')!

  const db = useDB()

  const [row] = await db
    .select({
      id: post.id,
      sourceConversationId: post.sourceConversationId,
      slug: post.slug,
      title: post.title,
      content: post.content,
      status: post.status,
      boardId: post.boardId,
      voteCount: post.voteCount,
      commentCount: post.commentCount,
      mergedTo: post.mergedTo,
      mergedCount: sql<number>`(SELECT count(*)::int FROM post p2 WHERE p2.merged_to = ${post.id})`,
      authorId: post.authorId,
      authorName: user.name,
      authorImage: user.image,
      authorEmail: user.email,
      authorIsAnonymous: user.isAnonymous,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    })
    .from(post)
    .leftJoin(user, eq(post.authorId, user.id))
    .where(and(eq(post.slug, slug), eq(post.orgId, orgId)))
    .limit(1)

  if (!row) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  const userId = session?.user.id
  const hasVoted = userId ? await findPostHasVoted(db, row, userId) : false
  const subscribed = userId ? await findPostSubscribed(db, row.id, userId) : false

  // Gates author.email below: shipping it to end users would hand every
  // reporter's address to anyone who opens a post.
  //
  // A guest's address is a reserved-domain placeholder nobody can write to, so it
  // is withheld from staff as well — showing it only invites someone to try.
  const role = getOrgMemberRole(session, orgId)
  const canReadInbox = role === 'owner' || role === 'manager'
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const showAuthorEmail = !!role && !row.authorIsAnonymous

  // Fetch the display title only after the same permission check as the source ID.
  const source = canReadInbox ? await findSourceConversation(db, orgId, row.sourceConversationId) : {}

  return {
    id: row.id,
    ...source,
    slug: row.slug,
    title: row.title,
    content: row.content,
    status: row.status,
    boardId: row.boardId,
    voteCount: row.voteCount,
    commentCount: row.commentCount,
    mergedTo: row.mergedTo,
    mergedCount: row.mergedCount,
    hasVoted,
    subscribed,
    author: {
      id: row.authorId,
      name: row.authorName,
      image: row.authorImage,
      isAnonymous: !!row.authorIsAnonymous,
      ...(showAuthorEmail ? { email: row.authorEmail } : {}),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // If merged, the canonical post's slug and title
    canonicalPost: await findCanonicalPost(db, row.mergedTo),
  }
})
