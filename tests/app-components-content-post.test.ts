import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { CommentItem } from '../shared/types/comment'
import { apiErrorMessage, errorStatus } from '../app/lib/form-errors'
import {
  findComment,
  mergeBody,
  postEditError,
  replyIds,
  replyTargetFor,
  similarSearchBody,
  similarSearchDelay,
  statusBadgeStyle,
  statusCssVar,
  statusNotifyBody,
  submitDefaults,
  submitError,
} from '../app/components/post/-post-logic'

const comment = (id: string, children?: CommentItem[]): CommentItem => ({
  id,
  parentId: null,
  replyToId: null,
  likeCount: 0,
  hasLiked: false,
  author: { id: 'u', name: 'U', image: null } as CommentItem['author'],
  content: id,
  type: 'comment',
  editedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  children,
})

test('validates an edited post title before its content', () => {
  assert.equal(postEditError('', ''), 'post.detail.errors.titleRequired')
  assert.equal(postEditError('Title', ''), 'post.detail.errors.contentRequired')
  assert.equal(postEditError('Title', 'Body'), null)
})

test('prefers the server message for a failed request', () => {
  assert.equal(apiErrorMessage({ data: { message: 'Nope' } }, 'fallback'), 'Nope')
  assert.equal(apiErrorMessage({ data: { message: '' } }, 'fallback'), 'fallback')
  assert.equal(apiErrorMessage({}, 'fallback'), 'fallback')
  assert.equal(apiErrorMessage(null, 'fallback'), 'fallback')
  assert.equal(errorStatus({ statusCode: 409 }), 409)
  assert.equal(errorStatus(undefined), undefined)
})

test('builds merge bodies for both directions', () => {
  assert.deepEqual(mergeBody('bring', 'current', 'other'), { canonicalPostId: 'current', mergedPostId: 'other' })
  assert.deepEqual(mergeBody('push', 'current', 'other'), { canonicalPostId: 'other', mergedPostId: 'current' })
})

test('omits an empty status notification note', () => {
  assert.deepEqual(statusNotifyBody('done', ''), { status: 'done', note: undefined })
  assert.deepEqual(statusNotifyBody('done', 'Shipped'), { status: 'done', note: 'Shipped' })
})

test('styles statuses and falls back to open for unknown ones', () => {
  assert.equal(statusCssVar('planned'), '--status-planned')
  assert.equal(statusCssVar('archived'), '--status-open')
  assert.deepEqual(statusBadgeStyle('done'), {
    color: 'var(--status-done)',
    backgroundColor: 'var(--status-done-bg)',
    borderColor: 'var(--status-done-border)',
  })
})

test('finds top-level comments and loaded replies', () => {
  const reply = comment('r1')
  const comments = [comment('c1', [reply]), comment('c2')]
  assert.equal(findComment(comments, 'c2')?.id, 'c2')
  assert.equal(findComment(comments, 'r1'), reply)
  assert.equal(findComment(comments, 'missing'), undefined)
})

test('replies into the thread that holds the answered comment', () => {
  const comments = [comment('c1', [comment('r1')]), comment('c2')]
  assert.deepEqual(replyTargetFor(comments, 'c2'), { commentId: 'c2', parentId: 'c2' })
  assert.deepEqual(replyTargetFor(comments, 'r1'), { commentId: 'r1', parentId: 'c1' })
  assert.equal(replyTargetFor(comments, 'missing'), null)
  assert.deepEqual(replyIds({ commentId: 'c2', parentId: 'c2' }), { parentId: 'c2', replyToId: undefined })
  assert.deepEqual(replyIds({ commentId: 'r1', parentId: 'c1' }), { parentId: 'c1', replyToId: 'r1' })
})

test('validates a new post in board, title, content order', () => {
  assert.equal(submitError(null, 'Title', 'Body'), 'post.submit.errors.selectBoard')
  assert.equal(submitError('b1', '  ', 'Body'), 'post.submit.errors.titleRequired')
  assert.equal(submitError('b1', 'Title', ' '), 'post.submit.errors.contentRequired')
  assert.equal(submitError('b1', 'Title', 'Body'), null)
})

test('opens the submit modal on the default board with any prefill', () => {
  const boards = [{ id: 'first' }, { id: 'second' }]
  assert.deepEqual(submitDefaults('second', boards, { title: 'T', body: 'B' }), {
    boardId: 'second',
    title: 'T',
    body: 'B',
  })
  assert.deepEqual(submitDefaults(undefined, boards, undefined), {
    boardId: 'first',
    title: undefined,
    body: undefined,
  })
  assert.equal(submitDefaults(undefined, [], {}).boardId, null)
})

test('searches similar posts with the body only when one is written', () => {
  assert.deepEqual(similarSearchBody('Title', '  '), { title: 'Title' })
  assert.deepEqual(similarSearchBody('Title', ' Body '), { title: 'Title', content: 'Body' })
  assert.equal(similarSearchDelay(''), 500)
  assert.equal(similarSearchDelay('Body'), 1000)
})
