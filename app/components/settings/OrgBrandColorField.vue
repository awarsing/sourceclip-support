<script setup lang="ts">
import { normalizeBrandHex } from '#layers/feedlog/shared/utils/branding'

defineProps<{
  presets: readonly string[]
  disabled: boolean
}>()

const color = defineModel<string>({ required: true })
</script>

<template>
  <div>
    <label class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('settings.branding.brandColor') }}</label>
    <div class="mt-2 flex flex-wrap items-center gap-3">
      <label class="relative w-11 h-11 rounded-lg border border-border overflow-hidden cursor-pointer shrink-0" :style="{ backgroundColor: color }">
        <input v-model="color" type="color" class="absolute inset-0 opacity-0 cursor-pointer" :disabled="disabled">
      </label>
      <input
        v-model="color"
        type="text"
        class="w-32 h-11 px-3 rounded-lg border border-border bg-background text-sm font-mono uppercase focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
        :disabled="disabled"
      >
      <div class="flex items-center gap-1.5">
        <button
          v-for="c in presets"
          :key="c"
          type="button"
          :style="{ backgroundColor: c }"
          class="w-7 h-7 rounded-md border border-border/60 ring-offset-2 ring-offset-card transition disabled:cursor-not-allowed"
          :class="normalizeBrandHex(color) === c ? 'ring-2 ring-foreground' : ''"
          :disabled="disabled"
          @click="color = c"
        />
      </div>
    </div>
    <p class="text-[11px] text-muted-foreground mt-1.5">{{ $t('settings.branding.brandColorHint') }}</p>
  </div>
</template>
