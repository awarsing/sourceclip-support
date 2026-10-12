<script setup lang="ts">
import type { ChatInput, Detail, Item, Run } from '#layers/feedlog/shared/agent/content'
import { readAgentEvents } from '#layers/feedlog/shared/agent/sse'
import { widgetEmbedKey } from '#layers/feedlog/app/composables/useWidgetEmbed'
import { widgetProtocolKey } from '#layers/feedlog/app/composables/useWidgetProtocol'
import type { WidgetChatResume } from '#layers/feedlog/app/composables/useWidgetResume'
import {
  MAX_UPLOAD_MB,
  applyHistoryPage,
  applyPollPage,
  buildSendInput,
  canRetryChat,
  chatFailureText,
  composerFromMessage,
  exceedsUploadLimit,
  firstLoadedSeq,
  handoffNoticeItem,
  hasItem,
  historyPath,
  isAgentRunning,
  isDeliveredSend,
  isJsonResponse,
  isUnauthorized,
  latestSeq,
  messageAuthorLabel,
  needsOlderHistory,
  optimisticCustomerItem,
  parseSavedPending,
  retryInput,
  reuseIdenticalSend,
  sendVerdict,
  shouldPoll,
  shouldReportRead,
  type ChatAttachment,
  type SavedPending,
} from './-chat-logic'

const props = defineProps<{
  productName: string
  openId: string | null
  resumeState?: WidgetChatResume | null
}>()
const emit = defineEmits<{
  authRequired: []
  filed: []
  replied: [id: string, lastSeq: number]
  started: [id: string]
  busy: [value: boolean]
  stateChange: [state: WidgetChatResume]
}>()
const { t } = useI18n()
const messageTime = useConversationTime()
const messageAuthor = (item: Item) => messageAuthorLabel(item, t)
const { user, widgetFetch, widgetRequest, ensureIdentity } = inject(widgetEmbedKey)!
const protocol = inject(widgetProtocolKey, null)
const apiBase = '/api/widget/conversations'
const conversationId = ref<string | null>(null)
const items = ref<Item[]>([])
const runs = ref<Run[]>([])
const nextBeforeSeq = ref<number | null>(null)
const draft = ref('')
const sending = ref(false)
const awaitingRun = ref(false)
const loadingThread = ref(false)
const transient = ref('')
const failure = ref('')
const pending = ref<ChatInput | null>(null)
const articleSlug = ref<string | null>(null)
const observedSeq = ref(0)
let chatActive = true
function reportRead(id: string) {
  const state = { active: chatActive, hidden: document.hidden, articleOpen: !!articleSlug.value }
  if (shouldReportRead({ ...state, observedSeq: observedSeq.value })) emit('replied', id, observedSeq.value)
}
const handlingMode = ref<'ai' | 'human' | 'closed'>('ai')
const bodyEl = ref<HTMLElement | null>(null)
const latestRun = computed(() => runs.value.at(-1))
const busy = computed(() => sending.value || isAgentRunning(handlingMode.value, latestRun.value))
const canRetry = computed(() => canRetryChat(pending.value, handlingMode.value, items.value.at(-1), latestRun.value))
const thinking = computed(() => handlingMode.value === 'ai' && busy.value && !awaitingRun.value)
const failureText = computed(() => chatFailureText(failure.value, sending.value, handlingMode.value, latestRun.value))
const showRefresh = computed(() => latestRun.value?.status === 'running' && !sending.value)
const showGreeting = computed(() => !items.value.length && !loadingThread.value)
const resumeKey = 'feedlog:widget:agent-pending'
let version = 0

function savePending() {
  try {
    if (pending.value)
      sessionStorage.setItem(
        resumeKey,
        JSON.stringify({ owner: user.value?.id, conversationId: conversationId.value, pending: pending.value }),
      )
    else sessionStorage.removeItem(resumeKey)
  } catch {
    /* The request can still be retried while this frame remains open. */
  }
}
const attachments = ref<ChatAttachment[]>([])
const pendingUploads = ref(0)
const uploading = computed(() => pendingUploads.value > 0)
const composerBlocked = computed(() => busy.value || uploading.value)
watch(
  () => composerBlocked.value || loadingThread.value,
  (value) => emit('busy', value),
  { immediate: true },
)
const uploadError = ref('')
const articleScrollTop = ref(0)
let scrollTop = 0

