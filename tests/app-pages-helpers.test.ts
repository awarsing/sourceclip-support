import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { FilterCondition } from '../app/composables/useFeedbackFilters'
import { adminStatusBadge, adminTypeBadgeClass, categoryBadgeClass, formatListDate } from '../app/lib/pages/changelog'
import { errorStatus } from '../app/lib/form-errors'
import { acceptFailure, inviteState } from '../app/lib/pages/invite'
import {
  formatExpiresIn,
  inviteButtonKey,
  inviteToast,
  isLastOwner,
  parseInviteEmails,
  roleChangeAllowed,
} from '../app/lib/pages/members'
import { newPasswordProblem, PASSWORD_MIN_LENGTH } from '../app/lib/auth-forms'
import { isDefiniteFailure, readBackState, saveStatus } from '../app/lib/pages/personal'
import {
  applyBoardPostUpdate,
  applyFeedbackUpdate,
  applyVote,
  blankCondition,
  boardQuery,
  compactPageNumbers,
  conditionBinding,
  conditionHasValue,
  isDroppedByFilter,
  needsStatusUpdate,
  nextSortOrder,
  pageRange,
  parseFeedbackSort,
  removePost,
  resolveBoardId,
  showsStatusBadge,
  statusStyle,
  submitPrefillFromQuery,
  upsertCondition,
  valuesPatch,
  voteMethod,
  windowPageNumbers,
} from '../app/lib/pages/posts'

const BOARD_UUID = '0b6f8f2e-3c1d-4f6a-9a51-6d7b2c9e4f10'

test('changelog badges fall back for unknown categories and statuses', () => {
  assert.match(categoryBadgeClass('new'), /text-primary/)
  assert.match(categoryBadgeClass('other'), /bg-secondary/)
  assert.match(adminTypeBadgeClass('improved'), /text-chart-2/)
  assert.match(adminTypeBadgeClass('fixed'), /text-success/)
  assert.equal(adminStatusBadge('published').icon, 'lucide:check-circle')
  assert.deepEqual(adminStatusBadge('archived'), {
    tone: adminStatusBadge('draft').tone,
    icon: 'lucide:alert-circle',
  })
  assert.equal(formatListDate(null), '-')
  assert.equal(formatListDate('2026-03-05T12:00:00Z'), 'March 5, 2026')
})

test('errorStatus reads the status code of a failed fetch', () => {
  assert.equal(errorStatus({ statusCode: 404 }), 404)
  assert.equal(errorStatus(null), undefined)
  assert.equal(errorStatus(new Error('boom')), undefined)
})

test('inviteState walks loading, invalid, anonymous, match and mismatch', () => {
  const invitation = { email: 'a@example.com' }
  assert.equal(inviteState(true, false, invitation, null), 'loading')
  assert.equal(inviteState(false, true, invitation, null), 'invalid')
  assert.equal(inviteState(false, false, null, { email: 'a@example.com' }), 'invalid')
  assert.equal(inviteState(false, false, invitation, undefined), 'anonymous')
  assert.equal(inviteState(false, false, invitation, { email: 'a@example.com' }), 'match')
  assert.equal(inviteState(false, false, invitation, { email: 'b@example.com' }), 'mismatch')
  assert.equal(acceptFailure(new Error('expired')), 'expired')
  assert.equal(acceptFailure(null), 'invalid')
  assert.equal(acceptFailure({}), 'invalid')
})

