import { and, asc, eq, ne } from 'drizzle-orm'
import { helpArticle } from '#layers/feedlog/server/db/schemas'

export default defineEventHandler(async (event) => {
  const orgId = await requireHelpCenterOrg(event)
  const shortId = getRouterParam(event, 'shortId')!.split('-')[0]!

  const db = useDB()

  const row = await findHelpArticleRow(and(eq(helpArticle.orgId, orgId), eq(helpArticle.shortId, shortId)))

  if (!row || !row.collectionVisible || row.status !== 'published') {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const siblings = await db
    .select({
      shortId: helpArticle.shortId,
      slug: helpArticle.slug,
      title: helpArticle.title,
      description: helpArticle.description,
    })
    .from(helpArticle)
    .where(
      and(
        eq(helpArticle.orgId, orgId),
        eq(helpArticle.collectionId, row.collectionId),
        eq(helpArticle.status, 'published'),
        ne(helpArticle.id, row.id),
      ),
    )
    .orderBy(asc(helpArticle.position), asc(helpArticle.id))

  return {
    shortId: row.shortId,
    canonicalSlug: row.slug,
    title: row.title,
    description: row.description,
    content: row.content,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    collection: { id: row.collectionId, name: row.collectionName },
    siblings,
  }
})
