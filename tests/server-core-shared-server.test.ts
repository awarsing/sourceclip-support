import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createError, type H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { conversation, member, organization, post, postSubscription, postUnread, user } from '../server/db/schemas'
import { useDB } from '../server/utils/db'
import { generateSlug } from '../server/utils/slug'
import { computeContentHash } from '../server/utils/hash'
import { generateExcerpt, stripMarkdown } from '../shared/utils/markdown'

assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname),
  'Integration tests require a local database',
)

const embeddings: unknown[][] = []
const adminNotifications: unknown[] = []
const domainListeners: Record<string, Array<(event: any, context?: any) => Promise<void>>> = {}
let runtimeConfig: Record<string, unknown> = {}
Object.assign(globalThis, {
  createError,
  useDB,
  stripMarkdown,
  generateExcerpt,
  computeContentHash,
  generateSlug,
  defineNitroPlugin: (plugin: unknown) => plugin,
  defineEventHandler: (handler: unknown) => handler,
  useRuntimeConfig: () => runtimeConfig,
  getOrgInfo: async (slug: string) =>
    slug === 'help-on'
      ? { id: 'org-help', metadata: { portalModules: { helpCenter: true } } }
      : { id: 'org-off', metadata: {} },
  onDomainEvent: (_app: unknown, name: string, handler: (event: any, context?: any) => Promise<void>) => {
    ;(domainListeners[name] ??= []).push(handler)
  },
  generatePostEmbedding: async (...args: unknown[]) => {
    embeddings.push(args)
  },
  emitAdminNotification: async (input: unknown) => {
    adminNotifications.push(input)
  },
  sendEmail: async () => {},
  renderInvitationEmail: () => '',
})
process.env.AUTH_EMAIL_ENABLED = 'true'

const { formatConversationTime } = await import('../shared/utils/conversation-time')
const { getOrgMemberRole } = await import('../server/utils/auth')
const { registerBlobProvider, resolveBlobProvider } = await import('../server/utils/blob')
const { requireHelpCenterOrg } = await import('../server/utils/help-portal')
const { parseAiResponse } = await import('../server/utils/changelog-ai')
const { hashPassword, verifyPassword } = await import('../server/utils/password-hash')
const { withHelpShortId } = await import('../server/utils/help')
const { generateEmbedding } = await import('../server/utils/embedding')
const { createPostRecord } = await import('../server/utils/post-create')
const { countWidgetBadge } = await import('../server/utils/widget-unread')
const { buildAuthConfig, defaultTrustedOrigins } = await import('../server/utils/better-auth')
const accessLog = (await import('../server/plugins/access-log')).default as unknown as (app: unknown) => void
const frameAncestors = (await import('../server/middleware/01-frame-ancestors')).default as unknown as (
  event: unknown,
) => void
const feedbackListeners = (await import('../server/plugins/feedback-listeners')).default as unknown as (
  app: unknown,
) => void

const db = useDB()
after(() => (db as unknown as { $client: { end: () => Promise<void> } }).$client.end())

async function seedOrg() {
  const orgId = uuidv7()
  const ownerId = uuidv7()
  const authorId = uuidv7()
  await db.insert(organization).values({ id: orgId, name: 'Org', slug: `org-${orgId}` })
  await db.insert(user).values([
    { id: ownerId, name: 'Owner', email: `${ownerId}@example.com` },
    { id: authorId, name: 'Author', email: `${authorId}@example.com` },
  ])
  await db.insert(member).values({ id: uuidv7(), organizationId: orgId, userId: ownerId, role: 'owner' })
  return { orgId, ownerId, authorId }
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error as { statusCode?: number; message: string }
  }
  assert.fail('expected a refusal')
}

