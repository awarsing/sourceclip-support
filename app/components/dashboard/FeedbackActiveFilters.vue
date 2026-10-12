<script setup lang="ts">
import type { FeedbackFieldDef } from './FeedbackFilterMenu.vue'
import { conditionBinding, valuesPatch } from '~/lib/pages/posts'

const props = defineProps<{ fieldDefs: FeedbackFieldDef[] }>()
const conditions = defineModel<FilterCondition[]>('conditions', { required: true })

const chips = computed(() =>
  conditions.value.flatMap((condition) => {
    const def = props.fieldDefs.find((d) => d.key === condition.field)
    return def ? [{ def, binding: conditionBinding(condition) }] : []
  }),
)

function patch(field: string, change: Record<string, unknown>) {
  conditions.value = conditions.value.map((c) => (c.field === field ? ({ ...c, ...change } as FilterCondition) : c))
}
function remove(field: string) {
  conditions.value = conditions.value.filter((c) => c.field !== field)
}
</script>

<template>
  <div v-if="chips.length > 0" class="px-6 py-4 border-b border-border flex items-end justify-between gap-3 bg-background/30">
    <div class="flex flex-wrap items-center gap-2 min-w-0">
      <span class="hidden sm:inline text-[11px] font-bold text-muted-foreground uppercase tracking-wider mr-2 shrink-0">{{ $t('dashboard.feedback.activeFilters') }}</span>
      <FilterChip
        v-for="{ def, binding } in chips"
        :key="def.key"
        v-bind="binding"
        :label="def.label"
        :icon="def.icon"
        :kind="def.kind"
        :options="def.options"
        :searchable="!!def.searchable"
        @update:op="patch(def.key, { op: $event })"
        @update:values="patch(def.key, valuesPatch(def.kind, $event))"
        @update:range="patch(def.key, $event)"
        @remove="remove(def.key)"
      />
    </div>
    <button
      class="relative inline-flex items-center h-7 shrink-0 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors underline underline-offset-2 after:absolute after:content-[''] after:-inset-x-3 after:-inset-y-2 sm:after:content-none"
      @click="conditions = []"
    >
      {{ $t('dashboard.feedback.clearAll') }}
    </button>
  </div>
</template>
