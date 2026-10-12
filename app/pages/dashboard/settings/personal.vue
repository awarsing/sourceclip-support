<script setup lang="ts">
import type { MemberPreferenceResponse } from '#layers/feedlog/shared/schemas/member-preference'
import { errorStatus } from '~/lib/pages/http'
import { isDefiniteFailure, type PreferenceState, readBackState } from '~/lib/pages/personal'

// Keep the email destination during sign-in; the shared login modal stays on this URL.
definePageMeta({ layout: false })

const { data: session } = await useAuthSession()
const { hasAccount } = useGuestSession()
const ctx = useOrgContext()
const { open: openLogin } = useLoginModal()
const localePath = useLocalePath()
const { t } = useI18n()
const isMember = computed(() => hasAccount.value && !!ctx.value.role)
const scope = computed(() => (isMember.value ? `${ctx.value.orgId}:${session.value?.user.id}` : ''))
const preferences = ref<MemberPreferenceResponse | null>(null)
const enabled = ref(false)
const state = ref<PreferenceState>('loading')
const busy = computed(() => state.value === 'loading' || state.value === 'saving')
const dirty = computed(
  () => !!preferences.value && enabled.value !== preferences.value.notifications.staff_feedback_email_enabled,
)
let generation = 0
let mounted = false
let savedTimer: ReturnType<typeof setTimeout> | undefined

function applyPreferences(value: MemberPreferenceResponse) {
  preferences.value = value
  enabled.value = value.notifications.staff_feedback_email_enabled
}

function showSaved() {
  state.value = 'saved'
  savedTimer = setTimeout(() => {
    state.value = 'ready'
  }, 2500)
}

function fetchPreferences() {
  return useApiFetch<MemberPreferenceResponse>('/api/me/preferences', { retry: 0, timeout: 10000 })
}

async function load() {
  if (!scope.value) return
  const current = ++generation
  clearTimeout(savedTimer)
  state.value = 'loading'
  preferences.value = null
  const value = await fetchPreferences().catch(() => null)
  if (current !== generation) return
  if (value) applyLoaded(value)
  else state.value = 'loadError'
}

function applyLoaded(value: MemberPreferenceResponse) {
  applyPreferences(value)
  state.value = 'ready'
}

function setEnabled(value: boolean) {
  if (busy.value) return
  clearTimeout(savedTimer)
  enabled.value = value
  state.value = 'ready'
}

function reset() {
  if (preferences.value && !busy.value) setEnabled(preferences.value.notifications.staff_feedback_email_enabled)
}

function patchPreferences(value: boolean) {
  return useApiFetch<MemberPreferenceResponse>('/api/me/preferences', {
    method: 'PATCH',
    body: { notifications: { staff_feedback_email_enabled: value } },
    retry: 0,
    timeout: 10000,
  }).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
}

async function save() {
  if (!dirty.value || busy.value) return
  const current = ++generation
  const value = enabled.value
  clearTimeout(savedTimer)
  state.value = 'saving'
  await settleSave(current, value, await patchPreferences(value))
}

async function settleSave(current: number, value: boolean, outcome: Awaited<ReturnType<typeof patchPreferences>>) {
  if (current !== generation) return
  if ('result' in outcome) applySaved(outcome.result)
  else await recoverSave(current, value, outcome.error)
}

function applySaved(result: MemberPreferenceResponse) {
  applyPreferences(result)
  showSaved()
}

async function recoverSave(current: number, value: boolean, error: unknown) {
  if (isDefiniteFailure(errorStatus(error))) {
    state.value = 'saveError'
    return
  }
  // A lost response may follow a successful write. Read back before claiming either outcome.
  const result = await fetchPreferences().catch(() => null)
  if (current !== generation) return
  preferences.value = result
  const next = readBackState(result, value)
  if (next === 'saved') showSaved()
  else state.value = next
}

watch(
  scope,
  () => {
    ++generation
    clearTimeout(savedTimer)
    preferences.value = null
    state.value = 'loading'
    if (mounted) void load()
  },
  { immediate: true, flush: 'sync' },
)

// Wait for the async layout to hydrate before replacing its loading content.
onMounted(() => {
  mounted = true
  void load()
})

onScopeDispose(() => {
  ++generation
  clearTimeout(savedTimer)
})
useHead({ title: () => t('settings.personal.title') })
</script>

<template>
  <NuxtLayout :name="isMember ? 'dashboard' : 'default'">
    <div v-if="isMember" class="flex flex-col h-full">
      <header class="min-h-16 px-6 py-3 border-b border-border flex items-center shrink-0 bg-card">
        <div>
          <h2 class="font-heading text-lg font-bold">{{ $t('settings.personal.title') }}</h2>
          <p class="text-xs text-muted-foreground">
            {{ preferences ? $t('settings.personal.subtitle', { name: preferences.organization.name }) : $t('settings.personal.scope') }}
          </p>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <PersonalNotificationsCard
            :enabled="enabled"
            :preferences="preferences"
            :state="state"
            :busy="busy"
            :dirty="dirty"
            @update:enabled="setEnabled"
            @retry="load"
            @reset="reset"
            @save="save"
          />
        </div>
      </div>
    </div>
    <section v-else class="max-w-md mx-auto my-12 p-6 rounded-xl border border-border bg-card space-y-4">
      <h1 class="font-heading text-lg font-bold">{{ $t('settings.personal.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ $t(hasAccount ? 'settings.personal.membersOnly' : 'settings.personal.signInPrompt') }}</p>
      <Button v-if="!hasAccount" @click="openLogin()">{{ $t('common.signIn') }}</Button>
      <Button v-else variant="outline" as-child><NuxtLink :to="localePath('/')">{{ $t('common.goHome') }}</NuxtLink></Button>
    </section>
  </NuxtLayout>
</template>
