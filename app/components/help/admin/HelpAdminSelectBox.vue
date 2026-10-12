<script setup lang="ts">
import type { SelectionState } from '~/lib/pages/help'

// The row checkbox: always shown once something is selected, on hover otherwise.
const props = defineProps<{ state: SelectionState; selecting: boolean }>()
defineEmits<{ toggle: [] }>()

const boxClass = computed(() => {
  if (props.state !== 'none') return 'border-primary bg-primary text-primary-foreground opacity-100'
  return `border-border text-transparent ${props.selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
})
</script>

<template>
  <button
    type="button"
    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 bg-card transition-all"
    :class="boxClass"
    @click.prevent.stop="$emit('toggle')"
  >
    <span v-if="state === 'some'" class="h-0.5 w-2.5 rounded-full bg-primary-foreground" />
    <Icon v-else name="lucide:check" size="13" />
  </button>
</template>
