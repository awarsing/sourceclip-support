<script setup lang="ts">
defineProps<{ loading: boolean; label: string }>()
const emit = defineEmits<{ load: [] }>()
</script>

<template>
  <button
    class="text-xs font-bold text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5"
    :disabled="loading"
    @click="emit('load')"
  >
    {{ label }}
    <Icon v-if="loading" name="lucide:loader-2" size="12" class="animate-spin" />
  </button>
</template>
