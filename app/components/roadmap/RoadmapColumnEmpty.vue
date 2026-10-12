<script setup lang="ts">
defineProps<{
  label: string
  editable?: boolean
}>()

const emit = defineEmits<{ add: [] }>()
</script>

<template>
  <div
    class="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border/60 rounded-xl p-8 text-center bg-card/30"
  >
    <Icon name="lucide:puzzle" size="48" class="text-border mb-3" />
    <p class="text-xs font-medium text-muted-foreground">{{ $t('roadmap.emptyColumn', { status: label.toLowerCase() }) }}</p>
    <button
      v-if="editable"
      class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-primary bg-primary/5 hover:bg-primary/10 transition-colors text-xs font-bold border border-primary/20"
      @click="emit('add')"
    >
      <Icon name="lucide:plus-circle" size="16" />
      {{ $t('roadmap.addItem') }}
    </button>
  </div>
</template>
