import { ne, sql } from 'drizzle-orm'
import { helpArticle } from '#layers/feedlog/server/db/schemas'

export default defineEventHandler(async (event) => {
  return await bulkUpdateHelpArticles(
    event,
    { status: 'published', publishedAt: sql`coalesce(${helpArticle.publishedAt}, now())` },
    ne(helpArticle.status, 'published'),
  )
})
