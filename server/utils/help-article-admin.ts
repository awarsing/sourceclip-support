import { and, eq, inArray, type SQL } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { helpArticle, helpCollection } from '../db/schemas'
import { bulkHelpArticleSchema } from '../../shared/schemas/help'

type HelpArticleUpdates = Record<string, unknown>

interface HelpArticleText {
  title: string
  description: string | null
  content: string
}

export interface HelpArticleState extends HelpArticleText {
  status: string
  publishedAt: Date | null
  collectionId: string
}

export interface HelpArticleEdit {
  title?: string
  description?: string | null
  content?: string
  status?: string
  collectionId?: string
  aiEnabled?: boolean
}

// The text an edit leaves behind. Changed text rewrites the search vector, and a
// new title a new slug.
export function planHelpArticleText(existing: HelpArticleState, body: HelpArticleEdit) {
  const next: HelpArticleText = {
    title: body.title ?? existing.title,
    description: body.description === undefined ? existing.description : body.description,
    content: body.content ?? existing.content,
  }
  const contentChanged =
    next.title !== existing.title || next.description !== existing.description || next.content !== existing.content
  const updates: HelpArticleUpdates = {}
  if (contentChanged) {
    Object.assign(updates, next, {
      tsv: buildHelpTsv(next.title, next.description, next.content),
      updatedAt: new Date(),
    })
    if (next.title !== existing.title) updates.slug = generateHelpSlug(next.title)
  }
  return { next, contentChanged, updates }
}

// Status transitions. Editing an archived article reopens it as a draft;
// publishing needs a title and content; only a published article can be archived.
export function planHelpArticleStatus(
  existing: HelpArticleState,
  requested: string | undefined,
  next: HelpArticleText,
  contentChanged: boolean,
): HelpArticleUpdates {
  const status = requested ?? (existing.status === 'archived' && contentChanged ? 'draft' : undefined)
  if (status === 'published') return publishUpdates(existing, next)
  if (status === 'archived' && existing.status !== 'published') {
    throw createError({ statusCode: 409, message: 'Only a published article can be unpublished' })
  }
  return status ? { status } : {}
}

function publishUpdates(existing: HelpArticleState, next: HelpArticleText): HelpArticleUpdates {
  if (!next.title.trim()) {
    throw createError({ statusCode: 400, message: 'Title is required to publish' })
  }
  if (!next.content.trim()) {
    throw createError({ statusCode: 400, message: 'Content is required to publish' })
  }
  return existing.publishedAt ? { status: 'published' } : { status: 'published', publishedAt: new Date() }
}

// Moving to another collection of this org appends the article to its end.
export async function planHelpArticleMove(
  orgId: string,
  existing: HelpArticleState,
  collectionId: string | undefined,
): Promise<HelpArticleUpdates> {
  if (!collectionId || collectionId === existing.collectionId) return {}
  await requireHelpCollection(orgId, collectionId)
  return { collectionId, position: await nextHelpArticlePosition(collectionId) }
}

export async function requireHelpCollection(orgId: string, collectionId: string): Promise<void> {
  const [collection] = await useDB()
    .select({ id: helpCollection.id })
    .from(helpCollection)
    .where(and(eq(helpCollection.id, collectionId), eq(helpCollection.orgId, orgId)))
    .limit(1)
  if (!collection) {
    throw createError({ statusCode: 404, message: 'Collection not found' })
  }
}

// Bulk status change over this org's articles; ids that are not `eligible` (or
// not in the org) are counted as skipped.
export async function bulkUpdateHelpArticles(
  event: H3Event,
  values: PgUpdateSetSource<typeof helpArticle>,
  eligible: SQL,
): Promise<{ affected: number; skipped: number }> {
  const { orgId } = await requireOrgPermission(event, { feedlog: ['moderate'] })
  const body = await readValidatedBody(event, bulkHelpArticleSchema.parse)
  const affected = await useDB()
    .update(helpArticle)
    .set(values)
    .where(and(eq(helpArticle.orgId, orgId), inArray(helpArticle.id, body.ids), eligible))
    .returning({ id: helpArticle.id })
  return { affected: affected.length, skipped: body.ids.length - affected.length }
}
