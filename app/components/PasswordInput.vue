<script setup lang="ts">
// Password field with a show/hide toggle. Bind v-model:visible to share the
// toggle between fields; left unbound, each field keeps its own.
defineProps<{
  id: string
  placeholder?: string
  minlength?: number
}>()

const model = defineModel<string>({ required: true })
const visible = defineModel<boolean>('visible', { default: false })
</script>

<template>
  <div class="relative">
    <Input
      :id="id"
      v-model="model"
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
</template>
