import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { post, postSearch } from '../db/schemas'
import { generateExcerpt, stripMarkdown } from '../../shared/utils/markdown'
import { computeContentHash } from './hash'

export interface PostUpdateBody {
  title?: string
  content?: string
  status?: string
  boardId?: string | null
}

export interface PostUpdatePlan {
  updates: Record<string, unknown>
  title: string
  content: string
  contentChanged: boolean
}

// The columns a post edit writes. A new title or content refreshes the excerpt
// and, when the text really changed, the content hash. Nothing to write is a 400.
export function planPostUpdate(body: PostUpdateBody, existing: { title: string; content: string }): PostUpdatePlan {
  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = body.title
  if (body.content !== undefined) {
    updates.content = body.content
    updates.excerpt = generateExcerpt(body.content)
  }
  if (body.status !== undefined) updates.status = body.status
  if (body.boardId !== undefined) updates.boardId = body.boardId

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  const title = body.title ?? existing.title
  const content = body.content ?? existing.content
  const contentChanged = title !== existing.title || content !== existing.content
  if (contentChanged) updates.contentHash = computeContentHash(title, content)
  return { updates, title, content, contentChanged }
}

// Writes the plan to a post of this org. Changed text also refreshes the search
// row and, in the background, the embedding.
export async function savePostUpdate(event: H3Event, orgId: string, id: string, plan: PostUpdatePlan) {
  const db = useDB()
  const [updated] = await db
    .update(post)
    .set(plan.updates)
    .where(and(eq(post.id, id), eq(post.orgId, orgId)))
    .returning()

  if (plan.contentChanged) {
    const searchText = stripMarkdown(plan.title + '\n' + plan.content)
    await db.insert(postSearch).values({ postId: id, orgId, searchText }).onConflictDoUpdate({
      target: postSearch.postId,
      set: { searchText },
    })
    event.waitUntil(generatePostEmbedding(id, orgId, plan.title, plan.content, plan.updates.contentHash as string))
  }
  return updated
}
