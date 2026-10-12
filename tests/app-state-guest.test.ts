import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ref } from 'vue'
import { isRetryableClaimError } from '../app/lib/guest-claim'
import { GUEST_TOKEN_STORAGE_KEY } from '../shared/utils/guest'
import { memoryStorage, resetNuxt, stubGlobals } from './app-state-nuxt'

const loginModal = await import('../app/composables/useLoginModal')
stubGlobals({ useLoginModal: loginModal.useLoginModal })
const { useGuestSession } = await import('../app/composables/useGuestSession')
const { useWidgetEmbed, widgetEmbedKey } = await import('../app/composables/useWidgetEmbed')

const user = { id: 'u1', email: 'a@b.c', name: 'Ann', image: null }

test('only an unanswered, rate-limited or failed claim is retried', () => {
  assert.equal(isRetryableClaimError(new Error('network')), true)
  assert.equal(isRetryableClaimError(null), true)
  assert.equal(isRetryableClaimError({ statusCode: 429 }), true)
  assert.equal(isRetryableClaimError({ statusCode: 503 }), true)
  assert.equal(isRetryableClaimError({ statusCode: 400 }), false)
  assert.equal(isRetryableClaimError({ statusCode: 401 }), false)
})

function portal(guest: Record<string, boolean>, session: unknown) {
  resetNuxt()
  const fetches: { url: string; opts: unknown }[] = []
  let mintResult: () => Promise<{ token: string | null }> = async () => ({ token: 'guest-token' })
  const storage = memoryStorage()
  stubGlobals({
    usePortalOrg: () => ref({ guest }),
    useNuxtData: () => ({ data: ref(session) }),
    localStorage: storage,
    refreshNuxtData: async () => {},
    $fetch: (url: string, opts: unknown) => {
      fetches.push({ url, opts })
      return mintResult()
    },
  })
  return {
    fetches,
    storage,
    failMint: () => {
      mintResult = async () => Promise.reject(new Error('down'))
    },
  }
}

test('an account holder may always act and never mints a guest', async () => {
  const env = portal({ vote: false }, { user: { isAnonymous: false } })
  const guest = useGuestSession()
  assert.equal(guest.hasAccount.value, true)
  assert.equal(guest.isGuest.value, false)
  assert.equal(guest.mayAct('vote'), true)
  assert.equal(await guest.ensureIdentity('vote'), true)
  guest.claimIfPending()
  assert.deepEqual(env.fetches, [])
})

test('a visitor the org does not let act is sent to the sign-in modal', async () => {
  portal({ vote: false }, null)
  const guest = useGuestSession()
  assert.equal(guest.mayAct('vote'), false)
  assert.equal(await guest.ensureIdentity('vote'), false)
  assert.equal(loginModal.useLoginModal().isOpen.value, true)
})

test('an allowed visitor mints one guest and keeps its token', async () => {
  const env = portal({ vote: true }, null)
  const guest = useGuestSession()
  assert.equal(guest.guestMay('vote'), true)
  const [first, second] = await Promise.all([guest.ensureIdentity('vote'), guest.ensureIdentity('vote')])
  assert.equal(first && second, true)
  assert.equal(env.fetches.length, 1)
  assert.equal(env.fetches[0]!.url, '/api/auth/sign-in/anonymous')
  assert.equal(env.storage.getItem(GUEST_TOKEN_STORAGE_KEY), 'guest-token')
  env.failMint()
  assert.equal(await guest.ensureIdentity('vote'), false)
})

test('an existing guest acts without minting again', async () => {
  const env = portal({ comment: true }, { user: { isAnonymous: true } })
  const guest = useGuestSession()
  assert.equal(guest.isGuest.value, true)
  assert.equal(guest.hasIdentity.value, true)
  assert.equal(await guest.ensureIdentity('comment'), true)
  assert.deepEqual(env.fetches, [])
})

test('a guest token that cannot be stored still mints', async () => {
  const env = portal({ vote: true }, null)
  stubGlobals({ localStorage: memoryStorage({}, true), $fetch: async () => ({ token: null }) })
  assert.equal(await useGuestSession().ensureIdentity('vote'), true)
  assert.deepEqual(env.fetches, [])
})

