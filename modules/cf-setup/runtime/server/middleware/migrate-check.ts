import type { H3Event } from 'h3'
import { resolveState, type StateSnapshot } from '../utils/migration-state'
import { isCloudflare } from '../utils/preset'

// Bypass list: paths that must NOT be intercepted even when DB is unmigrated.
// - /setup: the bootstrap page itself
// - /api/_migrate/**: status + run endpoints the setup page calls
// - /api/auth/**: better-auth flows, needed for admin login on upgrade path
// - /_nuxt/**, /favicon.ico, /_payload.json: static assets for setup page to render
// - /api/health: external probes must stay 200 even during setup
const BYPASS_PREFIXES = [
  '/setup',
  '/api/_migrate/',
  '/api/auth/',
  '/_nuxt/',
  '/_payload.json',
  '/favicon.ico',
  '/health',
]

function shouldBypass(path: string): boolean {
  return BYPASS_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? path.startsWith(prefix)
      : path === prefix || path.startsWith(prefix + '/') || path === prefix,
  )
}

// API requests get a machine-readable 503 instead of an HTML redirect,
// so fetch() callers don't follow the redirect and parse HTML as JSON.
// HTML requests go to setup, preserving the original path so the setup page
// can bounce back after migration completes.
function redirectToSetup(event: H3Event, path: string, snapshot: StateSnapshot) {
  if (path.startsWith('/api/')) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Not Initialized',
      data: {
        code: 'NOT_INITIALIZED',
        state: snapshot.state,
        expected: snapshot.expected,
        applied: snapshot.applied,
      },
    })
  }
  return sendRedirect(event, `/setup?redirect=${encodeURIComponent(path)}`, 302)
}

export default defineEventHandler(async (event) => {
  if (!isCloudflare()) return

  const path = getRequestURL(event).pathname

  if (shouldBypass(path)) return

  const snapshot = await resolveState()

  if (snapshot.state !== 'migrated') return redirectToSetup(event, path, snapshot)
})
