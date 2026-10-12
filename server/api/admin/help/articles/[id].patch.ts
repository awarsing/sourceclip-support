import { and, eq } from 'drizzle-orm'
import { helpArticle } from '#layers/feedlog/server/db/schemas'
import { updateHelpArticleSchema } from '#layers/feedlog/shared/schemas/help'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgPermission(event, { feedlog: ['moderate'] })

  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, updateHelpArticleSchema.parse)

  const db = useDB()
  const scope = and(eq(helpArticle.id, id), eq(helpArticle.orgId, orgId))

  const [existing] = await db
    .select({
      status: helpArticle.status,
      title: helpArticle.title,
      description: helpArticle.description,
      content: helpArticle.content,
      publishedAt: helpArticle.publishedAt,
      collectionId: helpArticle.collectionId,
    })
    .from(helpArticle)
    .where(scope)
    .limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }

  const text = planHelpArticleText(existing, body)
  const updates = {
    ...(body.aiEnabled === undefined ? {} : { aiEnabled: body.aiEnabled }),
    ...(await planHelpArticleMove(orgId, existing, body.collectionId)),
    ...text.updates,
    ...planHelpArticleStatus(existing, body.status, text.next, text.contentChanged),
  }

  if (Object.keys(updates).length) {
    await db.update(helpArticle).set(updates).where(scope)
  }

  return await findHelpArticleDetail(orgId, id)
})
