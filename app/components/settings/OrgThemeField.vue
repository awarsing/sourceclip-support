<script setup lang="ts">
type Theme = 'system' | 'light' | 'dark'

defineProps<{
  options: { value: Theme; label: string; icon: string }[]
  disabled: boolean
}>()

const theme = defineModel<Theme>({ required: true })
</script>

<template>
  <div>
    <label class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t('settings.branding.defaultTheme') }}</label>
    <!-- flex (block-level) + w-fit so it drops below the inline <label> like
         the Logo/Brand-color rows; inline-flex would stay on the label's line. -->
    <div class="mt-2 flex w-fit rounded-lg border border-border bg-background p-1">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold transition-colors disabled:cursor-not-allowed"
        :class="theme === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
        :disabled="disabled"
        @click="theme = opt.value"
      >
        <Icon :name="opt.icon" size="14" />
        {{ opt.label }}
      </button>
    </div>
    <p class="text-[11px] text-muted-foreground mt-1.5">{{ $t('settings.branding.defaultThemeHint') }}</p>
  </div>
</template>
