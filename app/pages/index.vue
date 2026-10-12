<script setup lang="ts">
import {
  applyBoardPostUpdate,
  applyVote,
  boardQuery,
  type PostUpdate,
  resolveBoardId,
  submitPrefillFromQuery,
  voteMethod,
} from '~/lib/pages/posts'

usePageOg({ kind: 'home' })
const portalOrg = usePortalOrg() // for the sr-only <h1> below
const branding = computed(() => portalOrg.value.branding)
const hasWelcome = computed(() => branding.value.welcomeTitle || branding.value.welcomeDescription)

// Auth & login modal
const { data: session } = useAuthSession()
const isSsoSession = computed(
  () => !!(session.value as { session?: { ssoOrgId?: string | null } } | null)?.session?.ssoOrgId,
)
const orgCtx = useOrgContext()
const canEditPortal = computed(() => !!session.value?.user && !!orgCtx.value.role && !isSsoSession.value)
const loginModal = useLoginModal()
const { mayAct, ensureIdentity } = useGuestSession()

// Board store
const boardStore = useBoardStore()
await callOnce(() => boardStore.fetchBoards())
const { boards, boardMap, totalPostCount } = storeToRefs(boardStore)

// Currently selected board and sort order
const route = useRoute()
const router = useRouter()

// `?b=` accepts a board id or its name. Names are matched only once the board
// store has loaded; until then this reads as "no filter".
const activeBoardId = computed(() => resolveBoardId(route.query.b, boards.value))
const sortBy = ref<'top' | 'recent'>('recent')

// Post list
const sort = computed(() => (sortBy.value === 'top' ? 'votes' : 'createdAt'))

const posts = ref<PostListItem[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)
const fetchingPosts = ref(false)

// Loading indicator for board switching (top progress bar)
const { start: startLoading, finish: finishLoading } = useLoadingIndicator()

async function fetchPosts(cursor?: string) {
  const data = await useApiFetch<CursorPaginatedList<PostListItem>>('/api/posts', {
    query: {
      boardId: activeBoardId.value || undefined,
      sort: sort.value,
      pageSize: 10,
      cursor,
    },
  })
  return data
}

// Initial load
const initialData = await fetchPosts()
posts.value = initialData.data
nextCursor.value = initialData.pagination.nextCursor

const searchQuery = ref('')
const searching = ref(false)
const searchActive = computed(() => searchQuery.value.trim().length > 0)
const searchToolbar = ref<{ reset: () => void } | null>(null)
let boardSwitchClearing = false

// Reset list when filters change
watch(activeBoardId, async () => {
  if (searchActive.value) return
  startLoading()
  fetchingPosts.value = true
  try {
    const data = await fetchPosts()
    posts.value = data.data
    nextCursor.value = data.pagination.nextCursor
  } finally {
    finishLoading()
    fetchingPosts.value = false
  }
})

watch(sort, async () => {
  if (searchActive.value) return
  fetchingPosts.value = true
  try {
    const data = await fetchPosts()
    posts.value = data.data
    nextCursor.value = data.pagination.nextCursor
  } finally {
    fetchingPosts.value = false
  }
})

async function refreshPosts() {
  const data = await fetchPosts()
  posts.value = data.data
  nextCursor.value = data.pagination.nextCursor
}

watch(searchQuery, async () => {
  const q = searchQuery.value.trim()
  if (!q) {
    if (boardSwitchClearing) {
      boardSwitchClearing = false
      return
    }
    await refreshPosts()
    return
  }
  searching.value = true
  try {
    const res = await useApiFetch<{ data: PostListItem[] }>('/api/posts/search', { query: { q } })
    posts.value = res.data
    nextCursor.value = null // search returns a flat capped set — no "load more"
  } finally {
    searching.value = false
  }
})

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const data = await fetchPosts(nextCursor.value)
    posts.value.push(...data.data)
    nextCursor.value = data.pagination.nextCursor
  } finally {
    loadingMore.value = false
  }
}

function resetSearchToolbar() {
  searchToolbar.value?.reset()
}

// Switch board
async function selectBoard(boardId: string | null) {
  const wasCommitted = searchActive.value
  const refreshAfter = wasCommitted && activeBoardId.value === boardId
  resetSearchToolbar()
  if (wasCommitted) {
    boardSwitchClearing = true
    searchQuery.value = ''
  }
  router.push({ query: boardQuery(boardId) })
  if (refreshAfter) await refreshPosts()
}

// Status configuration (centralized)

// Modal controls
const showSubmit = ref(false)
const { showDetail, detailSlug, openPostDetail } = usePostDetailModal()

// The composer opens before any identity exists; a guest is only minted when the
// draft is actually submitted.
const canOpenSubmit = computed(() => mayAct('allowPost'))
function openSubmit() {
  if (!canOpenSubmit.value) return loginModal.open()
  showSubmit.value = true
}

// Pre-filled submit links: /?new=1&title=...&body=...&b=...
// This is the one entry point that opens the form to signed-out visitors — they
// arrive holding a draft, so making them sign in first would throw it away.
// Caps mirror the form's own limits; over-long values are truncated rather than
// rejected, since a broken link should still get the reporter to a usable form.
const submitPrefill = ref<{ title?: string; body?: string }>()

// Strips the one-shot params once read: otherwise a refresh replays the draft,
// and sharing the current URL hands your draft to someone else.
onMounted(() => {
  const opened = submitPrefillFromQuery(route.query)
  if (!opened) return
  submitPrefill.value = opened.prefill
  showSubmit.value = true
  router.replace({ query: opened.query as typeof route.query })
})

