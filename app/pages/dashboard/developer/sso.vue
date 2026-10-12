<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { SsoSecret } from '~/composables/useSsoSecrets'
import { SSO_SECRET_LIMIT } from '~~/shared/constants/sso'
import { apiErrorMessage } from '~/lib/form-errors'

// /dashboard/settings/sso — manage product-SSO signing secrets + integration
// guide. Owner-only (the API enforces it too); other staff see a notice.

definePageMeta({ layout: 'dashboard', middleware: ['admin'] })

const { t } = useI18n()
const ctx = useOrgContext()
const isOwner = computed(() => ctx.value.role === 'owner')

const { secrets, loading, refresh, create, update, remove } = useSsoSecrets()

const view = ref<'secrets' | 'guide'>('secrets')
const canCreate = computed(() => secrets.value.length < SSO_SECRET_LIMIT)
const tabs = computed(() => [
  { k: 'secrets' as const, label: t('dashboard.sso.signingSecrets') },
  { k: 'guide' as const, label: t('dashboard.sso.integrationGuide') },
])

// Defer to onMounted: the list endpoint needs the session cookie, simplest to
// fetch client-side after mount (mirrors the Members page).
onMounted(() => {
  if (isOwner.value) void refresh()
})

// Create + rename share one dialog (SsoSecretDialog). dialogMode picks the copy;
// renameTarget is set only in rename mode.
const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'rename'>('create')
const renameTarget = ref<SsoSecret | null>(null)
const justCreatedId = ref<string | null>(null)

function openCreate() {
  dialogMode.value = 'create'
  renameTarget.value = null
  dialogOpen.value = true
}
function openRename(s: SsoSecret) {
  dialogMode.value = 'rename'
  renameTarget.value = s
  dialogOpen.value = true
}

async function createSecret(label: string) {
  const s = await create(label)
  justCreatedId.value = s.id
  setTimeout(() => {
    if (justCreatedId.value === s.id) justCreatedId.value = null
  }, 6000)
}

async function submitDialog(mode: 'create' | 'rename', target: SsoSecret | null, label: string) {
  if (mode === 'create') await createSecret(label)
  else if (target) await update(target.id, { label })
}

async function onDialogSubmit(payload: { label: string }) {
  const mode = dialogMode.value
  const failedKey = mode === 'create' ? 'dashboard.sso.createFailed' : 'dashboard.sso.renameFailed'
  const target = renameTarget.value
  dialogOpen.value = false
  try {
    await submitDialog(mode, target, payload.label)
  } catch (e) {
    toast.error(apiErrorMessage(e, t(failedKey)))
  }
}

async function onToggle(s: SsoSecret) {
  try {
    await update(s.id, { enabled: !s.enabled })
  } catch {
    toast.error(t('dashboard.sso.updateFailed'))
  }
}

// Delete (page-level confirm). Keep the target in its own ref, separate from the
// dialog's open flag — reka-ui's AlertDialogAction closes the dialog on click,
// and if open-state and target shared one ref the close would wipe the target
// before confirmDelete reads it (DELETE then silently never fires).
const deleteTarget = ref<SsoSecret | null>(null)
const showDelete = ref(false)
function askDelete(s: SsoSecret) {
  deleteTarget.value = s
  showDelete.value = true
}
async function confirmDelete() {
  const target = deleteTarget.value
  showDelete.value = false
  if (!target) return
  try {
    await remove(target.id)
  } catch {
    toast.error(t('dashboard.sso.deleteFailed'))
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <header class="h-16 px-6 border-b border-border flex items-center justify-between shrink-0 bg-card">
      <div>
        <h2 class="font-heading text-lg font-bold">{{ $t('dashboard.sso.title') }}</h2>
        <p class="text-xs text-muted-foreground">{{ $t('dashboard.sso.subtitle') }}</p>
      </div>
      <button
        v-if="isOwner && view === 'secrets'"
        :disabled="!canCreate"
        class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        :title="canCreate ? '' : $t('dashboard.sso.limitReached', { limit: SSO_SECRET_LIMIT })"
        @click="openCreate"
      >
        <Icon name="lucide:plus" size="14" />
        {{ $t('dashboard.sso.createSecret') }}
      </button>
    </header>

    <!-- Sub-nav (segmented) -->
    <div class="px-6 pt-4 border-b border-border bg-card shrink-0">
      <div class="flex gap-6">
        <button
          v-for="tab in tabs"
          :key="tab.k"
          class="pb-3 -mb-px text-sm font-semibold border-b-2 transition-colors"
          :class="view === tab.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="view = tab.k"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-3xl mx-auto px-6 py-8">
        <!-- Owner gate -->
        <div v-if="!isOwner" class="rounded-xl border border-border bg-card px-6 py-14 flex flex-col items-center text-center">
          <div class="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-3">
            <Icon name="lucide:lock" size="22" class="text-muted-foreground" />
          </div>
          <p class="font-heading font-bold text-sm">{{ $t('dashboard.sso.ownersOnly') }}</p>
          <p class="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
            {{ $t('dashboard.sso.ownersOnlyHint') }}
          </p>
        </div>

        <!-- Secrets -->
        <SsoSecretsPanel
          v-else-if="view === 'secrets'"
          :secrets="secrets"
          :loading="loading"
          :just-created-id="justCreatedId"
          @create="openCreate"
          @toggle="onToggle"
          @rename="openRename"
          @delete="askDelete"
        />

        <!-- Integration guide -->
        <SsoIntegrationGuide v-else />
      </div>
    </div>

    <SsoSecretDialog
      v-model:open="dialogOpen"
      :mode="dialogMode"
      :initial-label="renameTarget?.label ?? ''"
      @submit="onDialogSubmit"
    />

    <!-- Delete confirmation -->
    <AlertDialog v-model:open="showDelete">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle class="font-heading">{{ $t('dashboard.sso.deleteTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>
            <span class="font-semibold text-foreground">{{ deleteTarget?.label || $t('dashboard.sso.untitled') }}</span>{{ $t('dashboard.sso.deleteDescription') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction class="bg-red-600 hover:bg-red-700 text-white" @click="confirmDelete">
            {{ $t('dashboard.sso.deletePermanently') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
