import { and, eq, inArray, sql } from 'drizzle-orm'
import { post, user, vote } from '../db/schemas'

// The PostListItem row shape shared by the post list and search queries. The
// caller joins `user` on post.authorId.
export const postListColumns = {
  id: post.id,
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  status: post.status,
  boardId: post.boardId,
  voteCount: post.voteCount,
  commentCount: post.commentCount,
  mergedCount: sql<number>`(SELECT count(*)::int FROM post p2 WHERE p2.merged_to = ${post.id})`,
  authorId: post.authorId,
  authorName: user.name,
  authorImage: user.image,
  authorIsAnonymous: user.isAnonymous,
  createdAt: post.createdAt,
}

// The subset of postIds the user has voted on.
export async function findVotedPostIds(
  db: ReturnType<typeof useDB>,
  userId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()
  const votes = await db
    .select({ postId: vote.postId })
    .from(vote)
    .where(and(eq(vote.userId, userId), inArray(vote.postId, postIds)))
  return new Set(votes.map((v) => v.postId))
}
