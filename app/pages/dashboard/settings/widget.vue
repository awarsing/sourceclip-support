<script setup lang="ts">
import { toast } from 'vue-sonner'
import {
  CONVERSATION_RETENTION_DEFAULT_DAYS,
  CONVERSATION_RETENTION_MAX_DAYS,
  CONVERSATION_RETENTION_MIN_DAYS,
} from '#layers/feedlog/shared/constants/conversation'
import { WIDGET_MAX_ENABLED_RULES } from '#layers/feedlog/shared/constants/widget-rules'
import {
  WIDGET_LAUNCHER_ALIGNMENT_DEFAULT,
  WIDGET_LAUNCHER_CLOSE_BEHAVIOR_DEFAULT,
  WIDGET_LAUNCHER_OFFSET_DEFAULT,
  WIDGET_LAUNCHER_OFFSET_MIN,
  type WidgetLauncherAlignment,
  type WidgetLauncherCloseBehavior,
} from '#layers/feedlog/shared/constants/widget-launcher'
import { updateWidgetSettingsSchema } from '#layers/feedlog/shared/schemas/widget'
import {
  type DraftRule,
  differsFrom,
  isValidOffset,
  isValidRetention,
  ruleLabel,
  saveBlocked,
  toggleDraftRule,
  upsertDraftRule,
} from '~/lib/pages/widget-settings'

definePageMeta({ layout: 'dashboard', middleware: ['admin'] })

const { t, locale } = useI18n()
const ctx = useOrgContext()
const canEdit = computed(() => ctx.value.role === 'owner' || ctx.value.role === 'manager')
const { settings, loading, saving, error, refresh, save, allRules, builtinsPatch, customPatch } = useWidgetSettings()
const { confirm } = useConfirmDialog()
const savingSection = ref<'enabled' | 'launcher' | 'assistant' | null>(null)
const launcherError = ref<string | null>(null)
const assistantError = ref<string | null>(null)
const launcherSaved = ref(false)
const assistantSaved = ref(false)

const alignDraft = ref<WidgetLauncherAlignment>(WIDGET_LAUNCHER_ALIGNMENT_DEFAULT)
const offsetDraft = reactive<Record<'bottom' | 'side', number | string>>({
  bottom: WIDGET_LAUNCHER_OFFSET_DEFAULT,
  side: WIDGET_LAUNCHER_OFFSET_DEFAULT,
})
const closeDraft = ref<WidgetLauncherCloseBehavior>(WIDGET_LAUNCHER_CLOSE_BEHAVIOR_DEFAULT)
const emailDraft = ref('')
const retentionDraft = ref<number | string>(CONVERSATION_RETENTION_DEFAULT_DAYS)
const rulesDraft = ref<DraftRule[]>([])

function hydrateLauncher() {
  if (!settings.value) return
  alignDraft.value = settings.value.launcherConfig.alignment
  offsetDraft.bottom = settings.value.launcherConfig.bottomOffset
  offsetDraft.side = settings.value.launcherConfig.sideOffset
  closeDraft.value = settings.value.launcherConfig.closeBehavior
  launcherError.value = null
  launcherSaved.value = false
}
function hydrateAssistant() {
  if (!settings.value) return
  emailDraft.value = settings.value.supportEmail ?? ''
  retentionDraft.value = settings.value.conversationRetentionDays
  rulesDraft.value = allRules.value.map((rule) => ({ ...rule }))
  assistantError.value = null
  assistantSaved.value = false
}
onMounted(async () => {
  if (!canEdit.value) return
  await refresh()
  hydrateLauncher()
  hydrateAssistant()
})

