import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { resetNuxt, stubGlobals } from './app-state-nuxt'

type Listener = (event: MessageEvent) => void

const HOST = 'https://acme.example'

// A frame whose parent is a separate window, plus the parent's mailbox.
function frame(query: Record<string, unknown> = { origin: HOST }) {
  const posted: { message: any; targetOrigin: string }[] = []
  const parent = { postMessage: (message: unknown, targetOrigin: string) => posted.push({ message, targetOrigin }) }
  const listeners = new Set<Listener>()
  const opened: unknown[][] = []
  const win = {
    parent,
    addEventListener: (_name: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_name: string, fn: Listener) => listeners.delete(fn),
    open: (...args: unknown[]) => opened.push(args),
  }
  stubGlobals({ window: win, useRoute: () => ({ query }) })
  const deliver = (data: unknown, { source = parent as unknown, origin = HOST } = {}) => {
    for (const fn of [...listeners]) fn({ data, source, origin } as MessageEvent)
  }
  return { posted, listeners, opened, win, deliver }
}

const { useWidgetProtocol, widgetProtocolKey } = await import('../app/composables/useWidgetProtocol')

test('a frame that is not embedded sends nothing and opens feedback in a new tab', async () => {
  resetNuxt()
  const host = frame()
  host.win.parent = host.win as never
  const protocol = useWidgetProtocol()
  protocol.init()
  protocol.ready()
  protocol.navigateToFeedback('a b')
  assert.deepEqual(host.posted, [])
  assert.deepEqual(host.opened, [['/p/a%20b', '_blank', 'noopener,noreferrer']])
  assert.equal(await protocol.requestPageContext(), null)
  assert.equal(typeof widgetProtocolKey, 'symbol')
})

test('without an origin on the embed URL nothing is posted or accepted', async () => {
  resetNuxt()
  const host = frame({ origin: ['x'] })
  const protocol = useWidgetProtocol()
  protocol.init()
  protocol.requestClose()
  host.deliver({ v: 1, type: 'set-theme', payload: { theme: 'dark' } })
  assert.equal(protocol.parentOrigin.value, null)
  assert.equal(protocol.theme.value, undefined)
  assert.deepEqual(host.posted, [])
  assert.equal(await protocol.requestPageContext(), null)
})

test('outbound messages carry the protocol version and target the host origin', () => {
  resetNuxt()
  const host = frame()
  const protocol = useWidgetProtocol()
  protocol.init()
  protocol.onResume(
    () => ({ draft: 'hi' }),
    () => {},
  )
  protocol.ready()
  protocol.requestAuth('expired')
  protocol.reportUnread(3)
  protocol.navigateToFeedback('slug')
  protocol.requestClose()
  assert.deepEqual(
    host.posted.map((p) => p.message),
    [
      { v: 1, type: 'ready', payload: { capabilities: { resumeState: true, theme: true } } },
      { v: 1, type: 'auth-requested', payload: { reason: 'expired' } },
      { v: 1, type: 'unread', payload: { count: 3 } },
      { v: 1, type: 'navigate', payload: { to: 'feedback', slug: 'slug' } },
      { v: 1, type: 'close-request' },
    ],
  )
  assert.ok(host.posted.every((p) => p.targetOrigin === HOST))
})

test('host messages are accepted only from the parent, its origin and this protocol version', () => {
  resetNuxt()
  const host = frame()
  const restored: unknown[] = []
  const protocol = useWidgetProtocol()
  protocol.onResume(
    () => ({ draft: 'kept' }),
    (state) => restored.push(state),
  )
  protocol.init()
  host.deliver({ v: 1, type: 'set-theme', payload: { theme: 'dark' } }, { source: {} })
  host.deliver({ v: 1, type: 'set-theme', payload: { theme: 'dark' } }, { origin: 'https://evil.example' })
  host.deliver({ v: 2, type: 'set-theme', payload: { theme: 'dark' } })
  host.deliver(null)
  host.deliver({ v: 1, type: 'unknown' })
  host.deliver({ v: 1, type: 'set-theme', payload: { theme: 'neon' } })
  assert.equal(protocol.theme.value, undefined)
  host.deliver({ v: 1, type: 'set-theme', payload: { theme: 'dark' } })
  assert.equal(protocol.theme.value, 'dark')

  host.deliver({ v: 1, type: 'init', payload: { capabilities: { pageContext: true }, resumeState: { draft: 'x' } } })
  host.deliver({ v: 1, type: 'init' })
  assert.deepEqual(restored, [{ draft: 'x' }])

  host.deliver({ v: 1, type: 'resume-state-request', payload: { requestId: 7 } })
  host.deliver({ v: 1, type: 'resume-state-request', payload: { requestId: 'r1' } })
  assert.deepEqual(
    host.posted.map((p) => p.message),
    [{ v: 1, type: 'resume-state', payload: { requestId: 'r1', state: { draft: 'kept' } } }],
  )
  resetNuxt()
  assert.equal(host.listeners.size, 0)
})

test('a resume request is ignored until the page registers a capture', () => {
  resetNuxt()
  const host = frame()
  const protocol = useWidgetProtocol()
  protocol.init()
  host.deliver({ v: 1, type: 'resume-state-request', payload: { requestId: 'r1' } })
  protocol.ready()
  assert.deepEqual(
    host.posted.map((p) => p.message),
    [{ v: 1, type: 'ready', payload: { capabilities: { resumeState: false, theme: true } } }],
  )
})

test('page context falls back to the host origin when the host cannot answer', async () => {
  resetNuxt()
  const host = frame()
  const protocol = useWidgetProtocol()
  protocol.init()
  assert.equal(await protocol.requestPageContext(), null)
  host.deliver({ v: 1, type: 'init', payload: {} })
  assert.deepEqual(await protocol.requestPageContext(), { origin: HOST })
})

test('an origin that is not a bare web origin is never reported as page context', async () => {
  resetNuxt()
  const odd = `${HOST}/path`
  const host = frame({ origin: odd })
  const protocol = useWidgetProtocol()
  protocol.init()
  host.deliver({ v: 1, type: 'init', payload: {} }, { origin: odd })
  assert.equal(await protocol.requestPageContext(), null)
})

test('page context merges the host reply and times out when there is none', async () => {
  resetNuxt()
  const host = frame()
  const protocol = useWidgetProtocol()
  protocol.init()
  host.deliver({ v: 1, type: 'init', payload: { capabilities: { pageContext: true } } })

  const answered = protocol.requestPageContext()
  const request = host.posted.at(-1)!.message
  assert.equal(request.type, 'page-context-request')
  host.deliver({ v: 1, type: 'page-context', payload: { requestId: 'other', context: { pathname: '/x' } } })
  host.deliver({
    v: 1,
    type: 'page-context',
    payload: {
      requestId: request.payload.requestId,
      context: { pathname: '/pricing', origin: 'https://spoof.example' },
    },
  })
  assert.deepEqual(await answered, { pathname: '/pricing', origin: HOST })

  const invalid = protocol.requestPageContext()
  const second = host.posted.at(-1)!.message
  host.deliver({ v: 1, type: 'page-context', payload: { requestId: second.payload.requestId, context: { bad: 1 } } })
  assert.deepEqual(await invalid, { origin: HOST })

  const started = Date.now()
  assert.deepEqual(await protocol.requestPageContext(), { origin: HOST })
  assert.ok(Date.now() - started >= 400)
})
