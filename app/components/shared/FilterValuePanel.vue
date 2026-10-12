<script setup lang="ts">
import {
  type FilterValueOption,
  filterNeedsSearch,
  quickDateRange,
  toggleFilterValue,
  visibleFilterOptions,
} from '~/lib/filter-values'

// Value picker shared by the filter chip and the Filters menu's second level.
// Renders menu content only — the caller supplies the DropdownMenuContent wrapper.

const props = withDefaults(
  defineProps<{
    kind: 'enum' | 'date' | 'single'
    op: string
    values?: string[]
    from?: string
    to?: string
    options?: FilterValueOption[]
    searchable?: boolean
  }>(),
  {
    values: () => [],
    options: () => [],
    from: undefined,
    to: undefined,
    searchable: false,
  },
)

const emit = defineEmits<{
  'update:op': [op: string]
  'update:values': [values: string[]]
  'update:range': [range: { from?: string; to?: string }]
}>()

const search = ref('')
const showSearch = computed(() => filterNeedsSearch(props.searchable, props.options))
const visibleOptions = computed(() => visibleFilterOptions(props.options, search.value))

function toggleValue(value: string) {
  emit('update:values', toggleFilterValue(props.kind, props.values, value))
}

function quickRange(days: number | 'quarter') {
  emit('update:op', 'range')
  emit('update:range', quickDateRange(days, new Date()))
}
</script>

<template>
  <FilterDateValues
    v-if="kind === 'date'"
    :op="op"
    :from="from"
    :to="to"
    @quick="quickRange"
    @update:range="emit('update:range', $event)"
  />

  <template v-else>
    <div v-if="showSearch" class="p-1.5 pb-1">
      <input
        v-model="search"
        class="w-full h-7 px-2 rounded-md border border-border bg-background text-[11px]"
        :placeholder="$t('dashboard.filter.searchPlaceholder')"
      >
    </div>
    <div class="max-h-[240px] overflow-y-auto">
      <FilterValueRow
        v-for="opt in visibleOptions"
        :key="opt.value"
        :option="opt"
        :checked="values.includes(opt.value)"
        @toggle="toggleValue(opt.value)"
      />
      <p v-if="!visibleOptions.length" class="px-2 py-3 text-center text-[11px] text-muted-foreground">
        {{ $t('dashboard.filter.noMatches') }}
      </p>
    </div>
  </template>
</template>
