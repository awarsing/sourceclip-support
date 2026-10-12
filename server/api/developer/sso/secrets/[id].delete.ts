import { organizationSso } from '#layers/feedlog/server/db/schemas'

// DELETE /api/developer/sso/secrets/:id — permanently delete (owner-only).
// Tokens signed with it stop verifying immediately. Org-scoped → 404 for ids
// that don't belong to the caller's org.
export default defineEventHandler(async (event) => {
  const { scope } = await requireSsoSecretRoute(event)

  const [row] = await useDB().delete(organizationSso).where(scope).returning({ id: organizationSso.id })
  if (!row) throw createError({ statusCode: 404, message: 'Secret not found' })
  return { ok: true }
})
