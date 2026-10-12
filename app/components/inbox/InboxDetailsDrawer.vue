<script setup lang="ts">
import InboxCustomerDetails from '#layers/feedlog/app/components/inbox/CustomerDetails.vue'
import type { InboxDetail } from '#layers/feedlog/shared/inbox/types'

defineProps<{
  detail: InboxDetail | null
  feedbacks: { id: string; slug: string; title: string; status: string }[]
  busy: boolean
  hasMore: boolean
}>()
const emit = defineEmits<{ priority: [value: string]; feedback: [slug: string]; more: [] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

function openFeedback(slug: string) {
  emit('feedback', slug)
  open.value = false
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="overflow-y-auto p-0">
      <SheetTitle class="sr-only">{{ t('inbox.customerDetails') }}</SheetTitle>
      <SheetDescription class="sr-only">{{ t('inbox.customer') }}</SheetDescription>
      <InboxCustomerDetails v-if="detail" :customer="detail.customer" :conversation="detail.conversation" :feedbacks="feedbacks" :busy="busy" :has-more="hasMore" @priority="emit('priority', $event)" @feedback="openFeedback" @more="emit('more')" />
    </SheetContent>
  </Sheet>
</template>
