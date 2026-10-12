<script setup lang="ts">
import InboxStatusBadge from '#layers/feedlog/app/components/inbox/StatusBadge.vue'
import type { InboxRow } from '~/lib/pages/inbox'

const props = defineProps<{ row: InboxRow; active: boolean; unread: boolean }>()
const emit = defineEmits<{ open: [id: string] }>()
const { t } = useI18n()
const { authorName } = useAuthorDisplay()
const time = useConversationTime()

const preview = computed(() => props.row.previewText || props.row.title || t('inbox.title'))
const tooltip = computed(() => props.row.previewText || props.row.title || undefined)
</script>

<template>
  <button class="flex w-full items-center gap-3 border-b border-l-2 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" :class="active ? 'border-l-primary bg-primary/5' : 'border-l-transparent'" :aria-current="active ? 'true' : undefined" :aria-label="`${authorName(row.customer)}: ${preview}`" :title="tooltip" data-inbox-conversation @click="emit('open', row.id)">
    <UserAvatar :author="row.customer" :size="9" />
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-[13px] leading-5" :class="unread ? 'font-bold' : 'font-medium'" data-inbox-preview>{{ preview }}</span>
        <time class="shrink-0 text-[10px] text-muted-foreground" :datetime="row.lastMessageAt">{{ time(row.lastMessageAt) }}</time>
        <span class="inline-flex size-2 shrink-0" data-inbox-unread-slot>
          <span v-if="unread" class="size-2 rounded-full bg-primary" role="img" :aria-label="t('inbox.unread')" data-inbox-unread />
        </span>
      </div>
      <div class="mt-1.5 flex items-center gap-2" data-inbox-labels>
        <InboxStatusBadge :status="row.status" />
        <span v-if="row.priority === 'high'" class="inline-flex shrink-0 items-center text-primary" role="img" :aria-label="t('inbox.high')" :title="t('inbox.high')" data-inbox-priority>
          <Icon name="lucide:flag" mode="svg" size="14" class="[&_path]:fill-current" aria-hidden="true" />
        </span>
      </div>
    </div>
  </button>
</template>
