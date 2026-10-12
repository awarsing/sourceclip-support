import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ref } from 'vue'
import { brandStyles, logoFaviconLinks, systemThemeScripts } from '../app/lib/app-head'
import { extractErrorCode } from '../app/lib/error-code'
import { FORWARDED_HEADERS, presentHeaders } from '../app/lib/forwarded-headers'
import { timeAgoParts } from '../app/lib/time-ago'
import { resolveAttachmentUrl, resolveAttachmentUrls, sanitizeAttachmentHtml } from '../app/utils/attachment'
import { AVATAR_MAX_BYTES, AVATAR_MAX_EDGE, AvatarValidationError } from '../shared/utils/avatar'
import { guestTag } from '../shared/utils/identity'
import { fakeT, stubGlobals } from './app-state-nuxt'

test('attachment keys resolve to file URLs and resolved URLs pass through', () => {
  assert.equal(resolveAttachmentUrl(null), null)
  assert.equal(resolveAttachmentUrl(''), null)
  assert.equal(resolveAttachmentUrl('blob:https://x/1'), null)
  assert.equal(resolveAttachmentUrl('https://cdn.example/a.png'), 'https://cdn.example/a.png')
  assert.equal(resolveAttachmentUrl('/api/files/a.png'), '/api/files/a.png')
  assert.equal(
    resolveAttachmentUrl('uploads/Screenshot (1)#?.png'),
    '/api/files/uploads/Screenshot%20%281%29%23%3F.png',
  )
  assert.equal(
    resolveAttachmentUrls('![a](attachment:uploads/Shot (1).png) ![b](attachment:noext)'),
    '![a](/api/files/uploads/Shot%20%281%29.png) ![b](/api/files/noext)',
  )
  assert.equal(sanitizeAttachmentHtml('<img src="attachment:a b.png">'), '<img src="/api/files/a%20b.png">')
})

test('error codes are found however the h3 body is nested', () => {
  assert.equal(extractErrorCode({ data: { code: 'A' } }), 'A')
  assert.equal(extractErrorCode({ code: 'B' }), 'B')
  assert.equal(extractErrorCode({ _data: { data: { code: 'C' } } }), 'C')
  assert.equal(extractErrorCode({ response: { _data: { data: { code: 'D' } } } }), 'D')
  assert.equal(extractErrorCode({ data: { code: 7 } }), undefined)
  assert.equal(extractErrorCode('LOCAL_AUTH_REQUIRED'), undefined)
  assert.equal(extractErrorCode(null), undefined)
})

test('elapsed time uses the largest unit that fits', () => {
  const s = 1000
  assert.deepEqual(timeAgoParts(59 * s), { key: 'time.justNow' })
  assert.deepEqual(timeAgoParts(60 * s), { key: 'time.minutesAgo', n: 1 })
  assert.deepEqual(timeAgoParts(3599 * s), { key: 'time.minutesAgo', n: 59 })
  assert.deepEqual(timeAgoParts(3600 * s), { key: 'time.hoursAgo', n: 1 })
  assert.deepEqual(timeAgoParts(24 * 3600 * s), { key: 'time.daysAgo', n: 1 })
  assert.deepEqual(timeAgoParts(30 * 86400 * s), { key: 'time.monthsAgo', n: 1 })
  assert.deepEqual(timeAgoParts(359 * 86400 * s), { key: 'time.monthsAgo', n: 11 })
  assert.deepEqual(timeAgoParts(360 * 86400 * s), { key: 'time.yearsAgo', n: 1 })
  assert.deepEqual(timeAgoParts(800 * 86400 * s), { key: 'time.yearsAgo', n: 2 })
})

test('useTimeAgo and useFormatDate render through i18n', async () => {
  const locale = ref('en')
  stubGlobals({ useI18n: () => ({ t: fakeT, locale }) })
  const { useFormatDate, useTimeAgo } = await import('../app/composables/useDateFormat')
  const ago = useTimeAgo()
  assert.equal(ago(new Date()), 'time.justNow')
  assert.equal(ago(new Date(Date.now() - 2 * 3600 * 1000).toISOString()), 'time.hoursAgo {"n":2}')
  const format = useFormatDate()
  assert.equal(format('2026-03-04T12:00:00Z'), 'Mar 4, 2026')
  locale.value = 'zh'
  assert.equal(format('2026-03-04T12:00:00Z'), '2026年3月4日')
})

test('author names show guests by tag and fall back to anonymous', async () => {
  stubGlobals({ useI18n: () => ({ t: fakeT }) })
  const { useAuthorDisplay } = await import('../app/composables/useAuthorDisplay')
  const { authorName, authorInitials } = useAuthorDisplay()
  assert.equal(authorName({ id: 'u1', name: 'Guest 1', isAnonymous: true }), `common.guest {"tag":"${guestTag('u1')}"}`)
  assert.equal(authorName({ name: 'Ann', isAnonymous: true }), 'Ann')
  assert.equal(authorName({ id: 'u2', name: 'Bob' }), 'Bob')
  assert.equal(authorName({ id: 'u3', name: '' }), 'common.anonymous')
  assert.equal(authorName(null), 'common.anonymous')
  assert.equal(authorInitials({ name: 'zoe' }), 'ZO')
  assert.equal(authorInitials(undefined), '?')
})

