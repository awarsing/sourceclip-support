<script setup lang="ts">
import { statusBadgeStyle, statusCssVar } from '../post/-post-logic'
import { normalizeStatus } from './-changelog-logic'

const props = defineProps<{
  item: { id: string; title: string; voteCount: number; status: string }
  selected: boolean
  blocked: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()

const rowClass = computed(() => [
  props.selected ? 'bg-primary/5 !border-primary/10' : 'hover:bg-background',
  props.blocked ? 'opacity-40 cursor-not-allowed' : '',
])
const checkClass = computed(() =>
  props.selected
    ? 'bg-primary border-primary shadow-sm text-primary-foreground'
    : 'border-2 border-border bg-card group-hover:border-primary/30 text-transparent',
)
const titleClass = computed(() => (props.selected ? 'text-primary' : 'group-hover:text-primary'))
const status = computed(() => normalizeStatus(props.item.status))
const badgeStyle = computed(() => statusBadgeStyle(status.value))
const dotStyle = computed(() => ({ backgroundColor: `var(${statusCssVar(status.value)})` }))
</script>

<template>
  <div
    class="group relative flex items-start gap-4 p-4 rounded-xl transition-all cursor-pointer mb-1 border border-transparent"
    :class="rowClass"
    @click="emit('toggle')"
  >
    <!-- Checkbox circle -->
    <div class="mt-1 flex-shrink-0">
      <div class="w-5 h-5 rounded-[6px] transition-all flex items-center justify-center" :class="checkClass">
        <Icon name="lucide:check" size="14" class="stroke-[3]" />
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 overflow-hidden">
          <h4 class="text-[15px] font-bold font-heading truncate transition-colors" :class="titleClass">
            {{ item.title }}
          </h4>
          <div class="flex items-center gap-3 text-muted-foreground/50 text-[12px] font-bold shrink-0">
            <span class="flex items-center gap-0.5">
              <Icon name="lucide:chevron-up" size="16" /> {{ item.voteCount }}
            </span>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4 mt-1">
        <p class="text-[13px] text-muted-foreground line-clamp-1 flex-1" />
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 border"
          :style="badgeStyle"
        >
          <span class="w-1.5 h-1.5 rounded-full" :style="dotStyle" />
          {{ $t(statusLabelKey(item.status)) }}
        </span>
      </div>
    </div>
  </div>
</template>
