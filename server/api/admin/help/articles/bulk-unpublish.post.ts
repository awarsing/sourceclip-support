import { eq } from 'drizzle-orm'
import { helpArticle } from '#layers/feedlog/server/db/schemas'

export default defineEventHandler(async (event) => {
  return await bulkUpdateHelpArticles(event, { status: 'archived' }, eq(helpArticle.status, 'published'))
})
