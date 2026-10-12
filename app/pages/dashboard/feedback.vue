<script setup lang="ts">
import type { FeedbackFieldDef } from '#layers/feedlog/app/components/dashboard/FeedbackFilterMenu.vue'
import {
  applyFeedbackUpdate,
  compactPageNumbers,
  type FeedbackSort,
  nextSortOrder,
  pageRange,
  parseFeedbackSort,
  type PostUpdate,
  removePost,
} from '~/lib/pages/posts'

definePageMeta({ layout: 'dashboard', middleware: 'admin' })

const boardStore = useBoardStore()
await callOnce(() => boardStore.fetchBoards())
const { boards, boardMap } = storeToRefs(boardStore)
const { t } = useI18n()

// ---- Filter system ----

const { data: authorsData } = await useFetch<{
  data: { id: string; name: string | null; email: string | null; image: string | null }[]
}>('/api/admin/posts/authors')
const authors = computed(() => authorsData.value?.data ?? [])

const fieldDefs = computed<FeedbackFieldDef[]>(() => [
  {
    key: 'status',
    kind: 'enum',
    label: t('dashboard.filter.status'),
    icon: 'lucide:activity',
    options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(statusLabelKey(o.value)), color: o.color })),
  },
  {
    key: 'boardId',
    kind: 'enum',
    label: t('dashboard.filter.board'),
    icon: 'lucide:layers',
    options: [
      ...boards.value.map((b) => ({ value: b.id, label: b.name })),
      { value: 'none', label: t('dashboard.filter.noBoard') },
    ],
  },
  {
    key: 'author',
    kind: 'enum',
    label: t('dashboard.filter.author'),
    icon: 'lucide:user',
    searchable: true,
    options: authors.value.map((a) => ({
      value: a.id,
      label: a.name || a.email || a.id,
      sub: a.email || '',
      image: a.image,
    })),
  },
  {
    key: 'created',
    kind: 'date',
    label: t('dashboard.filter.created'),
    icon: 'lucide:calendar',
    options: [],
  },
  {
    key: 'merged',
    kind: 'single',
    label: t('dashboard.filter.merged'),
    icon: 'lucide:git-merge',
    options: [
      { value: 'canonical_only', label: t('dashboard.feedback.canonicalOnly') },
      { value: 'merged_only', label: t('dashboard.feedback.mergedOnly') },
      { value: 'all', label: t('dashboard.all') },
    ],
  },
])

const route = useRoute()
const conditions = ref<FilterCondition[]>(parseFilterQuery(route.query as Record<string, unknown>))

function clearAllFilters() {
  conditions.value = []
}

const defaultBoardId = computed(() => {
  const v = railValue(conditions.value, 'boardId')
  return v && v !== 'none' ? v : undefined
})

function pickRail(field: EnumFilterField, value: string) {
  conditions.value = toggleRail(conditions.value, field, value)
}

// ---- Sort & Pagination ----
const sortBy = ref<FeedbackSort>(parseFeedbackSort(route.query.sort))
const sortOrder = ref<'asc' | 'desc'>(route.query.order === 'asc' ? 'asc' : 'desc')
const currentPage = ref(Math.max(Number(route.query.page) || 1, 1))
const pageSize = 10

const searchTerm = ref((route.query.q as string) || '')
const searchActive = computed(() => searchTerm.value.length > 0)

watch(
  [conditions, searchTerm],
  () => {
    currentPage.value = 1
  },
  { deep: true },
)

// replaceState, not the router — a push would re-run the route watchers and
// refetch a list we already have.
watch(
  [conditions, searchTerm, sortBy, sortOrder, currentPage],
  () => {
    const qs = serializeFilterQuery(conditions.value, {
      q: searchTerm.value,
      sort: sortBy.value,
      order: sortOrder.value,
      page: currentPage.value,
    })
    window.history.replaceState(window.history.state, '', qs ? `${route.path}?${qs}` : route.path)
  },
  { deep: true },
)

// While searching, route to the additive /search endpoint; otherwise use the
// standard list endpoint. Both return PagePaginatedList<PostListItem>.
const apiUrl = computed(() => (searchActive.value ? '/api/admin/posts/search' : '/api/admin/posts'))

// Fetch data
const {
  data: postsData,
  refresh: refreshPosts,
  status: fetchStatus,
} = await useFetch<PagePaginatedList<PostListItem>>(apiUrl, {
  query: computed(() =>
    filterApiQuery(conditions.value, {
      q: searchTerm.value || undefined,
      sort: sortBy.value,
      order: sortOrder.value,
      page: currentPage.value,
      pageSize,
    }),
  ),
})

