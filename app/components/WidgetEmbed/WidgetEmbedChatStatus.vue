<script setup lang="ts">
defineProps<{
  transient: string
  thinking: boolean
  failureText: string | null
  canRetry: boolean
  canRefresh: boolean
}>()
const emit = defineEmits<{ retry: []; refresh: [] }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="transient" class="max-w-[82%] rounded-lg rounded-bl-sm border border-border bg-card px-3 py-2.5 text-[13.5px] leading-normal"><WidgetEmbedMarkdown :text="transient" /></div>
  <div v-else-if="thinking" role="status" :aria-label="t('widget.thinking')" class="flex justify-start">
    <div class="px-3.5 py-2.5 rounded-lg rounded-bl-sm bg-card border border-border text-xs text-muted-foreground flex items-center gap-1.5">
      <span class="flex items-center gap-1" aria-hidden="true">
        <span v-for="n in 3" :key="n" class="w-1 h-1 rounded-full bg-current opacity-40 typing-dot" :style="{ animationDelay: `${(n - 1) * 0.16}s` }" />
      </span>
      {{ t('widget.thinking') }}
    </div>
  </div>
  <div v-if="failureText !== null" role="status" class="text-xs text-destructive">{{ failureText }}</div>
  <button v-if="canRetry" class="text-xs font-semibold text-primary" @click="emit('retry')">{{ t('widget.retryReply') }}</button>
  <button v-if="canRefresh" class="text-xs text-primary" @click="emit('refresh')">{{ t('widget.refreshStatus') }}</button>
</template>

<style scoped>
.typing-dot { animation: typing 1.2s ease-in-out infinite; }
@keyframes typing {
  0%, 60%, 100% { opacity: 0.25; }
  30% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .typing-dot { animation: none; }
}
</style>
