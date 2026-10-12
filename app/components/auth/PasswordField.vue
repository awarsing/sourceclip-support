<script setup lang="ts">
// A labelled PasswordInput.
defineProps<{ id: string; label: string; placeholder?: string; minlength?: number }>()
const value = defineModel<string>({ required: true })
const visible = defineModel<boolean>('visible', { default: false })
</script>

<template>
  <div class="space-y-2">
    <label class="text-sm font-medium" :for="id">{{ label }}</label>
    <PasswordInput :id="id" v-model="value" v-model:visible="visible" :placeholder="placeholder" :minlength="minlength" />
  </div>
</template>
