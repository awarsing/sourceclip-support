import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createError, getQuery, type H3Event } from 'h3'
import { SignJWT } from 'jose'

type TestSession = { session: { ssoOrgId?: string | null }; user: { isAnonymous?: boolean | null } } | null
const sessions: Record<string, TestSession> = {
  none: null,
  local: { session: { ssoOrgId: null }, user: { isAnonymous: false } },
  sso: { session: { ssoOrgId: 'org-1' }, user: { isAnonymous: false } },
  guest: { session: {}, user: { isAnonymous: true } },
}
let sessionLookups = 0
Object.assign(globalThis, {
  createError,
  getQuery,
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        sessionLookups++
        return sessions[headers.get('x-test-session') ?? 'none']
      },
    },
  },
})
const { guardSsoAuthRequest } = await import('../server/utils/sso-auth-guard')
const { validateReturnTo, verifySsoJwt } = await import('../server/utils/sso')

function authEvent(
  path: string,
  session: string,
  orgId = 'org-1',
  context: { orgSlug?: string } = { orgSlug: 'acme' },
) {
  return {
    path,
    headers: new Headers({ 'x-test-session': session }),
    context: { orgId, ...context },
  } as unknown as H3Event
}

function request(method = 'GET', body?: unknown) {
  return new Request('https://acme.example.com/api/auth/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    const { statusCode, message, data } = error as { statusCode: number; message: string; data?: { code?: string } }
    return { statusCode, message, code: data?.code }
  }
  assert.fail('expected a refusal')
}

test('auth guard leaves other routes, ungated endpoints and verified sessions alone', async () => {
  sessionLookups = 0
  assert.equal(await guardSsoAuthRequest(authEvent('/api/posts', 'sso'), request()), false)
  assert.equal(await guardSsoAuthRequest(authEvent('/api/auth/sign-in/email', 'sso'), request()), false)
  assert.equal(await guardSsoAuthRequest(authEvent('/api/auth/callback/google', 'guest'), request()), false)
  assert.equal(sessionLookups, 0, 'ungated paths must not resolve a session')
  for (const session of ['none', 'local']) {
    assert.equal(await guardSsoAuthRequest(authEvent('/api/auth/admin/list-users', session), request()), false)
    assert.equal(await guardSsoAuthRequest(authEvent('/api/auth/update-user', session), request('POST')), false)
  }
})

test('get-session hides an SSO session only on a host it was not issued for', async () => {
  assert.equal(await guardSsoAuthRequest(authEvent('/api/auth/get-session', 'sso'), request()), false)
  assert.equal(await guardSsoAuthRequest(authEvent('/api/auth/get-session?x=1', 'sso', 'org-2'), request()), true)
  assert.equal(await guardSsoAuthRequest(authEvent('/api/auth/get-session', 'guest', 'org-2'), request()), false)
})

test('guests and SSO sessions cannot manage credentials, admin or unlisted organization endpoints', async () => {
  assert.deepEqual(
    await refusal(guardSsoAuthRequest(authEvent('/api/auth/organization/list-members', 'guest'), request())),
    {
      statusCode: 403,
      message: 'This session cannot manage credentials, profile, or organization',
      code: undefined,
    },
  )
  for (const path of [
    '/api/auth/change-password',
    '/api/auth/admin/set-role',
    '/api/auth/organization/delete',
    '/api/auth/organization/a-future-endpoint',
  ]) {
    assert.deepEqual(await refusal(guardSsoAuthRequest(authEvent(path, 'sso'), request('POST', {}))), {
      statusCode: 403,
      message: 'Sign in directly to perform this action',
      code: 'LOCAL_AUTH_REQUIRED',
    })
  }
})

