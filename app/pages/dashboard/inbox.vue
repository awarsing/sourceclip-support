<script setup lang="ts">
import { toast } from 'vue-sonner'
import InboxCustomerDetails from '#layers/feedlog/app/components/inbox/CustomerDetails.vue'
import type { Content } from '#layers/feedlog/shared/agent/content'
import type { EmailResult, InboxCommandResult, InboxDetail } from '#layers/feedlog/shared/inbox/types'
import {
  appendPage,
  buildReplyContent,
  commandBlocked,
  commandEndpoint,
  commandPayload,
  type DeliveryMode,
  detailQuery,
  eachUntilStopped,
  emailRetryEndpoint,
  type InboxFilters,
  type InboxRow,
  insertStaffItem,
  isScrolledToEnd,
  listQuery,
  mergeById,
  mergeDetail,
  type PendingRequest,
  pendingRequest,
  restoreScroll,
  scrollState,
  scrollToEnd,
  statusHint as statusHintText,
  uploadBody,
  uploadRejection,
  visibleTimelineItems,
} from '~/lib/pages/inbox'
import { errorStatus } from '~/lib/form-errors'

interface CommandContext {
  id: string
  action: string
  version: number
  content: Content
  body: Record<string, unknown>
}
interface FeedbackRow {
  id: string
  slug: string
  title: string
  status: string
}
interface ListPage {
  items: InboxRow[]
  nextCursor: string | null
}

definePageMeta({ layout: 'dashboard', middleware: 'admin' })
const { t, locale } = useI18n()
const { data: session } = useAuthSession()
const { confirm } = useConfirmDialog()
const route = useRoute()
const { canModerate } = usePermission(
  computed(() => undefined),
  'post',
)
const { refresh: refreshBadge, isUnread, markRead } = useInboxBadge()
const currentUser = computed(() => session.value?.user)
const searchOpen = ref(false)
const timelineView = ref<{ el: HTMLElement | null } | null>(null)
const composer = ref<{ focus: () => void } | null>(null)
const draftImages = reactive<Record<string, { key: string }[]>>({})
const uploadCounts = reactive<Record<string, number>>({})
const drafts = reactive<Record<string, string>>({})
const deliveryModes = reactive<Record<string, DeliveryMode>>({})
const emailSending = reactive<Record<string, boolean>>({})
const emailResults = reactive<Record<string, EmailResult>>({})
const feedbackSlug = ref<string | null>(null)
const feedbackOpen = ref(false)
const rows = ref<InboxRow[]>([])
const nextCursor = ref<string | null>(null)
const filters = reactive<InboxFilters>({ q: '', status: 'open', priority: 'all', sort: 'newest' })
const selected = ref<string | null>(null)
const detail = ref<InboxDetail | null>(null)
const error = ref('')
const loading = ref(true)
const sending = ref(false)
const activeAction = ref<string | null>(null)
const showDetails = ref(true)
const drawer = ref(false)
const feedbacks = ref<FeedbackRow[]>([])
const feedbackPage = ref(0)
const feedbackTotal = ref(0)
const wide = ref(false)
const pending = new Map<string, PendingRequest>()
let commandQueue: Promise<void> = Promise.resolve()
let listVersion = 0
let detailVersion = 0
let polling: ReturnType<typeof setInterval> | undefined
let media: MediaQueryList | undefined
let pollingBusy = false

const images = computed(() => (selected.value ? draftImages[selected.value] || [] : []))
const uploading = computed(() => !!selected.value && !!uploadCounts[selected.value])
const draft = computed({
  get: () => (selected.value ? drafts[selected.value] || '' : ''),
  set: (value) => {
    if (selected.value) drafts[selected.value] = value
  },
})
const deliveryMode = computed({
  get: () => (selected.value ? (deliveryModes[selected.value] ?? 'auto') : 'auto'),
  set: (value: DeliveryMode) => {
    if (selected.value) deliveryModes[selected.value] = value
  },
})
const sendable = computed(() => !!draft.value.trim() || images.value.length > 0)
const hasFilters = computed(() => !!filters.q.trim() || filters.status !== 'all' || filters.priority !== 'all')
const visibleItems = computed(() => visibleTimelineItems(detail.value?.items))
const busy = computed(() => sending.value || activeAction.value !== null)
const date = (value: string | null) => (value ? new Date(value).toLocaleString(locale.value) : '')
const canReply = computed(() => !!detail.value && ['open', 'pending'].includes(detail.value.conversation.status))
const isAiHandling = computed(() => detail.value?.conversation.status === 'ai_handling')
const canClose = computed(() => !!detail.value && detail.value.conversation.status !== 'closed')
const replyReady = computed(() => canReply.value && sendable.value && !uploading.value && !sending.value)
const statusHint = computed(() => statusHintText(detail.value?.conversation, t, date))
const detailsShown = computed(() => (wide.value && showDetails.value) || drawer.value)
const showAside = computed(() => !!detail.value && wide.value && showDetails.value)
const showComposer = computed(() => canReply.value || isAiHandling.value)
const pollReady = computed(() => !busy.value && !loading.value && !!selected.value && !!detail.value)
const customerDetails = computed(() => ({
  feedbacks: feedbacks.value,
  busy: activeAction.value === 'set_priority',
  hasMore: feedbacks.value.length < feedbackTotal.value,
}))

