<script setup lang="ts">
import { resolveAttachmentUrl } from '#layers/feedlog/app/utils/attachment'
import type { EmbedView } from '~/lib/pages/widget-embed'

// Header of the widget frame: back, the workspace mark in chat, the title and close.
const props = defineProps<{
  view: EmbedView
  title: string
  org: { logo: string | null }
  orgInitial: string
  totalCount: number
  feedbackUnread: number
}>()
defineEmits<{ back: []; close: [] }>()

const { t } = useI18n()
const isRoot = computed(() => props.view === 'conversations')
const showLogo = computed(() => props.view === 'chat' && !!props.org.logo)
const logoUrl = computed(() => resolveAttachmentUrl(props.org.logo) ?? undefined)
const showCounts = computed(() => props.view === 'list' && !!props.totalCount)
</script>

<template>
  <header class="min-h-16 px-4 pt-[env(safe-area-inset-top)] border-b border-border bg-card flex items-center gap-2.5 shrink-0">
    <button
      v-if="!isRoot"
      class="w-7 h-7 shrink-0 hover:opacity-70 transition-opacity flex items-center justify-center text-primary"
      :aria-label="t('widget.back')"
      @click="$emit('back')"
    >
      <Icon name="lucide:arrow-left" size="17" />
    </button>
    <img v-if="showLogo" :src="logoUrl" alt="" class="w-7 h-7 rounded-md object-cover shrink-0">
    <span
      v-else-if="view === 'chat'"
      class="w-7 h-7 rounded-md shrink-0 grid place-items-center bg-primary text-primary-foreground font-heading font-bold text-[13px]"
    >{{ orgInitial }}</span>
    <div class="flex-1 min-w-0" :class="isRoot ? 'text-center' : ''">
      <p class="font-heading truncate" :class="isRoot ? 'text-lg font-bold leading-6' : 'font-semibold text-[15.5px]'">
        {{ title }}
      </p>
      <p v-if="showCounts" class="mt-0.5 text-xs text-muted-foreground truncate">
        {{ t('widget.postCount', { count: totalCount }, totalCount) }}<template v-if="feedbackUnread"> · {{ t('widget.withUpdates', { count: feedbackUnread }, feedbackUnread) }}</template>
      </p>
    </div>
    <button
      class="w-6.5 h-6.5 rounded-full bg-secondary hover:opacity-80 transition-opacity flex items-center justify-center text-primary shrink-0"
      :aria-label="t('widget.close')"
      data-fdl-action="widget_panel_close"
      @click="$emit('close')"
    >
      <Icon name="lucide:x" size="13" />
    </button>
  </header>
</template>
