import { authorUpdatePostSchema } from '#layers/feedlog/shared/schemas/post'

// PATCH /api/posts/:id — Edit a post's title/content. Any author can edit
// their own; moderators can edit anyone's (escalates via feedlog:moderate).
export default defineEventHandler(async (event) => {
  const { session, orgId, postId, db } = await requirePostRoute(event)
  const existing = await requireOrgPost(db, orgId, postId, ['authorId', 'title', 'content'])

  if (existing.authorId !== session.user.id) {
    await requireOrgPermission(event, { feedlog: ['moderate'] })
  }

  const body = await readValidatedBody(event, authorUpdatePostSchema.parse)
  return await savePostUpdate(event, orgId, postId, planPostUpdate(body, existing))
})
