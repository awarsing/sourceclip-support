import { DEFAULT_ORG_ID, DEFAULT_ORG_SLUG } from '../../shared/constants/default-org'

// Active org context for the current request. Defaults to the single
// default-org. When `rootDomain` is configured, the tenant slug comes from the
// request host and orgId / role from the session's orgList.
export interface ClientOrgContext {
  orgId: string
  orgSlug: string
  // Current user's role inside this org, if any (driven by session.orgList).
  role: 'owner' | 'manager' | 'contributor' | null
}

export interface OrgListRow {
  orgId: string
  slug: string
  role: string
}

export interface TenantHosts {
  rootDomain: string
  authDomainHost: string
}

export function authDomainHostOf(authDomain: string): string {
  return authDomain.replace(/^https?:\/\//, '').replace(/:\d+$/, '')
}

export function parseTenantSlug(host: string, { rootDomain, authDomainHost }: TenantHosts): string | null {
  const bare = host.toLowerCase().split(':')[0] ?? ''
  if (!bare || bare === rootDomain || bare === authDomainHost) return null
  const suffix = `.${rootDomain}`
  if (!bare.endsWith(suffix)) return null
  const slug = bare.slice(0, -suffix.length)
  return !slug || slug.includes('.') ? null : slug
}

function roleOf(row: OrgListRow | undefined): ClientOrgContext['role'] {
  return (row?.role as ClientOrgContext['role']) ?? null
}

// `host` is read only in multi-tenant mode.
export function resolveOrgContext(list: OrgListRow[], hosts: TenantHosts, host: () => string): ClientOrgContext {
  // Open-source: rootDomain unset → single-tenant.
  if (!hosts.rootDomain) {
    return {
      orgId: DEFAULT_ORG_ID,
      orgSlug: DEFAULT_ORG_SLUG,
      role: roleOf(list.find((o) => o.orgId === DEFAULT_ORG_ID)),
    }
  }
  const slug = parseTenantSlug(host(), hosts)
  if (!slug) {
    // Auth / root host — no tenant binding. Surface the default-org so
    // unrelated UI bits don't crash, but role is null.
    return { orgId: DEFAULT_ORG_ID, orgSlug: DEFAULT_ORG_SLUG, role: null }
  }
  const match = list.find((o) => o.slug === slug)
  return { orgId: match?.orgId ?? slug, orgSlug: match?.slug ?? slug, role: roleOf(match) }
}

export function browserHost(): string {
  return typeof window !== 'undefined' ? window.location.host : ''
}
