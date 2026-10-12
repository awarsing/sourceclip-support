import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  appendRoadmapPage,
  applyRoadmapUpdate,
  buildRenderList,
  columnHasEntries,
  commitRoadmapMove,
  findInsertIndex,
  findRoadmapPost,
  findRoadmapStatus,
  isRoadmapStatus,
  type RoadmapBoardData,
  removeRoadmapItem,
  roadmapColumnSummary,
  roadmapPageQuery,
} from '../app/lib/roadmap-board'

type Item = { id: string; createdAt: string; status?: string; title?: string; boardId?: string }

const item = (id: string, day: number, extra: Partial<Item> = {}): Item => ({
  id,
  createdAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  ...extra,
})

function board(): RoadmapBoardData<Item> {
  return {
    planned: { data: [item('p3', 3), item('p1', 1)], total: 5, nextCursor: 'c1' },
    in_progress: { data: [item('i2', 2)], total: 1, nextCursor: null },
    done: { data: [], total: 0, nextCursor: null },
  }
}

const ids = (list: { id: string }[]) => list.map((entry) => entry.id)

test('roadmap statuses exclude open and anything unknown', () => {
  assert.equal(isRoadmapStatus('planned'), true)
  assert.equal(isRoadmapStatus('done'), true)
  assert.equal(isRoadmapStatus('open'), false)
  assert.equal(isRoadmapStatus(undefined), false)
})

test('column summary reads a column and defaults when data is missing', () => {
  assert.deepEqual(roadmapColumnSummary(board(), 'planned').nextCursor, 'c1')
  assert.equal(roadmapColumnSummary(board(), 'planned').total, 5)
  assert.deepEqual(roadmapColumnSummary(null, 'done'), { items: [], total: 0, nextCursor: null })
})

test('insert index keeps newest first and breaks time ties by the larger id', () => {
  const list = [item('b', 5), item('a', 3)]
  assert.equal(findInsertIndex(list, item('z', 9)), 0)
  assert.equal(findInsertIndex(list, item('m', 4)), 1)
  assert.equal(findInsertIndex(list, item('x', 1)), 2)
  assert.equal(findInsertIndex(list, item('c', 5)), 0)
  assert.equal(findInsertIndex(list, item('a0', 5)), 1)
  assert.equal(findInsertIndex([], item('x', 1)), 0)
})

test('render list interleaves the ghost and the pending drop at their positions', () => {
  const items = [item('a', 3), item('b', 2)]
  const ghost = { status: 'planned' as const, index: 1, post: item('g', 9) }
  const pending = {
    postId: 'p',
    post: item('p', 8),
    fromStatus: 'done' as const,
    toStatus: 'planned' as const,
    index: 0,
  }
  assert.deepEqual(
    buildRenderList(items, 'planned', ghost, pending).map((entry) => `${entry.type}:${entry.key}`),
    ['pending:p', 'card:a', 'ghost:g', 'card:b'],
  )
  assert.deepEqual(
    buildRenderList(items, 'done', ghost, pending).map((entry) => entry.key),
    ['a', 'b'],
  )
})

test('render list puts placeholders past the end after the cards', () => {
  const ghost = { status: 'done' as const, index: 4, post: item('g', 9) }
  const pending = {
    postId: 'p',
    post: item('p', 8),
    fromStatus: 'planned' as const,
    toStatus: 'done' as const,
    index: 0,
  }
  assert.deepEqual(
    buildRenderList([], 'done', ghost, pending).map((entry) => entry.type),
    ['ghost', 'pending'],
  )
  assert.deepEqual(
    buildRenderList([item('a', 1)], 'done', null, null).map((entry) => entry.type),
    ['card'],
  )
})

test('post and status lookups tolerate missing data', () => {
  const data = board()
  assert.equal(findRoadmapPost(data, 'planned', 'p1')?.id, 'p1')
  assert.equal(findRoadmapPost(data, 'planned', 'nope'), null)
  assert.equal(findRoadmapPost(null, 'planned', 'p1'), null)
  assert.equal(findRoadmapPost(data, null, 'p1'), null)
  assert.equal(findRoadmapPost(data, 'planned', null), null)
  assert.equal(findRoadmapStatus(data, 'i2'), 'in_progress')
  assert.equal(findRoadmapStatus(data, 'nope'), null)
  assert.equal(findRoadmapStatus(undefined, 'i2'), null)
})

test('removing a post updates its column and ignores unknown ids', () => {
  const data = board()
  removeRoadmapItem(data, 'p3')
  assert.deepEqual(ids(data.planned.data), ['p1'])
  assert.equal(data.planned.total, 4)
  removeRoadmapItem(data, 'nope')
  assert.equal(data.planned.total, 4)
})

