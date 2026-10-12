function at(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
    value,
  )
}

// The h3 error code in an API failure. better-auth's fetch wrapper and plain
// $fetch nest the error body differently, and both reach here.
export function extractErrorCode(payload: unknown): string | undefined {
  const code =
    at(payload, ['data', 'code']) ??
    at(payload, ['code']) ??
    at(payload, ['_data', 'data', 'code']) ??
    at(payload, ['response', '_data', 'data', 'code'])
  return typeof code === 'string' ? code : undefined
}
