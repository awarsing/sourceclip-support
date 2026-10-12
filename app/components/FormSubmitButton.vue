<script setup lang="ts">
withDefaults(defineProps<{ loading: boolean; type?: 'submit' | 'button' }>(), { type: 'submit' })
</script>

<template>
  <Button :type="type" class="w-full" size="lg" :disabled="loading">
    <Spinner v-if="loading" class="mr-2 size-4" />
    <slot />
  </Button>
</template>
