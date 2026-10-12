import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  bulkBody,
  bulkResultMessage,
  formatShortDate,
  hasNoContent,
  selectionState,
  shownRange,
  toggleCollectionArticles,
  toggledSet,
  withoutId,
} from '../app/lib/pages/help'
import { activeHeading, createAnchorIds, headingSlug, tocItemClass } from '../app/lib/pages/help-article'
import { apiErrorMessage } from '../app/lib/pages/http'
import { navGroupClasses, navGroupVisibility } from '../app/lib/pages/layout'
import {
  canRestore,
  embedTitleKey,
  feedbackListUrl,
  isScrollableBox,
  restoredConversationId,
  resumeSnapshot,
  rootView,
  shouldContainWheel,
} from '../app/lib/pages/widget-embed'
import {
  type DraftRule,
  differsFrom,
  isValidOffset,
  isValidRetention,
  ruleLabel,
  saveBlocked,
  toggleDraftRule,
  upsertDraftRule,
} from '../app/lib/pages/widget-settings'

test('help list selection helpers', () => {
  const set = new Set(['a'])
  assert.deepEqual([...toggledSet(set, 'b')], ['a', 'b'])
  assert.deepEqual([...toggledSet(set, 'a')], [])
  assert.deepEqual([...withoutId(set, 'a')], [])
  assert.deepEqual([...set], ['a'])

  assert.equal(selectionState([], set), 'none')
  assert.equal(selectionState(['x', 'y'], set), 'none')
  assert.equal(selectionState(['a', 'y'], set), 'some')
  assert.equal(selectionState(['a'], set), 'all')

  const selectAll = toggleCollectionArticles(['a', 'b'], set)
  assert.deepEqual([...selectAll.selected].sort(), ['a', 'b'])
  assert.equal(selectAll.expand, true)
  const clear = toggleCollectionArticles(['a', 'b'], new Set(['a', 'b', 'c']))
  assert.deepEqual([...clear.selected], ['c'])
  assert.equal(clear.expand, false)
})

test('help list stats, bulk and range helpers', () => {
  assert.equal(hasNoContent(null), true)
  assert.equal(hasNoContent({ collectionCount: 0, articleCount: 0 }), true)
  assert.equal(hasNoContent({ collectionCount: 1, articleCount: 0 }), false)
  assert.equal(hasNoContent({ collectionCount: 0, articleCount: 2 }), false)

  assert.deepEqual(bulkBody(['a']), { ids: ['a'] })
  assert.deepEqual(bulkBody(['a'], false), { ids: ['a'], aiEnabled: false })
  assert.deepEqual(bulkResultMessage('ai-visibility', 3), { key: 'help.admin.aiUpdated', n: undefined })
  assert.deepEqual(bulkResultMessage('publish', 3), { key: 'help.admin.publishResult', n: 3 })
  assert.deepEqual(bulkResultMessage('unpublish', 1), { key: 'help.admin.unpublishResult', n: 1 })

  assert.deepEqual(shownRange(1, 10, 0), { from: 0, to: 0 })
  assert.deepEqual(shownRange(2, 10, 15), { from: 11, to: 15 })
  assert.equal(formatShortDate('2026-03-05T12:00:00Z'), 'Mar 5, 2026')
})

test('help article anchors are slugged and numbered per render', () => {
  assert.equal(headingSlug('Getting Started!', 0), 'getting-started')
  assert.equal(headingSlug('快速开始', 1), '快速开始')
  assert.equal(headingSlug('***', 4), 'section-4')
  assert.equal(headingSlug(undefined, 2), 'section-2')

  const anchorId = createAnchorIds()
  assert.equal(anchorId({ text: 'Setup', index: 1 }), 'setup')
  assert.equal(anchorId({ text: 'Setup', index: 2 }), 'setup-2')
  assert.equal(anchorId({ text: 'Setup', index: 3 }), 'setup-3')
  // A new render starts again from the first heading.
  assert.equal(anchorId({ text: 'Setup', index: 1 }), 'setup')
  assert.equal(anchorId({ text: '' }), 'section-0')
})

