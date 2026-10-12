// Pure state rules for WidgetEmbedChat. The leading dash keeps Nuxt from
// registering this module as a component (ignorePrefix).
import type { ChatInput, Content, Detail, Item, Run } from '../../../shared/agent/content'

type Translate = (key: string, params?: Record<string, unknown>) => string
type Handling = 'ai' | 'human' | 'closed'
type SendInput = Extract<ChatInput, { action: 'send' }>
type SendMessage = SendInput['message']

export interface ChatAttachment {
  key: string
  name: string
}

export interface SavedPending {
  owner: string
  conversationId: string
  pending: ChatInput
}

export const MAX_UPLOAD_MB = 16
const MAX_MESSAGE_PARTS = 10

export function messageAuthorLabel(item: Item, t: Translate): string {
  if (item.authorType === 'customer') return t('widget.messageYou')
  if (item.authorType === 'agent') return t('widget.messageAI')
  const name = item.author?.name
  return name ? t('widget.messageStaffNamed', { name }) : t('widget.messageStaff')
}

export const hasFeedbackCard = (content: Content) => content.parts.some((part) => 'feedback_id' in part)

export function isAgentRunning(handling: Handling, run: Run | undefined): boolean {
  return handling === 'ai' && run?.status === 'running'
}

export function canRetryChat(
  pending: ChatInput | null,
  handling: Handling,
  lastItem: Item | undefined,
  latestRun: Run | undefined,
): boolean {
  if (pending) return true
  return handling === 'ai' && lastItem?.authorType === 'customer' && latestRun?.status !== 'running'
}

/** The failure line under the thread, or null when no line is shown. */
export function chatFailureText(
  failure: string,
  sending: boolean,
  handling: Handling,
  latestRun: Run | undefined,
): string | null {
  if (failure) return failure
  if (sending || handling !== 'ai' || latestRun?.status !== 'failed') return null
  return latestRun.error ?? ''
}

export function shouldReportRead(state: {
  active: boolean
  hidden: boolean
  articleOpen: boolean
  observedSeq: number
}): boolean {
  return state.active && !state.hidden && !state.articleOpen && state.observedSeq > 0
}

export function shouldPoll(state: {
  active: boolean
  articleOpen: boolean
  conversationId: string | null
  hidden: boolean
  loading: boolean
  sending: boolean
  polling: boolean
}): boolean {
  if (!state.active || state.articleOpen || !state.conversationId) return false
  return !state.hidden && !state.loading && !state.sending && !state.polling
}

export function historyPath(base: string, id: string, older: boolean, beforeSeq: number | null): string {
  const suffix = older && beforeSeq ? `?beforeSeq=${beforeSeq}` : ''
  return `${base}/${id}/items${suffix}`
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const merged = new Map(existing.map((entry) => [entry.id, entry]))
  for (const entry of incoming) merged.set(entry.id, entry)
  return [...merged.values()]
}

/** One page of history, prepended for an older page or replacing the thread otherwise. */
export function applyHistoryPage(
  current: { items: Item[]; runs: Run[] },
  data: Pick<Detail, 'items' | 'runs'>,
  older: boolean,
): { items: Item[]; runs: Run[] } {
  const items = older ? [...data.items, ...current.items] : data.items
  const runs = mergeById(older ? current.runs : [], data.runs).sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  )
  return { items, runs }
}

/** Items and runs that arrived since the last poll, merged into the thread. */
export function applyPollPage(
  current: { items: Item[]; runs: Run[] },
  data: Pick<Detail, 'items' | 'runs'>,
): { items: Item[]; runs: Run[] } {
  return {
    items: mergeById(current.items, data.items).sort((a, b) => a.seq - b.seq),
    runs: mergeById(current.runs, data.runs).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
  }
}

export function needsOlderHistory(firstSeq: number | null, beforeSeq: number | null, items: Item[]): boolean {
  return !!firstSeq && !!beforeSeq && (items[0]?.seq ?? 0) > firstSeq
}

export function hasItem(items: Item[], id: string): boolean {
  return items.some((item) => item.id === id)
}

export function isDeliveredSend(request: ChatInput | null, items: Item[]): request is SendInput {
  return request?.action === 'send' && hasItem(items, request.message.id)
}

export function isUnauthorized(error: unknown): boolean {
  return (error as { statusCode?: number } | null)?.statusCode === 401
}

export function exceedsUploadLimit(size: number): boolean {
  return size > MAX_UPLOAD_MB * 1024 * 1024
}

export type SendVerdict = 'empty' | 'tooMany' | 'ok'

export function sendVerdict(text: string, attachmentCount: number, blocked: boolean): SendVerdict {
  if ((!text && !attachmentCount) || blocked) return 'empty'
  return attachmentCount + (text ? 1 : 0) > MAX_MESSAGE_PARTS ? 'tooMany' : 'ok'
}

export function buildSendInput(text: string, attachments: ChatAttachment[], uuid: () => string): SendInput {
  const idempotencyKey = uuid()
  return {
    action: 'send',
    idempotency_key: idempotencyKey,
    message: {
      id: uuid(),
      content: {
        parts: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...attachments.map((file) => ({ type: 'image' as const, storage_key: file.key })),
        ],
      },
      context: null,
    },
  }
}

/** Resending the same content reuses the parked request so its idempotency key holds. */
export function reuseIdenticalSend(previous: ChatInput | null, input: SendInput): ChatInput {
  const same =
    previous?.action === 'send' && JSON.stringify(previous.message.content) === JSON.stringify(input.message.content)
  return same ? previous : input
}

export function retryInput(pending: ChatInput | null, last: Item | undefined, uuid: () => string): ChatInput | null {
  if (pending) return pending
  if (last?.authorType !== 'customer') return null
  return { action: 'retry', idempotency_key: uuid(), trigger_item_id: last.id }
}

export function composerFromMessage(message: SendMessage): { draft: string; attachments: ChatAttachment[] } {
  const parts = message.content.parts
  return {
    draft: parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n'),
    attachments: parts
      .filter((part) => part.type === 'image')
      .map((part) => ({ key: part.storage_key, name: part.storage_key })),
  }
}

/** A request parked by this owner before a reload, unless another conversation was asked for. */
export function parseSavedPending(
  raw: string | null,
  owner: string | undefined,
  openId: string | null,
): SavedPending | null {
  let saved: SavedPending | null = null
  try {
    saved = JSON.parse(raw ?? 'null')
  } catch {
    /* Ignore an incomplete local draft. */
  }
  return saved && saved.owner === owner && !openId ? saved : null
}

export function optimisticCustomerItem(message: SendMessage, now: Date): Item {
  return { ...message, seq: 0, authorType: 'customer', agentRunId: null, createdAt: now.toISOString() }
}

export function handoffNoticeItem(data: { noticeItemId: string; lastSeq: number }, text: string, now: Date): Item {
  return {
    id: data.noticeItemId,
    seq: data.lastSeq,
    authorType: 'system',
    notice: 'handoff',
    content: { parts: [{ type: 'text', text }] },
    context: null,
    agentRunId: null,
    createdAt: now.toISOString(),
  }
}

export function firstLoadedSeq(items: Item[]): number | null {
  return items.find((item) => item.seq > 0)?.seq ?? null
}

export function latestSeq(data: Pick<Detail, 'conversation' | 'nextAfterSeq'>): number {
  return data.nextAfterSeq ?? data.conversation.lastSeq
}

export function isJsonResponse(response: { headers: { get(name: string): string | null } }): boolean {
  return response.headers.get('content-type')?.includes('application/json') ?? false
}
