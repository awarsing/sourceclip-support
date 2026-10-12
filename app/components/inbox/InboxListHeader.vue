<script setup lang="ts">
import { INBOX_STATUS_OPTIONS, type InboxFilters } from '~/lib/pages/inbox'

defineProps<{ loading: boolean }>()
const emit = defineEmits<{ refresh: []; closeSearch: [] }>()
const filters = defineModel<InboxFilters>('filters', { required: true })
const searchOpen = defineModel<boolean>('searchOpen', { required: true })
const { t } = useI18n()

const PRIORITIES = ['all', 'high', 'normal'] as const
const iconButton = 'hover:bg-secondary/50 hover:text-foreground dark:hover:bg-secondary/50'
const pill =
  'flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-bold text-primary transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const statusLabel = (status: string) => (status === 'all' ? t('inbox.all') : t(`inbox.statuses.${status}`))
const priorityLabel = (priority: string) => (priority === 'all' ? t('inbox.allPriorities') : t(`inbox.${priority}`))
const newest = computed(() => filters.value.sort === 'newest')
const sortLabel = computed(() => t(newest.value ? 'inbox.newest' : 'inbox.oldest'))
const sortIcon = computed(() => (newest.value ? 'lucide:arrow-down-wide-narrow' : 'lucide:arrow-up-narrow-wide'))

function toggleSearch() {
  if (searchOpen.value) emit('closeSearch')
  else searchOpen.value = true
}
function toggleSort() {
  filters.value.sort = newest.value ? 'oldest' : 'newest'
}
</script>

<template>
  <div class="shrink-0 border-b border-border px-4 py-3">
    <div class="mb-3 flex h-8 items-center justify-between">
      <h1 class="font-heading text-base font-bold">{{ t('inbox.title') }}</h1>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon" :class="[iconButton, 'size-8 text-muted-foreground', { 'bg-secondary text-foreground': searchOpen }]" :title="t('inbox.search')" :aria-label="t('inbox.search')" @click="toggleSearch"><Icon name="lucide:search" size="16" /></Button>
        <Button variant="ghost" size="icon" :class="[iconButton, 'size-8 text-muted-foreground']" :title="t('inbox.refresh')" :aria-label="t('inbox.refresh')" :disabled="loading" @click="emit('refresh')"><Icon name="lucide:refresh-cw" size="15" :class="{ 'animate-spin': loading }" /></Button>
      </div>
    </div>
    <form v-if="searchOpen" class="relative mb-3" @submit.prevent="emit('refresh')" @keydown.esc="emit('closeSearch')">
      <Input v-model="filters.q" autofocus :placeholder="t('inbox.search')" :aria-label="t('inbox.search')" class="h-8 pr-8 text-xs" />
      <Button type="button" variant="ghost" size="icon" :class="[iconButton, 'absolute right-0 top-0 size-8']" :title="t('inbox.cancel')" :aria-label="t('inbox.cancel')" @click="emit('closeSearch')"><Icon name="lucide:x" size="13" /></Button>
    </form>
    <div class="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button type="button" :class="pill" :aria-label="t('inbox.status')"><span class="truncate">{{ statusLabel(filters.status) }}</span><Icon name="lucide:chevron-down" size="12" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <FilterOptionItem v-for="status in INBOX_STATUS_OPTIONS" :key="status" :selected="filters.status === status" @select="filters.status = status">{{ statusLabel(status) }}</FilterOptionItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button type="button" :class="pill" :aria-label="t('inbox.priority')"><span class="truncate">{{ priorityLabel(filters.priority) }}</span><Icon name="lucide:chevron-down" size="12" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <FilterOptionItem v-for="priority in PRIORITIES" :key="priority" :selected="filters.priority === priority" @select="filters.priority = priority">{{ priorityLabel(priority) }}</FilterOptionItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" :class="[iconButton, 'size-7 shrink-0 text-muted-foreground']" :title="sortLabel" :aria-label="sortLabel" @click="toggleSort"><Icon :name="sortIcon" size="15" /></Button>
    </div>
  </div>
</template>
