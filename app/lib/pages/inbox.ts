// Pure helpers behind the dashboard inbox page. Kept free of Nuxt auto-imports
// so node:test can exercise them directly.
import type { Content } from '../../../shared/agent/content'
import type { SystemEventPart } from '../../../shared/inbox/state'
import type {
  InboxConversation,
  InboxCustomer,
  InboxDetail,
  InboxMessage,
  InboxCommandResult,
} from '../../../shared/inbox/types'

export type InboxRow = InboxConversation & { customer: InboxCustomer }
export type ContentPart = Content['parts'][number]
export type DeliveryMode = 'auto' | 'immediate'
export interface InboxFilters {
  q: string
  status: string
  priority: string
  sort: string
}

export const INBOX_STATUS_OPTIONS = ['all', 'open', 'pending', 'snoozed', 'closed', 'ai_handling'] as const
export const SNOOZE_CHOICES = ['hour', 'threeHours', 'tomorrow', 'monday', 'week', 'month'] as const

function atNine(value: Date) {
  value.setHours(9, 0, 0, 0)
}

function addMonthClamped(value: Date) {
  const day = value.getDate()
  value.setDate(1)
  value.setMonth(value.getMonth() + 1)
  value.setDate(Math.min(day, new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()))
  atNine(value)
}

const SNOOZE_STEPS: Record<string, (value: Date) => void> = {
  hour: (value) => value.setHours(value.getHours() + 1),
  threeHours: (value) => value.setHours(value.getHours() + 3),
  tomorrow: (value) => {
    value.setDate(value.getDate() + 1)
    atNine(value)
  },
  monday: (value) => {
    value.setDate(value.getDate() + ((8 - value.getDay()) % 7 || 7))
    atNine(value)
  },
  week: (value) => value.setDate(value.getDate() + 7),
}

/** The wake-up instant for a snooze choice, as an ISO string. Unknown choices snooze a month. */
export function wakeTime(choice: string, now = new Date()) {
  const value = new Date(now)
  ;(SNOOZE_STEPS[choice] ?? addMonthClamped)(value)
  return value.toISOString()
}

/** System events staff should see in the timeline: handoffs and manual snooze or close. */
export function showSystemNotice(part: ContentPart): part is SystemEventPart {
  if (part.type !== 'system_event') return false
  if (part.kind === 'handoff') return true
  return part.reason === 'manual' && (part.kind === 'snoozed' || part.kind === 'closed')
}

const BUILTIN_HANDOFF_RULES = ['builtin-billing', 'builtin-account-access', 'builtin-privacy-legal']

/** i18n key for a handoff notice; built-in support rules have their own wording. */
export function handoffNoticeKey(part: SystemEventPart) {
  const rule = part.rule?.id ?? ''
  const builtin = part.reason === 'support_rule' && BUILTIN_HANDOFF_RULES.includes(rule)
  return `inbox.handoffNotices.${builtin ? rule : part.reason}`
}

/** Timeline items to render: every message, and system items that carry a visible notice. */
export function visibleTimelineItems(items: InboxMessage[] | undefined) {
  return (items ?? []).filter((item) => item.authorType !== 'system' || item.content.parts.some(showSystemNotice))
}

export function isHandoffItem(item: InboxMessage) {
  return item.content.parts.some((part) => part.type === 'system_event' && part.kind === 'handoff')
}

/** "Snoozed · wakes at <date>" style hint for the status badge. */
export function statusHint(
  conversation: InboxConversation | undefined,
  t: (key: string) => string,
  date: (value: string | null) => string,
) {
  if (!conversation) return ''
  const label = t(`inbox.statuses.${conversation.status}`)
  if (!conversation.stateDueAt) return label
  const due = t(conversation.status === 'snoozed' ? 'inbox.wakeAt' : 'inbox.closeAt')
  return `${label} · ${due} ${date(conversation.stateDueAt)}`
}

/** Merge two lists by id, later entries replacing earlier ones while keeping first-seen order. */
export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]) {
  return [...new Map([...existing, ...incoming].map((row) => [row.id, row])).values()]
}

export function appendPage<T>(existing: T[], incoming: T[], more: boolean) {
  return more ? [...existing, ...incoming] : incoming
}

export function listQuery(filters: InboxFilters, cursor: string | null) {
  return { ...filters, ...(cursor ? { cursor } : {}) }
}

/** Query for a detail load: older pages, the initial page, or the items after the last seen one. */
export function detailQuery(detail: InboxDetail | null, older: boolean, initial: boolean) {
  if (older) return { beforeSeq: detail?.nextBeforeSeq }
  if (initial) return {}
  return { afterSeq: detail?.nextAfterSeq ?? 0 }
}

/**
 * Fold a freshly loaded page into the current detail. Returns null when the
 * response is older than what is already shown.
 */
export function mergeDetail(current: InboxDetail | null, data: InboxDetail, older: boolean, initial: boolean) {
  if (!current || initial) return data
  if (data.conversation.lastSeq < current.conversation.lastSeq) return null
  return {
    ...data,
    items: mergeById(current.items, data.items).sort((a, b) => a.seq - b.seq),
    nextBeforeSeq: older ? data.nextBeforeSeq : current.nextBeforeSeq,
    nextAfterSeq: older ? current.nextAfterSeq : data.nextAfterSeq,
  }
}

