import { and, eq } from 'drizzle-orm'
import { post, postSearch } from '#layers/feedlog/server/db/schemas'
import { authorUpdatePostSchema } from '#layers/feedlog/shared/schemas/post'

// PATCH /api/posts/:id — Edit a post's title/content. Any author can edit
// their own; moderators can edit anyone's (escalates via feedlog:moderate).
export default defineEventHandler(async (event) => {
  const { session, orgId } = await requireAuthInOrg(event)
  const id = getRouterParam(event, 'postId')!

  const db = useDB()

  const [existing] = await db
    .select({ id: post.id, authorId: post.authorId, title: post.title, content: post.content })
    .from(post)
    .where(and(eq(post.id, id), eq(post.orgId, orgId)))
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  if (existing.authorId !== session.user.id) {
    await requireOrgPermission(event, { feedlog: ['moderate'] })
  }

  const body = await readValidatedBody(event, authorUpdatePostSchema.parse)

  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = body.title
  if (body.content !== undefined) {
    updates.content = body.content
    updates.excerpt = generateExcerpt(body.content)
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  // Check if title or content changed (need to update hash/search/embedding)
  const newTitle = (updates.title as string) ?? existing.title
  const newContent = (updates.content as string) ?? existing.content
  const contentChanged = newTitle !== existing.title || newContent !== existing.content

  if (contentChanged) {
    updates.contentHash = computeContentHash(newTitle, newContent)
  }

  const [updated] = await db.update(post).set(updates).where(eq(post.id, id)).returning()

  // Update search text and trigger embedding if content changed
  if (contentChanged) {
    const searchText = stripMarkdown(newTitle + '\n' + newContent)
    await db.insert(postSearch).values({ postId: id, orgId, searchText }).onConflictDoUpdate({
      target: postSearch.postId,
      set: { searchText },
    })

    event.waitUntil(generatePostEmbedding(id, orgId, newTitle, newContent, updates.contentHash as string))
  }

  return updated
})