function reportState() {
  emit('stateChange', {
    conversationId: conversationId.value,
    draft: draft.value,
    attachments: attachments.value.map((file) => ({ ...file })),
    pending: pending.value,
    articleSlug: articleSlug.value,
    articleScrollTop: articleScrollTop.value,
    firstSeq: firstLoadedSeq(items.value),
    scrollTop,
  })
}
function rememberScroll() {
  if (bodyEl.value?.clientHeight) scrollTop = bodyEl.value.scrollTop
  reportState()
}
watch([draft, attachments, conversationId, pending, articleSlug, articleScrollTop, items], reportState, { deep: true })

const isCurrent = (current: number) => current === version

async function restoreState(state: WidgetChatResume) {
  const current = version + 1
  await openConversation(state.conversationId)
  if (!isCurrent(current)) return
  // Restore the loaded history range before applying its scroll offset.
  if (!(await backfillHistory(state.firstSeq, current))) return
  applyRestoredDraft(state)
  await nextTick()
  await document.fonts.ready
  if (isCurrent(current)) restoreScroll(state.scrollTop)
}
async function backfillHistory(firstSeq: number | null, current: number) {
  while (needsOlderHistory(firstSeq, nextBeforeSeq.value, items.value)) {
    try {
      await loadHistory(true)
    } catch {
      break
    }
    if (!isCurrent(current)) return false
  }
  return true
}
function applyRestoredDraft(state: WidgetChatResume) {
  draft.value = state.draft
  attachments.value = state.attachments.map((file) => ({ ...file }))
  pending.value = state.pending
  confirmIfDelivered(pending.value)
  savePending()
  articleScrollTop.value = state.articleScrollTop
  articleSlug.value = state.articleSlug
}
function confirmIfDelivered(request: ChatInput | null) {
  if (isDeliveredSend(request, items.value)) confirmInput(request)
}
function restoreScroll(top: number) {
  scrollTop = top
  if (bodyEl.value) bodyEl.value.scrollTop = scrollTop
  reportState()
}
watch(
  () => props.resumeState,
  (state) => {
    if (state) void restoreState(state)
  },
)

async function uploadFiles(files: File[]) {
  if (!files.length || awaitingRun.value) return
  // An attachment is a write like any other, so it is enough on its own to earn
  // a guest identity.
  if (await ensureIdentity()) await uploadEach(files)
  else uploadError.value = t('widget.uploadFailed')
}
async function uploadEach(files: File[]) {
  uploadError.value = ''
  pendingUploads.value++
  for (const file of files) if (!(await uploadOne(file))) break
  pendingUploads.value--
}
/** Uploads one file; false stops the batch. */
async function uploadOne(file: File) {
  if (exceedsUploadLimit(file.size)) {
    uploadError.value = t('widget.uploadTooLarge', { size: MAX_UPLOAD_MB })
    return true
  }
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await widgetFetch<{ key: string }>('/api/upload', { method: 'POST', body: form })
    attachments.value.push({ key: res.key, name: file.name })
    return true
  } catch (err) {
    return handleUploadError(err)
  }
}
function handleUploadError(err: unknown) {
  // Same 401 contract as send(): park before the SDK rebuilds the frame.
  if (isUnauthorized(err)) {
    parkForAuth()
    return false
  }
  uploadError.value = t('widget.uploadFailed')
  return true
}

