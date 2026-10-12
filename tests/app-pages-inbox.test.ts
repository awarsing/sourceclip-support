import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { SystemEventPart } from '../shared/inbox/state'
import type { InboxCustomer, InboxDetail, InboxMessage } from '../shared/inbox/types'
import {
  appendPage,
  bubbleClass,
  buildReplyContent,
  commandBlocked,
  commandEndpoint,
  commandPayload,
  type ContentPart,
  detailQuery,
  eachUntilStopped,
  emailRetryEndpoint,
  handoffNoticeKey,
  insertStaffItem,
  isHandoffItem,
  isImeComposing,
  isScrolledToEnd,
  listQuery,
  messageAuthorLabel,
  mergeById,
  mergeDetail,
  type PendingRequest,
  pastedImages,
  pendingRequest,
  restoreScroll,
  ruleScenario,
  scrollState,
  scrollToEnd,
  showSystemNotice,
  statusHint,
  uploadBody,
  uploadRejection,
  visibleTimelineItems,
  wakeTime,
} from '../app/lib/pages/inbox'

const local = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime()

test('wakeTime moves forward by hours, days and weeks', () => {
  const now = new Date(2026, 0, 14, 15, 30) // Wednesday
  assert.equal(Date.parse(wakeTime('hour', now)), local(2026, 0, 14, 16, 30))
  assert.equal(Date.parse(wakeTime('threeHours', now)), local(2026, 0, 14, 18, 30))
  assert.equal(Date.parse(wakeTime('tomorrow', now)), local(2026, 0, 15, 9, 0))
  assert.equal(Date.parse(wakeTime('week', now)), local(2026, 0, 21, 15, 30))
  assert.equal(typeof wakeTime('hour'), 'string')
})

test('wakeTime picks the next Monday, a full week ahead on a Monday', () => {
  assert.equal(Date.parse(wakeTime('monday', new Date(2026, 0, 14, 10, 0))), local(2026, 0, 19, 9, 0))
  assert.equal(Date.parse(wakeTime('monday', new Date(2026, 0, 19, 10, 0))), local(2026, 0, 26, 9, 0))
})

test('wakeTime clamps a month ahead to the end of a shorter month', () => {
  assert.equal(Date.parse(wakeTime('month', new Date(2026, 0, 31, 10, 0))), local(2026, 1, 28, 9, 0))
  assert.equal(Date.parse(wakeTime('month', new Date(2026, 4, 15, 10, 0))), local(2026, 5, 15, 9, 0))
})

const event = (patch: Partial<SystemEventPart>): SystemEventPart => ({
  type: 'system_event',
  kind: 'handoff',
  reason: 'user_requested',
  fromStatus: 'ai_handling',
  toStatus: 'open',
  ...patch,
})

test('showSystemNotice shows handoffs and manual snooze or close only', () => {
  assert.equal(showSystemNotice({ type: 'text', text: 'hi' }), false)
  assert.equal(showSystemNotice(event({ kind: 'handoff' })), true)
  assert.equal(showSystemNotice(event({ kind: 'snoozed', reason: 'manual' })), true)
  assert.equal(showSystemNotice(event({ kind: 'closed', reason: 'manual' })), true)
  assert.equal(showSystemNotice(event({ kind: 'closed', reason: 'timeout' })), false)
  assert.equal(showSystemNotice(event({ kind: 'reopened', reason: 'manual' })), false)
})

test('handoffNoticeKey names built-in support rules and falls back to the reason', () => {
  const rule = (id: string) => ({ id, scenario: 'x' })
  assert.equal(
    handoffNoticeKey(event({ reason: 'support_rule', rule: rule('builtin-billing') })),
    'inbox.handoffNotices.builtin-billing',
  )
  assert.equal(
    handoffNoticeKey(event({ reason: 'support_rule', rule: rule('custom') })),
    'inbox.handoffNotices.support_rule',
  )
  assert.equal(handoffNoticeKey(event({ reason: 'support_rule' })), 'inbox.handoffNotices.support_rule')
  assert.equal(
    handoffNoticeKey(event({ reason: 'knowledge_gap', rule: rule('builtin-billing') })),
    'inbox.handoffNotices.knowledge_gap',
  )
})