test('help article table of contents', () => {
  const headings = [
    { id: 'a', top: -200 },
    { id: 'b', top: 50 },
    { id: 'c', top: 400 },
  ]
  assert.equal(activeHeading(headings, 60, false), 'b')
  assert.equal(activeHeading(headings, 0, false), 'a')
  assert.equal(activeHeading([{ id: 'a', top: 500 }], 60, false), 'a')
  assert.equal(activeHeading(headings, 60, true), 'c')
  assert.equal(activeHeading([], 60, true), '')

  assert.deepEqual(tocItemClass(2, true), ['pl-3.5 text-[13px]', 'font-semibold', 'border-primary text-primary'])
  assert.deepEqual(tocItemClass(3, false), [
    'pl-7 text-[12.5px]',
    'font-medium',
    'border-border text-muted-foreground hover:text-foreground',
  ])
  assert.equal(tocItemClass(2, false)[1], '')
})

test('apiErrorMessage prefers the server message', () => {
  assert.equal(apiErrorMessage({ data: { message: 'Nope' } }, 'fallback'), 'Nope')
  assert.equal(apiErrorMessage({ data: { message: '' } }, 'fallback'), 'fallback')
  assert.equal(apiErrorMessage(null, 'fallback'), 'fallback')
})

test('nav group classes and visibility by variant', () => {
  assert.equal(navGroupClasses('mobile').link, 'px-3')
  assert.match(navGroupClasses('desktop').label, /hidden/)
  assert.deepEqual(navGroupVisibility('mobile', true), { shown: false, listClass: '' })
  assert.deepEqual(navGroupVisibility('mobile', false), { shown: true, listClass: '' })
  assert.deepEqual(navGroupVisibility('desktop', true), { shown: true, listClass: 'min-[1360px]:hidden' })
  assert.deepEqual(navGroupVisibility('desktop', false), { shown: true, listClass: '' })
})

test('widget embed resume snapshot and restore', () => {
  const chat = { conversationId: 'c1', draft: 'hi' }
  const snap = resumeSnapshot({ email: 'a@x.io', isAnonymous: false }, 'chat', 'c0', chat, 12)
  assert.deepEqual(snap, { owner: 'a@x.io', anonymous: false, view: 'chat', conversationId: 'c0', chat, scrollTop: 12 })
  assert.notEqual(snap.chat, chat)
  assert.deepEqual(resumeSnapshot(null, 'list', null, null, 0), {
    owner: null,
    anonymous: true,
    view: 'list',
    conversationId: null,
    chat: null,
    scrollTop: 0,
  })
  assert.equal(resumeSnapshot({ email: 'g@x.io', isAnonymous: true }, 'chat', null, null, 0).anonymous, true)

  assert.equal(canRestore({ anonymous: true, owner: 'g@x.io' }, 'other@x.io'), true)
  assert.equal(canRestore({ anonymous: false, owner: 'a@x.io' }, 'a@x.io'), true)
  assert.equal(canRestore({ anonymous: false, owner: 'a@x.io' }, 'b@x.io'), false)

  assert.equal(restoredConversationId({ ...snap, view: 'list' }), 'c0')
  assert.equal(restoredConversationId(snap), 'c1')
  assert.equal(restoredConversationId({ ...snap, chat: null }), 'c0')
  assert.equal(restoredConversationId({ ...snap, chat: { conversationId: null, draft: '' } }), 'c0')
})

test('widget embed wheel containment', () => {
  const root = { name: 'root' }
  const inner = { name: 'inner' }
  const outside = { name: 'outside' }
  const none = () => false
  assert.equal(shouldContainWheel({ ctrlKey: true, deltaY: 5 }, [inner, root], root, none), false)
  assert.equal(shouldContainWheel({ ctrlKey: false, deltaY: 0 }, [inner, root], root, none), false)
  assert.equal(shouldContainWheel({ ctrlKey: false, deltaY: 5 }, [inner, root], root, none), true)
  assert.equal(
    shouldContainWheel({ ctrlKey: false, deltaY: 5 }, [inner, root], root, (node) => node === inner),
    false,
  )
  // Elements past the widget root do not count.
  assert.equal(
    shouldContainWheel({ ctrlKey: false, deltaY: 5 }, [inner, root, outside], root, (node) => node === outside),
    true,
  )
  assert.equal(isScrollableBox('auto', 500, 200), true)
  assert.equal(isScrollableBox('scroll', 500, 200), true)
  assert.equal(isScrollableBox('auto', 200, 200), false)
  assert.equal(isScrollableBox('hidden', 500, 200), false)
})

