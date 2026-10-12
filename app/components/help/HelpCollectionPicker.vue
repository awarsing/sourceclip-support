<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import type { HelpCollectionIcon } from '#layers/feedlog/shared/constants/help'

defineProps<{
  collections: { id: string; name: string; icon: HelpCollectionIcon }[]
  current: { id: string; name: string } | null | undefined
}>()
const emit = defineEmits<{ pick: [collectionId: string] }>()

const open = ref(false)
const pickerRef = ref<HTMLElement | null>(null)
onClickOutside(pickerRef, () => {
  open.value = false
})
onKeyStroke('Escape', () => {
  open.value = false
})

function choose(collectionId: string) {
  open.value = false
  emit('pick', collectionId)
}
</script>

<template>
  <div ref="pickerRef" class="relative">
    <div
      class="flex h-9 cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-3 text-[13px] font-semibold leading-[18px]"
      @click="open = !open"
    >
      {{ current?.name }}
      <Icon name="lucide:chevron-down" size="14" class="text-muted-foreground" />
    </div>
    <div v-if="open" class="absolute inset-x-0 top-10 z-20 overflow-hidden rounded-lg border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,.12)]">
      <div
        v-for="option in collections"
        :key="option.id"
        class="flex cursor-pointer items-center gap-2.5 px-3 py-[9px] hover:bg-secondary"
        @click="choose(option.id)"
      >
        <span class="flex text-primary"><Icon :name="`lucide:${option.icon}`" size="15" /></span>
        <span class="min-w-0 flex-1 truncate text-[13px] font-semibold">{{ option.name }}</span>
        <Icon v-if="option.id === current?.id" name="lucide:check" size="14" class="text-primary" />
      </div>
    </div>
  </div>
</template>