const message = (patch: Partial<InboxMessage> & { parts?: ContentPart[] }): InboxMessage => ({
  id: patch.id ?? 'm1',
  seq: patch.seq ?? 1,
  authorType: patch.authorType ?? 'customer',
  content: { parts: patch.parts ?? [{ type: 'text', text: 'hello' }] },
  context: null,
  agentRunId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  author: patch.author ?? null,
})

test('visibleTimelineItems drops system items without a notice', () => {
  const items = [
    message({ id: 'a' }),
    message({ id: 'b', authorType: 'system', parts: [event({ kind: 'reopened', reason: 'customer_message' })] }),
    message({ id: 'c', authorType: 'system', parts: [event({ kind: 'handoff' })] }),
  ]
  assert.deepEqual(
    visibleTimelineItems(items).map((item) => item.id),
    ['a', 'c'],
  )
  assert.deepEqual(visibleTimelineItems(undefined), [])
  assert.equal(isHandoffItem(items[2]!), true)
  assert.equal(isHandoffItem(items[0]!), false)
})

test('statusHint adds the due date for snoozed and pending conversations', () => {
  const t = (key: string) => `[${key}]`
  const date = (value: string | null) => `<${value}>`
  const conversation = {
    id: 'c',
    title: null,
    previewText: null,
    status: 'snoozed' as const,
    priority: 'normal' as const,
    stateDueAt: '2026-02-01',
    lastMessageAt: '2026-01-01',
    lastSeq: 3,
  }
  assert.equal(statusHint(undefined, t, date), '')
  assert.equal(statusHint(conversation, t, date), '[inbox.statuses.snoozed] · [inbox.wakeAt] <2026-02-01>')
  assert.equal(
    statusHint({ ...conversation, status: 'pending' }, t, date),
    '[inbox.statuses.pending] · [inbox.closeAt] <2026-02-01>',
  )
  assert.equal(statusHint({ ...conversation, stateDueAt: null }, t, date), '[inbox.statuses.snoozed]')
})

test('list and page helpers merge without duplicates', () => {
  assert.deepEqual(
    mergeById(
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 1 },
      ],
      [
        { id: 'b', v: 2 },
        { id: 'c', v: 1 },
      ],
    ),
    [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 1 },
    ],
  )
  assert.deepEqual(appendPage([1], [2], true), [1, 2])
  assert.deepEqual(appendPage([1], [2], false), [2])
  const filters = { q: 'x', status: 'open', priority: 'all', sort: 'newest' }
  assert.deepEqual(listQuery(filters, null), filters)
  assert.deepEqual(listQuery(filters, 'next'), { ...filters, cursor: 'next' })
})

const detail = (patch: Partial<InboxDetail> = {}): InboxDetail => ({
  conversation: {
    id: 'c',
    title: null,
    previewText: null,
    status: 'open',
    priority: 'normal',
    stateDueAt: null,
    lastMessageAt: '2026-01-01',
    lastSeq: 5,
  },
  customer: { id: 'u', name: 'U', image: null, isAnonymous: false },
  items: [],
  nextBeforeSeq: 2,
  nextAfterSeq: 5,
  hasMore: false,
  emails: {},
  ...patch,
})

test('detailQuery asks for older pages, the first page or newer items', () => {
  assert.deepEqual(detailQuery(detail(), true, false), { beforeSeq: 2 })
  assert.deepEqual(detailQuery(null, true, false), { beforeSeq: undefined })
  assert.deepEqual(detailQuery(detail(), false, true), {})
  assert.deepEqual(detailQuery(detail(), false, false), { afterSeq: 5 })
  assert.deepEqual(detailQuery(null, false, false), { afterSeq: 0 })
})

test('mergeDetail folds pages in order and ignores stale responses', () => {
  const current = detail({ items: [message({ id: 'b', seq: 2 })] })
  const fresh = detail({ items: [message({ id: 'a', seq: 1 })], nextBeforeSeq: null, nextAfterSeq: 6 })
  assert.equal(mergeDetail(null, fresh, false, false), fresh)
  assert.equal(mergeDetail(current, fresh, false, true), fresh)
  const older = mergeDetail(current, fresh, true, false)!
  assert.deepEqual(
    older.items.map((item) => item.id),
    ['a', 'b'],
  )
  assert.equal(older.nextBeforeSeq, null)
  assert.equal(older.nextAfterSeq, 5)
  const newer = mergeDetail(current, fresh, false, false)!
  assert.equal(newer.nextBeforeSeq, 2)
  assert.equal(newer.nextAfterSeq, 6)
  const stale = detail({ conversation: { ...current.conversation, lastSeq: 4 } })
  assert.equal(mergeDetail(current, stale, false, false), null)
})

