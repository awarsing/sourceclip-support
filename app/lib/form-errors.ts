// Turns the errors that auth calls and $fetch reject with into toast text.

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface AuthCallError {
  code?: string
  message?: string
}

// Known error codes map to their own message key; anything else shows the
// server's message, or the fallback when it sent none.
export function authErrorMessage(
  error: AuthCallError,
  t: Translate,
  fallbackKey: string,
  codeKeys: Record<string, string> = {},
): string {
  const key = error.code ? codeKeys[error.code] : undefined
  return key ? t(key) : error.message || t(fallbackKey)
}

// $fetch errors carry the server's message in `data.message`.
export function apiErrorMessage(error: unknown, fallback: string): string {
  return (error as { data?: { message?: string } } | null)?.data?.message || fallback
}

// The HTTP status carried by a failed $fetch call, if any.
export function errorStatus(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode
}
