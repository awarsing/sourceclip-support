import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { uuidv7 } from 'uuidv7'
import * as schema from '../server/db/schemas/index'
import { encodeListCursor } from '../server/utils/list-cursor'
import {
  authApi,
  createOrg,
  createPost,
  db,
  loadHandler,
  registerSession,
  sentEmails,
  serve,
  setup,
} from './server-api-harness'

async function accountRoutes() {
  return serve({
    'POST /api/auth/claim-anonymous': await loadHandler('auth/claim-anonymous.post'),
    'POST /api/auth/set-password': await loadHandler('auth/set-password.post'),
    'GET /api/invitations/:id': await loadHandler('invitations/[id].get'),
    'POST /api/admin/invitations/:id/resend': await loadHandler('admin/invitations/[id]/resend.post'),
    'POST /api/developer/sso/secrets': await loadHandler('developer/sso/secrets/index.post'),
    'PATCH /api/developer/sso/secrets/:id': await loadHandler('developer/sso/secrets/[id].patch'),
    'DELETE /api/developer/sso/secrets/:id': await loadHandler('developer/sso/secrets/[id].delete'),
    'PATCH /api/admin/boards/:id': await loadHandler('admin/boards/[id].patch'),
    'DELETE /api/admin/boards/:id': await loadHandler('admin/boards/[id].delete'),
    'POST /api/profile/avatar': await loadHandler('profile/avatar.post'),
    'POST /api/admin/debug/fix-embedding': await loadHandler('admin/debug/fix-embedding.post'),
  })
}

// An in-memory blob store standing in for the configured provider.
const blobs = new Map<string, { type: string; size: number }>()
async function useMemoryBlobs() {
  await setup()
  ;(globalThis as unknown as { registerBlobProvider: (provider: unknown) => void }).registerBlobProvider({
    name: 'memory',
    storage: {
      put: async (pathname: string, body: Blob, options: { prefix: string }) => {
        const key = `${options.prefix}${uuidv7()}-${pathname}`
        blobs.set(key, { type: body.type, size: body.size })
        return { pathname: key }
      },
      get: async (key: string) => blobs.get(key) ?? null,
    },
  })
}

test('a signed-in account claims a guest identity once, and only a guest identity', async () => {
  const call = await accountRoutes()
  const { orgId, people, token } = await createOrg()
  const guestPost = await createPost(orgId, people.guest.user.id)
  const claim = (who: Parameters<typeof token>[0], anonymousToken: string, headers: Record<string, string> = {}) =>
    call('/api/auth/claim-anonymous', {
      method: 'POST',
      org: orgId,
      session: token(who),
      body: { anonymousToken },
      headers,
    })

  assert.equal((await claim('guest', token('guest'))).status, 400)
  assert.deepEqual((await claim('user', 'stale-token')).body, { claimed: false, reason: 'expired-or-already-claimed' })
  assert.equal((await claim('user', token('owner'))).status, 403)
  assert.equal((await claim('user', '')).status, 400)

  const claimed = await claim('user', token('guest'))
  assert.equal(claimed.status, 200)
  assert.equal(claimed.body.claimed, true)
  assert.equal(claimed.body.moved.posts, 1)
  const [moved] = await db.select().from(schema.post).where(eq(schema.post.id, guestPost.id))
  assert.equal(moved?.authorId, people.user.user.id)

  for (let i = 0; i < 10; i++) await claim('user', 'stale-token', { 'x-forwarded-for': `rate-${orgId}` })
  assert.equal((await claim('user', 'stale-token', { 'x-forwarded-for': `rate-${orgId}` })).status, 429)
})

test('the guest claim reports a claim of oneself without moving anything', async () => {
  const call = await accountRoutes()
  const { orgId, people } = await createOrg()
  // A guest session that, for the receiving side, is the same user signed in.
  const signedIn = {
    ...people.guest,
    user: { ...people.guest.user, isAnonymous: false },
    session: { ...people.guest.session, token: `signed-${orgId}` },
  }
  registerSession(signedIn)
  const result = await call('/api/auth/claim-anonymous', {
    method: 'POST',
    org: orgId,
    session: signedIn.session.token,
    body: { anonymousToken: people.guest.session.token },
  })
  assert.deepEqual(result.body, { claimed: false, reason: 'same-user' })
})