// The embedded widget talks to the API with a bearer token only.
function widget(responses: Record<string, () => Response | Promise<Response>>, stored: Record<string, string> = {}) {
  const requests: { path: string; init: RequestInit }[] = []
  const storage = memoryStorage(stored)
  stubGlobals({
    localStorage: storage,
    fetch: async (path: string, init: RequestInit) => {
      requests.push({ path, init })
      const respond = responses[path]
      if (!respond) throw new Error(`unexpected ${path}`)
      return respond()
    },
  })
  return { requests, storage }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test('the widget has no session without a token', async () => {
  const env = widget({})
  const embed = useWidgetEmbed()
  assert.equal(await embed.loadSession(), false)
  assert.equal(embed.status.value, 'anonymous')
  assert.deepEqual(env.requests, [])
  assert.equal(typeof widgetEmbedKey, 'symbol')
})

test('a stored guest token restores the session over a bearer header', async () => {
  const env = widget({ '/api/auth/get-session': () => json({ user }) }, { [GUEST_TOKEN_STORAGE_KEY]: 'stored' })
  const embed = useWidgetEmbed()
  assert.equal(await embed.loadSession(), true)
  assert.equal(embed.status.value, 'authenticated')
  assert.deepEqual(embed.user.value, user)
  const { init } = env.requests[0]!
  assert.equal(init.credentials, 'omit')
  assert.deepEqual(init.headers, { Authorization: 'Bearer stored' })
  assert.equal(await embed.ensureIdentity(), true)
})

test('a stale stored token is dropped', async () => {
  const env = widget(
    { '/api/auth/get-session': () => json({ message: 'nope' }, 401) },
    { [GUEST_TOKEN_STORAGE_KEY]: 'stale' },
  )
  const embed = useWidgetEmbed()
  assert.equal(await embed.loadSession(), false)
  assert.equal(embed.token.value, null)
  assert.equal(env.storage.getItem(GUEST_TOKEN_STORAGE_KEY), null)
  widget({ '/api/auth/get-session': () => json({}) }, { [GUEST_TOKEN_STORAGE_KEY]: 'empty' })
  assert.equal(await useWidgetEmbed().loadSession(), false)
})

test('widget requests set JSON headers and surface the API error code', async () => {
  const env = widget({
    '/json': () => json({ ok: true }),
    '/form': () => json({ ok: true }),
    '/fail': () => json({ message: 'Too many', data: { code: 'RATE' } }, 429),
    '/broken': () => new Response('<html>', { status: 502 }),
  })
  const embed = useWidgetEmbed()
  assert.deepEqual(await embed.widgetFetch('/json', { method: 'POST', body: '{}', headers: { 'X-A': '1' } }), {
    ok: true,
  })
  assert.deepEqual(env.requests[0]!.init.headers, { 'Content-Type': 'application/json', 'X-A': '1' })
  await embed.widgetRequest('/form', { method: 'POST', body: new FormData() })
  assert.deepEqual(env.requests[1]!.init.headers, {})
  await assert.rejects(embed.widgetRequest('/fail'), { message: 'Too many', statusCode: 429, code: 'RATE' })
  await assert.rejects(embed.widgetRequest('/broken'), {
    message: 'Request failed (502)',
    statusCode: 502,
    code: undefined,
  })
})

test('a guest is minted once, only when the org allows it', async () => {
  let mint = () => json({ token: 'minted', user: { ...user, isAnonymous: true } })
  const env = widget({ '/api/auth/sign-in/anonymous': () => mint() })
  const embed = useWidgetEmbed()
  assert.equal(await embed.ensureIdentity(), false)
  embed.allowGuest.value = true
  const [a, b] = await Promise.all([embed.ensureIdentity(), embed.ensureIdentity()])
  assert.equal(a && b, true)
  assert.equal(env.requests.length, 1)
  assert.equal(embed.token.value, 'minted')
  assert.equal(env.storage.getItem(GUEST_TOKEN_STORAGE_KEY), 'minted')

  for (const failure of [
    () => json({}, 500),
    () => json({ token: null, user: null }),
    () => Promise.reject(new Error('offline')) as never,
  ]) {
    mint = failure
    const fresh = useWidgetEmbed()
    fresh.allowGuest.value = true
    assert.equal(await fresh.ensureIdentity(), false)
    assert.equal(fresh.status.value, 'loading')
  }
})
