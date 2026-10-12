<script setup lang="ts">
import type { BulkAction } from '~/lib/pages/help'

// Below the title: bulk actions while articles are selected, otherwise the
// view switch and search.
defineProps<{ selectedCount: number }>()
defineEmits<{ clear: []; bulk: [action: BulkAction, aiEnabled?: boolean] }>()
const view = defineModel<'collections' | 'articles'>('view', { required: true })
const search = defineModel<string>('search', { required: true })

const VIEWS = ['collections', 'articles'] as const
</script>

<template>
  <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/30 px-6 py-4">
    <template v-if="selectedCount">
      <div class="flex h-9 items-center gap-3">
        <span class="text-[13px] font-bold leading-[18px]">{{ $t('help.admin.selected', { n: selectedCount }, selectedCount) }}</span>
        <button type="button" class="text-xs font-bold text-muted-foreground hover:text-foreground" @click="$emit('clear')">
          {{ $t('help.admin.clear') }}
        </button>
      </div>
      <div class="flex h-9 items-center gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-bold hover:bg-secondary"
          @click="$emit('bulk', 'unpublish')"
        >
          {{ $t('help.admin.unpublish') }}
        </button>
        <button
          type="button"
          class="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          @click="$emit('bulk', 'publish')"
        >
          {{ $t('help.admin.publish') }}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-secondary">
              {{ $t('help.admin.aiVisibility') }}<Icon name="lucide:chevron-down" size="13" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="$emit('bulk', 'ai-visibility', true)">{{ $t('help.admin.aiEnable') }}</DropdownMenuItem>
            <DropdownMenuItem @select="$emit('bulk', 'ai-visibility', false)">{{ $t('help.admin.aiDisable') }}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-1 rounded-2xl bg-secondary p-[3px]">
        <button
          v-for="option in VIEWS"
          :key="option"
          type="button"
          class="h-[26px] whitespace-nowrap rounded-lg px-3 text-xs font-bold leading-4 transition-colors"
          :class="view === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="view = option"
        >
          {{ option === 'collections' ? $t('help.admin.viewCollections') : $t('help.admin.viewArticles') }}
        </button>
      </div>
      <div class="relative flex w-64 items-center text-muted-foreground">
        <Icon name="lucide:search" size="14" class="absolute left-3" />
        <input
          v-model="search"
          type="text"
          class="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-[13px] text-foreground outline-none focus:border-primary"
          :placeholder="$t('help.admin.searchPlaceholder')"
        >
        <button v-if="search" type="button" class="absolute right-2.5 flex hover:text-foreground" @click="search = ''">
          <Icon name="lucide:x" size="13" />
        </button>
      </div>
    </template>
  </div>
</template>