test('conversation times read as relative ages, then as dates', () => {
  const now = Date.parse('2026-06-15T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms)
  assert.equal(formatConversationTime('not a date', 'en', 'now', now), '')
  assert.equal(formatConversationTime(ago(30_000), 'en', 'now', now), 'now')
  assert.equal(formatConversationTime(new Date(now + 60_000), 'en', 'now', now), 'now')
  assert.equal(formatConversationTime(ago(5 * 60_000), 'en', 'now', now), '5m')
  assert.equal(formatConversationTime(ago(3 * 3_600_000).toISOString(), 'en', 'now', now), '3h')
  assert.equal(formatConversationTime(ago(2 * 86_400_000), 'en', 'now', now), '2d')
  assert.equal(formatConversationTime('2026-05-01T12:00:00Z', 'en', 'now', now), 'May 1')
  assert.equal(formatConversationTime('2025-05-01T12:00:00Z', 'en', 'now', now), 'May 1, 2025')
  assert.equal(formatConversationTime('2026-05-01T12:00:00Z', 'zh', 'now', now), '5月1日')
})

test('member role is read only for a non-guest session in the org', () => {
  const session = {
    user: { isAnonymous: false },
    orgList: [{ orgId: 'one', role: 'manager' }],
  } as unknown as Parameters<typeof getOrgMemberRole>[0]
  assert.equal(getOrgMemberRole(null, 'one'), null)
  assert.equal(getOrgMemberRole(session, undefined), null)
  assert.equal(getOrgMemberRole(session, 'one'), 'manager')
  assert.equal(getOrgMemberRole(session, 'two'), null)
  assert.equal(getOrgMemberRole({ ...session, orgList: undefined } as typeof session, 'one'), null)
  assert.equal(getOrgMemberRole({ ...session, user: { isAnonymous: true } } as typeof session, 'one'), null)
})

test('blob provider: explicit pick, then any custom provider, then the NuxtHub default', () => {
  runtimeConfig = {}
  assert.throws(() => resolveBlobProvider(), /No blob provider registered/)
  const storage = {} as never
  registerBlobProvider({ name: 'nuxthub', storage })
  assert.equal(resolveBlobProvider().name, 'nuxthub')
  registerBlobProvider({ name: 's3', storage })
  assert.equal(resolveBlobProvider().name, 's3')
  runtimeConfig = { blobProvider: 'nuxthub' }
  assert.equal(resolveBlobProvider().name, 'nuxthub')
  runtimeConfig = { blobProvider: 'missing' }
  assert.equal(resolveBlobProvider().name, 's3')
})

test('help center resolves only for an org with the module enabled', async () => {
  const event = (context: Record<string, unknown>) => ({ context }) as unknown as H3Event
  assert.equal(await requireHelpCenterOrg(event({ orgSlug: 'help-on' })), 'org-help')
  assert.equal(await requireHelpCenterOrg(event({ orgSlug: 'help-on', orgId: 'request-org' })), 'request-org')
  assert.equal((await refusal(requireHelpCenterOrg(event({ orgSlug: 'help-off' })))).statusCode, 404)
  assert.equal((await refusal(requireHelpCenterOrg(event({})))).statusCode, 404)
})

test('AI changelog output is read from plain, fenced or embedded JSON', () => {
  const output = { title: 'Dark mode', content_markdown: 'You can now...', suggested_tags: ['ui'] }
  const json = JSON.stringify(output)
  assert.deepEqual(parseAiResponse(json), output)
  assert.deepEqual(parseAiResponse(`Here you go:\n\`\`\`json\n${json}\n\`\`\``), output)
  assert.deepEqual(parseAiResponse(`Sure! ${json} Hope this helps.`), output)
  for (const raw of [
    '',
    'no json at all',
    '} {',
    'null',
    JSON.stringify({ ...output, suggested_tags: [1] }),
    JSON.stringify({ ...output, title: 1 }),
    '```json\n{"title":"x"}\n```',
  ]) {
    assert.throws(() => parseAiResponse(raw), { statusCode: 502, message: 'AI returned invalid response format' })
  }
})

test('passwords verify only against a well-formed matching PBKDF2 record', async () => {
  const hash = await hashPassword('correct horse')
  assert.match(hash, /^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
  assert.equal(await verifyPassword({ hash, password: 'correct horse' }), true)
  assert.equal(await verifyPassword({ hash, password: 'wrong horse' }), false)
  const [, , salt, key] = hash.split('$')
  for (const malformed of [
    'scrypt$1$aa$bb',
    `pbkdf2-sha256$100000$${salt}`,
    `pbkdf2-sha256$0$${salt}$${key}`,
    `pbkdf2-sha256$many$${salt}$${key}`,
  ]) {
    assert.equal(await verifyPassword({ hash: malformed, password: 'correct horse' }), false, malformed)
  }
  assert.equal(await verifyPassword({ hash: `pbkdf2-sha256$100000$${salt}$${key!.slice(2)}`, password: 'x' }), false)
})

test('help short ids retry only on a unique violation', async () => {
  const attempts: string[] = []
  const id = await withHelpShortId(async (shortId) => {
    attempts.push(shortId)
    if (attempts.length < 3) throw Object.assign(new Error('duplicate'), { code: '23505' })
    return shortId
  })
  assert.equal(attempts.length, 3)
  assert.equal(id, attempts[2])
  await assert.rejects(
    withHelpShortId(async () => {
      throw Object.assign(new Error('duplicate'), { code: '23505' })
    }, 2),
    { statusCode: 500, message: 'Failed to generate article id' },
  )
  await assert.rejects(
    withHelpShortId(async () => {
      throw new Error('connection lost')
    }),
    /connection lost/,
  )
})

test('embeddings are requested from the configured OpenAI-compatible endpoint', async (t) => {
  const saved = { key: process.env.OPENAI_API_KEY, base: process.env.OPENAI_BASE_URL }
  const requests: Array<{ url: string; init: RequestInit }> = []
  let reply = new Response(JSON.stringify({ data: [{ embedding: [0.5, 0.25] }] }))
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, init })
    return reply
  })
  try {
    delete process.env.OPENAI_API_KEY
    await assert.rejects(generateEmbedding('x'), /OPENAI_API_KEY is not configured/)

    process.env.OPENAI_API_KEY = 'test-key'
    process.env.OPENAI_BASE_URL = 'https://llm.example.com/v1//'
    assert.deepEqual(await generateEmbedding('hello'), [0.5, 0.25])
    assert.equal(requests[0]!.url, 'https://llm.example.com/v1/embeddings')
    assert.equal((requests[0]!.init.headers as Record<string, string>).Authorization, 'Bearer test-key')
    assert.deepEqual(JSON.parse(String(requests[0]!.init.body)), {
      model: 'text-embedding-3-large',
      input: 'hello',
      dimensions: 768,
    })

    delete process.env.OPENAI_BASE_URL
    reply = new Response('quota', { status: 429 })
    await assert.rejects(generateEmbedding('hello'), /OpenAI API error: 429 quota/)
    assert.equal(requests[1]!.url, 'https://api.openai.com/v1/embeddings')
    reply = new Response(JSON.stringify({ data: [] }))
    await assert.rejects(generateEmbedding('hello'), /no embedding returned/)
  } finally {
    process.env.OPENAI_API_KEY = saved.key
    if (saved.key === undefined) delete process.env.OPENAI_API_KEY
    process.env.OPENAI_BASE_URL = saved.base
    if (saved.base === undefined) delete process.env.OPENAI_BASE_URL
  }
})

