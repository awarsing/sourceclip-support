import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { SignJWT } from 'jose'
import * as schema from '../server/db/schemas/index'
import { authStub, createOrg, db, loadHandler, serve } from './server-api-harness'

async function widgetRoutes() {
  return serve({
    'GET /api/widget/config': await loadHandler('widget/config.get'),
    'GET /api/portal-identity': await loadHandler('portal-identity.get'),
    'PATCH /api/admin/widget': await loadHandler('admin/widget/index.patch'),
    'POST /api/widget/auth/exchange': await loadHandler('widget/auth/exchange.post'),
    'GET /api/sso/jwt': await loadHandler('sso/jwt.get'),
  })
}

// Sessions minted through better-auth's internal adapter, recorded for the test.
const minted: { userId: string; fields: Record<string, string> }[] = []
authStub.$context = Promise.resolve({
  secret: 'test-auth-secret',
  sessionConfig: { expiresIn: 3600 },
  authCookies: {
    sessionToken: { name: 'better-auth.session_token', attributes: { httpOnly: true, sameSite: 'Lax', path: '/' } },
    sessionData: { name: 'better-auth.session_data', attributes: { httpOnly: true, sameSite: 'lax', secure: true } },
  },
  internalAdapter: {
    createSession: async (userId: string, _dontRemember: boolean, fields: Record<string, string>) => {
      minted.push({ userId, fields })
      return fields.failSession ? null : { token: `session-${minted.length}`, expiresAt: new Date('2026-12-01') }
    },
  },
})

async function addSecret(orgId: string, secret: string, enabled = true) {
  await db.insert(schema.organizationSso).values({ orgId, secret, enabled, label: null })
}

function sign(secret: string, claims: Record<string, unknown>, expiresIn = '10m') {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret))
}

test('the widget bootstrap reads the kill switch, launcher, guest access and brand fresh', async () => {
  const call = await widgetRoutes()
  const { orgId } = await createOrg({ metadata: { primaryColor: '#fafafa', guest: { allowPost: true } } })

  const anonymous = await call('/api/widget/config')
  assert.equal(anonymous.body.enabled, false)
  assert.deepEqual(anonymous.body.org, { name: '', logo: null })
  assert.equal(anonymous.headers.get('cache-control'), 'no-store')

  const defaults = await call('/api/widget/config', { orgSlug: orgId })
  assert.equal(defaults.body.enabled, true)
  assert.equal(defaults.body.org.name, `Org ${orgId}`)
  assert.match(defaults.body.branding.primaryForeground, /^#[0-9a-f]{6}$/i)

  await db.insert(schema.organizationWidget).values({
    orgId,
    enabled: false,
    launcherConfig: { alignment: 'left', bottomOffset: 40, sideOffset: 8, closeBehavior: 'hide' },
  })
  const configured = await call('/api/widget/config', { orgSlug: orgId })
  assert.equal(configured.body.enabled, false)
  assert.equal(configured.body.launcher.alignment, 'left')
  assert.equal(configured.body.launcher.bottomOffset, 40)
})

test('portal identity brands the default org as FeedLog and resolves logo paths', async () => {
  const call = await widgetRoutes()
  const fallback = await call('/api/portal-identity', { orgSlug: 'no-such-org' })
  assert.deepEqual(
    { name: fallback.body.name, isDefault: fallback.body.isDefault, logo: fallback.body.logo },
    { name: 'FeedLog', isDefault: true, logo: null },
  )
  assert.equal(fallback.body.modules.helpCenter, false)

  for (const [logo, expected] of [
    ['logos/mark.png', '/api/files/logos/mark.png'],
    ['https://cdn.example/mark.png', 'https://cdn.example/mark.png'],
    ['/mark.svg', '/mark.svg'],
  ]) {
    const { orgId } = await createOrg({ metadata: { portalModules: { helpCenter: true } } })
    await db.update(schema.organization).set({ logo }).where(eq(schema.organization.id, orgId))
    const named = await call('/api/portal-identity', { orgSlug: orgId })
    assert.equal(named.body.logo, expected)
    assert.equal(named.body.name, `Org ${orgId}`)
    assert.equal(named.body.isDefault, false)
    assert.equal(named.body.modules.helpCenter, true)
  }
})

test('moderators save widget settings section by section within the rule cap', async () => {
  const call = await widgetRoutes()
  const { orgId, token } = await createOrg()
  const save = (body: unknown, who = token('manager')) =>
    call('/api/admin/widget', { method: 'PATCH', org: orgId, session: who, body })

  const untouched = await save({})
  assert.equal(untouched.status, 200)
  assert.equal(untouched.body.enabled, true)
  assert.equal(untouched.body.baseUrl, 'http://test.local')

  const saved = await save({
    supportEmail: 'help@example.invalid',
    customRules: [{ scenario: 'Refunds', enabled: true }],
  })
  assert.equal(saved.body.supportEmail, 'help@example.invalid')
  assert.match(saved.body.rules.custom[0].id, /^c_/)
  const kept = await save({ customRules: [{ id: saved.body.rules.custom[0].id, scenario: 'Refunds', enabled: false }] })
  assert.equal(kept.body.rules.custom[0].id, saved.body.rules.custom[0].id)
  assert.equal((await save({ supportEmail: '' })).body.supportEmail, null)

  const tooMany = Array.from({ length: 8 }, (_, i) => ({ scenario: `Rule ${i}`, enabled: true }))
  const capped = await save({ customRules: tooMany })
  assert.equal(capped.status, 400)
  assert.match(capped.body.message, /At most/)
  const invalid = await save({ supportEmail: 'not-an-email' })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.message, 'Invalid support email')
  assert.equal((await save({ enabled: false }, token('user'))).status, 403)
})

