<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { SerializeObject } from 'nitropack/types'
import {
  appendRoadmapPage,
  applyRoadmapUpdate,
  buildRenderList,
  columnHasEntries,
  commitRoadmapMove,
  findInsertIndex,
  findRoadmapPost,
  findRoadmapStatus,
  type RoadmapGhost,
  type RoadmapPendingDrop,
  type RoadmapUpdate,
  removeRoadmapItem,
  roadmapColumnSummary,
  roadmapPageQuery,
} from '~/lib/roadmap-board'

// Component instance with exposed `el` from RoadmapCard
type CardComponentRef = ComponentPublicInstance & { el: HTMLElement }

// API response item type (PostListItem after JSON serialization)
type RoadmapItem = SerializeObject<PostListItem>

const props = defineProps<{
  boardId?: string | null
  editable?: boolean
}>()

const emit = defineEmits<{
  (e: 'open-detail', item: PostListItem): void
  (e: 'add', status: RoadmapStatus): void
}>()

// Define expose before await (Vue requirement)
// Use wrapper functions since the actual implementations are defined after await
const exposed = {
  refresh: () => refresh(),
  updateItem: (updated: RoadmapUpdate) => updateItem(updated),
  removeItem: (postId: string) => removeItem(postId),
}
defineExpose(exposed)

// Ensure board data is loaded (needed by RoadmapCard for board names)
const boardStore = useBoardStore()
await callOnce(() => boardStore.fetchBoards())

const roadmapStatuses = ROADMAP_STATUSES
const { t } = useI18n()

// Fetch roadmap data (deep: true to track nested mutations)
const { data: roadmapData, refresh } = await useFetch('/api/roadmap', {
  deep: true,
  query: computed(() => ({
    boardId: props.boardId || undefined,
  })),
})

// Build columns from API data
const columns = computed(() =>
  roadmapStatuses.map((status) => ({
    id: status,
    label: t(statusLabelKey(status)),
    cssVar: STATUS_CONFIG[status].cssVar,
    ...roadmapColumnSummary(roadmapData.value, status),
  })),
)

// ---- Drag and drop state ----
const draggingPostId = ref<string | null>(null)
const draggingFromStatus = ref<RoadmapStatus | null>(null)
const dropTargetStatus = ref<RoadmapStatus | null>(null)

// Ghost preview: shows where the card will land in the target column (during hover)
const ghostPreview = ref<RoadmapGhost<RoadmapItem> | null>(null)

// Pending drop: ghost with loading indicator while API confirms (after release)
const pendingDrop = ref<RoadmapPendingDrop<RoadmapItem> | null>(null)

// Flat render list for each column (cards + ghost + pending interleaved)
function renderList(column: { id: RoadmapStatus; items: RoadmapItem[] }) {
  return buildRenderList(column.items, column.id, ghostPreview.value, pendingDrop.value)
}

function showsCardList(column: { id: RoadmapStatus; items: RoadmapItem[] }) {
  return columnHasEntries(column.id, column.items, ghostPreview.value, pendingDrop.value)
}

function showsEmptyState(column: { items: RoadmapItem[] }) {
  return !column.items.length && !draggingPostId.value
}

// Marks the hover ghost so showGhostPreview can scroll it into view.
function ghostMarker(entry: { type: string }) {
  return entry.type === 'ghost' ? '' : undefined
}

function cardClass(post: RoadmapItem) {
  return {
    'opacity-40 scale-95': draggingPostId.value === post.id || pendingDrop.value?.postId === post.id,
    'cursor-grab active:cursor-grabbing select-none': props.editable && !pendingDrop.value,
  }
}

function openDetail(post: RoadmapItem) {
  if (!draggingPostId.value && !pendingDrop.value) emit('open-detail', post as unknown as PostListItem)
}

// ---- Drag and drop setup (pragmatic-drag-and-drop) ----
const columnRefs = ref<Record<string, HTMLElement | null>>({})
const cardRefs = ref<Map<string, CardComponentRef>>(new Map())
const cleanupFns: (() => void)[] = []

function setColumnRef(status: string, el: Element | ComponentPublicInstance | null) {
  columnRefs.value[status] = el as HTMLElement | null
}

function setCardRef(id: string, el: Element | ComponentPublicInstance | null) {
  if (props.editable && el) {
    cardRefs.value.set(id, el as CardComponentRef)
  }
  // Never delete on unmount — TransitionGroup leave animation fires setCardRef(id, null)
  // ~150ms after the new component has already set a fresh ref for the same id.
  // Deleting here would remove the valid new ref and break drag registration.
  // Stale entries are harmless: setupDragAndDrop skips them (el null / not in data).
}

