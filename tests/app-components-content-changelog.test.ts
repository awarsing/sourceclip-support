import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { CHANGELOG_EMOJIS } from '../shared/types/changelog'
import {
  applyServerReactions,
  canGenerateChangelog,
  changelogBody,
  hasTitleAndContent,
  isOutsideClick,
  normalizeStatus,
  pickedFeedback,
  reactionPath,
  shiftReaction,
  toggleCategory,
  toggleLimitedSelection,
  typeIcon,
  typeToggleClass,
} from '../app/components/changelog/-changelog-logic'

test('builds the changelog body with a trimmed title', () => {
  assert.deepEqual(changelogBody({ title: ' T ', content: ' C ', categories: ['new'], cover: null }), {
    title: 'T',
    content: ' C ',
    categories: ['new'],
    cover: null,
  })
  assert.equal(hasTitleAndContent({ title: 'T', content: 'C' }), true)
  assert.equal(hasTitleAndContent({ title: ' ', content: 'C' }), false)
  assert.equal(hasTitleAndContent({ title: 'T', content: ' ' }), false)
})

test('toggles categories and styles them by type', () => {
  assert.deepEqual(toggleCategory(['new'], 'fixed'), ['new', 'fixed'])
  assert.deepEqual(toggleCategory(['new', 'fixed'], 'new'), ['fixed'])
  assert.equal(typeToggleClass('new', false), 'border-border bg-background text-muted-foreground hover:bg-muted')
  assert.equal(typeToggleClass('new', true), 'border-primary/25 bg-primary/10 text-primary')
  assert.equal(typeToggleClass('improved', true), 'border-chart-2/25 bg-chart-2/10 text-chart-2')
  assert.equal(typeToggleClass('fixed', true), 'border-success/25 bg-success/10 text-success')
  assert.equal(typeIcon('new'), 'lucide:sparkles')
  assert.equal(typeIcon('improved'), 'lucide:zap')
  assert.equal(typeIcon('fixed'), 'lucide:wrench')
})

test('shifts reactions on and off without going negative', () => {
  const counts: Record<string, number> = {}
  const picked: Record<string, boolean> = {}
  shiftReaction(counts, picked, 'a', true)
  assert.deepEqual([counts.a, picked.a], [1, true])
  shiftReaction(counts, picked, 'a', false)
  assert.deepEqual([counts.a, picked.a], [0, false])
  shiftReaction(counts, picked, 'b', false)
  assert.deepEqual([counts.b, picked.b], [0, false])
})

test('applies the reactions the server recorded', () => {
  const counts: Record<string, number> = { [CHANGELOG_EMOJIS[0]]: 9 }
  const picked: Record<string, boolean> = { [CHANGELOG_EMOJIS[0]]: true }
  applyServerReactions(
    counts,
    picked,
    { reactionCounts: { [CHANGELOG_EMOJIS[1]]: 2 }, userReactions: [CHANGELOG_EMOJIS[1]] },
    CHANGELOG_EMOJIS,
  )
  assert.equal(counts[CHANGELOG_EMOJIS[0]], 9)
  assert.equal(counts[CHANGELOG_EMOJIS[1]], 2)
  assert.equal(picked[CHANGELOG_EMOJIS[0]], false)
  assert.equal(picked[CHANGELOG_EMOJIS[1]], true)
})

test('addresses reactions and detects outside clicks', () => {
  assert.equal(reactionPath('c1', '+', false), '/api/changelogs/c1/reactions')
  assert.equal(reactionPath('c1', '+', true), '/api/changelogs/c1/reactions?emoji=%2B')
  const inside = { id: 'inside' }
  const root = { contains: (node: unknown) => node === inside }
  assert.equal(isOutsideClick(true, root, { id: 'outside' }), true)
  assert.equal(isOutsideClick(true, root, inside), false)
  assert.equal(isOutsideClick(true, root, null), false)
  assert.equal(isOutsideClick(false, root, { id: 'outside' }), false)
  assert.equal(isOutsideClick(true, null, { id: 'outside' }), false)
})

test('needs feedback or a description to generate', () => {
  assert.equal(canGenerateChangelog([], ' '), false)
  assert.equal(canGenerateChangelog(['f1'], ''), true)
  assert.equal(canGenerateChangelog([], 'notes'), true)
})

test('limits feedback selection and keeps the picked order', () => {
  assert.deepEqual(toggleLimitedSelection(['a'], 'b', 2), ['a', 'b'])
  assert.deepEqual(toggleLimitedSelection(['a', 'b'], 'a', 2), ['b'])
  assert.deepEqual(toggleLimitedSelection(['a', 'b'], 'c', 2), ['a', 'b'])
  const sources = [
    { id: 'a', title: 'A', voteCount: 1 },
    { id: 'b', title: 'B', voteCount: 2 },
  ]
  assert.deepEqual(pickedFeedback(['b', 'missing', 'a'], sources), [
    { id: 'b', title: 'B' },
    { id: 'a', title: 'A' },
  ])
  assert.equal(normalizeStatus('In Progress'), 'in_progress')
})