function openFeedback(slug: string) {
  feedbackSlug.value = slug
  feedbackOpen.value = true
}
function timelineEl() {
  return timelineView.value?.el ?? null
}
function isCurrentDetail(id: string | null, version: number) {
  return id === selected.value && version === detailVersion
}

async function refreshList(more = false) {
  const version = ++listVersion
  loading.value = true
  error.value = ''
  const data = await useApiFetch<ListPage>('/api/admin/inbox/conversations', {
    query: listQuery(filters, more ? nextCursor.value : null),
  }).catch(() => null)
  if (version !== listVersion) return
  loading.value = false
  if (data) applyListPage(data, more)
  else error.value = t('inbox.loadFailed')
}
function applyListPage(data: ListPage, more: boolean) {
  rows.value = more ? mergeById(rows.value, data.items) : data.items
  nextCursor.value = data.nextCursor
  void refreshBadge()
}
async function loadDetail(id: string, older = false, initial = false) {
  const version = detailVersion
  const data = await useApiFetch<InboxDetail>(`/api/admin/inbox/conversations/${id}`, {
    query: detailQuery(detail.value, older, initial),
  })
  if (!isCurrentDetail(id, version)) return
  Object.assign(emailResults, data.emails)
  const before = scrollState(timelineEl())
  const next = mergeDetail(detail.value, data, older, initial)
  if (!next) return
  detail.value = next
  await nextTick()
  restoreScroll(timelineEl(), before, older, initial)
  if (!older) reportRead()
}
function reportRead() {
  const id = selected.value
  if (id && detail.value && timelineRead()) markRead(id, detail.value.nextAfterSeq)
}
function timelineRead() {
  return !feedbackOpen.value && !document.hidden && isScrolledToEnd(timelineEl())
}
async function loadFeedback(more = false) {
  const id = selected.value
  if (!id) return
  const page = more ? feedbackPage.value + 1 : 1
  const data = await useApiFetch<{ data: FeedbackRow[]; pagination: { total: number } }>('/api/admin/posts', {
    query: { sourceConversationId: id, merged: 'all', page, pageSize: 20, sort: 'createdAt', order: 'desc' },
  })
  if (id !== selected.value) return
  feedbacks.value = appendPage(feedbacks.value, data.data, more)
  feedbackPage.value = page
  feedbackTotal.value = data.pagination.total
}
function clearSelection() {
  selected.value = null
  detail.value = null
  detailVersion++
}

