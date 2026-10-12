<script setup lang="ts">
import {
  WIDGET_LAUNCHER_CLOSE_BEHAVIORS,
  type WidgetLauncherAlignment,
  type WidgetLauncherCloseBehavior,
} from '#layers/feedlog/shared/constants/widget-launcher'

// Launcher placement inputs: alignment, both offsets and the close behaviour.
defineProps<{ saving: boolean }>()
defineEmits<{ submit: [] }>()
const alignment = defineModel<WidgetLauncherAlignment>('alignment', { required: true })
const bottom = defineModel<number | string>('bottom', { required: true })
const side = defineModel<number | string>('side', { required: true })
const closeBehavior = defineModel<WidgetLauncherCloseBehavior>('closeBehavior', { required: true })

const ALIGNMENTS = ['left', 'right'] as const

function setAlignment(value: unknown) {
  if (ALIGNMENTS.includes(value as WidgetLauncherAlignment)) alignment.value = value as WidgetLauncherAlignment
}
function setCloseBehavior(value: unknown) {
  if (WIDGET_LAUNCHER_CLOSE_BEHAVIORS.includes(value as WidgetLauncherCloseBehavior))
    closeBehavior.value = value as WidgetLauncherCloseBehavior
}
</script>

<template>
  <fieldset :disabled="saving" class="min-w-0 space-y-6">
    <div>
      <p id="launcher-alignment-label" class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {{ $t('settings.widget.alignLabel') }}
      </p>
      <ToggleGroup
        type="single"
        :spacing="1"
        class="mt-2 gap-0 rounded-lg border border-border bg-background p-1"
        :model-value="alignment"
        :disabled="saving"
        aria-labelledby="launcher-alignment-label"
        @update:model-value="setAlignment"
      >
        <ToggleGroupItem
          v-for="option in ALIGNMENTS"
          :key="option"
          :value="option"
          class="h-8 rounded-md px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground disabled:cursor-not-allowed"
        >
          {{ $t(`settings.widget.align_${option}`) }}
        </ToggleGroupItem>
      </ToggleGroup>
      <div class="grid grid-cols-2 gap-4 mt-5">
        <WidgetOffsetField v-model="bottom" field="bottom" :alignment="alignment" @submit="$emit('submit')" />
        <WidgetOffsetField v-model="side" field="side" :alignment="alignment" @submit="$emit('submit')" />
      </div>
      <p class="text-[11px] text-muted-foreground mt-3">
        {{ $t('settings.widget.placementHint') }}
      </p>
    </div>
    <div class="pt-5 border-t border-border">
      <label for="launcher-close-behavior" class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {{ $t('settings.widget.closeBehaviorLabel') }}
      </label>
      <Select :model-value="closeBehavior" :disabled="saving" @update:model-value="setCloseBehavior">
        <SelectTrigger
          id="launcher-close-behavior"
          class="mt-2 w-full data-[size=default]:h-10 rounded-lg border-border bg-background text-xs"
          aria-describedby="launcher-close-hint"
        >
          <SelectValue>{{ $t(`settings.widget.closeBehavior_${closeBehavior}`) }}</SelectValue>
        </SelectTrigger>
        <SelectContent class="max-w-[calc(100vw-2rem)]">
          <SelectItem
            v-for="behavior in WIDGET_LAUNCHER_CLOSE_BEHAVIORS"
            :key="behavior"
            :value="behavior"
            :text-value="$t(`settings.widget.closeBehavior_${behavior}`)"
            class="py-2.5 text-xs"
          >
            <span class="block min-w-0">
              <span class="block font-medium leading-5">
                {{ $t(`settings.widget.closeBehavior_${behavior}`) }}
              </span>
              <span class="mt-0.5 block text-[11px] leading-snug opacity-70">
                {{ $t(`settings.widget.closeBehaviorHint_${behavior}`) }}
              </span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <p id="launcher-close-hint" class="text-[11px] text-muted-foreground mt-3">
        {{ $t(`settings.widget.closeBehaviorHint_${closeBehavior}`) }}
      </p>
    </div>
  </fieldset>
</template>
