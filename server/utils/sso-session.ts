import { and, eq } from 'drizzle-orm'
import { createError, deleteCookie, parseCookies, setCookie } from 'h3'
import type { H3Event } from 'h3'
import { organizationSso } from '../db/schemas'

// The identity half shared by GET /api/sso/jwt (browser redirect) and
// POST /api/widget/auth/exchange (SDK token exchange): verify the org-signed
// JWT, find or create the user, and mint a session collared to this org.

type SsoDB = ReturnType<typeof useDB>
type AuthContext = Awaited<typeof auth.$context>
type CookieAttributes = AuthContext['authCookies']['sessionToken']['attributes']

// Every enabled secret of this org (no `kid` — see schemas/sso.ts).
export async function findEnabledSsoSecrets(db: SsoDB, orgId: string): Promise<string[]> {
  const rows = await db
    .select({ secret: organizationSso.secret })
    .from(organizationSso)
    .where(and(eq(organizationSso.orgId, orgId), eq(organizationSso.enabled, true)))
  if (rows.length === 0) {
    throw createError({ statusCode: 404, message: 'SSO is not configured for this organization' })
  }
  return rows.map((s) => s.secret)
}

export async function startSsoSession(
  db: SsoDB,
  orgId: string,
  jwt: string,
  sessionFields: Record<string, string>,
  failureMessage: string,
) {
  const identity = await verifySsoJwt(jwt, await findEnabledSsoSecrets(db, orgId))
  const userId = await findOrCreateSsoUser(db, identity)
  const ctx = await auth.$context
  const sessionRow = await ctx.internalAdapter.createSession(userId, false, sessionFields)
  if (!sessionRow?.token) {
    throw createError({ statusCode: 500, message: failureMessage })
  }
  return { ctx, userId, sessionRow }
}

// better-auth's sameSite type allows capitalized variants ("Lax"); h3 wants
// lowercase. Runtime default is "lax" — normalize to keep both happy.
function cookieOptions(attributes: CookieAttributes) {
  const raw = attributes.sameSite
  return {
    httpOnly: attributes.httpOnly,
    sameSite: typeof raw === 'string' ? (raw.toLowerCase() as 'lax' | 'strict' | 'none') : raw,
    path: attributes.path ?? '/',
    secure: attributes.secure,
  }
}

// Sets the better-auth signed session cookie. Host-only on purpose (no domain
// attribute), so the SSO session stays bound to the exact host that minted it
// and never widens to a parent domain.
export async function setSsoSessionCookie(event: H3Event, ctx: AuthContext, token: string): Promise<void> {
  const cookie = ctx.authCookies.sessionToken
  const value = await signSessionCookieValue(token, ctx.secret)
  setCookie(event, cookie.name, value, { ...cookieOptions(cookie.attributes), maxAge: ctx.sessionConfig.expiresIn })
}

// Invalidates the cookie cache (session_data, possibly chunked). better-auth's
// getSession returns the cached payload WITHOUT cross-checking session_token,
// so a leftover cache from a prior login (e.g. an existing Google session on
// this host) would otherwise win and mask the new SSO session for up to its
// maxAge. Clearing it forces the next getSession to read the fresh session
// from the DB (and re-cache it).
//
// The deletion must carry the cookie's own attributes — matching better-auth's
// expireCookie. Under secure cookies the name is `__Secure-…`, and a browser
// rejects any Set-Cookie for a `__Secure-`-prefixed name that omits Secure.
export function clearSessionDataCookies(event: H3Event, ctx: AuthContext): void {
  const dataCookie = ctx.authCookies.sessionData
  const options = cookieOptions(dataCookie.attributes)
  for (const name of Object.keys(parseCookies(event))) {
    if (name === dataCookie.name || name.startsWith(`${dataCookie.name}.`)) {
      deleteCookie(event, name, options)
    }
  }
}

// Owner-only routes on one signing secret (:id). Scoped by org so an owner can
// only touch their own secrets; 404 otherwise (doesn't leak existence).
export async function requireSsoSecretRoute(event: H3Event) {
  const { orgId } = await requireOrgOwner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 404, message: 'Secret not found' })
  return { orgId, id, scope: and(eq(organizationSso.id, id), eq(organizationSso.orgId, orgId)) }
}
