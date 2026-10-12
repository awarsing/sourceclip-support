import type { H3Event } from 'h3'

// better-auth's own endpoints bypass the requireOrg* helpers — the organization
// plugin reads permission off the member table, the admin plugin off user.role —
// so the host-binding collar in getUserSession never sees them. This guards them
// for sessions nobody verified: product-SSO and guest.
//
// Unrecognised endpoints are refused, not allowed: better-auth adds routes in
// minor bumps, and a new one must not become reachable on its own.

const GLOBAL_IDENTITY_ENDPOINTS = new Set([
  'set-password',
  'change-password',
  'change-email',
  'update-user',
  'delete-user',
  'link-social',
  'unlink-account',
])

// Reachable for an SSO session, provided the org they name is the one that
// minted it (enforced in assertTargetOrgIsSessionOrg).
const ORG_SCOPED_ORGANIZATION_ENDPOINTS = new Set([
  'get-full-organization',
  'update',
  'list-members',
  'list-invitations',
  'invite-member',
  'cancel-invitation',
  'update-member-role',
  'remove-member',
  'has-permission',
  'get-active-member',
  'get-active-member-role',
  'check-slug',
])

const PAYLOAD_METHODS = new Set(['POST', 'PUT', 'PATCH'])

function localAuthRequired(): Error {
  return createError({
    statusCode: 403,
    message: 'Sign in directly to perform this action',
    data: { code: 'LOCAL_AUTH_REQUIRED' },
  })
}

function crossOrgRejected(): Error {
  return createError({
    statusCode: 403,
    message: 'This session cannot act on another organization',
    data: { code: 'LOCAL_AUTH_REQUIRED' },
  })
}

// Most endpoints name an org by id, a few (get-full-organization) by slug.
function assertNamesSessionOrg(id: unknown, slug: unknown, ssoOrgId: string, allowedSlug: string | undefined) {
  if (typeof id === 'string' && id && id !== ssoOrgId) throw crossOrgRejected()
  if (typeof slug === 'string' && slug && allowedSlug && slug !== allowedSlug) throw crossOrgRejected()
}

// clone() tees the stream; reading the body off the h3 event would consume the
// only copy better-auth gets on the Workers adapter.
async function jsonPayload(request: Request): Promise<Record<string, unknown> | null> {
  if (!PAYLOAD_METHODS.has(request.method)) return null
  try {
    const body = (await request.clone().json()) as unknown
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function assertTargetOrgIsSessionOrg(event: H3Event, request: Request, ssoOrgId: string) {
  const allowedSlug = event.context.orgSlug as string | undefined
  const query = getQuery(event)
  assertNamesSessionOrg(query.organizationId, query.organizationSlug, ssoOrgId, allowedSlug)
  const body = await jsonPayload(request)
  if (body) assertNamesSessionOrg(body.organizationId, body.organizationSlug, ssoOrgId, allowedSlug)
}

type GuardedEndpoint = { kind: 'organization'; endpoint: string } | { kind: 'admin' | 'identity' | 'session' }

const firstSegment = (path: string) => path.split(/[?/]/)[0] ?? ''

// The better-auth endpoints an unverified session may be refused, or null for
// everything else (sign-in, callbacks), which keeps its current cost.
function guardedEndpoint(path: string): GuardedEndpoint | null {
  if (!path.startsWith('/api/auth/')) return null
  const rest = path.slice('/api/auth/'.length)
  if (rest.startsWith('organization/')) {
    return { kind: 'organization', endpoint: firstSegment(rest.slice('organization/'.length)) }
  }
  if (rest.startsWith('admin/')) return { kind: 'admin' }
  const segment = firstSegment(rest)
  if (GLOBAL_IDENTITY_ENDPOINTS.has(segment)) return { kind: 'identity' }
  return segment === 'get-session' ? { kind: 'session' } : null
}

async function unverifiedSession(event: H3Event) {
  const session = await auth.api.getSession({ headers: event.headers })
  const ssoOrgId = (session?.session as { ssoOrgId?: string | null } | undefined)?.ssoOrgId ?? undefined
  const isGuest = !!(session?.user as { isAnonymous?: boolean | null } | undefined)?.isAnonymous
  return { ssoOrgId, isGuest }
}

// Returns true when the caller must answer as if nobody were signed in.
export async function guardSsoAuthRequest(event: H3Event, request: Request): Promise<boolean> {
  const guarded = guardedEndpoint(event.path)
  if (!guarded) return false

  const { ssoOrgId, isGuest } = await unverifiedSession(event)
  if (!ssoOrgId && !isGuest) return false

  // Business endpoints already refuse a session on a host it wasn't issued for,
  // but this route skips the collar and would still hand back name and email.
  if (guarded.kind === 'session') {
    return !!ssoOrgId && ssoOrgId !== event.context.orgId
  }

  if (isGuest) {
    throw createError({
      statusCode: 403,
      message: 'This session cannot manage credentials, profile, or organization',
    })
  }

  // The admin plugin judges by user.role, which has no notion of the current org.
  if (guarded.kind !== 'organization' || !ORG_SCOPED_ORGANIZATION_ENDPOINTS.has(guarded.endpoint)) {
    throw localAuthRequired()
  }

  await assertTargetOrgIsSessionOrg(event, request, ssoOrgId!)
  return false
}