test('adding a first password checks length, refuses a second one and mails the owner', async () => {
  const call = await accountRoutes()
  const { orgId, people, token } = await createOrg()
  let accounts = [{ providerId: 'google' }]
  authApi.listUserAccounts = async () => accounts
  authApi.setPassword = async ({ body }: { body: { newPassword: string } }) => ({ status: body.newPassword.length > 0 })
  const setPassword = (body: unknown, session: string | undefined = token('user')) =>
    call('/api/auth/set-password', { method: 'POST', org: orgId, session, body })

  assert.equal((await setPassword({ newPassword: 'longenough' }, '')).status, 401)
  assert.equal((await setPassword({})).status, 400)
  assert.equal((await setPassword({ newPassword: 'short' })).status, 400)
  assert.equal((await setPassword({ newPassword: 'x'.repeat(129) })).status, 400)
  const sentBefore = sentEmails.length
  const ok = await setPassword({ newPassword: 'longenough' })
  assert.deepEqual(ok.body, { status: true })
  assert.equal(sentEmails.length, sentBefore + 1)
  assert.equal(sentEmails.at(-1)?.to, people.user.user.email)
  accounts = [{ providerId: 'credential' }]
  const again = await setPassword({ newPassword: 'longenough' })
  assert.equal(again.status, 400)
  assert.match(again.body.message, /already set/)
})

test('invitations are looked up publicly and resent only while pending', async () => {
  const call = await accountRoutes()
  const { orgId, people, token } = await createOrg()
  const invite = async (values: Partial<typeof schema.invitation.$inferInsert> = {}) => {
    const id = uuidv7()
    await db.insert(schema.invitation).values({
      id,
      organizationId: orgId,
      email: `${id}@example.invalid`,
      role: 'manager',
      inviterId: people.owner.user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
      ...values,
    })
    return id
  }
  const pending = await invite()
  const accepted = await invite({ status: 'accepted' })
  const expired = await invite({ expiresAt: new Date(Date.now() - 1000) })

  const found = await call(`/api/invitations/${pending}`)
  assert.equal(found.status, 200)
  assert.equal(found.body.organizationName, `Org ${orgId}`)
  assert.equal(found.body.role, 'manager')
  for (const id of [accepted, expired, 'missing']) {
    assert.equal((await call(`/api/invitations/${id}`)).status, 404)
  }

  const resend = (id: string) =>
    call(`/api/admin/invitations/${id}/resend`, { method: 'POST', org: orgId, session: token('owner') })
  delete process.env.RESEND_API_KEY
  const copied = await resend(pending)
  assert.equal(copied.body.sent, false)
  assert.match(copied.body.url, new RegExp(pending))
  process.env.RESEND_API_KEY = 'test'
  try {
    assert.deepEqual((await resend(pending)).body, { sent: true })
    assert.match(sentEmails.at(-1)?.subject ?? '', new RegExp(`Org ${orgId}`))
  } finally {
    delete process.env.RESEND_API_KEY
  }
  assert.equal((await resend(accepted)).status, 400)
  assert.equal((await resend(expired)).status, 400)
  assert.equal((await resend(uuidv7())).status, 404)
})

test('owners manage SSO signing secrets up to the cap', async () => {
  const call = await accountRoutes()
  const { orgId, token } = await createOrg()
  const secrets = (path: string, method: string, body?: unknown, who = token('owner')) =>
    call(`/api/developer/sso/secrets${path}`, { method, org: orgId, session: who, body })

  const created = await secrets('', 'POST', { label: '  Production  ' })
  assert.equal(created.status, 201)
  assert.equal(created.body.label, 'Production')
  assert.equal((await secrets('', 'POST', {}, token('manager'))).status, 403)
  const id = created.body.id

  assert.equal((await secrets(`/${id}`, 'PATCH', { enabled: false })).body.enabled, false)
  assert.equal((await secrets(`/${id}`, 'PATCH', { label: '   ' })).body.label, null)
  assert.equal((await secrets(`/${id}`, 'PATCH', { label: 42 })).status, 400)
  assert.equal((await secrets(`/${uuidv7()}`, 'PATCH', { enabled: true })).status, 404)
  assert.deepEqual((await secrets(`/${id}`, 'DELETE')).body, { ok: true })
  assert.equal((await secrets(`/${id}`, 'DELETE')).status, 404)

  for (let i = 0; i < 5; i++) assert.equal((await secrets('', 'POST', { label: '' })).body.label, null)
  assert.equal((await secrets('', 'POST', {})).status, 409)
})

