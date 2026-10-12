<script setup lang="ts">
defineProps<{ enabled: boolean }>()
</script>

<template>
  <span
    class="inline-flex items-center justify-center gap-1.5 h-6 rounded-full text-[11px] font-semibold shrink-0"
    :class="enabled ? '' : 'bg-muted text-muted-foreground'"
    :style="enabled
      ? 'min-width: 82px; background-color: var(--status-done-bg); color: var(--status-done)'
      : 'min-width: 82px'"
  >
    <span
      class="w-1.5 h-1.5 rounded-full"
      :style="{ backgroundColor: enabled ? 'var(--status-done)' : 'var(--status-open)' }"
    />
    {{ enabled ? $t('dashboard.sso.active') : $t('dashboard.sso.disabled') }}
  </span>
</template>
