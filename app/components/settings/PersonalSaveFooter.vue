<script setup lang="ts">
import { type PreferenceState, saveStatus } from '~/lib/pages/personal'

// Footer of the personal notifications card: the save note, reset and save.
const props = defineProps<{ state: PreferenceState; busy: boolean; dirty: boolean }>()
const emit = defineEmits<{ reset: []; save: [] }>()

const status = computed(() => saveStatus(props.state, props.dirty))
</script>

<template>
  <div class="px-6 py-3 border-t border-border bg-muted/30 flex flex-wrap items-center justify-end gap-3">
    <p aria-live="polite" class="text-xs flex items-center gap-1.5 mr-auto" :class="state === 'saveError' ? 'text-destructive' : 'text-muted-foreground'">
      <template v-if="status">
        <Icon v-if="status.icon" :name="status.icon" size="13" class="shrink-0" />
        {{ $t(status.key) }}
      </template>
    </p>
    <div class="flex items-center gap-2 ml-auto">
      <button v-if="dirty" :disabled="busy" class="h-9 px-4 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors" @click="emit('reset')">
        {{ $t('settings.reset') }}
      </button>
      <button :disabled="!dirty || busy" class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all" @click="emit('save')">
        {{ busy ? $t('settings.saving') : $t('settings.saveChanges') }}
      </button>
    </div>
  </div>
</template>
