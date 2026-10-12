<script setup lang="ts">
defineProps<{ cursor: string | null; loading: boolean }>()

const emit = defineEmits<{ load: [] }>()
</script>

<template>
  <div v-if="cursor" class="flex justify-center pt-2 pb-1 mt-4">
    <button
      class="text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
      :disabled="loading"
      @click.stop="emit('load')"
    >
      {{ loading ? $t('roadmap.loading') : $t('roadmap.loadMore') }}
    </button>
  </div>
</template>