function scrollToBottom() {
  nextTick(() => {
    if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight
  })
}
function applyHandling(handling: Detail['conversation']['handling']) {
  handlingMode.value = handling ?? 'ai'
  if (handlingMode.value !== 'ai') transient.value = ''
}
async function loadHistory(older = false) {
  if (!conversationId.value) return
  const current = version
  const id = conversationId.value
  const data = await widgetFetch<Detail>(historyPath(apiBase, id, older, nextBeforeSeq.value))
  if (!isCurrent(current)) return
  applyHandling(data.conversation.handling)
  const page = applyHistoryPage({ items: items.value, runs: runs.value }, data, older)
  items.value = page.items
  runs.value = page.runs
  nextBeforeSeq.value = data.nextBeforeSeq
  if (!older) await markObserved(id, latestSeq(data))
}
async function markObserved(id: string, seq: number) {
  observedSeq.value = seq
  await nextTick()
  reportRead(id)
}
async function refreshStatus() {
  failure.value = ''
  try {
    await loadHistory()
  } catch {
    failure.value = t('widget.loadFailed')
  }
}
function confirmInput(input: ChatInput) {
  if (input.action === 'send') acceptSentMessage(input.message)
  awaitingRun.value = false
  pending.value = null
  savePending()
  scrollToBottom()
}
function acceptSentMessage(message: Extract<ChatInput, { action: 'send' }>['message']) {
  if (!hasItem(items.value, message.id)) items.value.push(optimisticCustomerItem(message, new Date()))
  draft.value = ''
  attachments.value = []
}

