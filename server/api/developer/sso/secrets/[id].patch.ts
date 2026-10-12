import { organizationSso } from '#layers/feedlog/server/db/schemas'

// PATCH /api/developer/sso/secrets/:id — disable/re-enable (rotation) or rename
// (owner-only). Scoped by org so an owner can only touch their own secrets;
// 404 otherwise (doesn't leak existence).
export default defineEventHandler(async (event) => {
  const { scope } = await requireSsoSecretRoute(event)
  const patch = ssoSecretPatch(await readBody<{ enabled?: boolean; label?: string }>(event))

  const [row] = await useDB().update(organizationSso).set(patch).where(scope).returning()
  if (!row) throw createError({ statusCode: 404, message: 'Secret not found' })
  return ssoSecretToView(row)
})

function ssoSecretPatch(body: { enabled?: unknown; label?: unknown } | null | undefined) {
  const patch: { enabled?: boolean; label?: string | null } = {}
  if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body?.label === 'string') patch.label = body.label.trim().slice(0, 80) || null
  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to update' })
  }
  return patch
}