test('created posts get a search row and, when asked, an author subscription; the badge counts unread', async () => {
  const { orgId, authorId } = await seedOrg()
  const subscribed = await createPostRecord({
    orgId,
    authorId,
    title: 'Export to CSV',
    content: '**Please** add CSV export',
    boardId: '',
    subscribeAuthor: true,
  })
  assert.match(subscribed.slug, /^export-to-csv-/)
  assert.equal(subscribed.boardId, null)
  assert.equal(subscribed.contentHash, computeContentHash('Export to CSV', '**Please** add CSV export'))
  const quiet = await db.transaction((tx) =>
    createPostRecord({ orgId, authorId, title: 'Quiet', content: 'No subscription', subscribeAuthor: false }, tx),
  )
  const subscriptions = await db.select().from(postSubscription).where(eq(postSubscription.userId, authorId))
  assert.deepEqual(
    subscriptions.map((row) => row.postId),
    [subscribed.id],
  )
  await assert.rejects(
    createPostRecord({ orgId, authorId, title: 'Lost', content: 'x', subscribeAuthor: false }, {
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
    } as never),
    { statusCode: 500, message: 'Failed to create' },
  )

  assert.deepEqual(await countWidgetBadge(orgId, authorId), { count: 0, feedback: 0 })
  await db.insert(postUnread).values([
    { postId: subscribed.id, userId: authorId },
    { postId: quiet.id, userId: authorId },
  ])
  await db.insert(conversation).values({ orgId, userId: authorId, unread: true, lastSeq: 1 })
  await db.insert(conversation).values({ orgId, userId: authorId, unread: true, lastSeq: 0 })
  assert.deepEqual(await countWidgetBadge(orgId, authorId), { count: 3, feedback: 2 })
})

