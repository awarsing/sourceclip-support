<script setup lang="ts">
import type { EmailResult, InboxCustomer, InboxMessage } from '#layers/feedlog/shared/inbox/types'

defineProps<{
  items: InboxMessage[]
  customer: InboxCustomer
  hasEarlier: boolean
  emailResults: Record<string, EmailResult>
  emailSending: Record<string, boolean>
}>()
const emit = defineEmits<{ scroll: []; earlier: []; feedback: [slug: string]; retryEmail: [itemId: string] }>()
const { t } = useI18n()
const el = ref<HTMLElement | null>(null)

defineExpose({ el })
</script>

<template>
  <div ref="el" class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5" data-inbox-timeline @scroll.passive="emit('scroll')">
    <div v-if="hasEarlier" class="text-center"><Button variant="ghost" size="sm" class="text-xs" @click="emit('earlier')">{{ t('inbox.earlier') }}</Button></div>
    <InboxTimelineItem
      v-for="item in items"
      :key="item.id"
      :item="item"
      :customer="customer"
      :email="emailResults[item.id]"
      :email-sending="!!emailSending[item.id]"
      @feedback="emit('feedback', $event)"
      @retry-email="emit('retryEmail', $event)"
    />
  </div>
</template>