test('moderators rename and delete boards of their org', async () => {
  const call = await accountRoutes()
  const { orgId, people, token } = await createOrg()
  const [b] = await db.insert(schema.board).values({ orgId, name: 'Ideas', description: 'Old' }).returning()
  const p = await createPost(orgId, people.user.user.id, { boardId: b!.id })
  const board = (method: string, body?: unknown, id = b!.id) =>
    call(`/api/admin/boards/${id}`, { method, org: orgId, session: token('manager'), body })

  const renamed = await board('PATCH', { name: 'Feature ideas', description: '' })
  assert.deepEqual([renamed.body.name, renamed.body.description], ['Feature ideas', null])
  assert.equal((await board('PATCH', {})).status, 400)
  assert.equal((await board('PATCH', { name: 'x' }, uuidv7())).status, 404)
  assert.equal((await board('DELETE')).status, 204)
  assert.equal((await board('DELETE')).status, 404)
  const [detached] = await db.select().from(schema.post).where(eq(schema.post.id, p.id))
  assert.equal(detached?.boardId, null)
})

test('avatars are size-checked while streaming, inspected and stored under the user', async () => {
  await useMemoryBlobs()
  const call = await accountRoutes()
  const { orgId, people, token } = await createOrg()
  const png = readFileSync(new URL('./fixtures/avatar.png', import.meta.url))
  const upload = (body: Uint8Array, session: string = token('user'), headers: Record<string, string> = {}) =>
    call('/api/profile/avatar', { method: 'POST', org: orgId, session, body, headers })

  const stored = await upload(new Uint8Array(png))
  assert.equal(stored.status, 200)
  assert.ok(stored.body.key.startsWith(`test-uploads/avatars/${encodeURIComponent(people.user.user.id)}/`))
  assert.equal(blobs.get(stored.body.key)?.type, 'image/png')

  const wide = new Uint8Array(png)
  new DataView(wide.buffer).setUint32(16, 4096)
  const tooWide = await upload(wide)
  assert.equal(tooWide.status, 400)
  assert.equal(tooWide.body.data.code, 'imageTooManyPixels')
  assert.equal((await upload(new TextEncoder().encode('not an image'))).body.data.code, 'invalidImage')
  const huge = await upload(new Uint8Array(5 * 1024 * 1024 + 1))
  assert.equal(huge.status, 413)
  assert.equal(huge.body.data.code, 'imageTooLarge')
  assert.equal(
    (await upload(new Uint8Array(png), token('user'), { 'content-length': String(6 * 1024 * 1024) })).status,
    413,
  )
  assert.equal((await upload(new Uint8Array(png), token('guest'))).status, 403)
})

test('staff reply images must be live uploads of this org, and queued email state is reported', async () => {
  await useMemoryBlobs()
  const { assertReplyImages, findReplyEmailState } = await import('../server/utils/inbox-reply')
  const orgId = `org-${uuidv7()}`
  const conversations = new Set(['c1'])
  const tasks = new Map<string, Record<string, unknown>>([
    ['queued', { status: 'pending', result: null, manual_retry: false, delivery_mode: 'scheduled' }],
    ['failed', { status: 'done', result: 'failed', manual_retry: false, delivery_mode: 'immediate' }],
    ['retried', { status: 'done', result: 'failed', manual_retry: true, delivery_mode: 'immediate' }],
  ])
  const pool = {
    query: async (text: string, values: unknown[]) => {
      if (text.includes('FROM conversation'))
        return { rows: conversations.has(values[0] as string) ? [{ user_id: 'u' }] : [] }
      const task = tasks.get(values[0] as string)
      return { rows: task ? [task] : [] }
    },
  }
  const event = {} as Parameters<typeof assertReplyImages>[0]
  const key = (name: string) => `test-uploads/${orgId}/${name}`
  blobs.set(key('ok.png'), { type: 'image/png', size: 10 })
  blobs.set(key('doc.pdf'), { type: 'application/pdf', size: 10 })
  blobs.set(key('big.png'), { type: 'image/png', size: 17 * 1024 * 1024 })
  const check = (conversationId: string, ...storageKeys: string[]) =>
    assertReplyImages(event, pool, orgId, conversationId, [
      { type: 'text' },
      ...storageKeys.map((storage_key) => ({ type: 'image', storage_key })),
    ])

  await check('missing')
  await check('c1', key('ok.png'))
  await assert.rejects(check('missing', key('ok.png')), { statusCode: 404 })
  await assert.rejects(check('c1', `test-uploads/other-org/ok.png`), { statusCode: 422 })
  for (const name of ['gone.png', 'doc.pdf', 'big.png']) {
    await assert.rejects(check('c1', key(name)), { statusCode: 422, message: 'Image unavailable' })
  }

  assert.equal(await findReplyEmailState(pool, 'none'), null)
  assert.deepEqual(await findReplyEmailState(pool, 'queued'), {
    status: 'pending',
    deliveryMode: 'scheduled',
    canRetry: false,
  })
  assert.deepEqual(await findReplyEmailState(pool, 'failed'), {
    status: 'failed',
    deliveryMode: 'immediate',
    canRetry: true,
  })
  assert.equal((await findReplyEmailState(pool, 'retried'))?.canRetry, false)
})