test('members helpers parse invites, format expiry and guard the last owner', () => {
  assert.deepEqual(parseInviteEmails(' a@x.io, b@x.io;c@x.io\n d@x.io  '), ['a@x.io', 'b@x.io', 'c@x.io', 'd@x.io'])
  const now = Date.parse('2026-01-01T00:00:00Z')
  assert.equal(formatExpiresIn(null, 'Expired', now), '')
  assert.equal(formatExpiresIn('2025-12-31T00:00:00Z', 'Expired', now), 'Expired')
  assert.equal(formatExpiresIn('2026-01-04T01:00:00Z', 'Expired', now), '3d')
  assert.equal(formatExpiresIn('2026-01-01T05:30:00Z', 'Expired', now), '5h')
  assert.equal(formatExpiresIn('2026-01-01T00:12:30Z', 'Expired', now), '12m')
  assert.equal(formatExpiresIn('2026-01-01T00:00:10Z', 'Expired', now), '1m')

  assert.equal(isLastOwner({ role: 'owner' }, 1), true)
  assert.equal(isLastOwner({ role: 'owner' }, 2), false)
  assert.equal(isLastOwner({ role: 'manager' }, 1), false)
  assert.equal(roleChangeAllowed({ role: 'owner' }, 'owner', 1), false)
  assert.equal(roleChangeAllowed({ role: 'owner' }, 'manager', 1), false)
  assert.equal(roleChangeAllowed({ role: 'owner' }, 'manager', 2), true)
  assert.equal(roleChangeAllowed({ role: 'contributor' }, 'owner', 1), true)

  assert.equal(inviteButtonKey(true, true), 'settings.members.sending')
  assert.equal(inviteButtonKey(true, false), 'settings.members.creating')
  assert.equal(inviteButtonKey(false, true), 'settings.members.sendInvites')
  assert.equal(inviteButtonKey(false, false), 'settings.members.createInvites')
  assert.deepEqual(inviteToast(2, true), {
    title: 'settings.members.invitationsCreated',
    description: 'settings.members.inviteToastEmailOn',
  })
  assert.deepEqual(inviteToast(1, false), {
    title: 'settings.members.invitationCreated',
    description: 'settings.members.inviteToastEmailOff',
  })
})

test('newPasswordProblem reports a mismatch before a short password', () => {
  const long = 'x'.repeat(PASSWORD_MIN_LENGTH)
  assert.equal(newPasswordProblem('short', 'other'), 'auth.errors.passwordsMismatch')
  assert.equal(newPasswordProblem('short', 'short'), 'auth.errors.passwordTooShort')
  assert.equal(newPasswordProblem(long, long), null)
})

test('personal preference save states', () => {
  assert.equal(isDefiniteFailure(403), true)
  assert.equal(isDefiniteFailure(408), false)
  assert.equal(isDefiniteFailure(500), false)
  assert.equal(isDefiniteFailure(undefined), false)
  const prefs = (enabled: boolean) => ({ notifications: { staff_feedback_email_enabled: enabled } })
  assert.equal(readBackState(null, true), 'unknown')
  assert.equal(readBackState(prefs(true), true), 'saved')
  assert.equal(readBackState(prefs(false), true), 'saveError')
  assert.equal(saveStatus('saveError', true)?.key, 'settings.personal.saveError')
  assert.equal(saveStatus('saved', false)?.icon, 'lucide:check')
  assert.deepEqual(saveStatus('ready', true), { key: 'settings.unsavedChanges', icon: null })
  assert.equal(saveStatus('ready', false), null)
})

test('status styling and badges', () => {
  assert.deepEqual(statusStyle('planned'), {
    color: 'var(--status-planned)',
    backgroundColor: 'var(--status-planned-bg)',
    borderColor: 'var(--status-planned-border)',
  })
  assert.equal(statusStyle('bogus').color, 'var(--status-open)')
  assert.equal(statusStyle(undefined).color, 'var(--status-open)')
  assert.equal(showsStatusBadge('done'), true)
  assert.equal(showsStatusBadge('open'), false)
  assert.equal(showsStatusBadge('bogus'), false)
  assert.equal(showsStatusBadge(undefined), false)
})

test('isDroppedByFilter honours is and not conditions', () => {
  const is: FilterCondition[] = [{ field: 'status', op: 'is', values: ['planned'] }]
  const not: FilterCondition[] = [{ field: 'status', op: 'not', values: ['done'] }]
  assert.equal(isDroppedByFilter([], 'status', 'done'), false)
  assert.equal(isDroppedByFilter([{ field: 'status', op: 'is', values: [] }], 'status', 'done'), false)
  assert.equal(isDroppedByFilter(is, 'status', 'done'), true)
  assert.equal(isDroppedByFilter(is, 'status', 'planned'), false)
  assert.equal(isDroppedByFilter(not, 'status', 'done'), true)
  assert.equal(isDroppedByFilter(not, 'status', 'open'), false)
})

