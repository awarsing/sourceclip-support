<script setup lang="ts">
import InboxStatusBadge from '#layers/feedlog/app/components/inbox/StatusBadge.vue'
import type { InboxConversation } from '#layers/feedlog/shared/inbox/types'
import { SNOOZE_CHOICES, wakeTime } from '~/lib/pages/inbox'

defineProps<{
  conversation: InboxConversation
  statusHint: string
  canReply: boolean
  canClose: boolean
  actionBusy: boolean
  detailsShown: boolean
}>()
const emit = defineEmits<{
  back: []
  command: [action: string, extra?: Record<string, unknown>]
  close: []
  toggleDetails: []
}>()
const { t, locale } = useI18n()

const iconButton =
  'hover:bg-secondary/50 hover:text-foreground dark:hover:bg-secondary/50 size-8 shrink-0 text-muted-foreground'
const formatWake = (choice: string) => new Date(wakeTime(choice)).toLocaleString(locale.value)

function snooze(choice: string) {
  emit('command', 'snooze', { wakeAt: wakeTime(choice), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
}
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:px-4">
    <Button variant="ghost" size="icon" class="hover:bg-secondary/50 hover:text-foreground dark:hover:bg-secondary/50 size-8 shrink-0 md:hidden" :title="t('inbox.back')" :aria-label="t('inbox.back')" @click="emit('back')"><Icon name="lucide:arrow-left" size="16" /></Button>
    <h2 class="min-w-0 flex-1 truncate font-heading text-sm font-semibold" :title="conversation.title || t('inbox.title')">{{ conversation.title || t('inbox.title') }}</h2>
    <span tabindex="0" :title="statusHint" :aria-label="statusHint"><InboxStatusBadge :status="conversation.status" /></span>
    <DropdownMenu v-if="canReply">
      <DropdownMenuTrigger as-child><Button variant="ghost" size="icon" :class="iconButton" :disabled="actionBusy" :title="t('inbox.snooze')" :aria-label="t('inbox.snooze')"><Icon name="lucide:clock" size="16" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-72">
        <DropdownMenuLabel class="text-xs">{{ t('inbox.snooze') }}</DropdownMenuLabel>
        <DropdownMenuItem v-for="choice in SNOOZE_CHOICES" :key="choice" class="group flex justify-between gap-4 py-2 text-xs focus:text-foreground" @select="snooze(choice)"><span>{{ t(`inbox.snoozeOptions.${choice}`) }}</span><span class="text-[10px] text-muted-foreground group-focus:text-foreground/80">{{ formatWake(choice) }}</span></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button v-if="conversation.status === 'snoozed'" variant="ghost" size="icon" :class="iconButton" :disabled="actionBusy" :title="t('inbox.resume')" :aria-label="t('inbox.resume')" @click="emit('command', 'resume')"><Icon name="lucide:play" size="16" /></Button>
    <Button v-if="canClose" variant="ghost" size="icon" :class="iconButton" :disabled="actionBusy" :title="t('inbox.close')" :aria-label="t('inbox.close')" @click="emit('close')"><Icon name="lucide:check-check" size="17" /></Button>
    <Button variant="ghost" size="icon" :class="[iconButton, { 'bg-primary/10 text-primary': detailsShown }]" :title="t(detailsShown ? 'inbox.hideDetails' : 'inbox.showDetails')" :aria-label="t(detailsShown ? 'inbox.hideDetails' : 'inbox.showDetails')" @click="emit('toggleDetails')"><Icon name="lucide:panel-right" size="16" /></Button>
  </header>
</template>