test('scroll helpers keep the reader anchored', () => {
  const box = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 200 })
  assert.deepEqual(scrollState(null), { atBottom: true, height: 0 })
  assert.deepEqual(scrollState(box(750)), { atBottom: true, height: 1000 })
  assert.deepEqual(scrollState(box(100)), { atBottom: false, height: 1000 })

  restoreScroll(null, { atBottom: true, height: 0 }, false, false)
  const older = box(10)
  restoreScroll(older, { atBottom: false, height: 600 }, true, false)
  assert.equal(older.scrollTop, 410)
  const initial = box(0)
  restoreScroll(initial, { atBottom: false, height: 0 }, false, true)
  assert.equal(initial.scrollTop, 1000)
  const pinned = box(0)
  restoreScroll(pinned, { atBottom: true, height: 0 }, false, false)
  assert.equal(pinned.scrollTop, 1000)
  const reading = box(5)
  restoreScroll(reading, { atBottom: false, height: 0 }, false, false)
  assert.equal(reading.scrollTop, 5)

  scrollToEnd(null)
  assert.equal(isScrolledToEnd(null), false)
  assert.equal(isScrolledToEnd({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }), false)
  assert.equal(isScrolledToEnd(box(795)), true)
  assert.equal(isScrolledToEnd(box(700)), false)
})

test('commandBlocked requires a conversation and a sendable reply', () => {
  const gate = { hasDetail: true, selected: 'c', canReply: true, sendable: true, uploading: false }
  assert.equal(commandBlocked('close', gate), false)
  assert.equal(commandBlocked('close', { ...gate, hasDetail: false }), true)
  assert.equal(commandBlocked('close', { ...gate, selected: null }), true)
  assert.equal(commandBlocked('close', { ...gate, canReply: false }), false)
  assert.equal(commandBlocked('reply', gate), false)
  assert.equal(commandBlocked('reply', { ...gate, canReply: false }), true)
  assert.equal(commandBlocked('reply', { ...gate, sendable: false }), true)
  assert.equal(commandBlocked('reply', { ...gate, uploading: true }), true)
})

test('reply content and payloads match the API contract', () => {
  const content = buildReplyContent('  hi  ', [{ key: 'k1' }])
  assert.deepEqual(content, {
    parts: [
      { type: 'text', text: 'hi' },
      { type: 'image', storage_key: 'k1' },
    ],
  })
  assert.deepEqual(buildReplyContent('   ', []), { parts: [] })
  assert.deepEqual(commandPayload('reply', {}, 'immediate', content), { notifyByEmail: true, content })
  assert.deepEqual(commandPayload('reply', {}, 'auto', content), { notifyByEmail: false, content })
  assert.deepEqual(commandPayload('snooze', { wakeAt: 'w' }, 'auto', content), { action: 'snooze', wakeAt: 'w' })
  assert.equal(commandEndpoint('c1', 'reply'), '/api/admin/inbox/conversations/c1/replies')
  assert.equal(commandEndpoint('c1', 'close'), '/api/admin/inbox/conversations/c1/actions')
  assert.equal(emailRetryEndpoint('c1', 'a/b'), '/api/admin/inbox/conversations/c1/items/a%2Fb/email/retry')
})

test('pendingRequest reuses the id of an identical unconfirmed command', () => {
  const pending = new Map<string, PendingRequest>()
  let n = 0
  const newId = () => `r${++n}`
  const first = pendingRequest(pending, 'c', ['close', {}], 4, newId)
  assert.deepEqual(first, { signature: '["close",{}]', requestId: 'r1', expectedLastSeq: 4 })
  assert.equal(pendingRequest(pending, 'c', ['close', {}], 9, newId), first)
  const other = pendingRequest(pending, 'c', ['resume', {}], 9, newId)
  assert.equal(other.requestId, 'r2')
  assert.equal(other.expectedLastSeq, 9)
  assert.equal(pending.get('c'), other)
  assert.match(pendingRequest(new Map(), 'd', [], 0).requestId, /^[0-9a-f-]{36}$/)
})

