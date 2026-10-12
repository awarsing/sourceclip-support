<script setup lang="ts">
import {
  CONVERSATION_RETENTION_MAX_DAYS,
  CONVERSATION_RETENTION_MIN_DAYS,
} from '#layers/feedlog/shared/constants/conversation'

// The assistant's support email and conversation retention inputs. The rule
// list sits between them in the default slot.
defineProps<{ emailValid: boolean; retentionValid: boolean }>()
defineEmits<{ submit: [] }>()
const email = defineModel<string>('email', { required: true })
const retention = defineModel<number | string>('retention', { required: true })
</script>

<template>
  <div>
    <label for="widget-support-email" class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{
      $t('settings.widget.emailLabel')
    }}</label>
    <input
      id="widget-support-email"
      v-model="email"
      type="email"
      :placeholder="$t('settings.widget.emailPlaceholder')"
      class="mt-2 w-full min-w-0 h-10 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:border-primary transition-colors"
      :class="emailValid ? 'border-border' : 'border-destructive'"
      :aria-invalid="!emailValid"
      @keydown.enter="$emit('submit')"
    >
    <p class="text-[11px] mt-1.5" :class="emailValid ? 'text-muted-foreground' : 'text-destructive'">
      {{ $t(emailValid ? 'settings.widget.emailHint' : 'settings.widget.invalidEmail') }}
    </p>
  </div>
  <slot />
  <div class="pt-5 border-t border-border">
    <label for="widget-retention" class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{
      $t('settings.widget.retentionLabel')
    }}</label>
    <div class="mt-2 flex items-center gap-2">
      <input
        id="widget-retention"
        v-model="retention"
        type="number"
        :min="CONVERSATION_RETENTION_MIN_DAYS"
        :max="CONVERSATION_RETENTION_MAX_DAYS"
        step="1"
        class="w-28 h-10 px-3 rounded-lg border bg-background text-sm tabular-nums focus:outline-none focus:border-primary transition-colors"
        :class="retentionValid ? 'border-border' : 'border-destructive'"
        :aria-invalid="!retentionValid"
        @keydown.enter="$emit('submit')"
      ><span class="text-sm text-muted-foreground">{{ $t('settings.widget.retentionUnit') }}</span>
    </div>
    <p class="text-[11px] mt-1.5" :class="retentionValid ? 'text-muted-foreground' : 'text-destructive'">
      {{
        retentionValid
          ? $t('settings.widget.retentionHint')
          : $t('settings.widget.retentionRange', { min: CONVERSATION_RETENTION_MIN_DAYS, max: CONVERSATION_RETENTION_MAX_DAYS })
      }}
    </p>
  </div>
</template>