const offsetValid = computed(() =>
  Object.values(offsetDraft).every((value) => isValidOffset(value, WIDGET_LAUNCHER_OFFSET_MIN)),
)
const launcherConfigDraft = computed(() => ({
  alignment: alignDraft.value,
  bottomOffset: Number(offsetDraft.bottom),
  sideOffset: Number(offsetDraft.side),
  closeBehavior: closeDraft.value,
}))
const launcherDirty = computed(
  () =>
    !!settings.value && (!offsetValid.value || differsFrom(launcherConfigDraft.value, settings.value.launcherConfig)),
)
const retentionValid = computed(() =>
  isValidRetention(retentionDraft.value, CONVERSATION_RETENTION_MIN_DAYS, CONVERSATION_RETENTION_MAX_DAYS),
)
const emailValid = computed(
  () =>
    updateWidgetSettingsSchema.pick({ supportEmail: true }).safeParse({ supportEmail: emailDraft.value.trim() })
      .success,
)
const assistantPatch = computed(() => ({
  supportEmail: emailDraft.value.trim(),
  conversationRetentionDays: Number(retentionDraft.value),
  ...builtinsPatch(rulesDraft.value),
  ...customPatch(rulesDraft.value),
}))
const assistantDirty = computed(
  () =>
    !!settings.value &&
    (!retentionValid.value ||
      JSON.stringify(assistantPatch.value) !==
        JSON.stringify({
          supportEmail: settings.value.supportEmail ?? '',
          conversationRetentionDays: settings.value.conversationRetentionDays,
          ...builtinsPatch(allRules.value),
          ...customPatch(allRules.value),
        })),
)
const activeCount = computed(() => rulesDraft.value.filter((rule) => rule.enabled).length)
const atLimit = computed(() => activeCount.value >= WIDGET_MAX_ENABLED_RULES)
const showCount = computed(() => activeCount.value >= WIDGET_MAX_ENABLED_RULES - 2)
const assistantValid = computed(
  () => emailValid.value && retentionValid.value && activeCount.value <= WIDGET_MAX_ENABLED_RULES,
)

// Only the section that submitted is rehydrated. Other drafts, including invalid
// input, must survive both successful saves and failed requests.
async function saveLauncher() {
  if (saveBlocked(saving.value, launcherDirty.value, offsetValid.value)) return
  savingSection.value = 'launcher'
  launcherError.value = await save({ launcherConfig: launcherConfigDraft.value })
  if (!launcherError.value) {
    hydrateLauncher()
    launcherSaved.value = true
  }
  savingSection.value = null
}
async function saveAssistant() {
  if (saveBlocked(saving.value, assistantDirty.value, assistantValid.value)) return
  savingSection.value = 'assistant'
  assistantError.value = await save(assistantPatch.value)
  if (!assistantError.value) {
    hydrateAssistant()
    assistantSaved.value = true
  }
  savingSection.value = null
}
async function toggleEnabled() {
  if (saving.value || !settings.value) return
  savingSection.value = 'enabled'
  const err = await save({ enabled: !settings.value.enabled })
  if (err) toast.error(err)
  savingSection.value = null
}
function resetPlacement() {
  alignDraft.value = WIDGET_LAUNCHER_ALIGNMENT_DEFAULT
  offsetDraft.bottom = WIDGET_LAUNCHER_OFFSET_DEFAULT
  offsetDraft.side = WIDGET_LAUNCHER_OFFSET_DEFAULT
  launcherError.value = null
}

const limitOpen = ref(false)
const dialogOpen = ref(false)
const editingId = ref<string | null>(null)
const editingText = computed(() => rulesDraft.value.find((rule) => rule.id === editingId.value)?.scenario)
function openAdd() {
  if (atLimit.value) {
    limitOpen.value = true
    return
  }
  editingId.value = null
  dialogOpen.value = true
}
function openEdit(id: string) {
  editingId.value = id
  dialogOpen.value = true
}
function onRuleSubmit(scenario: string) {
  upsertDraftRule(rulesDraft.value, editingId.value, scenario, () => crypto.randomUUID())
}
function toggleRule(id: string) {
  if (toggleDraftRule(rulesDraft.value, id, atLimit.value) === 'limit') limitOpen.value = true
}
function removeRule(id: string) {
  rulesDraft.value = rulesDraft.value.filter((rule) => rule.id !== id)
}
function ruleText(rule: DraftRule) {
  return ruleLabel(rule, settings.value?.rules.builtins, locale.value)
}