test('feedback.created embeds the post and notifies staff only for a non-staff author', async () => {
  const { orgId, ownerId, authorId } = await seedOrg()
  feedbackListeners({})
  const [embed, notify] = domainListeners['feedback.created']!
  const [created] = await db
    .insert(post)
    .values({ orgId, authorId, slug: `s-${uuidv7()}`, title: 'T', content: 'C', contentHash: 'h' })
    .returning()
  const [legacy] = await db
    .insert(post)
    .values({ orgId, authorId, slug: `s-${uuidv7()}`, title: 'Legacy', content: 'C' })
    .returning()
  const event = (feedbackId: string, userId?: string) => ({ orgId, userId, data: { feedbackId } })

  await embed!(event(created!.id))
  await embed!(event(legacy!.id))
  await embed!(event(uuidv7()))
  assert.deepEqual(embeddings, [[created!.id, orgId, 'T', 'C', 'h']])

  await notify!(event(created!.id))
  await notify!(event(created!.id, ownerId))
  await notify!(event(uuidv7(), authorId))
  assert.equal(adminNotifications.length, 0)
  await notify!(event(created!.id, authorId), { requestOrigin: 'https://org.example.com' })
  await notify!(event(created!.id, authorId))
  assert.deepEqual(adminNotifications, [
    {
      orgId,
      typeKey: 'post.created',
      postSlug: created!.slug,
      postTitle: 'T',
      snippet: 'C',
      actorId: authorId,
      requestOrigin: 'https://org.example.com',
    },
    {
      orgId,
      typeKey: 'post.created',
      postSlug: created!.slug,
      postTitle: 'T',
      snippet: 'C',
      actorId: authorId,
      requestOrigin: undefined,
    },
  ])
})