test('feedback table updates patch or drop rows', () => {
  const page = () => ({
    data: [
      { id: 'a', status: 'open', boardId: 'b1' },
      { id: 'b', status: 'open', boardId: 'b1' },
    ],
    pagination: { total: 2 },
  })
  const conditions: FilterCondition[] = [
    { field: 'status', op: 'is', values: ['open'] },
    { field: 'boardId', op: 'is', values: ['b1'] },
  ]

  const patched = page()
  applyFeedbackUpdate(patched, { id: 'a', boardId: 'b1' }, conditions)
  applyFeedbackUpdate(patched, { id: 'missing', status: 'done' }, conditions)
  assert.equal(patched.data.length, 2)

  const byStatus = page()
  applyFeedbackUpdate(byStatus, { id: 'a', status: 'done' }, conditions)
  assert.deepEqual(
    byStatus.data.map((p) => p.id),
    ['b'],
  )
  assert.equal(byStatus.pagination.total, 1)

  const byBoard = page()
  applyFeedbackUpdate(byBoard, { id: 'b', boardId: null }, conditions)
  assert.deepEqual(
    byBoard.data.map((p) => p.id),
    ['a'],
  )

  const kept = page()
  applyFeedbackUpdate(kept, { id: 'a', status: 'done' }, [])
  assert.equal(kept.data[0]!.status, 'done')

  applyFeedbackUpdate(null, { id: 'a' }, conditions)
  const noTotal = { data: [{ id: 'a' }] }
  removePost(noTotal, 'a')
  removePost(noTotal, 'a')
  removePost(undefined, 'a')
  assert.equal(noTotal.data.length, 0)
})

test('board list updates report board moves and drop posts that leave the board', () => {
  const posts = () => [
    { id: 'a', boardId: 'b1', voteCount: 0 },
    { id: 'b', boardId: 'b1', voteCount: 0 },
  ]
  assert.equal(applyBoardPostUpdate(posts(), { id: 'zz', boardId: 'b2' }, null), false)

  const stay = posts()
  assert.equal(applyBoardPostUpdate(stay, { id: 'a', status: 'done' }, 'b1'), false)
  assert.equal(stay[0]!.status, 'done')

  const moved = posts()
  assert.equal(applyBoardPostUpdate(moved, { id: 'a', boardId: 'b2' }, 'b1'), true)
  assert.deepEqual(
    moved.map((p) => p.id),
    ['b'],
  )

  const allBoards = posts()
  assert.equal(applyBoardPostUpdate(allBoards, { id: 'a', boardId: 'b2' }, null), true)
  assert.equal(allBoards[0]!.boardId, 'b2')
})

test('votes adjust counts only on change', () => {
  const post = { id: 'a', voteCount: 3, hasVoted: false }
  applyVote(post, false)
  assert.equal(post.voteCount, 3)
  applyVote(post, true)
  assert.deepEqual([post.voteCount, post.hasVoted], [4, true])
  applyVote(post, false)
  assert.deepEqual([post.voteCount, post.hasVoted], [3, false])
  assert.equal(voteMethod(true), 'DELETE')
  assert.equal(voteMethod(false), 'POST')
})

test('resolveBoardId accepts a uuid or a board name', () => {
  const boards = [
    { id: 'id-1', name: 'Ideas' },
    { id: 'id-2', name: 'ideas' },
  ]
  assert.equal(resolveBoardId(undefined, boards), null)
  assert.equal(resolveBoardId(['x'], boards), null)
  assert.equal(resolveBoardId(BOARD_UUID, boards), BOARD_UUID)
  assert.equal(resolveBoardId(' IDEAS ', boards), 'id-1')
  assert.equal(resolveBoardId('bugs', boards), null)
  assert.deepEqual(boardQuery('id-1'), { b: 'id-1' })
  assert.deepEqual(boardQuery(null), {})
})