async function open(id: string) {
  detailVersion++
  selected.value = id
  detail.value = null
  feedbacks.value = []
  feedbackTotal.value = 0
  showDetails.value = true
  error.value = ''
  try {
    await Promise.all([loadDetail(id, false, true), loadFeedback()])
  } catch {
    if (id === selected.value) error.value = t('inbox.loadFailed')
  }
}
function commandRunning(action: string) {
  return action === 'reply' ? sending.value : activeAction.value !== null
}
function setCommandRunning(action: string, running: boolean) {
  if (action === 'reply') sending.value = running
  else activeAction.value = running ? action : null
}
async function command(action: string, extra: Record<string, unknown> = {}) {
  if (commandRunning(action)) return
  const id = selected.value
  const version = detailVersion
  setCommandRunning(action, true)
  const previous = commandQueue
  let release!: () => void
  commandQueue = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    // Serialize writes so the next command uses the sequence returned by the previous one.
    await previous
    if (isCurrentDetail(id, version)) await executeCommand(action, extra)
  } finally {
    setCommandRunning(action, false)
    release()
  }
}
function commandContext(action: string, extra: Record<string, unknown>): CommandContext | null {
  const gate = {
    hasDetail: !!detail.value,
    selected: selected.value,
    canReply: canReply.value,
    sendable: sendable.value,
    uploading: uploading.value,
  }
  if (commandBlocked(action, gate)) return null
  const id = selected.value!
  const content = buildReplyContent(draft.value, images.value)
  const payload = commandPayload(action, extra, deliveryMode.value, content)
  const request = pendingRequest(pending, id, [action, payload], detail.value!.conversation.lastSeq)
  const body = { ...payload, requestId: request.requestId, expectedLastSeq: request.expectedLastSeq }
  return { id, action, version: detailVersion, content, body }
}
async function executeCommand(action: string, extra: Record<string, unknown>) {
  const context = commandContext(action, extra)
  if (!context) return
  error.value = ''
  try {
    const result = await useApiFetch<InboxCommandResult>(commandEndpoint(context.id, action), {
      method: 'POST',
      retry: 0,
      body: context.body,
    })
    commandSucceeded(context, result)
  } catch (e) {
    await commandFailed(context.id, e)
  }
}
function commandSucceeded(context: CommandContext, result: InboxCommandResult) {
  pending.delete(context.id)
  syncConversation(context.id, result.conversation)
  if (context.action === 'reply') applyReply(context, result)
  void refreshBadge()
  if (context.id === selected.value) reloadDetail(context)
}
function syncConversation(id: string, conversation: InboxCommandResult['conversation']) {
  const row = rows.value.find((row) => row.id === id)
  if (row) Object.assign(row, conversation)
  if (id === selected.value && detail.value) detail.value.conversation = conversation
}
function applyReply(context: CommandContext, result: InboxCommandResult) {
  drafts[context.id] = ''
  draftImages[context.id] = []
  if (result.email) emailResults[result.item.id] = result.email
  if (!isCurrentDetail(context.id, context.version) || !detail.value) return
  insertStaffItem(detail.value.items, result.item, context.content, currentUser.value)
  sending.value = false
  void nextTick(() => focusComposer(context))
}
function focusComposer(context: CommandContext) {
  if (!isCurrentDetail(context.id, context.version) || sending.value) return
  composer.value?.focus()
  scrollToEnd(timelineEl())
}
function reloadDetail(context: CommandContext) {
  void loadDetail(context.id).catch(() => {
    if (isCurrentDetail(context.id, context.version)) error.value = t('inbox.loadFailed')
  })
}
async function commandFailed(id: string, e: unknown) {
  if (errorStatus(e) !== 409) {
    toast.error(t('inbox.operationFailed'))
    return
  }
  pending.delete(id)
  toast.error(t('inbox.conflict'))
  if (id === selected.value) await loadDetail(id).catch(() => {})
}
async function retryEmail(itemId: string) {
  const conversationId = selected.value
  if (!conversationId || !emailResults[itemId]?.canRetry) return
  emailResults[itemId]!.canRetry = false
  emailSending[itemId] = true
  emailResults[itemId] = await useApiFetch<{ email: EmailResult }>(emailRetryEndpoint(conversationId, itemId), {
    method: 'POST',
    body: {},
    retry: 0,
  }).then(
    (result) => result.email,
    (): EmailResult => ({ status: 'failed', canRetry: false }),
  )
  emailSending[itemId] = false
}
async function closeConversation() {
  const id = selected.value
  const confirmed = await confirm({
    title: t('inbox.close'),
    description: t('inbox.confirmClose'),
    confirmText: t('inbox.close'),
    cancelText: t('inbox.cancel'),
  })
  if (confirmed && selected.value === id) await command('close')
}
function resetFilters() {
  filters.q = ''
  filters.status = 'all'
  filters.priority = 'all'
  filters.sort = 'newest'
  void refreshList()
}
function closeSearch() {
  searchOpen.value = false
  filters.q = ''
  void refreshList()
}
function imageCount(id: string) {
  return draftImages[id]?.length ?? 0
}
function canUpload(files: File[]) {
  return !sending.value && canReply.value && files.length > 0
}
async function uploadFiles(files: File[]) {
  const id = selected.value
  if (!id || !canUpload(files)) return
  uploadCounts[id] = (uploadCounts[id] || 0) + 1
  await eachUntilStopped(files, (file) => uploadOne(id, file))
  uploadCounts[id]!--
}
async function uploadOne(id: string, file: File) {
  const rejection = uploadRejection(file, imageCount(id))
  if (rejection) {
    toast.error(t(rejection.key, rejection.params))
    return !rejection.stop
  }
  await useApiFetch<{ key: string }>('/api/upload', { method: 'POST', body: uploadBody(file) }).then(
    (result) => {
      ;(draftImages[id] ??= []).push({ key: result.key })
    },
    () => toast.error(t('widget.uploadFailed')),
  )
  return true
}
function removeImage(index: number) {
  draftImages[selected.value!]!.splice(index, 1)
}
function setPriority(priority: string) {
  void command('set_priority', { priority })
}
function toggleDetails() {
  if (wide.value) showDetails.value = !showDetails.value
  else drawer.value = true
}
async function pollDetail() {
  if (document.hidden || pollingBusy || !pollReady.value) return
  pollingBusy = true
  // A failed poll preserves the current view.
  await loadDetail(selected.value!).catch(() => {})
  pollingBusy = false
}
watch(
  () => [filters.status, filters.priority, filters.sort],
  () => void refreshList(),
)
watch(
  () => route.query.conversationId,
  (id) => {
    if (typeof id === 'string' && id !== selected.value) void open(id)
  },
)
const updateWidth = () => {
  wide.value = media?.matches ?? false
}
watch(feedbackOpen, () => {
  void nextTick(reportRead)
})
onMounted(() => {
  media = matchMedia('(min-width: 1280px)')
  updateWidth()
  media.addEventListener('change', updateWidth)
  document.addEventListener('visibilitychange', reportRead)
  if (!canModerate.value) return
  void refreshBadge()
  if (typeof route.query.conversationId === 'string') void open(route.query.conversationId)
  polling = setInterval(pollDetail, 5000)
})
onBeforeUnmount(() => {
  detailVersion++
  listVersion++
  clearInterval(polling)
  media?.removeEventListener('change', updateWidth)
  document.removeEventListener('visibilitychange', reportRead)
})

