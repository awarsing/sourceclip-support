// Runs real server/api handlers against the throwaway test database.
//
// Nitro auto-imports h3, the server/utils exports and `auth`; this installs the
// same names on globalThis, backs `useDB` with DATABASE_URL, and replaces the
// better-auth instance with sessions the test registers by token. Handlers are
// loaded with `loadHandler` after the `#layers/feedlog` alias hook is in place.
import { registerHooks } from 'node:module'
import { readdirSync } from 'node:fs'
import { after } from 'node:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { uuidv7 } from 'uuidv7'
import * as h3 from 'h3'
import * as schema from '../server/db/schemas/index'

const root = new URL('../', import.meta.url).href
const alias = '#layers/feedlog/'
registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith(alias) ? root + specifier.slice(alias.length) : specifier, context)
  },
})

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set; run the tests through scripts/with-test-postgres.mjs')
const client = postgres(url, { max: 4, onnotice: () => {} })
export const db = drizzle(client, { schema })
// Some utilities import the app's own DB singleton directly; close its pool too.
after(async () => {
  await client.end()
  const app = await import('../server/db/index')
  await app.db.$client.end()
})

export interface TestSession {
  user: { id: string; name: string; email: string; isAnonymous?: boolean; image?: string | null }
  session: { id: string; token: string; ssoOrgId?: string | null }
  orgList: { orgId: string; role: string }[]
}

const sessions = new Map<string, TestSession>()
const permissionDenied = new Set<string>()
const pending: Promise<unknown>[] = []
// Every email a handler sends, in order.
export const sentEmails: { to: string; subject: string; html: string }[] = []
const storage = new Map<string, unknown>()

export const authApi: Record<string, (...args: any[]) => unknown> = {
  getSession: async ({ headers }: { headers: Headers }) => {
    const bearer = headers.get('authorization')?.replace(/^Bearer /, '')
    return sessions.get(headers.get('x-test-session') ?? bearer ?? '') ?? null
  },
  // Like better-auth, a permission only holds inside an org the caller belongs to.
  hasPermission: async ({ headers, body }: { headers: Headers; body: { organizationId?: string } }) => {
    const token = headers.get('x-test-session') ?? ''
    const member = sessions.get(token)?.orgList.some((entry) => entry.orgId === body.organizationId) ?? false
    return { success: member && !permissionDenied.has(token), error: null }
  },
}
export const authStub: { api: typeof authApi; $context?: unknown } = { api: authApi }

const runtimeConfig = { public: { uploadPrefix: 'test-uploads' } }

let installed: Promise<void> | undefined
// Utilities with module-level side effects (the real auth instance, the DB
// singleton) are replaced above rather than loaded.
const skippedUtils = new Set(['better-auth.ts', 'db.ts'])

async function installGlobals() {
  const globals: Record<string, unknown> = { ...h3 }
  Object.assign(globals, {
    useDB: () => db,
    auth: authStub,
    useRuntimeConfig: () => runtimeConfig,
    useStorage: () => ({
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: unknown) => void storage.set(key, value),
    }),
  })
  Object.assign(globalThis, globals)
  // Nitro auto-imports server/utils and, through Nuxt, shared/utils.
  for (const dir of ['../server/utils/', '../shared/utils/']) {
    const utilsDir = new URL(dir, import.meta.url)
    for (const file of readdirSync(utilsDir).sort()) {
      if (!file.endsWith('.ts') || skippedUtils.has(file)) continue
      const exports = await import(new URL(file, utilsDir).href)
      for (const [name, value] of Object.entries(exports)) {
        if (!(name in globals)) globals[name] = value
      }
    }
  }
  Object.assign(globalThis, globals)
  ;(globals.registerEmailProvider as (provider: unknown) => void)({
    name: 'console',
    send: async (message: { to: string; subject: string; html: string }) => void sentEmails.push(message),
  })
  // Org lookups read this database instead of opening the app's own pool.
  ;(globals.registerOrgCacheBackend as (backend: unknown) => void)({
    get: async (slug: string) => {
      const [row] = await db.select().from(schema.organization).where(eq(schema.organization.slug, slug))
      return row ?? null
    },
    invalidate: async () => {},
  })
}

export function setup() {
  installed ??= installGlobals()
  return installed
}

export async function loadHandler(path: string): Promise<h3.EventHandler> {
  await setup()
  return (await import(new URL(`../server/api/${path}`, import.meta.url).href)).default
}

