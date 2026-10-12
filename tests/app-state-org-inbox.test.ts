import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ref } from 'vue'
import {
  advanceReadPosition,
  hasUnread,
  isObservedSeq,
  mergeReadPositions,
  readPositionsKey,
} from '../app/lib/inbox-read-positions'
import { authDomainHostOf, browserHost, parseTenantSlug, resolveOrgContext } from '../app/lib/org-context'
import { DEFAULT_ORG_ID, DEFAULT_ORG_SLUG } from '../shared/constants/default-org'
import { memoryStorage, resetNuxt, stubGlobals } from './app-state-nuxt'

const hosts = { rootDomain: 'feedlog.io', authDomainHost: 'auth.feedlog.io' }
const orgs = [
  { orgId: DEFAULT_ORG_ID, slug: DEFAULT_ORG_SLUG, role: 'owner' },
  { orgId: 'org-acme', slug: 'acme', role: 'manager' },
]

test('tenant slugs come only from a single label under the root domain', () => {
  assert.equal(parseTenantSlug('Acme.FeedLog.io:3000', hosts), 'acme')
  assert.equal(parseTenantSlug('', hosts), null)
  assert.equal(parseTenantSlug('feedlog.io', hosts), null)
  assert.equal(parseTenantSlug('auth.feedlog.io', hosts), null)
  assert.equal(parseTenantSlug('acme.example.com', hosts), null)
  assert.equal(parseTenantSlug('a.b.feedlog.io', hosts), null)
  assert.equal(parseTenantSlug('.feedlog.io', hosts), null)
  assert.equal(authDomainHostOf('https://auth.feedlog.io:8443'), 'auth.feedlog.io')
  assert.equal(authDomainHostOf(''), '')
})

test('single-tenant mode always resolves the default org and never reads the host', () => {
  const host = () => assert.fail('host must not be read')
  assert.deepEqual(resolveOrgContext(orgs, { rootDomain: '', authDomainHost: '' }, host), {
    orgId: DEFAULT_ORG_ID,
    orgSlug: DEFAULT_ORG_SLUG,
    role: 'owner',
  })
  assert.equal(resolveOrgContext([], { rootDomain: '', authDomainHost: '' }, host).role, null)
})

test('multi-tenant mode binds the host slug and the role from the session', () => {
  assert.deepEqual(
    resolveOrgContext(orgs, hosts, () => 'acme.feedlog.io'),
    {
      orgId: 'org-acme',
      orgSlug: 'acme',
      role: 'manager',
    },
  )
  assert.deepEqual(
    resolveOrgContext(orgs, hosts, () => 'other.feedlog.io'),
    {
      orgId: 'other',
      orgSlug: 'other',
      role: null,
    },
  )
  assert.deepEqual(
    resolveOrgContext(orgs, hosts, () => 'auth.feedlog.io'),
    {
      orgId: DEFAULT_ORG_ID,
      orgSlug: DEFAULT_ORG_SLUG,
      role: null,
    },
  )
})

test('the browser host is empty outside a browser', () => {
  assert.equal(browserHost(), '')
  stubGlobals({ window: { location: { host: 'acme.feedlog.io' } } })
  try {
    assert.equal(browserHost(), 'acme.feedlog.io')
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
})

test('useOrgContext reads the session org list and the runtime config', async () => {
  const session = ref<unknown>({ orgList: orgs })
  stubGlobals({
    useAuthSession: () => ({ data: session }),
    useRuntimeConfig: () => ({ public: { rootDomain: 'feedlog.io', authDomain: 'https://auth.feedlog.io' } }),
    window: { location: { host: 'acme.feedlog.io' } },
  })
  try {
    const { useOrgContext } = await import('../app/composables/useOrgContext')
    const org = useOrgContext()
    assert.deepEqual(org.value, { orgId: 'org-acme', orgSlug: 'acme', role: 'manager' })
    session.value = null
    assert.deepEqual(org.value, { orgId: 'acme', orgSlug: 'acme', role: null })
    stubGlobals({ useRuntimeConfig: () => ({ public: {} }) })
    assert.deepEqual(useOrgContext().value, { orgId: DEFAULT_ORG_ID, orgSlug: DEFAULT_ORG_SLUG, role: null })
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
})

test('read positions merge forward only and ignore malformed entries', () => {
  assert.equal(readPositionsKey('o1'), 'feedlog:inbox:read:o1')
  assert.deepEqual(mergeReadPositions({ a: 5, b: 1 }, '{"a":3,"b":4,"c":2,"d":-1,"e":1.5,"f":"9"}'), {
    a: 5,
    b: 4,
    c: 2,
  })
  assert.deepEqual(mergeReadPositions(undefined, '{"a":0}'), { a: 0 })
  assert.equal(mergeReadPositions({}, 'null'), undefined)
  assert.equal(mergeReadPositions({}, '[1]'), undefined)
  assert.equal(mergeReadPositions({}, '7'), undefined)
  assert.throws(() => mergeReadPositions({}, '{'), SyntaxError)
})

test('a read position advances only past what was already seen', () => {
  assert.equal(isObservedSeq(3), true)
  assert.equal(isObservedSeq(0), false)
  assert.equal(isObservedSeq(Number.NaN), false)
  assert.equal(isObservedSeq(2 ** 60), false)
  assert.deepEqual(advanceReadPosition({ a: 2 }, 'a', 3), { a: 3 })
  assert.deepEqual(advanceReadPosition(undefined, 'b', 1), { b: 1 })
  assert.equal(advanceReadPosition({ a: 2 }, 'a', 2), undefined)
  assert.equal(hasUnread({ a: 3 }, { a: 2 }, 'a'), true)
  assert.equal(hasUnread({ a: 3 }, { a: 3 }, 'a'), false)
  assert.equal(hasUnread(undefined, undefined, 'a'), false)
})

test('useInboxBadge counts unread conversations and persists what was read', async () => {
  resetNuxt()
  const storage = memoryStorage()
  const listeners = new Map<string, unknown>()
  let summary: { id: string; attentionSeq: number }[] = [
    { id: 'c1', attentionSeq: 4 },
    { id: 'c2', attentionSeq: 2 },
  ]
  stubGlobals({
    useOrgContext: () => ref({ orgId: 'o1' }),
    localStorage: storage,
    window: {
      addEventListener: (name: string, fn: unknown) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    },
    useApiFetch: async (url: string) => {
      assert.equal(url, '/api/admin/inbox/summary')
      if (!summary.length) throw new Error('offline')
      return { openConversations: summary }
    },
  })
  try {
    const { useInboxBadge } = await import('../app/composables/useInboxBadge')
    const badge = useInboxBadge()
    assert.ok(listeners.has('storage'))
    assert.equal(badge.count.value, 0)
    await badge.refresh()
    assert.equal(badge.count.value, 2)
    badge.markRead('c1', 4)
    assert.equal(badge.isUnread('c1'), false)
    assert.equal(storage.getItem('feedlog:inbox:read:o1'), '{"c1":4}')
    badge.markRead('c1', 3)
    badge.markRead('c2', 0)
    assert.equal(badge.count.value, 1)
    stubGlobals({ localStorage: memoryStorage({}, true) })
    badge.markRead('c2', 2)
    assert.equal(badge.count.value, 0)
    summary = []
    await badge.refresh()
    assert.equal(badge.count.value, 0)
    resetNuxt()
    assert.ok(!listeners.has('storage'))
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
})
