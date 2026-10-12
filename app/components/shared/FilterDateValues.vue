<script setup lang="ts">
// Date filter values: quick presets, then the start and/or end date inputs the
// operator needs (after: start only, before: end only, range: both).
const props = defineProps<{
  op: string
  from?: string
  to?: string
}>()

const emit = defineEmits<{
  quick: [days: number | 'quarter']
  'update:range': [range: { from?: string; to?: string }]
}>()

const PRESETS = [
  ['last7', 7],
  ['last30', 30],
  ['thisQuarter', 'quarter'],
] as const

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value || undefined
}

function setFrom(event: Event) {
  emit('update:range', { from: inputValue(event), to: props.to })
}

function setTo(event: Event) {
  emit('update:range', { from: props.from, to: inputValue(event) })
}
</script>

<template>
  <div class="flex flex-wrap gap-1.5 p-1.5">
    <button
      v-for="[key, days] in PRESETS"
      :key="key"
      class="text-[10px] font-bold px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
      @click="emit('quick', days)"
    >
      {{ $t(`dashboard.filter.${key}`) }}
    </button>
  </div>
  <div class="flex items-center gap-1.5 p-1.5 pt-0">
    <input
      v-if="op !== 'before'"
      type="date"
      :value="from || ''"
      class="flex-1 h-7 px-1.5 rounded-md border border-border bg-background text-[11px]"
      @input="setFrom"
    >
    <span v-if="op === 'range'" class="text-[10px] text-muted-foreground">–</span>
    <input
      v-if="op !== 'after'"
      type="date"
      :value="to || ''"
      class="flex-1 h-7 px-1.5 rounded-md border border-border bg-background text-[11px]"
      @input="setTo"
    >
  </div>
</template>
