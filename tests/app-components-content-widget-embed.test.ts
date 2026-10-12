import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { ChatInput, Item, Run } from '../shared/agent/content'
import { articleApiPath, articleLinkTarget } from '../app/components/WidgetEmbed/-article-logic'
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
  hasFeedbackCard,
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
} from '../app/components/WidgetEmbed/-chat-logic'

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

const item = (
  id: string,
  seq: number,
  authorType: Item['authorType'] = 'customer',
  extra: Partial<Item> = {},
): Item => ({
  id,
  seq,
  authorType,
  content: { parts: [{ type: 'text', text: id }] },
  context: null,
  agentRunId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

const run = (id: string, startedAt: string, status: Run['status'] = 'completed', error: string | null = null): Run => ({
  id,
  triggerItemId: 'trigger',
  status,
  error,
  startedAt,
  deadlineAt: startedAt,
  finishedAt: null,
})

const sendInput = (id = 'm1', text = 'hello'): Extract<ChatInput, { action: 'send' }> => ({
  action: 'send',
  idempotency_key: `key-${id}`,
  message: { id, content: { parts: [{ type: 'text', text }] }, context: null },
})

const counter = () => {
  let n = 0
  return () => `uuid-${++n}`
}

test('labels each message author', () => {
  assert.equal(messageAuthorLabel(item('a', 1, 'customer'), t), 'widget.messageYou')
  assert.equal(messageAuthorLabel(item('a', 1, 'agent'), t), 'widget.messageAI')
  assert.equal(
    messageAuthorLabel(item('a', 1, 'staff', { author: { name: 'Ada' } }), t),
    'widget.messageStaffNamed:{"name":"Ada"}',
  )
  assert.equal(messageAuthorLabel(item('a', 1, 'staff', { author: { name: null } }), t), 'widget.messageStaff')
  assert.equal(messageAuthorLabel(item('a', 1, 'staff'), t), 'widget.messageStaff')
})

test('detects feedback cards in content', () => {
  assert.equal(hasFeedbackCard({ parts: [{ type: 'text', text: 'x' }] }), false)
  assert.equal(hasFeedbackCard({ parts: [{ feedback_id: 'f1' } as never] }), true)
})

test('reports an agent run only while the AI handles the conversation', () => {
  assert.equal(isAgentRunning('ai', run('r', 'a', 'running')), true)
  assert.equal(isAgentRunning('human', run('r', 'a', 'running')), false)
  assert.equal(isAgentRunning('ai', run('r', 'a', 'completed')), false)
  assert.equal(isAgentRunning('ai', undefined), false)
})

test('offers a retry for a parked request or an unanswered customer message', () => {
  assert.equal(canRetryChat(sendInput(), 'human', undefined, undefined), true)
  assert.equal(canRetryChat(null, 'ai', item('a', 1, 'customer'), run('r', 'a', 'failed')), true)
  assert.equal(canRetryChat(null, 'ai', item('a', 1, 'customer'), run('r', 'a', 'running')), false)
  assert.equal(canRetryChat(null, 'ai', item('a', 1, 'agent'), undefined), false)
  assert.equal(canRetryChat(null, 'human', item('a', 1, 'customer'), undefined), false)
})

test('shows a failure line for an error or a failed AI run', () => {
  assert.equal(chatFailureText('boom', true, 'human', undefined), 'boom')
  assert.equal(chatFailureText('', false, 'ai', run('r', 'a', 'failed', 'run error')), 'run error')
  assert.equal(chatFailureText('', false, 'ai', run('r', 'a', 'failed')), '')
  assert.equal(chatFailureText('', true, 'ai', run('r', 'a', 'failed')), null)
  assert.equal(chatFailureText('', false, 'human', run('r', 'a', 'failed')), null)
  assert.equal(chatFailureText('', false, 'ai', run('r', 'a', 'completed')), null)
  assert.equal(chatFailureText('', false, 'ai', undefined), null)
})

test('reports reads only from a visible, active thread with observed items', () => {
  const visible = { active: true, hidden: false, articleOpen: false, observedSeq: 3 }
  assert.equal(shouldReportRead(visible), true)
  assert.equal(shouldReportRead({ ...visible, active: false }), false)
  assert.equal(shouldReportRead({ ...visible, hidden: true }), false)
  assert.equal(shouldReportRead({ ...visible, articleOpen: true }), false)
  assert.equal(shouldReportRead({ ...visible, observedSeq: 0 }), false)
})

test('polls only an idle, visible, open conversation', () => {
  const idle = {
    active: true,
    articleOpen: false,
    conversationId: 'c1',
    hidden: false,
    loading: false,
    sending: false,
    polling: false,
  }
  assert.equal(shouldPoll(idle), true)
  for (const change of [
    { active: false },
    { articleOpen: true },
    { conversationId: null },
    { hidden: true },
    { loading: true },
    { sending: true },
    { polling: true },
  ])
    assert.equal(shouldPoll({ ...idle, ...change }), false)
})

test('builds history paths for the latest and older pages', () => {
  assert.equal(historyPath('/api', 'c1', false, 5), '/api/c1/items')
  assert.equal(historyPath('/api', 'c1', true, 5), '/api/c1/items?beforeSeq=5')
  assert.equal(historyPath('/api', 'c1', true, null), '/api/c1/items')
})

test('applies a history page and keeps runs ordered by start then id', () => {
  const current = { items: [item('b', 5)], runs: [run('r2', '2026-01-02')] }
  const data = { items: [item('a', 1)], runs: [run('r1', '2026-01-02'), run('r0', '2026-01-01')] }
  const older = applyHistoryPage(current, data, true)
  assert.deepEqual(
    older.items.map((entry) => entry.id),
    ['a', 'b'],
  )
  assert.deepEqual(
    older.runs.map((entry) => entry.id),
    ['r0', 'r1', 'r2'],
  )
  const latest = applyHistoryPage(current, data, false)
  assert.deepEqual(
    latest.items.map((entry) => entry.id),
    ['a'],
  )
  assert.deepEqual(
    latest.runs.map((entry) => entry.id),
    ['r0', 'r1'],
  )
})

test('merges a poll page by id and orders items by sequence', () => {
  const updated = item('b', 2, 'agent')
  const result = applyPollPage(
    { items: [item('c', 3), item('b', 2)], runs: [run('r1', '2026-01-02', 'running')] },
    { items: [updated, item('a', 1)], runs: [run('r1', '2026-01-02', 'completed'), run('r0', '2026-01-01')] },
  )
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    ['a', 'b', 'c'],
  )
  assert.equal(result.items[1], updated)
  assert.deepEqual(
    result.runs.map((entry) => [entry.id, entry.status]),
    [
      ['r0', 'completed'],
      ['r1', 'completed'],
    ],
  )
})

test('backfills older history until the restored first item is loaded', () => {
  assert.equal(needsOlderHistory(2, 4, [item('a', 4)]), true)
  assert.equal(needsOlderHistory(4, 4, [item('a', 4)]), false)
  assert.equal(needsOlderHistory(null, 4, [item('a', 4)]), false)
  assert.equal(needsOlderHistory(2, null, [item('a', 4)]), false)
  assert.equal(needsOlderHistory(2, 4, []), false)
})

test('finds items and delivered sends', () => {
  const items = [item('m1', 1)]
  assert.equal(hasItem(items, 'm1'), true)
  assert.equal(hasItem(items, 'm2'), false)
  assert.equal(isDeliveredSend(sendInput('m1'), items), true)
  assert.equal(isDeliveredSend(sendInput('m2'), items), false)
  assert.equal(isDeliveredSend({ action: 'retry', idempotency_key: 'k', trigger_item_id: 'm1' }, items), false)
  assert.equal(isDeliveredSend(null, items), false)
})

test('recognises unauthorized errors and oversized uploads', () => {
  assert.equal(isUnauthorized({ statusCode: 401 }), true)
  assert.equal(isUnauthorized({ statusCode: 500 }), false)
  assert.equal(isUnauthorized(null), false)
  assert.equal(exceedsUploadLimit(MAX_UPLOAD_MB * 1024 * 1024), false)
  assert.equal(exceedsUploadLimit(MAX_UPLOAD_MB * 1024 * 1024 + 1), true)
})

test('decides whether a draft can be sent', () => {
  assert.equal(sendVerdict('', 0, false), 'empty')
  assert.equal(sendVerdict('hi', 0, true), 'empty')
  assert.equal(sendVerdict('hi', 0, false), 'ok')
  assert.equal(sendVerdict('', 10, false), 'ok')
  assert.equal(sendVerdict('hi', 9, false), 'ok')
  assert.equal(sendVerdict('hi', 10, false), 'tooMany')
})

test('builds a send request with text before images', () => {
  const input = buildSendInput('hi', [{ key: 'k1', name: 'a.png' }], counter())
  assert.deepEqual(input, {
    action: 'send',
    idempotency_key: 'uuid-1',
    message: {
      id: 'uuid-2',
      content: {
        parts: [
          { type: 'text', text: 'hi' },
          { type: 'image', storage_key: 'k1' },
        ],
      },
      context: null,
    },
  })
  assert.deepEqual(buildSendInput('', [{ key: 'k1', name: 'a' }], counter()).message.content.parts, [
    { type: 'image', storage_key: 'k1' },
  ])
})

test('reuses a parked send only for identical content', () => {
  const parked = sendInput('m1', 'same')
  assert.equal(reuseIdenticalSend(parked, sendInput('m2', 'same')), parked)
  const fresh = sendInput('m3', 'other')
  assert.equal(reuseIdenticalSend(parked, fresh), fresh)
  assert.equal(reuseIdenticalSend(null, fresh), fresh)
  assert.equal(reuseIdenticalSend({ action: 'retry', idempotency_key: 'k', trigger_item_id: 'x' }, fresh), fresh)
})

test('retries the parked request or the last customer message', () => {
  const parked = sendInput()
  assert.equal(
    retryInput(parked, item('a', 1), () => 'k'),
    parked,
  )
  assert.deepEqual(
    retryInput(null, item('a', 1), () => 'k'),
    {
      action: 'retry',
      idempotency_key: 'k',
      trigger_item_id: 'a',
    },
  )
  assert.equal(
    retryInput(null, item('a', 1, 'agent'), () => 'k'),
    null,
  )
  assert.equal(
    retryInput(null, undefined, () => 'k'),
    null,
  )
})

test('restores the composer from a parked message', () => {
  const message = {
    id: 'm1',
    content: {
      parts: [
        { type: 'text' as const, text: 'one' },
        { type: 'image' as const, storage_key: 'k1' },
        { type: 'text' as const, text: 'two' },
      ],
    },
    context: null,
  }
  assert.deepEqual(composerFromMessage(message), { draft: 'one\ntwo', attachments: [{ key: 'k1', name: 'k1' }] })
})

test('reads a parked request only for its owner and an unspecified conversation', () => {
  const saved = { owner: 'u1', conversationId: 'c1', pending: sendInput() }
  const raw = JSON.stringify(saved)
  assert.deepEqual(parseSavedPending(raw, 'u1', null), saved)
  assert.equal(parseSavedPending(raw, 'u2', null), null)
  assert.equal(parseSavedPending(raw, 'u1', 'c2'), null)
  assert.equal(parseSavedPending(null, 'u1', null), null)
  assert.equal(parseSavedPending('{broken', 'u1', null), null)
  const anonymous = JSON.stringify({ conversationId: 'c1', pending: sendInput() })
  assert.equal(parseSavedPending(anonymous, undefined, null)?.conversationId, 'c1')
})

test('creates optimistic and handoff items', () => {
  const now = new Date('2026-02-03T04:05:06.000Z')
  const message = sendInput().message
  assert.deepEqual(optimisticCustomerItem(message, now), {
    ...message,
    seq: 0,
    authorType: 'customer',
    agentRunId: null,
    createdAt: '2026-02-03T04:05:06.000Z',
  })
  assert.deepEqual(handoffNoticeItem({ noticeItemId: 'n1', lastSeq: 9 }, 'Handed off', now), {
    id: 'n1',
    seq: 9,
    authorType: 'system',
    notice: 'handoff',
    content: { parts: [{ type: 'text', text: 'Handed off' }] },
    context: null,
    agentRunId: null,
    createdAt: '2026-02-03T04:05:06.000Z',
  })
})

test('reads sequence markers and response types', () => {
  assert.equal(firstLoadedSeq([item('o', 0), item('a', 3), item('b', 4)]), 3)
  assert.equal(firstLoadedSeq([item('o', 0)]), null)
  const conversation = { id: 'c', title: null, lastSeq: 7, unread: false }
  assert.equal(latestSeq({ conversation, nextAfterSeq: 9 }), 9)
  assert.equal(latestSeq({ conversation }), 7)
  const headers = (type: string | null) => ({ headers: { get: () => type } })
  assert.equal(isJsonResponse(headers('application/json; charset=utf-8')), true)
  assert.equal(isJsonResponse(headers('text/event-stream')), false)
  assert.equal(isJsonResponse(headers(null)), false)
})

test('classifies links inside a widget help article', () => {
  const origin = 'https://help.example.com'
  assert.deepEqual(articleLinkTarget('/help/abc123-getting-started', origin), {
    kind: 'article',
    slug: 'abc123-getting-started',
  })
  assert.deepEqual(articleLinkTarget('https://other.example.com/help/abc123-x', origin), { kind: 'external' })
  assert.deepEqual(articleLinkTarget('/pricing', origin), { kind: 'external' })
  assert.deepEqual(articleLinkTarget('mailto:support@example.com', origin), { kind: 'other' })
  assert.equal(articleApiPath('abc123-getting-started'), '/api/help/articles/abc123')
})
