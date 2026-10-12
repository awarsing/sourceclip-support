<script setup lang="ts">
import type { InboxFilters, InboxRow } from '~/lib/pages/inbox'

const props = defineProps<{
  rows: InboxRow[]
  selected: string | null
  loading: boolean
  error: string
  nextCursor: string | null
  hasFilters: boolean
  isUnread: (id: string) => boolean
}>()
const emit = defineEmits<{ refresh: [more: boolean]; open: [id: string]; resetFilters: []; closeSearch: [] }>()
const filters = defineModel<InboxFilters>('filters', { required: true })
const searchOpen = defineModel<boolean>('searchOpen', { required: true })
const { t } = useI18n()

const searching = computed(() => !!filters.value.q.trim())
const showSpinner = computed(() => props.loading && !props.rows.length)
const showEmpty = computed(() => !props.rows.length && !props.error)
</script>

<template>
  <section class="flex w-full shrink-0 flex-col border-r border-border bg-card md:w-80" :class="{ 'hidden md:flex': selected }" data-conversation-list>
    <InboxListHeader v-model:filters="filters" v-model:search-open="searchOpen" :loading="loading" @refresh="emit('refresh', false)" @close-search="emit('closeSearch')" />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="showSpinner" role="status" class="flex items-center justify-center py-16">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span class="sr-only">{{ t('inbox.loading') }}</span>
      </div>
      <div v-else-if="showEmpty" class="flex flex-col items-center justify-center px-5 py-16 text-center text-muted-foreground">
        <Icon :name="searching ? 'lucide:search-x' : 'lucide:inbox'" size="48" class="mb-4 opacity-50" />
        <p class="text-lg font-medium">{{ t('inbox.empty') }}</p>
        <template v-if="hasFilters">
          <p class="mt-1 text-sm">{{ t(searching ? 'dashboard.feedback.searchNoMatchHint' : 'dashboard.feedback.noResultsHint') }}</p>
          <button type="button" class="mt-4 h-8 rounded-lg border border-border px-3 text-xs font-bold transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="emit('resetFilters')">{{ t('inbox.clearFilters') }}</button>
        </template>
      </div>
      <InboxConversationRow v-for="row in rows" :key="row.id" :row="row" :active="selected === row.id" :unread="isUnread(row.id)" @open="emit('open', $event)" />
      <Button v-if="nextCursor" variant="ghost" class="w-full text-xs" :disabled="loading" @click="emit('refresh', true)">{{ t('inbox.loadMore') }}</Button>
    </div>
  </section>
</template>