// Local update handlers
function onPostUpdated(updated: PostUpdate) {
  // Board changed: the sidebar's per-board counts (served from the board store) are now stale.
  if (applyBoardPostUpdate(posts.value, updated, activeBoardId.value)) void boardStore.fetchBoards()
}

function onPostDeleted(postId: string) {
  const idx = posts.value.findIndex((p) => p.id === postId)
  if (idx !== -1) posts.value.splice(idx, 1)
  // A deleted post drops its board's count (and the total) → refresh the store.
  void boardStore.fetchBoards()
}

// Vote / unvote on list items
async function handleVote(post: PostListItem) {
  if (!(await ensureIdentity('allowVote'))) return
  const wasVoted = post.hasVoted
  applyVote(post, !wasVoted)
  try {
    await useApiFetch(`/api/posts/${post.id}/vote`, { method: voteMethod(wasVoted) })
  } catch {
    applyVote(post, wasVoted)
  }
}
</script>

<template>
  <!-- Sr-only H1: the board layout has no visible page title, but SEO needs one. -->
  <h1 class="sr-only">{{ portalOrg.name }} Feedback</h1>

  <!-- Sidebar: Boards -->
  <aside class="w-full md:w-[280px] shrink-0 space-y-8">
    <div class="space-y-4">
      <div class="font-heading text-lg font-bold mb-4 md:mb-4 hidden md:block">{{ $t('board.boards') }}</div>

      <BoardNavList :boards="boards" :active-board-id="activeBoardId" :total-post-count="totalPostCount" @select="selectBoard" />

      <!-- Keep "Powered by FeedLog" as one inline run so the flex gap only spaces
           the icon (a gap between the text node and the brand span would read as a
           stray space). Quiet prefix + emphasized brand give the badge hierarchy. -->
      <a
        href="https://feedlog.ai"
        target="_blank"
        rel="noreferrer"
        class="group hidden md:inline-flex items-center gap-1.5 px-4 pt-2 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        <Icon name="lucide:zap" size="12" class="opacity-60 transition-opacity group-hover:opacity-100" />
        <span>{{ $t('board.poweredBy') }}<span class="font-semibold text-foreground/75 transition-colors group-hover:text-foreground">FeedLog</span></span>
      </a>
    </div>
  </aside>

  <!-- Main content: Feedback area -->
  <section class="flex-1 min-w-0 flex flex-col gap-6">
    <PortalWelcomeBlock
      v-if="hasWelcome"
      :title="branding.welcomeTitle"
      :description="branding.welcomeDescription"
      :editable="canEditPortal"
    />

    <!-- Header row -->
    <BoardSearchToolbar
      ref="searchToolbar"
      v-model="searchQuery"
      v-model:sort="sortBy"
      @new-request="openSubmit()"
    />

    <!-- Post list with loading state -->
    <div :class="{ 'opacity-50 pointer-events-none': fetchingPosts || searching }" class="transition-opacity duration-200">

    <!-- Empty state -->
    <div v-if="posts.length === 0" class="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <!-- Search yielded nothing: nudge toward raising it (duplicate-prevention payoff) -->
      <template v-if="searchActive">
        <Icon name="lucide:search-x" size="48" class="mb-4 opacity-50" />
        <p class="text-lg font-medium">{{ $t('board.noMatches', { query: searchQuery.trim() }) }}</p>
        <p class="fl-empty__hint">{{ $t('board.noMatchesHint') }}</p>
        <Button
          class="h-10 px-4 rounded-lg text-[15px] font-heading font-semibold"
          data-fdl-action="feedback_composer_open"
          data-fdl-source="empty-state"
          @click="openSubmit()"
        >
          <Icon name="lucide:plus" size="18" />
          {{ $t('board.newRequest') }}
        </Button>
      </template>
      <template v-else>
        <Icon name="lucide:inbox" size="48" class="mb-4 opacity-50" />
        <p class="text-lg font-medium">{{ $t('board.noFeedback') }}</p>
      </template>
    </div>

    <!-- Feedback card list -->
    <div v-else class="flex flex-col gap-4">
      <BoardPostCard
        v-for="p in posts"
        :key="p.id"
        :post="p"
        :board-name="boardMap.get(p.boardId ?? '')"
        @open="openPostDetail"
        @vote="handleVote"
      />
    </div>

    </div>

    <!-- Load More -->
    <div v-if="nextCursor" class="flex justify-center mt-6">
      <button
        class="px-6 py-2.5 rounded-full border border-border text-sm font-heading font-semibold hover:border-primary hover:text-primary transition-colors bg-card shadow-warm disabled:opacity-50"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? $t('board.loading') : $t('board.loadMore') }}
      </button>
    </div>
  </section>

  <!-- Post detail modal -->
  <PostDetailModal v-model:open="showDetail" :slug="detailSlug" @updated="onPostUpdated" @deleted="onPostDeleted" />

  <!-- Submit feedback modal -->
  <SubmitModal
    v-model:open="showSubmit"
    :default-board-id="activeBoardId ?? undefined"
    :prefill="submitPrefill"
    @created="refreshPosts()"
  />
</template>

<style scoped>
.fl-empty__hint {
  font-size: 14px;
  margin: 4px 0 20px;
  color: var(--muted-foreground);
}
</style>
