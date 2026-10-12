<script setup lang="ts">
// "No account? Sign up" style line that moves the modal to another step.
defineProps<{ text: string; action: string }>()

const emit = defineEmits<{ switch: [] }>()
</script>

<template>
  <p class="text-center text-sm text-muted-foreground">
    {{ text }}
    <button class="text-primary hover:underline font-medium" @click="emit('switch')">{{ action }}</button>
  </p>
</template>