test('submitPrefillFromQuery opens the form and strips one-shot params', () => {
  assert.equal(submitPrefillFromQuery({}), null)
  assert.equal(submitPrefillFromQuery({ new: '0' }), null)
  assert.equal(submitPrefillFromQuery({ new: 'false' }), null)
  assert.deepEqual(submitPrefillFromQuery({ new: null, title: 'x'.repeat(250), body: 5, b: 'id-1' }), {
    prefill: { title: 'x'.repeat(200), body: undefined },
    query: { b: 'id-1' },
  })
})

test('sorting and pagination helpers', () => {
  assert.equal(parseFeedbackSort('votes'), 'votes')
  assert.equal(parseFeedbackSort('bogus'), 'createdAt')
  assert.equal(nextSortOrder('votes', 'desc', 'votes'), 'asc')
  assert.equal(nextSortOrder('votes', 'asc', 'votes'), 'desc')
  assert.equal(nextSortOrder('votes', 'desc', 'comments'), 'desc')
  assert.deepEqual(compactPageNumbers(4, 2), [1, 2, 3, 4])
  assert.deepEqual(compactPageNumbers(10, 1), [1, 2, 3])
  assert.deepEqual(compactPageNumbers(10, 5), [4, 5, 6])
  assert.deepEqual(compactPageNumbers(10, 10), [9, 10])
  assert.deepEqual(windowPageNumbers(3, 2), [1, 2, 3])
  assert.deepEqual(windowPageNumbers(10, 1), [1, 2, 3, 4, 5])
  assert.deepEqual(windowPageNumbers(10, 6), [4, 5, 6, 7, 8])
  assert.deepEqual(windowPageNumbers(10, 10), [6, 7, 8, 9, 10])
  assert.deepEqual(pageRange(2, 20, 35), { from: 21, to: 35, total: 35 })
})

test('filter condition helpers', () => {
  assert.deepEqual(blankCondition('created'), { field: 'created', op: 'after' })
  assert.deepEqual(blankCondition('merged'), { field: 'merged', value: '' })
  assert.deepEqual(blankCondition('status'), { field: 'status', op: 'is', values: [] })

  assert.equal(conditionHasValue({ field: 'created', op: 'after' }), false)
  assert.equal(conditionHasValue({ field: 'created', op: 'before', to: '2026-01-01' }), true)
  assert.equal(conditionHasValue({ field: 'merged', value: '' }), false)
  assert.equal(conditionHasValue({ field: 'merged', value: 'yes' }), true)
  assert.equal(conditionHasValue({ field: 'author', op: 'is', values: ['u1'] }), true)

  const start: FilterCondition[] = [{ field: 'status', op: 'is', values: ['open'] }]
  const replaced = upsertCondition(start, { field: 'status', op: 'not', values: ['done'] })
  assert.deepEqual(replaced, [{ field: 'status', op: 'not', values: ['done'] }])
  assert.deepEqual(upsertCondition(start, { field: 'status', op: 'is', values: [] }), [])

  assert.deepEqual(conditionBinding({ field: 'status', op: 'not', values: ['done'] }), {
    op: 'not',
    values: ['done'],
    from: undefined,
    to: undefined,
  })
  assert.deepEqual(conditionBinding({ field: 'created', op: 'range', from: 'a', to: 'b' }), {
    op: 'range',
    values: [],
    from: 'a',
    to: 'b',
  })
  assert.deepEqual(conditionBinding({ field: 'merged', value: 'yes' }), {
    op: 'is',
    values: ['yes'],
    from: undefined,
    to: undefined,
  })

  assert.deepEqual(valuesPatch('single', ['a', 'b']), { value: 'a' })
  assert.deepEqual(valuesPatch('multi', ['a', 'b']), { values: ['a', 'b'] })
  assert.equal(needsStatusUpdate(null), false)
  assert.equal(needsStatusUpdate('open'), false)
  assert.equal(needsStatusUpdate('planned'), true)
})