// Show ghost preview in target column and scroll to it
function showGhostPreview(targetStatus: RoadmapStatus) {
  const post = findRoadmapPost(roadmapData.value, draggingFromStatus.value, draggingPostId.value)
  if (!post) return

  const index = findInsertIndex(roadmapColumnSummary(roadmapData.value, targetStatus).items, post)

  ghostPreview.value = { status: targetStatus, index, post }

  // Scroll ghost into view after enter animation expands enough for layout
  setTimeout(() => {
    document.querySelector('[data-ghost-preview]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, 100)
}

function clearDropTarget() {
  dropTargetStatus.value = null
  ghostPreview.value = null
}

type DragAdapter = typeof import('@atlaskit/pragmatic-drag-and-drop/element/adapter')
type SetDragPreview =
  typeof import('@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview').setCustomNativeDragPreview

function registerColumns({ dropTargetForElements }: DragAdapter) {
  for (const status of roadmapStatuses) {
    const el = columnRefs.value[status]
    if (!el) continue
    const cleanup = dropTargetForElements({
      element: el,
      getData: () => ({ status }),
      canDrop: ({ source }) => source.data.status !== status,
      onDragEnter: () => {
        dropTargetStatus.value = status
        showGhostPreview(status)
      },
      onDragLeave: () => {
        if (dropTargetStatus.value === status) clearDropTarget()
      },
      onDrop: clearDropTarget,
    })
    cleanupFns.push(cleanup)
  }
}

function renderDragPreview(el: HTMLElement, container: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement
  clone.style.width = `${el.offsetWidth}px`
  clone.style.boxShadow = 'none'
  clone.style.opacity = '0.9'
  // Card surface token, not a fixed white, so the drag preview matches dark mode.
  clone.style.background = 'var(--card)'
  clone.style.borderRadius = '12px'
  clone.style.border = '2px solid var(--primary)'
  container.appendChild(clone)
}

function registerCard(
  { draggable }: DragAdapter,
  setCustomNativeDragPreview: SetDragPreview,
  id: string,
  el: HTMLElement,
) {
  const cardStatus = findRoadmapStatus(roadmapData.value, id)
  if (!cardStatus) return
  const cleanup = draggable({
    element: el,
    getInitialData: () => ({ postId: id, status: cardStatus }),
    onGenerateDragPreview: ({ nativeSetDragImage, location }) => {
      // Calculate mouse offset relative to the card element
      const rect = el.getBoundingClientRect()
      const offset = { x: location.current.input.clientX - rect.left, y: location.current.input.clientY - rect.top }
      setCustomNativeDragPreview({
        nativeSetDragImage,
        getOffset: () => offset,
        render: ({ container }) => renderDragPreview(el, container),
      })
    },
    onDragStart: () => {
      draggingPostId.value = id
      draggingFromStatus.value = cardStatus
    },
    onDrop: ({ location }) => {
      const target = location.current.dropTargets[0]
      if (target) handleDrop(id, cardStatus, target.data.status as RoadmapStatus)
      draggingPostId.value = null
      draggingFromStatus.value = null
      clearDropTarget()
    },
  })
  cleanupFns.push(cleanup)
}

function registerCards(adapter: DragAdapter, setCustomNativeDragPreview: SetDragPreview) {
  for (const [id, componentRef] of cardRefs.value) {
    if (componentRef.el) registerCard(adapter, setCustomNativeDragPreview, id, componentRef.el)
  }
}

function runCleanups() {
  for (const fn of cleanupFns) fn()
  cleanupFns.length = 0
}

async function setupDragAndDrop() {
  if (!props.editable || !import.meta.client) return
  runCleanups()

  const adapter = await import('@atlaskit/pragmatic-drag-and-drop/element/adapter')
  const { setCustomNativeDragPreview } = await import(
    '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
  )

  registerColumns(adapter)
  registerCards(adapter, setCustomNativeDragPreview)
}

watch(
  () => columns.value.map((c) => c.items.length),
  () => {
    nextTick(() => setupDragAndDrop())
  },
)

onMounted(() => {
  nextTick(() => setupDragAndDrop())
})

onUnmounted(runCleanups)

// ---- Handle drop (pessimistic update) ----
// Dragging never notifies: it is a bulk triage gesture, so the status moves
// silently. Mailing is done from the post detail sidebar.
function handleDrop(postId: string, fromStatus: RoadmapStatus, toStatus: RoadmapStatus) {
  // Clear hover ghost immediately to avoid two ghosts in the same frame
  clearDropTarget()

  if (fromStatus === toStatus) return
  const item = findRoadmapPost(roadmapData.value, fromStatus, postId)
  if (!item) return

  const index = findInsertIndex(roadmapColumnSummary(roadmapData.value, toStatus).items, item)
  pendingDrop.value = { postId, post: { ...item }, fromStatus, toStatus, index }
  void writeDrop()
}

async function writeDrop() {
  const drop = pendingDrop.value
  const data = roadmapData.value
  if (!drop || !data) return

  const MIN_LOADING_MS = 400
  try {
    await Promise.all([
      useApiFetch(`/api/admin/posts/${drop.postId}`, {
        method: 'PATCH',
        body: { status: drop.toStatus, notify: false },
      }),
      new Promise((r) => setTimeout(r, MIN_LOADING_MS)),
    ])
    // Pending becomes the real card under the same key, then the source card leaves.
    commitRoadmapMove(data, drop, () => {
      pendingDrop.value = null
    })
  } catch {
    // Failure: drop the ghost; the source card never moved.
    pendingDrop.value = null
  }
}

// ---- Load more with dedup ----
const loadingMore = ref<RoadmapStatus | null>(null)

async function loadMore(status: RoadmapStatus) {
  const cursor = roadmapColumnSummary(roadmapData.value, status).nextCursor
  if (!cursor || loadingMore.value) return

  loadingMore.value = status
  try {
    const moreData = await useApiFetch<CursorPaginatedList<RoadmapItem>>('/api/posts', {
      query: roadmapPageQuery(status, cursor, props.boardId),
    })
    appendRoadmapPage(roadmapData.value?.[status], moreData)
  } finally {
    loadingMore.value = null
  }
}

// ---- Local update methods ----

function updateItem(updated: RoadmapUpdate) {
  if (roadmapData.value) applyRoadmapUpdate(roadmapData.value, updated, props.boardId)
}

function removeItem(postId: string) {
  if (roadmapData.value) removeRoadmapItem(roadmapData.value, postId)
}
</script>

<template>
  <div class="flex gap-6 h-full">
    <div
      v-for="col in columns"
      :key="col.id"
      :ref="(el: Element | ComponentPublicInstance | null) => setColumnRef(col.id, el)"
      :data-status="col.id"
      class="flex-1 flex flex-col min-w-[260px] md:min-w-0 kanban-column transition-all duration-200"
      :class="{
        'ring-2 ring-primary/50': dropTargetStatus === col.id,
      }"
    >
      <RoadmapColumnHeader
        :label="col.label"
        :css-var="col.cssVar"
        :total="col.total"
        :editable="editable"
        @add="emit('add', col.id)"
      />

      <!-- Card list -->
      <div v-if="showsCardList(col)" class="kanban-scroll flex-1 overflow-y-auto pr-1">
        <TransitionGroup
          name="kanban-card"
          tag="div"
          class="space-y-4"
        >
          <div
            v-for="entry in renderList(col)"
            :key="entry.key"
            :data-ghost-preview="ghostMarker(entry)"
          >
            <RoadmapPlaceholderCard v-if="entry.type !== 'card'" :post="entry.post" :pending="entry.type === 'pending'" />

            <!-- Real card -->
            <RoadmapCard
              v-else
              :ref="(el: Element | ComponentPublicInstance | null) => setCardRef(entry.post.id, el)"
              :post="entry.post"
              :class="cardClass(entry.post)"
              @click="openDetail(entry.post)"
            />
          </div>
        </TransitionGroup>

        <RoadmapLoadMore :cursor="col.nextCursor" :loading="loadingMore === col.id" @load="loadMore(col.id)" />
      </div>

      <RoadmapColumnEmpty
        v-if="showsEmptyState(col)"
        :label="col.label"
        :editable="editable"
        @add="emit('add', col.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.kanban-column {
  /* Subtle panel that derives from the foreground so it reads as a recessed
     column in both light (faint dark wash) and dark (faint light wash) modes —
     a fixed light beige stayed light against the dark surface. */
  background-color: color-mix(in oklab, var(--foreground) 5%, transparent);
  border-radius: 16px;
  padding: 12px;
}

.kanban-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--foreground) 22%, transparent) transparent;
}
.kanban-scroll::-webkit-scrollbar {
  width: 6px;
}
.kanban-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.kanban-scroll::-webkit-scrollbar-thumb {
  background-color: color-mix(in oklab, var(--foreground) 22%, transparent);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.kanban-scroll::-webkit-scrollbar-thumb:hover {
  background-color: color-mix(in oklab, var(--foreground) 34%, transparent);
  border-width: 3px;
}

/* Card enter: expand from 0 height + fade in */
.kanban-card-enter-active {
  transition: all 0.15s ease;
  overflow: hidden;
}
.kanban-card-enter-from {
  opacity: 0;
  max-height: 0;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
.kanban-card-enter-to {
  opacity: 1;
  max-height: 200px;
}

/* Card leave: collapse to 0 height + fade out */
.kanban-card-leave-active {
  transition: all 0.15s ease;
  overflow: hidden;
}
.kanban-card-leave-from {
  opacity: 1;
  max-height: 200px;
}
.kanban-card-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

/* Other cards move smoothly when items are added/removed */
.kanban-card-move {
  transition: transform 0.15s ease;
}
</style>
