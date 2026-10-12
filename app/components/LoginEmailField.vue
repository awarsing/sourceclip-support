<script setup lang="ts">
defineProps<{ id: string }>()

const email = defineModel<string>({ required: true })
</script>

<template>
  <div class="space-y-2">
    <label class="text-sm font-medium" :for="id">{{ $t('common.email') }}</label>
    <Input
      :id="id"
      v-model="email"
      type="email"
      :placeholder="$t('auth.emailPlaceholder')"
      required
    />
  </div>
</template>
