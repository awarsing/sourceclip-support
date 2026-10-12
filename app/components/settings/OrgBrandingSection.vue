<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { resolveAttachmentUrl } from '~/utils/attachment'
import {
  DEFAULT_BRAND_COLOR,
  mergeBrandingMetadata,
  normalizeBrandHex,
  type OrgMetadataInput,
  parseBranding,
  portalThemeSchema,
} from '#layers/feedlog/shared/utils/branding'

interface OrgRow {
  id: string
  name: string
  slug: string
  logo: string | null
  metadata: OrgMetadataInput
}

const props = defineProps<{
  org: OrgRow
  isOwner: boolean
  // Layout variant. 'stacked' (default) is a single column, used by the OSS
  // workspace settings; 'split' puts controls in a compact left column and the
  // preview in a wider right column, used by the SaaS organization settings card.
  layout?: 'stacked' | 'split'
}>()

const layoutMode = computed(() => props.layout ?? 'stacked')

const emit = defineEmits<{
  saved: []
}>()

const { t } = useI18n()
const presets = ['#C45A46', '#2563EB', '#7C3AED', '#059669', '#DB2777', '#0F172A']
const themeOptions = computed(() => [
  { value: 'system' as const, label: t('settings.branding.theme.system'), icon: 'lucide:monitor' },
  { value: 'light' as const, label: t('settings.branding.theme.light'), icon: 'lucide:sun' },
  { value: 'dark' as const, label: t('settings.branding.theme.dark'), icon: 'lucide:moon' },
])

const saving = ref(false)
const uploading = ref(false)
const error = ref<string | null>(null)
const previewMode = ref<'light' | 'dark'>('light')

const form = reactive({
  logo: null as string | null,
  primaryColor: DEFAULT_BRAND_COLOR,
  defaultTheme: 'system' as 'system' | 'light' | 'dark',
})

function hydrate() {
  const branding = parseBranding(props.org.metadata)
  form.logo = props.org.logo
  form.primaryColor = normalizeBrandHex(branding.primaryColor)
  form.defaultTheme = branding.defaultTheme ?? 'system'
  previewMode.value = form.defaultTheme === 'dark' ? 'dark' : 'light'
  error.value = null
}

watch(() => props.org, hydrate, { immediate: true })

// Picking a default theme drives the preview so the admin immediately sees that
// mode rendered. Deliberately one-way: toggling the preview is a transient
// look-around and must never write back to the saved default theme. System has
// no single rendering, so it previews as light (the conventional baseline).
watch(
  () => form.defaultTheme,
  (theme) => {
    previewMode.value = theme === 'dark' ? 'dark' : 'light'
  },
)

const logoUrl = computed(() => resolveAttachmentUrl(form.logo))
// Domain shown in the preview's mock browser address bar: the host this dashboard
// is served from, which is where the portal lives too in a single-host deployment.
// Mirrors the real address a visitor would see instead of a hardcoded brand domain.
const previewDomain = computed(() => useRequestURL().host)
const currentBranding = computed(() => parseBranding(props.org.metadata))
const dirty = computed(() => {
  return (
    form.logo !== props.org.logo ||
    normalizeBrandHex(form.primaryColor) !== normalizeBrandHex(currentBranding.value.primaryColor) ||
    form.defaultTheme !== (currentBranding.value.defaultTheme ?? 'system')
  )
})
const canSave = computed(() => props.isOwner && dirty.value && !saving.value && !uploading.value)

async function uploadLogo(file: File) {
  uploading.value = true
  error.value = null
  try {
    const body = new FormData()
    body.append('file', file)
    const result = await $fetch<{ key: string }>('/api/upload', { method: 'POST', body })
    form.logo = result.key
  } catch {
    error.value = t('settings.branding.uploadFailed')
  } finally {
    uploading.value = false
  }
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  try {
    const metadata = mergeBrandingMetadata(props.org.metadata, {
      ...currentBranding.value,
      primaryColor: normalizeBrandHex(form.primaryColor),
      defaultTheme: portalThemeSchema.parse(form.defaultTheme),
    })
    await authClient.organization.update({
      organizationId: props.org.id,
      data: {
        // better-auth's update rejects a null logo (expects string); send ''
        // to clear, which the portal/switcher already treat as "no logo".
        logo: form.logo ?? '',
        metadata,
      },
    })
    emit('saved')
  } catch {
    error.value = t('settings.branding.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded-xl border border-border bg-card overflow-hidden">
    <div class="px-6 py-5 border-b border-border">
      <h3 class="font-heading font-bold text-sm">{{ $t('settings.branding.title') }}</h3>
      <p class="text-xs text-muted-foreground mt-0.5">{{ $t('settings.branding.subtitle') }}</p>
    </div>

    <div class="px-6 py-6">
      <!-- split: controls take a compact fixed left column; the preview gets the
           remaining width (it scales to its container, so a wider column = a
           larger, more faithful preview). stacked falls back to a single column. -->
      <div :class="layoutMode === 'split' ? 'grid lg:grid-cols-[270px_minmax(0,1fr)] gap-6 items-start' : 'space-y-6'">
        <div class="space-y-6">
          <OrgLogoField
            :logo-url="logoUrl"
            :has-logo="!!form.logo"
            :initial="org.name.charAt(0)"
            :is-owner="isOwner"
            :uploading="uploading"
            @pick="uploadLogo"
            @remove="form.logo = null"
          />

          <OrgBrandColorField v-model="form.primaryColor" :presets="presets" :disabled="!isOwner" />

          <OrgThemeField v-model="form.defaultTheme" :options="themeOptions" :disabled="!isOwner" />
        </div>

        <!-- Preview -->
        <div :class="layoutMode === 'split' ? '' : 'pt-2 border-t border-border'">
          <div class="flex items-center justify-between mb-2">
            <p class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('settings.preview') }}</p>
            <div class="inline-flex rounded-md border border-border bg-background p-0.5">
              <button type="button" class="w-7 h-6 rounded grid place-items-center transition-colors" :class="previewMode === 'light' ? 'bg-secondary text-primary' : 'text-muted-foreground'" @click="previewMode = 'light'">
                <Icon name="lucide:sun" size="13" />
              </button>
              <button type="button" class="w-7 h-6 rounded grid place-items-center transition-colors" :class="previewMode === 'dark' ? 'bg-secondary text-primary' : 'text-muted-foreground'" @click="previewMode = 'dark'">
                <Icon name="lucide:moon" size="13" />
              </button>
            </div>
          </div>
          <PortalMiniPreview
            :org-name="org.name"
            :logo="logoUrl"
            :primary-color="form.primaryColor"
            :dark="previewMode === 'dark'"
            :welcome-title="currentBranding.welcomeTitle"
            :welcome-description="currentBranding.welcomeDescription"
            :domain="previewDomain"
          />
        </div>
      </div>
    </div>

    <SettingsSaveFooter
      :error="error"
      :dirty="dirty"
      :saving="saving"
      :can-save="canSave"
      @reset="hydrate"
      @save="save"
    />
  </section>
</template>
