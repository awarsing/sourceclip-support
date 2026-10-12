<script setup lang="ts">
import type { FilterValueOption } from '../shared/FilterValuePanel.vue'
import { blankCondition, conditionBinding, type FilterFieldKey, upsertCondition, valuesPatch } from '~/lib/pages/posts'

export interface FeedbackFieldDef {
  key: FilterFieldKey
  kind: 'enum' | 'date' | 'single'
  label: string
  icon: string
  options: FilterValueOption[]
  searchable?: boolean
}

const props = defineProps<{ fieldDefs: FeedbackFieldDef[] }>()
const conditions = defineModel<FilterCondition[]>('conditions', { required: true })

const open = ref(false)
const pickingField = ref<FilterFieldKey | null>(null)
const draft = ref<FilterCondition | null>(null)

const availableFields = computed(() => {
  const used = new Set(conditions.value.map((c) => c.field))
  return props.fieldDefs.filter((d) => !used.has(d.key))
})
const pickingDef = computed(() => props.fieldDefs.find((d) => d.key === pickingField.value))
const binding = computed(() => (draft.value ? conditionBinding(draft.value) : null))

function startPicking(key: FilterFieldKey) {
  pickingField.value = key
  draft.value = blankCondition(key)
}
function resetPicking() {
  pickingField.value = null
  draft.value = null
}
// Also removes: unchecking the last value must drop the condition, not leave an empty chip.
function patchDraft(patch: Record<string, unknown>) {
  if (!draft.value) return
  const next = { ...draft.value, ...patch } as FilterCondition
  draft.value = next
  conditions.value = upsertCondition(conditions.value, next)
}
</script>

<template>
  <DropdownMenu v-model:open="open" @update:open="resetPicking">
    <DropdownMenuTrigger as-child>
      <button
        class="h-9 px-3 rounded-lg border border-border bg-background text-xs font-heading font-bold text-muted-foreground hover:text-foreground hover:border-primary transition-all flex items-center gap-2"
      >
        <Icon name="lucide:filter" size="16" />
        {{ $t('dashboard.feedback.filtersBtn') }}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" :class="pickingDef && binding ? 'min-w-[220px] max-w-[320px]' : 'w-48'">
      <template v-if="pickingDef && binding">
        <button
          class="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors border-b border-border"
          @click="resetPicking"
        >
          <Icon name="lucide:chevron-left" size="12" class="shrink-0" />
          {{ pickingDef.label }}
        </button>
        <FilterValuePanel
          v-bind="binding"
          :kind="pickingDef.kind"
          :options="pickingDef.options"
          :searchable="!!pickingDef.searchable"
          @update:op="patchDraft({ op: $event })"
          @update:values="patchDraft(valuesPatch(pickingDef.kind, $event))"
          @update:range="patchDraft($event)"
        />
      </template>
      <template v-else>
        <DropdownMenuItem v-for="def in availableFields" :key="def.key" class="cursor-pointer" @select.prevent="startPicking(def.key)">
          <Icon :name="def.icon" size="14" class="mr-2" />
          {{ def.label }}
        </DropdownMenuItem>
        <p v-if="!availableFields.length" class="px-2 py-3 text-center text-[11px] text-muted-foreground">
          {{ $t('dashboard.filter.noFieldsLeft') }}
        </p>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
