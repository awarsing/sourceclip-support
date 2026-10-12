<script setup lang="ts">
import type { Item } from '#layers/feedlog/shared/agent/content'
import { hasFeedbackCard } from './-chat-logic'

const props = defineProps<{ item: Item; author: string; time: string }>()
const emit = defineEmits<{ feedback: [slug: string]; article: [slug: string] }>()
const { t } = useI18n()

const isHandoff = computed(() => props.item.notice === 'handoff')
const isMessage = computed(() => !props.item.notice && props.item.authorType !== 'system')
const isCustomer = computed(() => props.item.authorType === 'customer')
const rowClass = computed(() => (isCustomer.value ? 'justify-end' : 'justify-start'))
const widthClass = computed(() => (hasFeedbackCard(props.item.content) ? 'max-w-[92%]' : 'max-w-[82%]'))
const bubbleClass = computed(() =>
  isCustomer.value ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card border border-border rounded-bl-sm',
)
</script>

<template>
  <div v-if="isHandoff" class="flex justify-start" :data-message-id="item.id" data-author="system">
    <div class="min-w-0 max-w-[82%]">
      <div class="rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2.5 text-[13.5px] font-normal leading-normal" data-handoff-message>{{ t('widget.conversationNotices.handoff') }}</div>
      <WidgetEmbedChatMeta :author="t('widget.messageAI')" :time="time" :created-at="item.createdAt" />
    </div>
  </div>
  <div v-else-if="isMessage" class="flex" :class="rowClass" :data-message-id="item.id" :data-author="item.authorType">
    <div class="min-w-0" :class="widthClass">
      <div class="rounded-2xl px-3 py-2.5 text-[13.5px] leading-normal" :class="bubbleClass">
        <WidgetEmbedParts :content="item.content" :plain-text="item.authorType !== 'agent'" @feedback="emit('feedback', $event)" @article="emit('article', $event)" />
      </div>
      <WidgetEmbedChatMeta :author="author" :time="time" :created-at="item.createdAt" :align-end="isCustomer" />
    </div>
  </div>
</template>

<style scoped>
[data-author='customer'] :deep(.md-editor-preview a) {
  color: var(--primary-foreground);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
</style>
