<script setup lang="ts">
import { pageRange, windowPageNumbers } from '~/lib/pages/posts'

definePageMeta({ layout: 'dashboard', middleware: 'admin' })

const { t } = useI18n()
const localePath = useLocalePath()

const listSearch = ref('')
const listStatus = ref<'all' | string>('all')

const statusOptions = computed(() => [
  { value: 'all', label: t('changelog.admin.status.all') },
  { value: 'published', label: t('changelog.admin.status.published') },
  { value: 'draft', label: t('changelog.admin.status.draft') },
  { value: 'needs_update', label: t('changelog.admin.status.needs_update') },
])

const pageSize = 10
const currentPage = ref(1)

const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout>
watch(listSearch, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = val
    currentPage.value = 1
  }, 300)
})

watch(listStatus, () => {
  currentPage.value = 1
})

const { data: listData, status: fetchStatus } = await useFetch<PagePaginatedList<ChangelogAdminListItem>>(
  '/api/admin/changelogs',
  {
    query: computed(() => ({
      status: listStatus.value !== 'all' ? listStatus.value : undefined,
      search: debouncedSearch.value || undefined,
      page: currentPage.value,
      pageSize,
    })),
  },
)

const items = computed(() => listData.value?.data ?? [])
const total = computed(() => listData.value?.pagination?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const pageNumbers = computed(() => windowPageNumbers(pageCount.value, currentPage.value))
const pending = computed(() => fetchStatus.value === 'pending')
const paginationSummary = computed(() =>
  t('changelog.admin.showing', pageRange(currentPage.value, pageSize, total.value)),
)

function handleCreate() {
  navigateTo(localePath('/dashboard/changelog/new'))
}

function handleSelect(id: string) {
  navigateTo(localePath(`/dashboard/changelog/${id}`))
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- Top bar -->
    <header class="h-16 px-6 border-b border-border flex items-center justify-between shrink-0 bg-card backdrop-blur-sm">
      <div class="flex items-center gap-4">
        <h2 class="font-heading text-lg font-bold">{{ $t('changelog.admin.title') }}</h2>
        <div class="h-4 w-[1px] bg-border" />
        <span class="text-xs font-medium text-muted-foreground">{{ $t('changelog.admin.subtitle') }}</span>
      </div>
      <button
        type="button"
        class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
        @click="handleCreate"
      >
        <Icon name="lucide:plus" size="16" />
        {{ $t('changelog.admin.create') }}
      </button>
    </header>

    <!-- Filter bar -->
    <div class="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-background/30 shrink-0">
      <FilterTag
        v-model="listStatus"
        :label="$t('changelog.admin.filterStatus')"
        icon="lucide:filter"
        :options="statusOptions"
        :removable="false"
      />
      <div class="relative w-full sm:w-64">
        <Icon name="lucide:search" size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="listSearch"
          type="text"
          :placeholder="$t('changelog.admin.searchPlaceholder')"
          class="h-7 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/30"
        >
      </div>
    </div>

    <!-- List -->
    <section class="flex min-h-0 flex-1 flex-col bg-background">
      <div class="min-h-0 flex-1 divide-y divide-border overflow-auto" :class="{ 'opacity-50 pointer-events-none': pending && items.length > 0 }">
        <!-- Loading -->
        <div v-if="pending && items.length === 0" class="flex items-center justify-center py-16">
          <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>

        <ChangelogAdminRow v-for="item in items" :key="item.id" :item="item" @select="handleSelect" />

        <p
          v-if="!pending && items.length === 0"
          class="px-[24px] py-[32px] text-center text-[14px] leading-[22px] text-muted-foreground"
        >
          {{ $t('changelog.admin.noEntries') }}
        </p>
      </div>

      <!-- Pagination -->
      <DashboardPagination
        v-if="total > 0"
        v-model:page="currentPage"
        class="shrink-0"
        :pages="pageNumbers"
        :page-count="pageCount"
        :summary="paginationSummary"
        :short-summary="$t('changelog.admin.entriesShort', { total })"
      />
    </section>
  </div>
</template>
