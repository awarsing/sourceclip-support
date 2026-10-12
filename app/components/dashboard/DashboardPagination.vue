<script setup lang="ts">
defineProps<{ pages: number[]; pageCount: number; summary: string; shortSummary: string }>()
const page = defineModel<number>('page', { required: true })
</script>

<template>
  <div class="h-14 md:h-16 px-4 md:px-6 border-t border-border flex items-center justify-between bg-card">
    <span class="hidden md:block text-xs text-muted-foreground font-medium">{{ summary }}</span>
    <span class="md:hidden text-xs text-muted-foreground font-medium">{{ shortSummary }}</span>
    <div class="flex items-center gap-2">
      <button
        class="w-8 h-8 flex items-center justify-center rounded border border-border hover:bg-background disabled:opacity-50"
        :disabled="page <= 1"
        @click="page--"
      >
        <Icon name="lucide:chevron-left" size="16" />
      </button>
      <button
        v-for="n in pages"
        :key="n"
        class="w-8 h-8 flex items-center justify-center rounded text-xs font-bold"
        :class="page === n ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-background'"
        @click="page = n"
      >
        {{ n }}
      </button>
      <button
        class="w-8 h-8 flex items-center justify-center rounded border border-border hover:bg-background disabled:opacity-50"
        :disabled="page >= pageCount"
        @click="page++"
      >
        <Icon name="lucide:chevron-right" size="16" />
      </button>
    </div>
  </div>
</template>