test('head entries for the logo favicon, brand styles and the system theme', () => {
  assert.deepEqual(logoFaviconLinks(null), [])
  assert.deepEqual(
    logoFaviconLinks('/logo.png').map((l) => [l.key, l.rel, l.href]),
    [
      ['favicon-svg', 'icon', '/logo.png'],
      ['favicon-png', 'icon', '/logo.png'],
      ['favicon-ico', 'shortcut icon', '/logo.png'],
      ['favicon-apple', 'apple-touch-icon', '/logo.png'],
    ],
  )
  assert.deepEqual(brandStyles(''), [])
  assert.deepEqual(brandStyles(':root{}'), [{ key: 'portal-brand-vars', innerHTML: ':root{}' }])
  assert.deepEqual(systemThemeScripts(false), [])
  assert.equal(systemThemeScripts(true)[0]!.key, 'portal-system-theme')
  assert.match(systemThemeScripts(true)[0]!.innerHTML, /prefers-color-scheme: dark/)
})

test('only present request headers are forwarded', () => {
  assert.deepEqual(FORWARDED_HEADERS, ['cookie', 'host', 'x-forwarded-host', 'x-forwarded-proto'])
  assert.deepEqual(presentHeaders({ cookie: 'a=1', host: '', 'x-forwarded-proto': 'https', other: 'x' }), {
    cookie: 'a=1',
    'x-forwarded-proto': 'https',
  })
})

test('useApiFetch prompts for local auth and still runs the caller hooks', async () => {
  const prompted: unknown[] = []
  let captured: Record<string, any> = {}
  stubGlobals({
    promptLocalAuthIfRequired: (payload: unknown) => prompted.push(payload),
    $fetch: (url: string, opts: Record<string, any>) => {
      captured = { url, ...opts }
      return Promise.resolve('ok')
    },
  })
  const { useApiFetch } = await import('../app/composables/useApiFetch')
  const seen: unknown[] = []
  assert.equal(
    await useApiFetch('/api/x', { method: 'POST', headers: { a: '1' }, onResponseError: (c) => void seen.push(c) }),
    'ok',
  )
  assert.equal(captured.url, '/api/x')
  assert.equal(captured.method, 'POST')
  assert.deepEqual(captured.headers, { a: '1' })
  const ctx = { response: { _data: { data: { code: 'LOCAL_AUTH_REQUIRED' } } } }
  await captured.onResponseError(ctx)
  assert.deepEqual(prompted, [ctx.response._data])
  assert.deepEqual(seen, [ctx])
  await useApiFetch('/api/y')
  await captured.onResponseError({})
  assert.deepEqual(captured.headers, {})
  assert.deepEqual(prompted.at(-1), undefined)
})

test('the dashboard middleware admits only signed-in org staff', async () => {
  let session: unknown = null
  stubGlobals({
    useAuthSession: async () => ({ data: ref(session) }),
    navigateTo: (to: string) => `redirect:${to}`,
  })
  const { default: admin } = (await import('../app/middleware/admin')) as unknown as {
    default: () => Promise<unknown>
  }
  assert.equal(await admin(), 'redirect:/')
  session = { user: { id: 'u1' } }
  assert.equal(await admin(), 'redirect:/')
  session = { user: { id: 'u1' }, orgList: [] }
  assert.equal(await admin(), 'redirect:/')
  session = { user: { id: 'u1' }, orgList: [{ role: 'contributor' }] }
  assert.equal(await admin(), undefined)
})

// A browser-like decode and canvas: enough of Image and <canvas> to run prepareAvatar.
function stubImagePipeline(size: { width: number; height: number }, canvasOk = { context: true, blob: true }) {
  const drawn: number[][] = []
  stubGlobals({
    Image: class {
      src = ''
      naturalWidth = size.width
      naturalHeight = size.height
      async decode() {}
    },
    document: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext() {
          return canvasOk.context ? { drawImage: (_image: unknown, ...rect: number[]) => drawn.push(rect) } : null
        },
        toBlob(resolve: (blob: Blob | null) => void, type: string) {
          resolve(canvasOk.blob ? new Blob(['png'], { type }) : null)
        },
      }),
    },
  })
  return drawn
}

const fixture = (extension: string) => readFileSync(new URL(`./fixtures/avatar.${extension}`, import.meta.url))

test('avatars are decoded and re-encoded as a PNG no larger than the edge limit', async () => {
  const { prepareAvatar } = await import('../app/utils/avatar')
  const file = new File([fixture('png')], 'me.png')
  const rejectsWith = (code: AvatarValidationError['code'], input: File = file) =>
    assert.rejects(prepareAvatar(input), (error) => error instanceof AvatarValidationError && error.code === code)

  const drawn = stubImagePipeline({ width: 2048, height: 1024 })
  const blob = await prepareAvatar(file)
  assert.equal(blob.type, 'image/png')
  assert.deepEqual(drawn, [[0, 0, AVATAR_MAX_EDGE, AVATAR_MAX_EDGE / 2]])

  const small = stubImagePipeline({ width: 10, height: 1 })
  await prepareAvatar(file)
  assert.deepEqual(small, [[0, 0, 10, 1]])

  await rejectsWith('imageTooLarge', new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], 'big.png'))
  stubImagePipeline({ width: 0, height: 0 })
  await rejectsWith('invalidImage')
  stubImagePipeline({ width: 6000, height: 6000 })
  await rejectsWith('imageTooManyPixels')
  stubImagePipeline({ width: 10, height: 10 }, { context: false, blob: true })
  await rejectsWith('invalidImage')
  stubImagePipeline({ width: 10, height: 10 }, { context: true, blob: false })
  await rejectsWith('invalidImage')
})