interface ScrollBox {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

function distanceFromEnd(element: ScrollBox) {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

/** Where the timeline was before new items arrived. */
export function scrollState(element: ScrollBox | null) {
  return { atBottom: !element || distanceFromEnd(element) < 80, height: element?.scrollHeight ?? 0 }
}

/** Keep the reader's place after a load: anchored when paging back, pinned to the end otherwise. */
export function restoreScroll(
  element: ScrollBox | null,
  before: { atBottom: boolean; height: number },
  older: boolean,
  initial: boolean,
) {
  if (!element) return
  if (older) element.scrollTop += element.scrollHeight - before.height
  else if (initial || before.atBottom) scrollToEnd(element)
}

export function scrollToEnd(element: ScrollBox | null) {
  if (element) element.scrollTop = element.scrollHeight
}

/** The reader has the end of the timeline in view. */
export function isScrolledToEnd(element: ScrollBox | null) {
  return !!element && !!element.clientHeight && distanceFromEnd(element) <= 8
}

export interface CommandGate {
  hasDetail: boolean
  selected: string | null
  canReply: boolean
  sendable: boolean
  uploading: boolean
}

/** A command needs an open conversation; a reply also needs something to send. */
export function commandBlocked(action: string, gate: CommandGate) {
  if (!gate.hasDetail || !gate.selected) return true
  return action === 'reply' && (!gate.canReply || !gate.sendable || gate.uploading)
}

/** The reply body: trimmed text, if any, followed by the attached images. */
export function buildReplyContent(draft: string, images: { key: string }[]): Content {
  const text = draft.trim()
  return {
    parts: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...images.map((image) => ({ type: 'image' as const, storage_key: image.key })),
    ],
  }
}

export function commandPayload(
  action: string,
  extra: Record<string, unknown>,
  deliveryMode: DeliveryMode,
  content: Content,
): Record<string, unknown> {
  if (action === 'reply') return { notifyByEmail: deliveryMode === 'immediate', content }
  return { action, ...extra }
}

export function commandEndpoint(id: string, action: string) {
  return `/api/admin/inbox/conversations/${id}/${action === 'reply' ? 'replies' : 'actions'}`
}

export interface PendingRequest {
  signature: string
  requestId: string
  expectedLastSeq: number
}

/**
 * Reuse the request id of an identical command that has not been confirmed yet,
 * so a retry is idempotent on the server; anything else starts a new request.
 */
export function pendingRequest(
  pending: Map<string, PendingRequest>,
  id: string,
  signatureOf: unknown,
  lastSeq: number,
  newId: () => string = () => crypto.randomUUID(),
) {
  const signature = JSON.stringify(signatureOf)
  const existing = pending.get(id)
  if (existing?.signature === signature) return existing
  const request = { signature, requestId: newId(), expectedLastSeq: lastSeq }
  pending.set(id, request)
  return request
}

interface SessionUser {
  id: string
  name: string
  image?: string | null
}

/** Show a just-sent staff reply right away, unless a poll already brought it in. */
export function insertStaffItem(
  items: InboxMessage[],
  item: InboxCommandResult['item'],
  content: Content,
  user: SessionUser | undefined,
) {
  if (items.some((existing) => existing.id === item.id)) return
  items.push({
    ...item,
    content,
    authorType: 'staff',
    context: null,
    agentRunId: null,
    author: user ? { id: user.id, name: user.name, image: user.image ?? null, isAnonymous: false } : null,
  })
  items.sort((a, b) => a.seq - b.seq)
}

export function emailRetryEndpoint(conversationId: string, itemId: string) {
  return `/api/admin/inbox/conversations/${conversationId}/items/${encodeURIComponent(itemId)}/email/retry`
}

const MAX_DRAFT_IMAGES = 9
const MAX_UPLOAD_MB = 16

/** Why a file cannot join the draft, and whether to stop processing the rest. */
export function uploadRejection(file: { type: string; size: number }, existingCount: number) {
  if (!file.type.startsWith('image/') || file.size > MAX_UPLOAD_MB * 1024 * 1024)
    return { key: 'widget.uploadTooLarge', params: { size: MAX_UPLOAD_MB }, stop: false }
  if (existingCount >= MAX_DRAFT_IMAGES) return { key: 'widget.tooManyParts', params: {}, stop: true }
  return null
}

/** Run uploads one at a time, stopping at the first that asks to stop. */
export async function eachUntilStopped<T>(items: T[], run: (item: T) => Promise<boolean>) {
  for (const item of items) {
    if (!(await run(item))) return
  }
}

export function uploadBody(file: Blob) {
  const body = new FormData()
  body.append('file', file)
  return body
}

export function pastedImages(data: { files?: ArrayLike<File> } | null | undefined) {
  return Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'))
}

/** Enter while an input method is composing confirms the composition, not the message. */
export function isImeComposing(event: { isComposing: boolean; keyCode: number }) {
  return event.isComposing || event.keyCode === 229
}

/** Name line under a message bubble. */
export function messageAuthorLabel(
  item: InboxMessage,
  customer: InboxCustomer,
  t: (key: string, params?: Record<string, unknown>) => string,
  authorName: (author: InboxMessage['author'] | InboxCustomer) => string,
) {
  if (item.authorType === 'agent') return t('inbox.ai')
  if (item.authorType !== 'staff') return authorName(item.author || customer)
  const name = item.author?.name
  return name ? t('widget.messageStaffNamed', { name }) : t('widget.messageStaff')
}

const BUBBLE_CLASSES: Record<string, string> = {
  staff: 'ml-auto rounded-tr-sm bg-primary/5',
  agent: 'rounded-tl-sm bg-secondary/50',
}

export function bubbleClass(authorType: string) {
  return BUBBLE_CLASSES[authorType] ?? 'rounded-tl-sm bg-card'
}

/** The scenario text for a handoff rule, localized when a translation exists. */
export function ruleScenario(rule: { scenario: string; scenarioZh?: string }, locale: string) {
  return locale === 'zh' && rule.scenarioZh ? rule.scenarioZh : rule.scenario
}
