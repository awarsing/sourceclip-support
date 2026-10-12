<script setup lang="ts">
import type { HelpCollectionIcon } from '#layers/feedlog/shared/constants/help'
import type { SelectionState } from '~/lib/pages/help'

// The header row of a collection in the help list: drag handle, selection,
// expand chevron and the edit button.
defineProps<{
  collection: {
    name: string
    description: string | null
    icon: HelpCollectionIcon
    visible: boolean
    articleCount: number
  }
  state: SelectionState
  selecting: boolean
  expanded: boolean
}>()
defineEmits<{ toggleExpanded: []; toggleSelection: []; edit: [] }>()
</script>

<template>
  <div
    class="group relative flex cursor-pointer items-center gap-3.5 border-b border-border px-6 py-3.5 hover:bg-background/60"
    @click="$emit('toggleExpanded')"
  >
    <div
      class="drag-handle absolute left-[5px] top-1/2 flex -translate-y-1/2 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-55"
      @click.stop
    >
      <Icon name="lucide:grip-vertical" size="14" />
    </div>
    <HelpAdminSelectBox :state="state" :selecting="selecting" @toggle="$emit('toggleSelection')" />
    <Icon
      name="lucide:chevron-right"
      size="16"
      class="shrink-0 text-muted-foreground transition-transform"
      :class="expanded && 'rotate-90'"
    />
    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
      <Icon :name="`lucide:${collection.icon}`" size="16" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-bold leading-5">{{ collection.name }}</span>
      <span class="block truncate text-xs leading-4 text-muted-foreground">{{ collection.description }}</span>
    </span>
    <HelpStatusBadge v-if="!collection.visible" status="hidden" />
    <span class="shrink-0 text-xs font-medium leading-4 text-muted-foreground">
      {{ $t('help.admin.articleCount', { n: collection.articleCount }, collection.articleCount) }}
    </span>
    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
      @click.stop="$emit('edit')"
    >
      <Icon name="lucide:ellipsis" size="16" />
    </button>
  </div>
</template>