test('loaded pages append only unseen posts and advance the cursor', () => {
  const data = board()
  appendRoadmapPage(data.planned, { data: [item('p1', 1), item('p0', 1)], pagination: { nextCursor: null } })
  assert.deepEqual(ids(data.planned.data), ['p3', 'p1', 'p0'])
  assert.equal(data.planned.nextCursor, null)
  appendRoadmapPage(undefined, { data: [], pagination: { nextCursor: null } })
  appendRoadmapPage(data.planned, null)
  assert.equal(data.planned.data.length, 3)
})

test('an update in the same column merges fields in place', () => {
  const data = board()
  applyRoadmapUpdate(data, { id: 'p1', title: 'Renamed' })
  assert.equal(data.planned.data[1]?.title, 'Renamed')
  assert.equal(data.planned.total, 5)
})

test('a board change under an active board filter removes the card', () => {
  const data = board()
  applyRoadmapUpdate(data, { id: 'p1', boardId: 'other' }, 'mine')
  assert.deepEqual(ids(data.planned.data), ['p3'])
  assert.equal(data.planned.total, 4)
  applyRoadmapUpdate(data, { id: 'p3', boardId: 'mine' }, 'mine')
  assert.deepEqual(ids(data.planned.data), ['p3'])
})

test('a status change moves the card into its sorted slot', () => {
  const data = board()
  applyRoadmapUpdate(data, { id: 'p3', status: 'in_progress', title: 'Moved' })
  assert.deepEqual(ids(data.planned.data), ['p1'])
  assert.equal(data.planned.total, 4)
  assert.deepEqual(ids(data.in_progress.data), ['p3', 'i2'])
  assert.equal(data.in_progress.data[0]?.title, 'Moved')
  assert.equal(data.in_progress.total, 2)
})

test('a status off the roadmap drops the card', () => {
  const data = board()
  applyRoadmapUpdate(data, { id: 'i2', status: 'open' })
  assert.deepEqual(ids(data.in_progress.data), [])
  assert.equal(data.in_progress.total, 0)
})

test('an unseen post is inserted when complete and only counted otherwise', () => {
  const data = board()
  applyRoadmapUpdate(data, { id: 'n1', status: 'done', title: 'New', createdAt: item('n1', 4).createdAt })
  assert.deepEqual(ids(data.done.data), ['n1'])
  assert.equal(data.done.total, 1)
  applyRoadmapUpdate(data, { id: 'n2', status: 'done' })
  assert.deepEqual(ids(data.done.data), ['n1'])
  assert.equal(data.done.total, 2)
  applyRoadmapUpdate(data, { id: 'n3', status: 'open', title: 'x', createdAt: 'y' })
  applyRoadmapUpdate(data, { id: 'n4' })
  assert.equal(data.done.total, 2)
})

test('a confirmed move inserts the target card before clearing pending and removing the source', () => {
  const data = board()
  const steps: string[] = []
  commitRoadmapMove(
    data,
    { postId: 'p3', post: item('p3', 3), fromStatus: 'planned', toStatus: 'done', index: 0 },
    () => steps.push(`cleared with ${data.done.data.length} done and ${data.planned.data.length} planned`),
  )
  assert.deepEqual(steps, ['cleared with 1 done and 2 planned'])
  assert.deepEqual(data.done.data, [{ ...item('p3', 3), status: 'done' }])
  assert.equal(data.done.total, 1)
  assert.deepEqual(ids(data.planned.data), ['p1'])
  assert.equal(data.planned.total, 4)
})

test('page query carries the cursor and drops an empty board filter', () => {
  assert.deepEqual(roadmapPageQuery('planned', 'c1', ''), {
    status: 'planned',
    sort: 'createdAt',
    cursor: 'c1',
    pageSize: 10,
    boardId: undefined,
  })
  assert.equal(roadmapPageQuery('done', 'c2', 'b1').boardId, 'b1')
})

test('a column lists entries while it has cards or a placeholder targets it', () => {
  const post = item('g', 1)
  assert.equal(columnHasEntries('done', [post], null, null), true)
  assert.equal(columnHasEntries('done', [], null, null), false)
  assert.equal(columnHasEntries('done', [], { status: 'done', index: 0, post }, null), true)
  assert.equal(columnHasEntries('done', [], { status: 'planned', index: 0, post }, null), false)
  const pending = { postId: 'g', post, fromStatus: 'planned' as const, toStatus: 'done' as const, index: 0 }
  assert.equal(columnHasEntries('done', [], null, pending), true)
  assert.equal(columnHasEntries('in_progress', [], null, pending), false)
})