test('the embedding backfill refreshes search rows and only re-embeds stale posts', async (t) => {
  const call = await accountRoutes()
  const { orgId, people, token } = await createOrg()
  const p = await createPost(orgId, people.user.user.id, {
    title: 'Dark mode',
    content: '**Please**',
    contentHash: null,
  })
  let embedded = 0
  const server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      embedded++
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ embedding: Array.from({ length: 768 }, () => 0.01) }] }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const backfill = (body: unknown) =>
    call('/api/admin/debug/fix-embedding', { method: 'POST', org: orgId, session: token('owner'), body })

  delete process.env.OPENAI_API_KEY
  const searchOnly = await backfill({})
  assert.deepEqual(searchOnly.body, {
    dryRun: false,
    total: 1,
    search: { updated: 1 },
    embedding: { enabled: false, updated: 0, skipped: 0, failed: 0 },
  })
  const [search] = await db.select().from(schema.postSearch).where(eq(schema.postSearch.postId, p.id))
  assert.equal(search?.searchText, 'Dark mode Please')
  const [hashed] = await db.select().from(schema.post).where(eq(schema.post.id, p.id))
  assert.match(hashed?.contentHash ?? '', /^[0-9a-f]{64}$/)

  process.env.OPENAI_API_KEY = 'test-key'
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  t.after(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
  })
  const dry = await backfill({ dryRun: true })
  assert.deepEqual(dry.body.embedding, { enabled: true, updated: 1, skipped: 0, failed: 0 })
  assert.equal(embedded, 0)
  assert.deepEqual((await backfill(null)).body.embedding, { enabled: true, updated: 1, skipped: 0, failed: 0 })
  assert.equal(embedded, 1)
  assert.deepEqual((await backfill({})).body.embedding, { enabled: true, updated: 0, skipped: 1, failed: 0 })
})

test('the public scheduler wake accepts no parameters and only GET or POST', async () => {
  await setup()
  const { assertBareSchedulerRequest } = await import('../server/utils/scheduler-request')
  const call = serve({
    'ALL /wake': defineEventHandler(async (event) => {
      await assertBareSchedulerRequest(event)
      return { ok: true }
    }),
  })
  const wake = (method: string, path = '', body?: unknown) => call(`/wake${path}`, { method, body })
  assert.equal((await wake('PUT')).status, 405)
  assert.equal((await wake('GET', '?force=1')).status, 400)
  assert.equal((await wake('POST', '', { force: true })).status, 400)
  assert.equal((await wake('POST', '', [1])).status, 400)
  assert.equal((await wake('POST', '', 'text')).status, 400)
  assert.deepEqual((await wake('GET')).body, { ok: true })
  assert.deepEqual((await wake('POST')).body, { ok: true })
  assert.deepEqual((await wake('POST', '', {})).body, { ok: true })
})

test('strict timestamp cursors fall back to the first page on anything unparseable', async () => {
  const { decodeTimestampCursor } = await import('../server/utils/list-cursor')
  const id = uuidv7()
  assert.deepEqual(decodeTimestampCursor(encodeListCursor({ s: '2026-01-01T00:00:00.000Z', id })), {
    s: '2026-01-01T00:00:00.000Z',
    id,
  })
  assert.equal(decodeTimestampCursor(undefined), null)
  assert.equal(decodeTimestampCursor('%%%'), null)
  assert.equal(decodeTimestampCursor(encodeListCursor({ s: 5, id })), null)
  assert.equal(decodeTimestampCursor(encodeListCursor({ s: 'yesterday', id })), null)
  assert.equal(decodeTimestampCursor(encodeListCursor({ s: '2026-01-01', id: 'not-a-uuid' })), null)
  assert.equal(decodeTimestampCursor(encodeListCursor({ s: '2026-01-01', id: 7 } as never)), null)
})