test('SSO sessions may use org-scoped endpoints only for the org that minted them', async () => {
  const allowed: Array<[string, Request]> = [
    ['/api/auth/organization/list-members', request()],
    ['/api/auth/organization/list-members?organizationId=org-1', request()],
    ['/api/auth/organization/get-full-organization?organizationSlug=acme', request()],
    ['/api/auth/organization/update', request('POST', { organizationId: 'org-1', data: {} })],
    ['/api/auth/organization/update', request('POST', 'not json')],
    ['/api/auth/organization/update', request('POST', 'null')],
    ['/api/auth/organization/invite-member', request('PUT', { organizationId: '' })],
  ]
  for (const [path, req] of allowed) assert.equal(await guardSsoAuthRequest(authEvent(path, 'sso'), req), false, path)
  assert.equal(
    await guardSsoAuthRequest(
      authEvent('/api/auth/organization/check-slug?organizationSlug=other', 'sso', 'org-1', {}),
      request(),
    ),
    false,
  )

  const refused: Array<[string, Request]> = [
    ['/api/auth/organization/list-members?organizationId=org-2', request()],
    ['/api/auth/organization/get-full-organization?organizationSlug=other', request()],
    ['/api/auth/organization/update', request('PATCH', { organizationId: 'org-2' })],
    ['/api/auth/organization/update', request('POST', { organizationSlug: 'other' })],
  ]
  for (const [path, req] of refused) {
    assert.deepEqual(await refusal(guardSsoAuthRequest(authEvent(path, 'sso'), req)), {
      statusCode: 403,
      message: 'This session cannot act on another organization',
      code: 'LOCAL_AUTH_REQUIRED',
    })
  }
})

const secret = 'first-secret-with-enough-length-0001'
const rotated = 'second-secret-with-enough-length-02'
async function token(claims: Record<string, unknown>, key = secret, expiresIn: string | number | null = '10m') {
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' })
  if (expiresIn !== null) jwt.setExpirationTime(expiresIn)
  return jwt.sign(new TextEncoder().encode(key))
}

test('SSO tokens verify against any enabled secret and normalize the identity', async () => {
  assert.deepEqual(
    await verifySsoJwt(await token({ email: ' Ada@Example.COM ', name: '  Ada  ', picture: 'https://img' }, rotated), [
      secret,
      rotated,
    ]),
    { email: 'ada@example.com', name: 'Ada', image: 'https://img' },
  )
  assert.deepEqual(await verifySsoJwt(await token({ email: 'bo@example.com', name: '  ', picture: '' }), [secret]), {
    email: 'bo@example.com',
    name: 'bo@example.com',
    image: null,
  })
})

test('SSO tokens are refused for a bad signature, a missing or distant exp and a missing email', async () => {
  const cases: Array<[Promise<string>, string]> = [
    [token({ email: 'a@example.com' }, 'an-unknown-secret-with-enough-length'), 'Invalid or expired SSO token'],
    [token({ email: 'a@example.com' }, secret, Math.floor(Date.now() / 1000) - 3600), 'Invalid or expired SSO token'],
    [token({ email: 'a@example.com' }, secret, null), 'SSO token must carry an exp claim'],
    [token({ email: 'a@example.com' }, secret, '3d'), 'SSO token exp is too far in the future'],
    [token({ email: 'not-an-address' }), 'SSO token must carry a valid email claim'],
    [token({ name: 'No Email' }), 'SSO token must carry a valid email claim'],
  ]
  for (const [jwt, message] of cases) {
    assert.deepEqual(await refusal(verifySsoJwt(await jwt, [secret])), { statusCode: 400, message, code: undefined })
  }
  assert.deepEqual(await refusal(verifySsoJwt(await token({ email: 'a@example.com' }), [])), {
    statusCode: 400,
    message: 'Invalid or expired SSO token',
    code: undefined,
  })
})

test('return_to stays on the request host', () => {
  const event = {
    path: '/api/sso',
    node: { req: { headers: { host: 'acme.example.com' }, url: '/api/sso', connection: {} } },
  } as unknown as H3Event
  assert.equal(validateReturnTo(event, undefined), '/')
  assert.equal(validateReturnTo(event, ''), '/')
  assert.equal(validateReturnTo(event, '//evil.example.com/x'), '/')
  assert.equal(validateReturnTo(event, '/a\\b'), '/')
  assert.equal(validateReturnTo(event, 'https://evil.example.com/x'), '/')
  assert.equal(validateReturnTo(event, 'http://[::1'), '/')
  assert.equal(validateReturnTo(event, '/board?tab=new#top'), '/board?tab=new#top')
  assert.equal(validateReturnTo(event, 'http://acme.example.com/roadmap'), '/roadmap')
})