const { data: initialList, error: initialListError } = await useFetch<ListPage>('/api/admin/inbox/conversations', {
  query: { ...filters },
  immediate: canModerate.value,
})
if (initialList.value) {
  rows.value = initialList.value.items
  nextCursor.value = initialList.value.nextCursor
}
if (initialListError.value) error.value = t('inbox.loadFailed')
loading.value = false
</script>

<template>
  <div v-if="!canModerate" class="p-8">{{ t('inbox.forbidden') }}</div>
  <div v-else class="flex h-full min-h-0 flex-col bg-background" data-inbox>
    <div v-if="error" role="alert" class="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">{{ error }}</div>
    <div class="flex min-h-0 flex-1">
      <InboxListPanel
        v-model:filters="filters"
        v-model:search-open="searchOpen"
        :rows="rows"
        :selected="selected"
        :loading="loading"
        :error="error"
        :next-cursor="nextCursor"
        :has-filters="hasFilters"
        :is-unread="isUnread"
        @refresh="refreshList"
        @open="open"
        @reset-filters="resetFilters"
        @close-search="closeSearch"
      />
      <div v-if="!selected" class="hidden flex-1 place-items-center bg-card p-10 md:grid">
        <div class="max-w-[460px] text-center">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon name="lucide:messages-square" size="26" /></div>
          <p class="text-lg font-bold leading-[26px]">{{ t('inbox.title') }}</p>
          <p class="mt-2 text-sm leading-[22px] text-muted-foreground">{{ t('inbox.select') }}</p>
        </div>
      </div>
      <section v-else-if="detail" class="flex min-w-0 flex-1 flex-col" data-inbox-thread>
        <InboxThreadHeader
          :conversation="detail.conversation"
          :status-hint="statusHint"
          :can-reply="canReply"
          :can-close="canClose"
          :action-busy="activeAction !== null"
          :details-shown="detailsShown"
          @back="clearSelection"
          @command="command"
          @close="closeConversation"
          @toggle-details="toggleDetails"
        />
        <InboxTimeline
          ref="timelineView"
          :items="visibleItems"
          :customer="detail.customer"
          :has-earlier="!!detail.nextBeforeSeq"
          :email-results="emailResults"
          :email-sending="emailSending"
          @scroll="reportRead"
          @earlier="loadDetail(selected!, true)"
          @feedback="openFeedback"
          @retry-email="retryEmail"
        />
        <InboxReplyComposer
          v-if="showComposer"
          ref="composer"
          v-model:draft="draft"
          v-model:delivery-mode="deliveryMode"
          :can-reply="canReply"
          :ai-handling="isAiHandling"
          :sending="sending"
          :uploading="uploading"
          :ready="replyReady"
          :images="images"
          @send="command('reply')"
          @upload="uploadFiles"
          @remove-image="removeImage"
        />
      </section>
      <div v-else role="status" class="flex flex-1 items-center justify-center bg-card py-16">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span class="sr-only">{{ t('inbox.loading') }}</span>
      </div>
      <aside v-if="showAside" class="w-64 shrink-0 overflow-y-auto border-l border-border bg-card 2xl:w-72" data-inbox-details>
        <InboxCustomerDetails v-bind="customerDetails" :customer="detail!.customer" :conversation="detail!.conversation" @priority="setPriority" @feedback="openFeedback" @more="loadFeedback(true)" />
      </aside>
    </div>
    <PostDetailModal v-model:open="feedbackOpen" :slug="feedbackSlug" @updated="loadFeedback()" />
    <InboxDetailsDrawer v-model:open="drawer" v-bind="customerDetails" :detail="detail" @priority="setPriority" @feedback="openFeedback" @more="loadFeedback(true)" />
  </div>
</template>
