<script setup lang="ts">
import { WIDGET_MAX_ENABLED_RULES } from '#layers/feedlog/shared/constants/widget-rules'
import type { DraftRule } from '~/lib/pages/widget-settings'

// The assistant's handoff rules: a switch per rule, edit and delete for custom ones.
defineProps<{
  rules: DraftRule[]
  saving: boolean
  activeCount: number
  showCount: boolean
  label: (rule: DraftRule) => string
}>()
defineEmits<{ add: []; toggle: [id: string]; edit: [id: string]; remove: [id: string] }>()
</script>

<template>
  <div class="pt-5 border-t border-border">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {{ $t('settings.widget.rulesLabel') }}
        </p><p class="text-[11px] text-muted-foreground mt-1">
          {{ $t('settings.widget.rulesHint') }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span
          v-if="showCount"
          class="text-[11px] text-muted-foreground tabular-nums"
        >{{ $t('settings.widget.activeCount', { count: activeCount, max: WIDGET_MAX_ENABLED_RULES }) }}</span><button
          type="button"
          class="h-8 px-3 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-secondary transition-colors flex items-center gap-1.5"
          @click="$emit('add')"
        >
          <Icon name="lucide:plus" size="13" />{{ $t('settings.widget.addRule') }}
        </button>
      </div>
    </div>
    <ul class="mt-4 divide-y divide-border rounded-lg border border-border overflow-hidden">
      <li v-for="rule in rules" :key="rule.id" class="px-4 py-3 flex flex-wrap items-start gap-3 bg-background">
        <Switch
          :id="`widget-rule-${rule.id}`"
          :model-value="rule.enabled"
          :disabled="saving"
          class="mt-0.5"
          :aria-label="label(rule)"
          @update:model-value="$emit('toggle', rule.id)"
        />
        <label
          :for="`widget-rule-${rule.id}`"
          class="flex-1 min-w-24 text-xs leading-relaxed break-words"
          :class="rule.enabled ? '' : 'text-muted-foreground'"
        >{{ label(rule) }}<span
          v-if="rule.builtin"
          class="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-wider bg-secondary text-primary px-1.5 py-0.5 rounded"
        >{{ $t('settings.widget.builtinBadge') }}</span></label>
        <div v-if="!rule.builtin" class="flex items-center gap-1 shrink-0 ml-auto">
          <button
            type="button"
            class="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground"
            :aria-label="$t('settings.widget.editRule')"
            @click="$emit('edit', rule.id)"
          >
            <Icon name="lucide:pencil" size="13" />
          </button>
          <button
            type="button"
            class="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive"
            :aria-label="$t('settings.widget.deleteConfirm')"
            @click="$emit('remove', rule.id)"
          >
            <Icon name="lucide:trash-2" size="13" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
