<script setup lang="ts">
// The stand-in host page behind the launcher preview.
defineProps<{ enabled: boolean }>()
</script>

<template>
  <div class="h-16 px-6 border-b border-border bg-card flex items-center justify-between">
    <span class="text-base font-heading font-bold">{{ $t('settings.widget.previewSite') }}</span>
    <Icon
      name="lucide:menu"
      size="20"
      class="text-muted-foreground"
    />
  </div>
  <div
    class="p-8 space-y-6"
    aria-hidden="true"
  >
    <div class="h-5 w-40 bg-muted rounded" />
    <div class="h-3 w-3/4 bg-muted rounded" />
    <div class="h-3 w-1/2 bg-muted rounded" />
    <div class="rounded-xl border border-border bg-card p-6 space-y-5 mt-8">
      <div class="h-4 w-1/3 bg-muted rounded" /><div class="h-3 w-full bg-muted rounded" /><div class="h-3 w-2/3 bg-muted rounded" />
    </div>
  </div>
  <p
    v-if="!enabled"
    class="absolute inset-x-6 bottom-12 text-center text-sm text-muted-foreground"
  >
    {{ $t('settings.widget.previewDisabled') }}
  </p>
</template>
