<script setup lang="ts">
import type { InboxMessage } from '#layers/feedlog/shared/inbox/types'
import type { SystemEventPart } from '#layers/feedlog/shared/inbox/state'
import { handoffNoticeKey, isHandoffItem, ruleScenario, showSystemNotice } from '~/lib/pages/inbox'

const props = defineProps<{ item: InboxMessage }>()
const { t, locale } = useI18n()
const time = useConversationTime()

const notices = computed(() => props.item.content.parts.filter(showSystemNotice))
const handoff = computed(() => isHandoffItem(props.item))
const staffName = computed(() => props.item.author?.name || t('widget.messageStaff'))

function stateNotice(part: SystemEventPart) {
  const time = part.dueAt ? new Date(part.dueAt).toLocaleString(locale.value) : ''
  return t(part.kind === 'snoozed' ? 'inbox.noticeSnoozed' : 'inbox.noticeClosed', { name: staffName.value, time })
}
</script>

<template>
  <div v-if="handoff" class="flex items-start gap-2.5">
    <div class="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon name="lucide:bot" size="14" /></div>
    <div class="min-w-0 max-w-[85%]">
      <div class="w-fit max-w-full rounded-xl rounded-tl-sm border border-border bg-secondary/50 px-3.5 py-2.5 text-[13px] font-normal leading-relaxed" data-handoff-message>{{ t('widget.conversationNotices.handoff') }}</div>
      <div class="mt-1.5 flex items-center gap-1 px-0.5 text-[10px] text-muted-foreground">
        <span class="font-semibold text-foreground dark:text-white">{{ t('widget.messageAI') }}</span><span aria-hidden="true">·</span><time :datetime="item.createdAt">{{ time(item.createdAt) }}</time>
      </div>
    </div>
  </div>
  <div v-for="(part, index) in notices" :key="index" class="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 py-1 text-center text-[11px] leading-relaxed text-muted-foreground">
    <details v-if="part.kind === 'handoff' && part.rule" class="min-w-0 max-w-full">
      <summary class="cursor-pointer list-none underline decoration-dotted underline-offset-4">{{ t(handoffNoticeKey(part)) }}</summary>
      <p class="mt-2 max-w-prose whitespace-normal break-words text-left">{{ ruleScenario(part.rule, locale) }}</p>
    </details>
    <span v-else-if="part.kind === 'handoff'">{{ t(handoffNoticeKey(part)) }}</span>
    <span v-else>{{ stateNotice(part) }}</span>
    <time :datetime="item.createdAt" class="text-[10px] opacity-75">{{ time(item.createdAt) }}</time>
  </div>
</template>
