import { updatePostSchema } from '#layers/feedlog/shared/schemas/post'

// PATCH /api/admin/posts/:id — Moderator-style update (status / board / title / content).
// Moderator gate covers all moderation fields uniformly; the dedicated public
// PATCH /api/posts/:id handles author edits with the inline ownership check.
// Status changes are silent here — notifications go through the separate
// POST /api/admin/posts/:id/notify-status, decided by the admin after the fact.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, updatePostSchema.parse)

  const { orgId } = await requireOrgPermission(event, { feedlog: ['moderate'] })
  const existing = await requireOrgPost(useDB(), orgId, id, ['title', 'content'])

  return await savePostUpdate(event, orgId, id, planPostUpdate(body, existing))
})
