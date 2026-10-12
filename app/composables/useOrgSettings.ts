import { authClient } from '~/lib/auth-client'
import type { OrgMetadataInput } from '#layers/feedlog/shared/utils/branding'

export interface OrgSettingsRow {
  id: string
  name: string
  slug: string
  logo: string | null
  metadata: OrgMetadataInput
}

// The organization row behind the settings pages, reloaded whenever the active
// org or role changes. onLoaded seeds each page's form from a fresh row.
export function useOrgSettings(onLoaded: (org: OrgSettingsRow) => void) {
  const ctx = useOrgContext()
  const orgId = computed(() => ctx.value.orgId)
  const isOwner = computed(() => ctx.value.role === 'owner')
  const org = ref<OrgSettingsRow | null>(null)
  const loading = ref(true)

  async function loadOrg() {
    if (!ctx.value.role) return
    loading.value = true
    try {
      const res = await authClient.organization.getFullOrganization({ query: { organizationId: orgId.value } })
      org.value = (res as { data?: OrgSettingsRow }).data ?? null
      if (org.value) onLoaded(org.value)
    } finally {
      loading.value = false
    }
  }

  // Load on the client only. The dashboard sits behind auth (nothing to SSR for
  // SEO) and the better-auth client is browser-oriented; fetching during SSR would
  // bake the loaded section into the HTML while the client hydrates from the empty
  // initial state, tripping a hydration mismatch.
  watch(
    () => [orgId.value, ctx.value.role] as const,
    ([, role]) => {
      if (role && import.meta.client) void loadOrg()
    },
    { immediate: true },
  )

  return { org, loading, isOwner, loadOrg }
}