test('the SDK exchanges an org-signed JWT for a collared session token', async () => {
  const call = await widgetRoutes()
  const { orgId } = await createOrg()
  const exchange = (body: unknown, org = orgId) =>
    call('/api/widget/auth/exchange', { method: 'POST', org, body, headers: { 'x-forwarded-for': orgId } })

  assert.equal((await exchange({ jwt: 'x' }, '')).status, 404)
  assert.equal((await exchange({})).status, 400)
  assert.equal((await exchange({ jwt: '   ' })).status, 400)
  const unconfigured = await exchange({ jwt: await sign('nope', { email: 'a@example.invalid' }) })
  assert.equal(unconfigured.status, 404)
  assert.equal(unconfigured.body.message, 'SSO is not configured for this organization')

  await addSecret(orgId, 'retired-secret', false)
  await addSecret(orgId, 'live-secret')
  assert.equal((await exchange({ jwt: await sign('retired-secret', { email: 'a@example.invalid' }) })).status, 400)

  const email = `sdk-${orgId}@example.invalid`
  const ok = await exchange({ jwt: await sign('live-secret', { email: email.toUpperCase(), name: 'SDK User' }) })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.token, `session-${minted.length}`)
  assert.equal(ok.body.expiresAt, '2026-12-01T00:00:00.000Z')
  assert.deepEqual({ email: ok.body.user.email, name: ok.body.user.name }, { email, name: 'SDK User' })
  assert.deepEqual(minted.at(-1)?.fields, { ssoOrgId: orgId })
  const again = await exchange({ jwt: await sign('live-secret', { email }) })
  assert.equal(again.body.user.id, ok.body.user.id)

  await db.insert(schema.organizationWidget).values({ orgId, enabled: false })
  assert.equal((await exchange({ jwt: await sign('live-secret', { email }) })).status, 403)
})

test('the SSO JWT login sets a host-bound session cookie and sends failures to the error page', async () => {
  const call = await widgetRoutes()
  const { orgId } = await createOrg()
  await addSecret(orgId, 'portal-secret')
  const login = (query: string, org = orgId, cookie?: string) =>
    call(`/api/sso/jwt?${query}`, { org, headers: cookie ? { cookie } : {} })

  const jwt = await sign('portal-secret', { email: `portal-${orgId}@example.invalid` })
  const ok = await login(
    `jwt=${jwt}&return_to=${encodeURIComponent('/board?x=1')}`,
    orgId,
    'better-auth.session_data=old; better-auth.session_data.0=chunk; other=keep',
  )
  assert.equal(ok.status, 302)
  assert.equal(ok.headers.get('location'), '/board?x=1')
  const cookies = ok.headers.getSetCookie()
  const session = cookies.find((c) => c.startsWith('better-auth.session_token='))
  assert.match(session ?? '', /HttpOnly/)
  assert.match(session ?? '', /SameSite=Lax/)
  assert.match(session ?? '', /Max-Age=3600/)
  assert.doesNotMatch(session ?? '', /Domain=/)
  const cleared = cookies.filter((c) => c.startsWith('better-auth.session_data'))
  assert.equal(cleared.length, 2)
  assert.ok(cleared.every((c) => /Secure/.test(c) && /Max-Age=0/.test(c)))
  assert.ok(!cookies.some((c) => c.startsWith('other=')))
  assert.deepEqual(minted.at(-1)?.fields, { ssoOrgId: orgId, activeOrganizationId: orgId })

  const offsite = await login(`jwt=${jwt}&return_to=${encodeURIComponent('https://evil.example/x')}`)
  assert.equal(offsite.headers.get('location'), '/')
  const missing = await login('return_to=%2Fboard')
  assert.equal(missing.headers.get('location'), `/sso/error?return_to=${encodeURIComponent('/board')}`)
  const noOrg = await login(`jwt=${jwt}`, '')
  assert.equal(noOrg.headers.get('location'), `/sso/error?return_to=${encodeURIComponent('/')}`)
  const forged = await login(`jwt=${await sign('wrong-secret', { email: 'x@example.invalid' })}`)
  assert.equal(forged.headers.get('location'), `/sso/error?return_to=${encodeURIComponent('/')}`)
})