test('widget embed list request, title and root view', () => {
  assert.equal(feedbackListUrl(false, 'cur', 35, 20), '/api/widget/feedback?pageSize=35')
  assert.equal(feedbackListUrl(false, null, 3, 20), '/api/widget/feedback?pageSize=20')
  assert.equal(feedbackListUrl(true, 'a b', 35, 20), '/api/widget/feedback?pageSize=20&cursor=a%20b')
  assert.equal(feedbackListUrl(true, null, 35, 20), '/api/widget/feedback?pageSize=20')
  assert.equal(embedTitleKey('conversations'), 'widget.messages')
  assert.equal(embedTitleKey('list'), 'widget.myFeedback')
  assert.equal(embedTitleKey('chat'), 'widget.agentTitle')
  assert.equal(rootView(0, 0), 'chat')
  assert.equal(rootView(2, 0), 'conversations')
  assert.equal(rootView(0, 1), 'conversations')
})

test('widget settings validation', () => {
  assert.equal(isValidOffset(24, 0), true)
  assert.equal(isValidOffset('12', 0), true)
  assert.equal(isValidOffset(' ', 0), false)
  assert.equal(isValidOffset('1.5', 0), false)
  assert.equal(isValidOffset(-1, 0), false)
  assert.equal(isValidOffset(2 ** 60, 0), false)
  assert.equal(isValidRetention(30, 1, 365), true)
  assert.equal(isValidRetention('', 1, 365), false)
  assert.equal(isValidRetention(0, 1, 365), false)
  assert.equal(isValidRetention(400, 1, 365), false)
  assert.equal(isValidRetention('7.5', 1, 365), false)

  assert.equal(differsFrom({ a: 1, b: 'x' }, { a: 1, b: 'x' }), false)
  assert.equal(differsFrom({ a: 1, b: 'y' }, { a: 1, b: 'x' }), true)
  assert.equal(saveBlocked(true, true, true), true)
  assert.equal(saveBlocked(false, false, true), true)
  assert.equal(saveBlocked(false, true, false), true)
  assert.equal(saveBlocked(false, true, true), false)
})

test('widget settings rules', () => {
  const builtins = [{ id: 'b1', scenario: 'Refunds', scenarioZh: '退款' }]
  const rule = (id: string, enabled: boolean, builtin = false): DraftRule => ({
    id,
    scenario: `text ${id}`,
    enabled,
    builtin,
  })
  assert.equal(ruleLabel(rule('b1', true, true), builtins, 'en'), 'Refunds')
  assert.equal(ruleLabel(rule('b1', true, true), builtins, 'zh-CN'), '退款')
  assert.equal(ruleLabel(rule('b2', true, true), builtins, 'en'), 'text b2')
  assert.equal(ruleLabel(rule('b1', true, true), undefined, 'en'), 'text b1')
  assert.equal(ruleLabel(rule('c1', true), builtins, 'en'), 'text c1')

  const rules = [rule('on', true), rule('off', false)]
  assert.equal(toggleDraftRule(rules, 'missing', false), null)
  assert.equal(toggleDraftRule(rules, 'off', true), 'limit')
  assert.equal(rules[1]!.enabled, false)
  assert.equal(toggleDraftRule(rules, 'on', true), 'toggled')
  assert.equal(rules[0]!.enabled, false)
  assert.equal(toggleDraftRule(rules, 'off', false), 'toggled')
  assert.equal(rules[1]!.enabled, true)

  upsertDraftRule(rules, 'on', 'edited', () => 'unused')
  assert.equal(rules[0]!.scenario, 'edited')
  upsertDraftRule(rules, 'gone', 'ignored', () => 'unused')
  assert.equal(rules.length, 2)
  upsertDraftRule(rules, null, 'fresh', () => 'uuid')
  assert.deepEqual(rules[2], { id: 'new-uuid', scenario: 'fresh', enabled: true, builtin: false })
})