test('insertStaffItem adds a sent reply once, in sequence order', () => {
  const items = [message({ id: 'a', seq: 1 }), message({ id: 'c', seq: 3 })]
  const content = { parts: [{ type: 'text' as const, text: 'reply' }] }
  insertStaffItem(items, { id: 'b', seq: 2, createdAt: 'now' }, content, { id: 'u1', name: 'Ann', image: 'i.png' })
  assert.deepEqual(
    items.map((item) => item.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(items[1]!.author, { id: 'u1', name: 'Ann', image: 'i.png', isAnonymous: false })
  assert.equal(items[1]!.authorType, 'staff')
  insertStaffItem(items, { id: 'b', seq: 2, createdAt: 'now' }, content, undefined)
  assert.equal(items.length, 3)
  insertStaffItem(items, { id: 'd', seq: 4, createdAt: 'now' }, content, { id: 'u2', name: 'Bo' })
  assert.deepEqual(items[3]!.author, { id: 'u2', name: 'Bo', image: null, isAnonymous: false })
  insertStaffItem(items, { id: 'e', seq: 5, createdAt: 'now' }, content, undefined)
  assert.equal(items[4]!.author, null)
})

test('uploadRejection skips non-images and oversized files and stops at the image limit', () => {
  assert.deepEqual(uploadRejection({ type: 'text/plain', size: 1 }, 0), {
    key: 'widget.uploadTooLarge',
    params: { size: 16 },
    stop: false,
  })
  assert.equal(uploadRejection({ type: 'image/png', size: 17 * 1024 * 1024 }, 0)?.stop, false)
  assert.deepEqual(uploadRejection({ type: 'image/png', size: 1 }, 9), {
    key: 'widget.tooManyParts',
    params: {},
    stop: true,
  })
  assert.equal(uploadRejection({ type: 'image/png', size: 1 }, 8), null)
})

test('eachUntilStopped runs in order and stops when asked', async () => {
  const seen: number[] = []
  await eachUntilStopped([1, 2, 3, 4], async (n) => {
    seen.push(n)
    return n !== 2
  })
  assert.deepEqual(seen, [1, 2])
})

test('upload and paste helpers', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' })
  assert.equal(uploadBody(file).get('file') instanceof Blob, true)
  const text = new File(['x'], 'a.txt', { type: 'text/plain' })
  assert.deepEqual(pastedImages({ files: [file, text] }), [file])
  assert.deepEqual(pastedImages(null), [])
  assert.deepEqual(pastedImages({}), [])
  assert.equal(isImeComposing({ isComposing: true, keyCode: 13 }), true)
  assert.equal(isImeComposing({ isComposing: false, keyCode: 229 }), true)
  assert.equal(isImeComposing({ isComposing: false, keyCode: 13 }), false)
})

test('message presentation helpers', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${params.name}` : key)
  const customer: InboxCustomer = { id: 'u', name: 'Cus', image: null, isAnonymous: false }
  const authorName = (author: { name: string | null } | null) => author?.name ?? 'anon'
  assert.equal(messageAuthorLabel(message({ authorType: 'agent' }), customer, t, authorName), 'inbox.ai')
  assert.equal(messageAuthorLabel(message({ authorType: 'customer' }), customer, t, authorName), 'Cus')
  const author = { id: 'x', name: 'Ann', image: null, isAnonymous: false }
  assert.equal(messageAuthorLabel(message({ authorType: 'customer', author }), customer, t, authorName), 'Ann')
  assert.equal(
    messageAuthorLabel(message({ authorType: 'staff', author }), customer, t, authorName),
    'widget.messageStaffNamed:Ann',
  )
  assert.equal(messageAuthorLabel(message({ authorType: 'staff' }), customer, t, authorName), 'widget.messageStaff')
  assert.equal(bubbleClass('staff'), 'ml-auto rounded-tr-sm bg-primary/5')
  assert.equal(bubbleClass('agent'), 'rounded-tl-sm bg-secondary/50')
  assert.equal(bubbleClass('customer'), 'rounded-tl-sm bg-card')
  assert.equal(ruleScenario({ scenario: 'en', scenarioZh: 'zh' }, 'zh'), 'zh')
  assert.equal(ruleScenario({ scenario: 'en' }, 'zh'), 'en')
  assert.equal(ruleScenario({ scenario: 'en', scenarioZh: 'zh' }, 'en'), 'en')
})
