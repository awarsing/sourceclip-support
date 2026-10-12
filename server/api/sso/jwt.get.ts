// GET /api/sso/jwt — third-party product SSO entry (JWT handoff).
//
// The customer's backend pre-signs an HS256 JWT with one of this org's shared
// secrets and redirects the signed-in user here. The org is resolved from the
// host, so the whole flow stays same-domain — no cross-domain hop, hence no
// one-time-token handoff.
//
// `auth`, `useDB`, the sso helpers and h3 utils are auto-imported by Nitro.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  // Derive a safe return target up front — needed even on failure so the
  // friendly error page can continue on to the board afterwards.
  const returnTo = validateReturnTo(event, typeof query.return_to === 'string' ? query.return_to : undefined)

  try {
    const orgId = event.context.orgId
    if (!orgId) {
      throw createError({ statusCode: 404, message: 'Organization not found' })
    }

    const token = typeof query.jwt === 'string' ? query.jwt : ''
    if (!token) {
      throw createError({ statusCode: 400, message: 'Missing jwt parameter' })
    }

    // Mint the session and mark it with ssoOrgId. createSession persists the
    // override field because ssoOrgId carries no defaultValue (so the framework's
    // default-fields pass can't clobber it) — verified against better-auth 1.5.4.
    // activeOrganizationId is pinned to the same org: better-auth's organization
    // endpoints fall back to it when a call omits an explicit organizationId.
    const { ctx, sessionRow } = await startSsoSession(
      useDB(),
      orgId,
      token,
      { ssoOrgId: orgId, activeOrganizationId: orgId },
      'Failed to create SSO session',
    )
    await setSsoSessionCookie(event, ctx, sessionRow.token)
    clearSessionDataCookies(event, ctx)

    return sendRedirect(event, returnTo, 302)
  } catch (err) {
    // The token comes from the customer's product, so a failure is the
    // integrator's problem, not the visitor's. Instead of a raw 400, send a
    // friendly interstitial (contact admin) that auto-continues to the board
    // logged out. Log the real reason server-side for the integrator to debug.
    console.warn('[sso] login failed:', (err as { statusMessage?: string })?.statusMessage ?? (err as Error)?.message)
    return sendRedirect(event, `/sso/error?return_to=${encodeURIComponent(returnTo)}`, 302)
  }
})