interface SubmitContext {
  id: string
  current: number
  input: ChatInput
  finished: boolean
}
async function submit(input: ChatInput) {
  if (!conversationId.value) return
  const ctx: SubmitContext = { id: conversationId.value, current: version, input, finished: false }
  beginSubmit(input)
  try {
    await deliver(ctx)
  } catch (error) {
    await recoverSubmit(ctx, error)
  } finally {
    endSubmit(ctx)
  }
}
function beginSubmit(input: ChatInput) {
  pending.value = input
  savePending()
  sending.value = true
  awaitingRun.value = true
  failure.value = ''
  transient.value = ''
}
async function deliver(ctx: SubmitContext) {
  if (!(await identify(ctx))) return
  if (!(await attachPageContext(ctx))) return
  savePending()
  const response = await widgetRequest(`${apiBase}/${ctx.id}/chat`, {
    method: 'POST',
    body: JSON.stringify(ctx.input),
  })
  await (isJsonResponse(response) ? acceptQueued(ctx, response) : streamRun(ctx, response))
  await settleSubmit(ctx)
}
async function identify(ctx: SubmitContext) {
  if (await ensureIdentity()) return true
  if (isCurrent(ctx.current)) failure.value = t('widget.sendFailed')
  return false
}
/** Sends the host page context with a new message; false when the chat moved on meanwhile. */
async function attachPageContext(ctx: SubmitContext) {
  if (!isCurrent(ctx.current)) return false
  const input = ctx.input
  if (input.action !== 'send' || input.message.context) return true
  input.message.context = await protocol!.requestPageContext()
  return isCurrent(ctx.current)
}
async function acceptQueued(ctx: SubmitContext, response: Response) {
  const result: Pick<Detail, 'conversation'> = await response.json()
  if (!isCurrent(ctx.current)) return
  handlingMode.value = result.conversation.handling ?? handlingMode.value
  confirmInput(ctx.input)
  emit('started', ctx.id)
}
type StreamHandler = (ctx: SubmitContext, data: any) => void
const streamHandlers: Record<string, StreamHandler> = {
  run: (ctx) => {
    handlingMode.value = 'ai'
    confirmInput(ctx.input)
    emit('started', ctx.id)
  },
  text: (_ctx, data: { delta: string }) => {
    transient.value += data.delta
    scrollToBottom()
  },
  finish: (ctx) => {
    ctx.finished = true
  },
  handoff: (ctx, data: { noticeItemId: string; lastSeq: number }) => {
    // The event confirms persistence; render it before the history fetch.
    // Reusing its ID lets history update the same bubble without a gap.
    if (!hasItem(items.value, data.noticeItemId))
      items.value.push(handoffNoticeItem(data, t('widget.conversationNotices.handoff'), new Date()))
    endAgentTurn(ctx, 'human')
  },
  closed: (ctx) => endAgentTurn(ctx, 'closed'),
  error: (_ctx, data: { message: string }) => {
    failure.value = data.message
  },
}
function endAgentTurn(ctx: SubmitContext, handling: 'human' | 'closed') {
  transient.value = ''
  failure.value = ''
  handlingMode.value = handling
  ctx.finished = true
  scrollToBottom()
}
async function streamRun(ctx: SubmitContext, response: Response) {
  if (!response.body) throw new Error('Missing response stream')
  await readAgentEvents(response.body, (name, data) => {
    if (isCurrent(ctx.current)) streamHandlers[name]?.(ctx, data)
  })
}
async function settleSubmit(ctx: SubmitContext) {
  if (!isCurrent(ctx.current)) return
  if (awaitingRun.value) throw new Error('Missing run acknowledgement')
  await loadHistory()
  if (ctx.finished) emit('filed')
}
async function recoverSubmit(ctx: SubmitContext, error: unknown) {
  if (!isCurrent(ctx.current)) return
  if (isUnauthorized(error)) return parkForAuth()
  failure.value = t('widget.sendFailed')
  await loadHistory().catch(() => {})
  // An ambiguous network failure is retried with the same request key.
  if (wasAccepted(ctx)) {
    confirmInput(ctx.input)
    emit('started', ctx.id)
  }
}
function wasAccepted(ctx: SubmitContext) {
  return isCurrent(ctx.current) && awaitingRun.value && isDeliveredSend(ctx.input, items.value)
}
/** Parks the request before the SDK rebuilds the frame for sign-in. */
function parkForAuth() {
  savePending()
  emit('authRequired')
}
function endSubmit(ctx: SubmitContext) {
  if (!isCurrent(ctx.current)) return
  transient.value = ''
  sending.value = false
  awaitingRun.value = false
  scrollToBottom()
}
async function send() {
  const text = draft.value.trim()
  const verdict = sendVerdict(text, attachments.value.length, composerBlocked.value)
  if (verdict === 'tooMany') uploadError.value = t('widget.tooManyParts')
  if (verdict !== 'ok') return
  conversationId.value ??= crypto.randomUUID()
  const input = buildSendInput(text, attachments.value, () => crypto.randomUUID())
  await submit(reuseIdenticalSend(pending.value, input))
}
async function retry() {
  if (busy.value) return
  const input = retryInput(pending.value, items.value.at(-1), () => crypto.randomUUID())
  if (input) await submit(input)
}
function resetConversation(id: string | null) {
  version++
  conversationId.value = id
  items.value = []
  runs.value = []
  pending.value = null
  nextBeforeSeq.value = null
  articleSlug.value = null
  transient.value = ''
  failure.value = ''
  sending.value = false
  awaitingRun.value = false
  observedSeq.value = 0
  handlingMode.value = 'ai'
}
async function openConversation(id: string | null) {
  resetConversation(id)
  if (!id) return
  loadingThread.value = true
  try {
    await loadHistory()
  } catch {
    failure.value = t('widget.loadFailed')
  } finally {
    loadingThread.value = false
    scrollToBottom()
  }
}
watch(
  () => props.openId,
  (id) => {
    if (id !== conversationId.value) void openConversation(id)
  },
)
function readStoredPending() {
  try {
    return sessionStorage.getItem(resumeKey)
  } catch {
    return null
  }
}
async function resumeSaved(saved: SavedPending) {
  await openConversation(saved.conversationId)
  pending.value = saved.pending
  failure.value = t('widget.sendFailed')
  const request = saved.pending
  if (request.action !== 'send') return
  if (hasItem(items.value, request.message.id)) confirmInput(request)
  else restoreComposer(request.message)
}
function restoreComposer(message: Extract<ChatInput, { action: 'send' }>['message']) {
  const composer = composerFromMessage(message)
  draft.value = composer.draft
  attachments.value = composer.attachments
}
onMounted(async () => {
  if (props.resumeState) return restoreState(props.resumeState)
  const saved = parseSavedPending(readStoredPending(), user.value?.id, props.openId)
  await (saved ? resumeSaved(saved) : openConversation(props.openId))
})
let polling: ReturnType<typeof setInterval> | undefined
let pollingBusy = false
function canPoll() {
  return shouldPoll({
    active: chatActive,
    articleOpen: !!articleSlug.value,
    conversationId: conversationId.value,
    hidden: document.hidden,
    loading: loadingThread.value,
    sending: sending.value,
    polling: pollingBusy,
  })
}
async function poll() {
  if (!canPoll()) return
  pollingBusy = true
  try {
    await fetchNewItems(version, conversationId.value!)
  } catch {
    /* Preserve the conversation and retry on the next visible interval. */
  } finally {
    pollingBusy = false
  }
}
async function fetchNewItems(current: number, id: string) {
  const data = await widgetFetch<Detail>(`${apiBase}/${id}/items?afterSeq=${observedSeq.value}`)
  if (!isCurrent(current)) return
  const page = applyPollPage({ items: items.value, runs: runs.value }, data)
  items.value = page.items
  applyHandling(data.conversation.handling)
  runs.value = page.runs
  observedSeq.value = data.nextAfterSeq ?? observedSeq.value
  if (data.items.length) await announceNewItems(id)
}
async function announceNewItems(id: string) {
  await nextTick()
  reportRead(id)
  scrollToBottom()
}
onMounted(() => {
  polling = setInterval(poll, 5000)
})
onBeforeUnmount(() => {
  version++
  clearInterval(polling)
})
onDeactivated(() => {
  chatActive = false
})
onActivated(() => {
  chatActive = true
  if (conversationId.value && !busy.value && !loadingThread.value) void refreshStatus()
})
function openFeedback(slug: string) {
  protocol!.navigateToFeedback(slug)
}
function openArticle(slug: string) {
  articleScrollTop.value = 0
  articleSlug.value = slug
}
async function closeArticle() {
  articleSlug.value = null
  await nextTick()
  if (conversationId.value) reportRead(conversationId.value)
}
</script>