const posts = computed(() => postsData.value?.data ?? [])
const pagination = computed(() => postsData.value?.pagination ?? { page: 1, pageSize, total: 0 })
const totalPages = computed(() => Math.ceil(pagination.value.total / pagination.value.pageSize))
const pageNumbers = computed(() => compactPageNumbers(totalPages.value, currentPage.value))
const pending = computed(() => fetchStatus.value === 'pending')
const emptyTitle = computed(() =>
  searchActive.value
    ? t('dashboard.feedback.searchNoMatch', { query: searchTerm.value })
    : t('dashboard.feedback.noResults'),
)
const emptyHint = computed(() =>
  t(searchActive.value ? 'dashboard.feedback.searchNoMatchHint' : 'dashboard.feedback.noResultsHint'),
)
const paginationSummary = computed(() =>
  t('dashboard.feedback.showing', pageRange(pagination.value.page, pagination.value.pageSize, pagination.value.total)),
)

function toggleSort(col: FeedbackSort) {
  sortOrder.value = nextSortOrder(sortBy.value, sortOrder.value, col)
  sortBy.value = col
  currentPage.value = 1
}

const showSubmit = ref(false)
const { showDetail, detailSlug, openPostDetail } = usePostDetailModal()

// Local update handlers
function onPostUpdated(updated: PostUpdate) {
  applyFeedbackUpdate(postsData.value, updated, conditions.value)
}

function onPostDeleted(postId: string) {
  removePost(postsData.value, postId)
}
</script>

<template>
  <!-- Top bar -->
  <header class="h-14 md:h-16 px-4 md:px-6 border-b border-border flex items-center justify-between shrink-0 bg-card backdrop-blur-sm">
    <div class="flex items-center gap-4">
      <h2 class="hidden sm:block font-heading text-lg font-bold">{{ $t('dashboard.feedback.title') }}</h2>
      <div class="hidden md:block h-4 w-[1px] bg-border" />
      <span class="hidden md:block text-xs font-medium text-muted-foreground">{{ $t('dashboard.feedback.subtitle') }}</span>
    </div>
    <div class="flex items-center gap-3">
      <!-- Search: persistent, filters the table in place -->
      <AdminFeedbackSearch v-model="searchTerm" />

      <FeedbackFilterMenu v-model:conditions="conditions" :field-defs="fieldDefs" />

      <!-- Create button -->
      <button
        class="h-9 px-3 sm:px-4 rounded-lg bg-primary text-primary-foreground text-xs font-heading font-bold hover:opacity-90 transition-all flex items-center gap-2 shrink-0"
        :aria-label="$t('dashboard.feedback.create')"
        @click="showSubmit = true"
      >
        <Icon name="lucide:plus" size="16" />
        <span class="hidden sm:inline">{{ $t('dashboard.feedback.create') }}</span>
      </button>
    </div>
  </header>

  <!-- Main content -->
  <div class="flex-1 flex min-h-0">
    <FeedbackQuickFilters
      :conditions="conditions"
      :boards="boards"
      @pick="pickRail"
      @clear="clearAllFilters"
    />
    <div class="flex-1 flex flex-col overflow-hidden bg-card min-w-0">
      <FeedbackActiveFilters v-model:conditions="conditions" :field-defs="fieldDefs" />

      <!-- Data table -->
      <div class="flex-1 overflow-auto" :class="{ 'opacity-50 pointer-events-none': pending && posts.length > 0 }" style="transition: opacity 0.2s ease;">
        <!-- Loading -->
        <div v-if="pending && posts.length === 0" class="flex items-center justify-center py-16">
          <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>

        <!-- Empty state -->
        <div v-else-if="posts.length === 0" class="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Icon :name="searchActive ? 'lucide:search-x' : 'lucide:inbox'" size="48" class="mb-4 opacity-50" />
          <p class="text-lg font-medium">{{ emptyTitle }}</p>
          <p class="text-sm mt-1">{{ emptyHint }}</p>
          <button
            v-if="conditions.length"
            class="mt-4 h-8 px-3 rounded-lg border border-border text-xs font-bold hover:text-primary hover:border-primary transition-colors"
            @click="clearAllFilters"
          >
            {{ $t('dashboard.feedback.clearAllFilters') }}
          </button>
        </div>

        <FeedbackPostTable
          v-else
          :posts="posts"
          :board-map="boardMap"
          :sort-by="sortBy"
          :sort-order="sortOrder"
          @open="openPostDetail"
          @sort="toggleSort"
        />
      </div>

      <DashboardPagination
        v-if="pagination.total > 0"
        v-model:page="currentPage"
        :pages="pageNumbers"
        :page-count="totalPages"
        :summary="paginationSummary"
        :short-summary="$t('dashboard.feedback.entriesShort', { total: pagination.total })"
      />
    </div>
  </div>

  <!-- Modals -->
  <SubmitModal v-model:open="showSubmit" :default-board-id="defaultBoardId" @created="refreshPosts()" />
  <PostDetailModal v-model:open="showDetail" :slug="detailSlug" @updated="onPostUpdated" @deleted="onPostDeleted" />
</template>
