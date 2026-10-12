<script setup lang="ts">
defineProps<{ id: string; label: string; placeholder?: string; minlength?: number }>()
const value = defineModel<string>({ required: true })
const visible = defineModel<boolean>('visible', { default: false })
</script>

<template>
  <div class="space-y-2">
    <label class="text-sm font-medium" :for="id">{{ label }}</label>
    <div class="relative">
      <Input
        :id="id"
        v-model="value"
        :type="visible ? 'text' : 'password'"
        :placeholder="placeholder"
        required
        :minlength="minlength"
        class="pr-10"
      />
      <button
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        @click="visible = !visible"
      >
        <Icon :name="visible ? 'lucide:eye-off' : 'lucide:eye'" size="16" />
      </button>
    </div>
  </div>
</template>
