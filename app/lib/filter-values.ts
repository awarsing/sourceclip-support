// Value logic for the dashboard filter chips and their value picker.

export interface FilterValueOption {
  value: string
  label: string
  sub?: string
  color?: string
  image?: string | null
}

export type FilterKind = 'enum' | 'date' | 'single'

type Translate = (key: string) => string

// Long option lists, or ones marked searchable, get a search box.
export function filterNeedsSearch(searchable: boolean, options: readonly FilterValueOption[]): boolean {
  return searchable || options.length > 8
}

export function visibleFilterOptions(options: FilterValueOption[], search: string): FilterValueOption[] {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return options
  return options.filter(
    (option) => option.label.toLowerCase().includes(keyword) || (option.sub || '').toLowerCase().includes(keyword),
  )
}

// A single-value filter replaces its value; the others toggle membership.
export function toggleFilterValue(kind: FilterKind, values: readonly string[], value: string): string[] {
  if (kind === 'single') return [value]
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Local-date range for a preset: the last N days, or the current quarter.
export function quickDateRange(days: number | 'quarter', now: Date): { from: string; to: string } {
  const start =
    days === 'quarter'
      ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return { from: isoDay(start), to: isoDay(now) }
}

export function optionInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export interface FilterChipState {
  kind: FilterKind
  op: string
  values: string[]
  from?: string
  to?: string
  options: FilterValueOption[]
}

function firstKnownOption(state: FilterChipState): FilterValueOption | undefined {
  return state.values.map((v) => state.options.find((o) => o.value === v)).find(Boolean)
}

// A chip is stale when none of its values exist any more. The option-list
// guard matters: candidates load async, and nothing resolves until they do.
export function isStaleFilter(state: FilterChipState): boolean {
  return state.kind !== 'date' && state.values.length > 0 && state.options.length > 0 && !firstKnownOption(state)
}

function dateLabel(state: FilterChipState, t: Translate): string {
  if (state.op === 'range') return `${state.from || '…'} – ${state.to || '…'}`
  return state.from || state.to || t('dashboard.filter.pickDate')
}

function valuesLabel(state: FilterChipState, t: Translate): string {
  if (!state.values.length) return t('dashboard.filter.pickValue')
  if (isStaleFilter(state)) return t('dashboard.filter.staleValue')
  return firstKnownOption(state)?.label ?? state.values[0]!
}

export function filterValueLabel(state: FilterChipState, t: Translate): string {
  return state.kind === 'date' ? dateLabel(state, t) : valuesLabel(state, t)
}

// How many values beyond the first one the chip names.
export function extraValueCount(state: Pick<FilterChipState, 'kind' | 'values'>): number {
  return state.kind === 'date' ? 0 : Math.max(0, state.values.length - 1)
}
