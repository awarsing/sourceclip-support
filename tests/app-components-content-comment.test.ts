import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { CommentItem } from '../shared/types/comment'
import {
  appendCommentPage,
  canLoadMergedComments,
  commentPageParams,
  commentSizing,
  hasMoreMergedComments,
  hasMoreReplies,
  isMergedSubPost,
  mergedSubComments,
  nextMergedPage,
  remainingReplies,
  buildReplyAuthorMap,
  replyToName,
  startCommentLoad,
} from '../app/components/comment/-comment-logic'

const author = (id: string) => ({ id, name: id.toUpperCase(), image: null }) as CommentItem['author']

const comment = (id: string, extra: Partial<CommentItem> = {}): CommentItem => ({
  id,
  parentId: null,
  replyToId: null,
  likeCount: 0,
  hasLiked: false,
  author: author(`a-${id}`),
  content: id,
  type: 'comment',
  editedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

const mergedPost = (nextCursor: string | null, data: CommentItem[] = []): NonNullable<CommentItem['mergedPost']> => ({
  post: { id: 'p1', slug: 'p1', title: 'P1', excerpt: null, commentCount: 3, author: author('p') },
  comments: { data, pagination: { nextCursor } },
})

test('sizes nested replies smaller than top-level comments', () => {
  const top = commentSizing(false)
  const nested = commentSizing(true)
  assert.equal(top.avatar, 10)
  assert.equal(nested.avatar, 8)
  assert.equal(top.row, '')
  assert.equal(nested.row, 'ml-10')
  assert.equal(nested.actionText, 'text-[11px]')
})

test('counts replies that are not loaded yet', () => {
  assert.equal(remainingReplies({ replyCount: 5, children: [comment('a'), comment('b')] }), 3)
  assert.equal(remainingReplies({}), 0)
  assert.equal(hasMoreReplies({ replyCount: 3, children: [comment('a')] }), true)
  assert.equal(hasMoreReplies({ replyCount: 3, children: [comment('a')] }, 1), false)
  assert.equal(hasMoreReplies({ replyCount: 1, children: [comment('a')] }), false)
})

test('maps replies to author names and resolves the answered author', () => {
  const children = [comment('r1'), comment('r2', { author: null as unknown as CommentItem['author'] })]
  const map = buildReplyAuthorMap(children, (who) => `name:${who.id}`)
  assert.deepEqual([...map], [['r1', 'name:a-r1']])
  assert.equal(buildReplyAuthorMap(undefined, () => 'x').size, 0)
  assert.equal(replyToName({ replyToId: 'r1', parentId: 'c1' }, map), 'name:a-r1')
  assert.equal(replyToName({ replyToId: 'c1', parentId: 'c1' }, map), null)
  assert.equal(replyToName({ replyToId: null, parentId: 'c1' }, map), null)
  assert.equal(replyToName({ replyToId: 'missing', parentId: 'c1' }, map), null)
  assert.equal(replyToName({ replyToId: 'r1', parentId: 'c1' }, undefined), null)
})

test('joins a merged post comments with later pages', () => {
  const mp = mergedPost('c1', [comment('a')])
  assert.deepEqual(mergedSubComments(undefined, {}), [])
  assert.deepEqual(
    mergedSubComments(mp, {}).map((entry) => entry.id),
    ['a'],
  )
  assert.deepEqual(
    mergedSubComments(mp, { p1: { data: [comment('b')], cursor: null } }).map((entry) => entry.id),
    ['a', 'b'],
  )
})

test('reports more merged comments from the latest known cursor', () => {
  assert.equal(hasMoreMergedComments(undefined, {}), false)
  assert.equal(hasMoreMergedComments(mergedPost('c1'), {}), true)
  assert.equal(hasMoreMergedComments(mergedPost(null), {}), false)
  assert.equal(hasMoreMergedComments(mergedPost('c1'), { p1: { data: [], cursor: null } }), false)
  assert.equal(hasMoreMergedComments(mergedPost(null), { p1: { data: [], cursor: 'c2' } }), true)
})

test('picks the next merged page to request', () => {
  const loaded = [comment('a')]
  assert.equal(nextMergedPage(undefined, {}, false), null)
  assert.equal(nextMergedPage(mergedPost('c1'), {}, true), null)
  assert.deepEqual(nextMergedPage(mergedPost('c1'), {}, false), { postId: 'p1', cursor: 'c1', previous: [] })
  assert.deepEqual(nextMergedPage(mergedPost('c1'), { p1: { data: loaded, cursor: 'c2' } }, false), {
    postId: 'p1',
    cursor: 'c2',
    previous: loaded,
  })
  assert.equal(nextMergedPage(mergedPost(null), {}, false), null)
})

test('appends comment pages and builds their query', () => {
  assert.deepEqual(appendCommentPage([1], { data: [2, 3], pagination: { nextCursor: 'n' } }), {
    data: [1, 2, 3],
    cursor: 'n',
  })
  assert.deepEqual(commentPageParams('c1'), { sort: 'oldest', limit: 5, withChildren: 'false', cursor: 'c1' })
  assert.deepEqual(commentPageParams(undefined), { sort: 'oldest', limit: 5, withChildren: 'false' })
})

test('starts a second-level comment load once at a time', () => {
  assert.deepEqual(startCommentLoad(undefined), {
    state: { data: [], loading: true, cursor: null },
    cursor: undefined,
  })
  assert.deepEqual(startCommentLoad({ data: [1], loading: false, cursor: 'c2' }), {
    state: { data: [1], loading: true, cursor: 'c2' },
    cursor: 'c2',
  })
  assert.equal(startCommentLoad({ data: [], loading: true, cursor: null }), null)
})

test('offers loading second-level comments while more exist', () => {
  assert.equal(canLoadMergedComments(0, undefined), false)
  assert.equal(canLoadMergedComments(undefined, undefined), false)
  assert.equal(canLoadMergedComments(2, undefined), true)
  assert.equal(canLoadMergedComments(2, { data: [], loading: true, cursor: null }), true)
  assert.equal(canLoadMergedComments(2, { data: [], loading: false, cursor: 'c' }), true)
  assert.equal(canLoadMergedComments(2, { data: [], loading: false, cursor: null }), false)
})

test('recognises second-level merged posts', () => {
  assert.equal(isMergedSubPost(comment('a', { type: 'mergedPost', mergedPost: mergedPost(null) })), true)
  assert.equal(isMergedSubPost(comment('a', { type: 'mergedPost' })), false)
  assert.equal(isMergedSubPost(comment('a')), false)
})
