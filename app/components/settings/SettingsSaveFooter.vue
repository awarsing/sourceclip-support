<script setup lang="ts">
defineProps<{ error: string | null; dirty: boolean; saving: boolean; canSave: boolean }>()
const emit = defineEmits<{ reset: []; save: [] }>()
</script>

<template>
  <div class="px-6 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
    <p v-if="error" class="text-xs text-red-600 flex items-center gap-1.5 min-w-0 truncate mr-auto">
      <Icon name="lucide:alert-circle" size="13" class="shrink-0" />
      {{ error }}
    </p>
    <button
      v-if="dirty"
      class="h-9 px-4 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-secondary transition-colors"
      :disabled="saving"
      @click="emit('reset')"
    >
      {{ $t('settings.reset') }}
    </button>
    <button
      :disabled="!canSave"
      class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      @click="emit('save')"
    >
      {{ saving ? $t('settings.saving') : $t('settings.saveChanges') }}
    </button>
  </div>
</template>
