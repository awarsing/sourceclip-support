<script setup lang="ts">
import {
  WIDGET_LAUNCHER_OFFSET_MIN,
  type WidgetLauncherAlignment,
} from '#layers/feedlog/shared/constants/widget-launcher'
import { isValidOffset } from '~/lib/pages/widget-settings'

// One launcher offset input with its unit and validation message.
const props = defineProps<{ field: 'bottom' | 'side'; alignment: WidgetLauncherAlignment }>()
defineEmits<{ submit: [] }>()
const value = defineModel<number | string>({ required: true })

const valid = computed(() => isValidOffset(value.value, WIDGET_LAUNCHER_OFFSET_MIN))
const inputId = computed(() => `launcher-${props.field}-offset`)
const errorId = computed(() => `launcher-${props.field}-error`)
const labelKey = computed(() =>
  props.field === 'bottom' ? 'settings.widget.offsetLabel' : `settings.widget.sideOffsetLabel_${props.alignment}`,
)
</script>

<template>
  <div class="min-w-0">
    <label :for="inputId" class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{{ $t(labelKey) }}</label>
    <div class="mt-2 flex items-center gap-2">
      <input
        :id="inputId"
        v-model="value"
        type="number"
        :min="WIDGET_LAUNCHER_OFFSET_MIN"
        step="1"
        class="min-w-16 w-0 flex-1 h-10 px-3 rounded-lg border bg-background text-sm tabular-nums focus:outline-none focus:border-primary transition-colors"
        :class="valid ? 'border-border' : 'border-destructive'"
        :aria-invalid="!valid"
        :aria-describedby="valid ? undefined : errorId"
        @keydown.enter="$emit('submit')"
      >
      <span class="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{{ $t('settings.widget.offsetUnit') }}</span>
    </div>
    <p v-if="!valid" :id="errorId" class="text-[11px] text-destructive mt-2" role="alert">
      {{ $t('settings.widget.offsetInvalid') }}
    </p>
  </div>
</template>
