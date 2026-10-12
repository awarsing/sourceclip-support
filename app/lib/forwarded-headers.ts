// Request headers an SSR $fetch forwards to internal /api/* calls. Without the
// cookie the SSR pass has no session, so authenticated routes 401 before the
// page reaches the browser.
export const FORWARDED_HEADERS = ['cookie', 'host', 'x-forwarded-host', 'x-forwarded-proto'] as const

// The forwarded headers that are actually present.
export function presentHeaders(headers: Partial<Record<string, string>>): Record<string, string> {
  const present: Record<string, string> = {}
  for (const name of FORWARDED_HEADERS) {
    const value = headers[name]
    if (value) present[name] = value
  }
  return present
}