const dirty = computed(() => launcherDirty.value || assistantDirty.value)
onBeforeRouteLeave(async () => {
  if (saving.value) return false
  if (!dirty.value) return true
  return confirm({
    title: t('settings.widget.leaveTitle'),
    description: t('settings.widget.leaveDescription'),
    confirmText: t('settings.widget.leaveDiscard'),
    cancelText: t('settings.widget.leaveKeep'),
    variant: 'destructive',
  })
})
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !saving.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <div class="flex flex-col h-full">
    <header class="h-16 px-6 border-b border-border flex items-center shrink-0 bg-card">
      <div>
        <h2 class="font-heading text-lg font-bold">
          {{ $t('settings.widget.title') }}
        </h2><p class="text-xs text-muted-foreground">
          {{ $t('settings.widget.subtitle') }}
        </p>
      </div>
    </header>
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <p
          v-if="!canEdit"
          class="text-sm text-muted-foreground"
        >
          {{ $t('settings.widget.ownerOnly') }}
        </p>
        <p
          v-else-if="loading"
          class="text-sm text-muted-foreground"
        >
          {{ $t('settings.loading') }}
        </p>
        <p
          v-else-if="error"
          class="text-sm text-red-600"
        >
          {{ error }}
        </p>
        <template v-else-if="settings">
          <WidgetInstallationSection
            :base-url="settings.baseUrl"
            :enabled="settings.enabled"
            :saving="saving"
            @toggle="toggleEnabled"
          />

          <section
            class="rounded-xl border border-border bg-card overflow-hidden"
            data-widget-section="launcher"
          >
            <div class="px-6 py-5 border-b border-border flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="font-heading font-bold text-sm">
                  {{ $t('settings.widget.placementSection') }}
                </h3><p class="text-xs text-muted-foreground mt-0.5">
                  {{ $t('settings.widget.placementDesc') }}
                </p>
              </div>
              <button
                type="button"
                class="h-8 px-3 rounded-md border border-border bg-background hover:bg-secondary transition-colors flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                :disabled="saving"
                @click="resetPlacement"
              >
                <Icon
                  name="lucide:rotate-ccw"
                  size="14"
                />{{ $t('settings.widget.resetPlacement') }}
              </button>
            </div>
            <div class="px-6 py-6 grid lg:grid-cols-[270px_minmax(0,1fr)] gap-6 items-start">
              <WidgetPlacementFields
                v-model:alignment="alignDraft"
                v-model:bottom="offsetDraft.bottom"
                v-model:side="offsetDraft.side"
                v-model:close-behavior="closeDraft"
                :saving="saving"
                @submit="saveLauncher"
              />
              <WidgetLauncherPreview
                class="border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0"
                :alignment="alignDraft"
                :bottom-offset="offsetDraft.bottom"
                :side-offset="offsetDraft.side"
                :close-behavior="closeDraft"
                :enabled="settings.enabled"
              />
            </div>
            <WidgetSaveBar
              :dirty="launcherDirty"
              :saving="savingSection === 'launcher'"
              :disabled="saving || !offsetValid"
              :error="launcherError"
              :saved="launcherSaved"
              :saved-hint="$t('settings.widget.launcherSavedHint')"
              @cancel="hydrateLauncher"
              @save="saveLauncher"
            />
          </section>

          <section
            class="rounded-xl border border-border bg-card overflow-hidden"
            data-widget-section="assistant"
          >
            <div class="px-6 py-5 border-b border-border">
              <h3 class="font-heading font-bold text-sm">
                {{ $t('settings.widget.supportSection') }}
              </h3><p class="text-xs text-muted-foreground mt-0.5">
                {{ $t('settings.widget.supportDesc') }}
              </p>
            </div>
            <fieldset
              :disabled="saving"
              class="px-6 py-6 space-y-6 min-w-0"
            >
              <WidgetContactFields
                v-model:email="emailDraft"
                v-model:retention="retentionDraft"
                :email-valid="emailValid"
                :retention-valid="retentionValid"
                @submit="saveAssistant"
              >
                <WidgetRuleList
                  :rules="rulesDraft"
                  :saving="saving"
                  :active-count="activeCount"
                  :show-count="showCount"
                  :label="ruleText"
                  @add="openAdd"
                  @toggle="toggleRule"
                  @edit="openEdit"
                  @remove="removeRule"
                />
              </WidgetContactFields>
            </fieldset>
            <WidgetSaveBar
              :dirty="assistantDirty"
              :saving="savingSection === 'assistant'"
              :disabled="saving || !assistantValid"
              :error="assistantError"
              :saved="assistantSaved"
              @cancel="hydrateAssistant"
              @save="saveAssistant"
            />
          </section>
        </template>
      </div>
    </div>
    <WidgetRuleDialog
      v-model:open="dialogOpen"
      :initial="editingText"
      @submit="onRuleSubmit"
    />
    <Dialog v-model:open="limitOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle class="font-heading">
            {{ $t('settings.widget.limitTitle') }}
          </DialogTitle><DialogDescription>{{ $t('settings.widget.limitDesc', { max: WIDGET_MAX_ENABLED_RULES }) }}</DialogDescription>
        </DialogHeader><DialogFooter>
          <button
            type="button"
            class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90"
            @click="limitOpen = false"
          >
            {{ $t('settings.widget.gotIt') }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
