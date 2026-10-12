/** The HTTP status carried by a failed $fetch call, if any. */
export function errorStatus(error: unknown) {
  return (error as { statusCode?: number } | null)?.statusCode
}

/** The server's message on a failed $fetch call, or the fallback when it sent none. */
export function apiErrorMessage(error: unknown, fallback: string) {
  return (error as { data?: { message?: string } } | null)?.data?.message || fallback
}
