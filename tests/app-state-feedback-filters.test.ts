import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  type FilterCondition,
  filterApiQuery,
  findCondition,
  parseFilterQuery,
  railValue,
  serializeFilterQuery,
  toggleRail,
} from '../app/composables/useFeedbackFilters'

test('parses enum, date and merged conditions from the address bar', () => {
  assert.deepEqual(
    parseFilterQuery({
      'status!': 'closed, done',
      status: 'open',
      boardId: 'b1',
      author: ' , ',
      createdFrom: '2026-01-01',
      createdTo: '2026-02-01',
      merged: 'all',
    }),
    [
      { field: 'status', op: 'not', values: ['closed', 'done'] },
      { field: 'boardId', op: 'is', values: ['b1'] },
      { field: 'created', op: 'range', from: '2026-01-01', to: '2026-02-01' },
      { field: 'merged', value: 'all' },
    ],
  )
  assert.deepEqual(parseFilterQuery({ createdFrom: '2026-01-01', merged: 'canonical_only', status: ['x'] }), [
    { field: 'created', op: 'after', from: '2026-01-01', to: undefined },
  ])
  assert.deepEqual(parseFilterQuery({ createdTo: '2026-01-01', author: '' }), [
    { field: 'created', op: 'before', from: undefined, to: '2026-01-01' },
  ])
  assert.deepEqual(parseFilterQuery({}), [])
})

test('serializes conditions without encoding the exclusion marker', () => {
  const conditions: FilterCondition[] = [
    { field: 'status', op: 'not', values: ['in progress', 'done'] },
    { field: 'boardId', op: 'is', values: [] },
    { field: 'created', op: 'range', from: '2026-01-01', to: '2026-01-31' },
    { field: 'merged', value: 'all' },
  ]
  assert.equal(
    serializeFilterQuery(conditions, { q: 'dark mode', sort: 'voteCount', order: 'asc', page: 3 }),
    'q=dark%20mode&status!=in%20progress,done&createdFrom=2026-01-01&createdTo=2026-01-31&merged=all&sort=voteCount&order=asc&page=3',
  )
  assert.equal(
    serializeFilterQuery(
      [
        { field: 'created', op: 'before', from: '2026-01-01', to: '2026-01-31' },
        { field: 'merged', value: 'canonical_only' },
        { field: 'author', op: 'is', values: ['u1'] },
      ],
      { sort: 'createdAt', order: 'desc', page: 1 },
    ),
    'createdTo=2026-01-31&author=u1',
  )
  assert.equal(
    serializeFilterQuery([{ field: 'created', op: 'after', from: '2026-01-01', to: '2026-01-31' }]),
    'createdFrom=2026-01-01',
  )
  assert.equal(serializeFilterQuery([]), '')
})

test('builds the API query with day boundaries in local time', () => {
  const query = filterApiQuery(
    [
      { field: 'status', op: 'is', values: ['open', 'planned'] },
      { field: 'author', op: 'not', values: ['u1'] },
      { field: 'boardId', op: 'is', values: [] },
      { field: 'created', op: 'range', from: '2026-01-01', to: '2026-01-31' },
    ],
    { q: 'x', pageSize: 20 },
  )
  assert.deepEqual(query, {
    merged: 'canonical_only',
    q: 'x',
    pageSize: 20,
    status: 'open,planned',
    'author!': 'u1',
    createdFrom: new Date(2026, 0, 1).toISOString(),
    createdTo: new Date(2026, 1, 1).toISOString(),
  })
  assert.deepEqual(
    filterApiQuery([
      { field: 'merged', value: 'all' },
      { field: 'created', op: 'before', from: '2026-01-01', to: 'not-a-date' },
    ]),
    { merged: 'all', createdTo: undefined },
  )
  assert.deepEqual(filterApiQuery([{ field: 'created', op: 'after', from: '2026-01-05', to: '2026-01-09' }]), {
    merged: 'canonical_only',
    createdFrom: new Date(2026, 0, 5).toISOString(),
  })
})

test('the quick-filter rail reads and toggles single-value inclusions', () => {
  const conditions: FilterCondition[] = [
    { field: 'status', op: 'is', values: ['open'] },
    { field: 'boardId', op: 'is', values: ['a', 'b'] },
    { field: 'author', op: 'not', values: ['u1'] },
    { field: 'merged', value: 'all' },
  ]
  assert.equal(findCondition(conditions, 'merged'), conditions[3])
  assert.equal(railValue(conditions, 'status'), 'open')
  assert.equal(railValue(conditions, 'boardId'), null)
  assert.equal(railValue(conditions, 'author'), null)
  assert.equal(railValue([], 'status'), null)
  assert.equal(railValue([{ field: 'created', op: 'after', from: '2026-01-01' }], 'created' as never), null)
  assert.deepEqual(toggleRail(conditions, 'status', 'open'), conditions.slice(1))
  assert.deepEqual(toggleRail(conditions, 'status', 'done'), [
    ...conditions.slice(1),
    { field: 'status', op: 'is', values: ['done'] },
  ])
})