test('auth config: trusted origins, invitation sending and guest naming', async () => {
  assert.deepEqual(defaultTrustedOrigins(), [])
  assert.deepEqual(
    defaultTrustedOrigins(new Request('https://x.example.com', { headers: { host: 'org.example.com' } })),
    ['http://org.example.com', 'https://org.example.com'],
  )

  const defaults = buildAuthConfig()
  assert.equal(defaults.trustedOrigins, defaultTrustedOrigins)
  assert.equal('account' in defaults, false)
  assert.equal(defaults.plugins!.length, 5)

  const invited: string[] = []
  const created: string[] = []
  const config = buildAuthConfig({
    trustedOrigins: ['https://app.example.com'],
    account: { accountLinking: { enabled: false } },
    socialProviderOverrides: { google: { prompt: 'select_account' } },
    extraPlugins: [{ id: 'extra' }],
    organizationExtras: {
      sendInvitationEmail: async (data) => {
        invited.push(data.email)
        if (data.email.startsWith('fail')) throw new Error('mail down')
      },
    },
    userCreateAfter: (newUser) => {
      created.push(newUser.email)
    },
  })
  assert.deepEqual(config.trustedOrigins, ['https://app.example.com'])
  assert.deepEqual(config.account, { accountLinking: { enabled: false } })
  assert.deepEqual(config.socialProviders, { google: { prompt: 'select_account' } })
  assert.equal(config.plugins!.length, 6)

  const orgPlugin = config.plugins!.find((plugin) => plugin.id === 'organization') as unknown as {
    options: { sendInvitationEmail: (data: unknown, request?: Request) => Promise<void>; creatorRole: string }
  }
  assert.equal(orgPlugin.options.creatorRole, 'owner')
  const invitation = (email: string) => ({ id: 'inv', email, organization: { name: 'Org' } })
  await orgPlugin.options.sendInvitationEmail(invitation('ok@example.com'))
  await orgPlugin.options.sendInvitationEmail(invitation('fail@example.com'))
  assert.deepEqual(invited, ['ok@example.com', 'fail@example.com'])

  const after = config.databaseHooks!.user!.create!.after! as (newUser: unknown) => Promise<void>
  await after({ id: 'u1', email: 'member@example.com', isAnonymous: false })
  assert.deepEqual(created, ['member@example.com'])
  const guestId = uuidv7()
  await db
    .insert(user)
    .values({ id: guestId, name: 'Anonymous', email: `${guestId}@guest.example.com`, isAnonymous: true })
  await after({ id: guestId, email: `${guestId}@guest.example.com`, isAnonymous: true })
  assert.deepEqual(created, ['member@example.com'])
  const [guest] = await db.select({ name: user.name }).from(user).where(eq(user.id, guestId))
  assert.match(guest!.name, /^Anonymous \S+$/)
  assert.notEqual(guest!.name, 'Anonymous')
})

test('access log records requests and errors', (t) => {
  const hooks: Record<string, (...args: any[]) => void> = {}
  accessLog({ hooks: { hook: (name: string, fn: (...args: any[]) => void) => (hooks[name] = fn) } })
  const logs = t.mock.method(console, 'log', () => {})
  const errors = t.mock.method(console, 'error', () => {})
  const event = {
    path: '/api/posts?x=1',
    context: {} as Record<string, unknown>,
    method: 'GET',
    node: {
      req: { method: 'GET', url: '/api/posts?x=1', headers: { host: 'org.example.com' }, connection: {} },
      res: { statusCode: 201 },
    },
  }
  hooks.request!(event)
  assert.equal(typeof event.context._startTime, 'number')
  hooks.afterResponse!(event)
  assert.match(String(logs.mock.calls[0]!.arguments[0]), /^\[access\] GET \/api\/posts\?x=1 201 \d+ms$/)
  hooks.afterResponse!({ ...event, context: {} })
  assert.match(String(logs.mock.calls[1]!.arguments[0]), / 0ms$/)

  hooks.error!(Object.assign(new Error('boom'), { statusCode: 418 }), { event })
  assert.match(String(errors.mock.calls[0]!.arguments[0]), /^\[access\] GET \/api\/posts\?x=1 418 \d+ms - boom$/)
  hooks.error!(new Error('early'), {})
  assert.equal(errors.mock.calls[1]!.arguments[0], '[access] - - 500 0ms - early')
  hooks.error!(new Error('pathless'), { event: { ...event, path: '', context: undefined } })
  assert.equal(errors.mock.calls[2]!.arguments[0], '[access] GET - 500 0ms - pathless')
})

test('only the widget embed page may be framed', () => {
  const headers: Array<[string, string] | null> = []
  Object.assign(globalThis, {
    setResponseHeader: (_event: unknown, name: string, value: string) => headers.push([name, value]),
  })
  for (const path of ['/api/widget/embed', '/widget/embed?org=x', '/widget/embed/chat', '/widget/embedded', '/']) {
    const before = headers.length
    frameAncestors({ path })
    if (headers.length === before) headers.push(null)
  }
  assert.deepEqual(headers, [
    null,
    ['Content-Security-Policy', 'frame-ancestors *'],
    ['Content-Security-Policy', 'frame-ancestors *'],
    ['Content-Security-Policy', "frame-ancestors 'none'"],
    ['Content-Security-Policy', "frame-ancestors 'none'"],
  ])
})