// Mounts handlers at their route paths and returns a fetch-like caller. The
// org is resolved from the x-test-org header, as org-context middleware would.
export function serve(routes: Record<string, h3.EventHandler>) {
  // Errors answer with their message, as Nitro's error handler does.
  const app = h3.createApp({
    onError: (error, event) => {
      h3.setResponseStatus(event, error.statusCode)
      h3.setResponseHeader(event, 'content-type', 'application/json')
      return h3.send(event, JSON.stringify({ statusCode: error.statusCode, message: error.message, data: error.data }))
    },
  })
  app.use(
    h3.defineEventHandler((event) => {
      event.context.orgId = event.headers.get('x-test-org') ?? undefined
      event.context.orgSlug = event.headers.get('x-test-org-slug') ?? undefined
      ;(event as unknown as { waitUntil: (p: Promise<unknown>) => void }).waitUntil = (p) => void pending.push(p)
    }),
  )
  const router = h3.createRouter()
  for (const [key, handler] of Object.entries(routes)) {
    const [method, route] = key.split(' ') as [string, string]
    router.use(route, handler, method.toLowerCase() as h3.RouterMethod)
  }
  app.use(router)
  const handle = h3.toWebHandler(app)
  return async (
    path: string,
    init: {
      method?: string
      session?: string
      org?: string
      orgSlug?: string
      body?: unknown
      headers?: Record<string, string>
    } = {},
  ) => {
    const headers = new Headers(init.headers)
    if (!headers.has('host')) headers.set('host', 'test.local')
    if (init.session) headers.set('x-test-session', init.session)
    if (init.org) headers.set('x-test-org', init.org)
    const slug = init.orgSlug ?? init.org
    if (slug) headers.set('x-test-org-slug', slug)
    let body: BodyInit | undefined
    if (init.body instanceof Uint8Array || typeof init.body === 'string') body = init.body as BodyInit
    else if (init.body !== undefined) {
      body = JSON.stringify(init.body)
      headers.set('content-type', 'application/json')
    }
    const response = await handle(
      new Request(`http://test.local${path}`, { method: init.method ?? 'GET', headers, body }),
    )
    const text = await response.text()
    let json: any
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return { status: response.status, headers: response.headers, body: json }
  }
}

export async function settle() {
  await Promise.allSettled(pending.splice(0))
}

// One organization with an owner, a manager, a contributor, an end user, a
// guest and an outsider. Every id is unique so test files can share the database.
export async function createOrg({ metadata }: { metadata?: Record<string, unknown> } = {}) {
  const orgId = `api-${uuidv7()}`
  await db.insert(schema.organization).values({
    id: orgId,
    name: `Org ${orgId}`,
    slug: orgId,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: new Date(),
  })
  const people = {} as Record<'owner' | 'manager' | 'contributor' | 'user' | 'guest' | 'outsider', TestSession>
  for (const role of ['owner', 'manager', 'contributor', 'user', 'guest', 'outsider'] as const) {
    const id = `${role}-${uuidv7()}`
    const isAnonymous = role === 'guest'
    await db
      .insert(schema.user)
      .values({ id, name: `${role} name`, email: `${id}@example.invalid`, isAnonymous, image: null })
    const staff = role === 'owner' || role === 'manager' || role === 'contributor'
    if (staff) {
      await db
        .insert(schema.member)
        .values({ id: uuidv7(), userId: id, organizationId: orgId, role, createdAt: new Date() })
    }
    const token = `token-${id}`
    const session: TestSession = {
      user: { id, name: `${role} name`, email: `${id}@example.invalid`, isAnonymous, image: null },
      session: { id: `session-${id}`, token, ssoOrgId: null },
      orgList: staff ? [{ orgId, role }] : [],
    }
    sessions.set(token, session)
    if (!staff || role === 'contributor') permissionDenied.add(token)
    people[role] = session
  }
  const token = (role: keyof typeof people) => people[role].session.token
  return { orgId, people, token }
}

export function registerSession(session: TestSession, { canModerate = false } = {}) {
  sessions.set(session.session.token, session)
  if (!canModerate) permissionDenied.add(session.session.token)
}

export async function createPost(
  orgId: string,
  authorId: string,
  values: Partial<typeof schema.post.$inferInsert> = {},
): Promise<typeof schema.post.$inferSelect> {
  const id = uuidv7()
  const [row] = await db
    .insert(schema.post)
    .values({ orgId, authorId, slug: `post-${id}`, title: `Post ${id}`, content: `Content ${id}`, ...values, id })
    .returning()
  return row!
}
