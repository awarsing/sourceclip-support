import { FORWARDED_HEADERS, presentHeaders } from '../lib/forwarded-headers'

function ssrForwardedHeaders(): Record<string, string> {
  if (!import.meta.server) return {}
  try {
    return presentHeaders(useRequestHeaders([...FORWARDED_HEADERS]))
  } catch {
    // Called outside Nuxt context (e.g. from store action after await),
    // header forwarding is not available — this is expected on
    // client-side navigations where headers come from the browser.
    return {}
  }
}

// SSR-safe $fetch wrapper. Forwards request cookie and host headers to
// internal /api/* calls during server-side rendering.
// Safe to call from store actions (outside Vue setup context).
export function useApiFetch<T>(url: string, opts?: Parameters<typeof $fetch>[1]) {
  // ofetch types this hook as MaybeArray; normalise before chaining.
  const callerHooks = [opts?.onResponseError].flat().filter((h) => typeof h === 'function')

  return $fetch<T>(url, {
    ...opts,
    headers: { ...ssrForwardedHeaders(), ...opts?.headers },
    // Central catch so deep links and stale tabs get the prompt too. The call
    // still rejects, so callers keep their own failure handling.
    async onResponseError(ctx) {
      promptLocalAuthIfRequired(ctx.response?._data)
      for (const hook of callerHooks) await (hook as (c: typeof ctx) => unknown)(ctx)
    },
  })
}
