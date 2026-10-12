<script setup lang="ts">
defineProps<{ roles: { key: string; label: string; icon: string; desc: string }[] }>()
</script>

<template>
  <SelectItem v-for="r in roles" :key="r.key" :value="r.key" class="py-2.5">
    <div class="flex items-start gap-2.5">
      <Icon :name="r.icon" size="14" class="mt-0.5 shrink-0 opacity-70" />
      <div class="min-w-0">
        <p class="text-sm font-semibold leading-tight">{{ r.label }}</p>
        <p class="text-[11px] leading-snug mt-0.5 opacity-70">{{ r.desc }}</p>
      </div>
    </div>
  </SelectItem>
</template>
