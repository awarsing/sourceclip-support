import {
  authDomainHostOf,
  browserHost,
  type ClientOrgContext,
  type OrgListRow,
  resolveOrgContext,
} from '../lib/org-context'

// Active org context for the current request: SSR reads the host from the
// request, the browser from window.location. See resolveOrgContext.
export function useOrgContext(): ComputedRef<ClientOrgContext> {
  const { data: session } = useAuthSession()
  const config = useRuntimeConfig()
  const hosts = {
    rootDomain: (config.public.rootDomain ?? '') as string,
    authDomainHost: authDomainHostOf((config.public.authDomain ?? '') as string),
  }
  const requestURL = import.meta.server ? useRequestURL() : null
  const host = () => (requestURL ? requestURL.host : browserHost())

  return computed(() => {
    const list = (session.value as { orgList?: OrgListRow[] } | null | undefined)?.orgList ?? []
    return resolveOrgContext(list, hosts, host)
  })
}
