<script setup lang="ts">
import type { HelpArticleStatus } from '#layers/feedlog/shared/constants/help'
import { formatShortDate } from '~/lib/pages/help'

// One article in the help list. In a collection it has a drag handle; in the
// flat list it names its collection instead.
defineProps<{
  article: {
    id: string
    title: string
    aiEnabled: boolean
    status: HelpArticleStatus
    updatedAt: string
    collection?: { name: string; visible: boolean }
  }
  selected: boolean
  selecting: boolean
}>()
defineEmits<{ toggle: [] }>()

const localePath = useLocalePath()
const CHIP = 'inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[10px] font-bold leading-[15px]'
</script>

<template>
  <NuxtLink
    :to="localePath(`/dashboard/help/${article.id}`)"
    class="group flex cursor-pointer items-center gap-3.5 border-b border-border bg-background py-3 pl-16 pr-6 hover:bg-secondary"
    :class="selected && '!bg-primary/5'"
  >
    <HelpAdminSelectBox :state="selected ? 'all' : 'none'" :selecting="selecting" @toggle="$emit('toggle')" />
    <template v-if="article.collection">
      <span class="invisible flex shrink-0"><Icon name="lucide:grip-vertical" size="14" /></span>
      <span class="min-w-0 flex-1 truncate text-sm font-semibold leading-5">{{ article.title }}</span>
      <span :class="[CHIP, 'gap-1 border-transparent bg-secondary text-primary']">
        <Icon v-if="!article.collection.visible" name="lucide:eye-off" size="11" />
        {{ article.collection.name }}
      </span>
    </template>
    <template v-else>
      <div class="drag-handle flex shrink-0 cursor-grab text-muted-foreground opacity-40" @click.prevent.stop>
        <Icon name="lucide:grip-vertical" size="14" />
      </div>
      <span class="min-w-0 flex-1 truncate text-sm font-semibold leading-5">{{ article.title }}</span>
    </template>
    <HelpStatusBadge :status="article.status" />
    <span
      v-if="article.aiEnabled"
      :class="[CHIP, 'gap-1 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300']"
    ><Icon name="lucide:sparkles" size="11" />{{ $t('help.admin.aiVisible') }}</span>
    <span class="w-24 shrink-0 text-right text-xs font-medium leading-4 text-muted-foreground">{{ formatShortDate(article.updatedAt) }}</span>
  </NuxtLink>
</template>
