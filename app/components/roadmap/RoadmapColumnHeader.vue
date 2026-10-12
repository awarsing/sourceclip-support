<script setup lang="ts">
defineProps<{
  label: string
  cssVar: string
  total: number
  editable?: boolean
}>()

const emit = defineEmits<{ add: [] }>()
</script>

<template>
  <div class="flex items-center justify-between mb-4 px-2">
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: `var(${cssVar})` }" />
      <h3 class="font-heading text-sm font-bold uppercase tracking-wider">{{ label }}</h3>
      <span class="ml-1 px-2 py-0.5 rounded-full bg-card/60 text-[10px] font-bold text-muted-foreground border border-border/40">
        {{ total }}
      </span>
    </div>
    <button
      v-if="editable"
      class="text-muted-foreground hover:text-primary transition-colors"
      @click="emit('add')"
    >
      <Icon name="lucide:plus" size="20" />
    </button>
  </div>
</template>
