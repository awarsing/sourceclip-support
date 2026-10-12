import { eq } from 'drizzle-orm'
import { organizationWidget, user } from '#layers/feedlog/server/db/schemas'

// Same identity path as GET /api/sso/jwt, but it answers the SDK instead of a
// browser: JSON in, JSON out, no redirect, no Set-Cookie. Errors stay JSON so
// the SDK can tell "bad token" from "widget off" from "no such org" apart.
//
// Rate-limited because this one writes: a valid JWT stays usable for its whole
// TTL, and unlike the /api/sso/jwt redirect a human clicks, this is an XHR a
// script can hammer, minting a session row every time. The ceiling is generous —
// the SDK caches its token per email, while whole companies share one egress IP.
const RATE_LIMIT = { limit: 30, windowSeconds: 60 }

export default defineEventHandler(
  async (
    event,
  ): Promise<{
    token: string
    expiresAt: string
    user: { id: string; email: string; name: string; image: string | null }
  }> => {
    const orgId = event.context.orgId
    if (!orgId) {
      throw createError({ statusCode: 404, message: 'Organization not found' })
    }

    // checkRateLimit fails open on a storage hiccup — availability wins over a
    // perfectly enforced ceiling.
    const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
    if (!(await checkRateLimit(`widget-exchange:${ip}`, RATE_LIMIT))) {
      throw createError({ statusCode: 429, message: 'Too many token exchanges, try again shortly' })
    }

    const jwt = await readExchangeJwt(event)
    const db = useDB()
    await assertWidgetEnabled(db, orgId)

    // ssoOrgId puts this session under the same collar as an /api/sso/jwt one:
    // host-bound to this org, barred from staff surfaces and credential changes.
    // That is the point — the widget asserts an org-supplied email we never verified.
    const { userId, sessionRow } = await startSsoSession(
      db,
      orgId,
      jwt,
      { ssoOrgId: orgId },
      'Failed to create widget session',
    )

    const [profile] = await db
      .select({ id: user.id, email: user.email, name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    if (!profile) {
      throw createError({ statusCode: 500, message: 'Failed to resolve widget user' })
    }

    // The RAW session token, not the signed cookie value: better-auth's bearer
    // plugin signs it itself, and our standard-base64 cookie signature would fail
    // its verify step and silently authenticate nobody.
    return {
      token: sessionRow.token,
      expiresAt: new Date(sessionRow.expiresAt).toISOString(),
      user: profile,
    }
  },
)

async function readExchangeJwt(event: Parameters<typeof readBody>[0]): Promise<string> {
  const body = await readBody<{ jwt?: unknown }>(event).catch(() => null)
  const jwt = typeof body?.jwt === 'string' ? body.jwt.trim() : ''
  if (!jwt) {
    throw createError({ statusCode: 400, message: 'Missing jwt in request body' })
  }
  return jwt
}

// No row = never configured = defaults, which enable the widget.
async function assertWidgetEnabled(db: ReturnType<typeof useDB>, orgId: string): Promise<void> {
  const [widgetRow] = await db
    .select({ enabled: organizationWidget.enabled })
    .from(organizationWidget)
    .where(eq(organizationWidget.orgId, orgId))
    .limit(1)
  if (!(widgetRow?.enabled ?? true)) {
    throw createError({ statusCode: 403, message: 'Widget is not enabled for this organization' })
  }
}
