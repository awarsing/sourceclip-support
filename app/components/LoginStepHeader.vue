<script setup lang="ts">
// Header for one step of the sign-in modal: the app logo, or an icon badge for
// the confirmation steps, then the title and an optional description.
defineProps<{
  title: string
  description?: string
  icon?: string
  success?: boolean
}>()
</script>

<template>
  <DialogHeader class="text-center space-y-2">
    <div
      v-if="icon"
      class="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
      :class="success ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary/10'"
    >
      <Icon :name="icon" size="24" :class="success ? 'text-green-600 dark:text-green-400' : 'text-primary'" />
    </div>
    <AppLogo v-else :size="48" class="mx-auto" />
    <DialogTitle class="font-heading text-xl">{{ title }}</DialogTitle>
    <DialogDescription v-if="description || $slots.default">
      <slot>{{ description }}</slot>
    </DialogDescription>
  </DialogHeader>
</template>