<template>
  <WidgetEmbedArticle v-if="articleSlug" :slug="articleSlug" :product-name="productName" :initial-scroll-top="articleScrollTop" @close="closeArticle" @article="openArticle" @scroll="articleScrollTop = $event" />
  <div v-show="!articleSlug" ref="bodyEl" class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-background p-3.5 space-y-2.5 [overflow-wrap:anywhere]" @scroll="rememberScroll">
    <div v-if="loadingThread" class="grid place-items-center p-4"><Icon name="lucide:loader-2" size="20" class="animate-spin" /></div>
    <button v-if="nextBeforeSeq" class="block mx-auto text-xs text-primary" @click="loadHistory(true)">{{ t('widget.earlierMessages') }}</button>
    <div v-if="showGreeting" class="max-w-[88%] rounded-lg border bg-card px-3 py-2.5 text-[13.5px]">{{ t('widget.greeting', { product: productName }) }}</div>
    <WidgetEmbedChatItem v-for="item in items" :key="item.id" :item="item" :author="messageAuthor(item)" :time="messageTime(item.createdAt)" @feedback="openFeedback" @article="openArticle" />
    <WidgetEmbedChatStatus :transient="transient" :thinking="thinking" :failure-text="failureText" :can-retry="canRetry && !sending" :can-refresh="showRefresh" @retry="retry" @refresh="refreshStatus" />
  </div>
  <WidgetEmbedChatComposer
    v-show="!articleSlug"
    v-model:draft="draft"
    :attachments="attachments"
    :uploading="uploading"
    :busy="busy"
    :awaiting-run="awaitingRun"
    :upload-error="uploadError"
    @send="send"
    @files="uploadFiles"
    @remove="attachments.splice($event, 1)"
    @dismiss-error="uploadError = ''"
  />
</template>
