// Whether a failed guest claim should keep its token for the next load: no
// answer at all, rate limiting or a server error may work on a retry. Anything
// else is permanent, and retrying it forever is worse than losing a claim that
// was never going to land.
export function isRetryableClaimError(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode ?? 0
  return status === 0 || status === 429 || status >= 500
}
