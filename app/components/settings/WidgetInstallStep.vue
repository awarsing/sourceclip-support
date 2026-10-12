<script setup lang="ts">
// One titled install snippet with its copy button.
defineProps<{
  title: string
  code: string
  copied: boolean
}>()

const emit = defineEmits<{ copy: [] }>()
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <p class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {{ title }}
      </p>
      <button
        type="button"
        class="h-7 px-2.5 rounded-md border border-border text-[11px] font-semibold hover:bg-secondary"
        @click="emit('copy')"
      >
        {{ copied ? $t('settings.widget.copied') : $t('settings.widget.copy') }}
      </button>
    </div>
    <pre class="mt-2 px-4 py-3 rounded-lg bg-muted/40 border border-border overflow-x-auto text-xs font-mono leading-relaxed"><code>{{ code }}</code></pre>
  </div>
</template>
