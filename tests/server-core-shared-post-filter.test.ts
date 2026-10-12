import assert from 'node:assert/strict'
import { test } from 'node:test'
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { parsePostFilter, postFilterConditions, type PostFilter } from '../server/utils/postFilterConditions'

const dialect = new PgDialect()
function where(filter: Omit<PostFilter, 'orgId'>) {
  const { sql, params } = dialect.sqlToQuery(and(...postFilterConditions({ orgId: 'org', ...filter }))!)
  return { sql: sql.replaceAll('"post".', ''), params }
}

test('query parameters become a filter; negations win over their positive form', () => {
  assert.deepEqual(parsePostFilter({}, 'org'), {
    orgId: 'org',
    status: undefined,
    statusNot: undefined,
    boardId: undefined,
    boardIdNot: undefined,
    authorId: undefined,
    authorIdNot: undefined,
    createdFrom: undefined,
    createdTo: undefined,
    merged: 'canonical_only',
  })
  const filter = parsePostFilter(
    {
      status: 'open, planned,,',
      'status!': ' ,',
      boardId: 'b1',
      'boardId!': 'b2,none',
      author: 'u1',
      'author!': 'u2',
      createdFrom: '2026-01-02',
      createdTo: 'not a date',
      merged: 'all',
    },
    'org',
  )
  assert.deepEqual(filter.status, ['open', 'planned'])
  assert.equal(filter.statusNot, undefined)
  assert.equal(filter.boardId, undefined)
  assert.deepEqual(filter.boardIdNot, ['b2', 'none'])
  assert.equal(filter.authorId, undefined)
  assert.deepEqual(filter.authorIdNot, ['u2'])
  assert.equal(filter.createdFrom?.toISOString(), '2026-01-02T00:00:00.000Z')
  assert.equal(filter.createdTo, undefined)
  assert.equal(filter.merged, 'all')
  assert.equal(
    parsePostFilter({ merged: 'merged_only', status: ['open'], createdFrom: '' }, 'org').merged,
    'merged_only',
  )
  assert.equal(parsePostFilter({ merged: 'other', status: ['open'] }, 'org').status, undefined)
})

test('merged filter defaults to canonical posts', () => {
  assert.deepEqual(where({}), { sql: '("org_id" = $1 and "merged_to" is null)', params: ['org'] })
  assert.deepEqual(where({ merged: 'merged_only' }), {
    sql: '("org_id" = $1 and "merged_to" is not null)',
    params: ['org'],
  })
  assert.deepEqual(where({ merged: 'all' }), { sql: '"org_id" = $1', params: ['org'] })
})

test('status, author and date filters', () => {
  const from = new Date('2026-01-01T00:00:00Z')
  const to = new Date('2026-02-01T00:00:00Z')
  const { sql, params } = where({
    merged: 'all',
    status: ['open'],
    statusNot: ['done'],
    authorId: ['u1'],
    authorIdNot: ['u2'],
    createdFrom: from,
    createdTo: to,
  })
  assert.equal(
    sql,
    '("org_id" = $1 and "status" in ($2) and "status" not in ($3) and "author_id" in ($4) and "author_id" not in ($5) and "created_at" >= $6 and "created_at" < $7)',
  )
  assert.deepEqual(params, ['org', 'open', 'done', 'u1', 'u2', from.toISOString(), to.toISOString()])
  assert.deepEqual(where({ merged: 'all', status: [], authorId: [] }).params, ['org'])
})

test('board filters name NULL explicitly for unclassified posts', () => {
  const board = (filter: Omit<PostFilter, 'orgId'>) =>
    where({ merged: 'all', ...filter }).sql.replace('("org_id" = $1 and ', '(')
  assert.equal(board({ boardId: ['b1'] }), '("board_id" in ($2))')
  assert.equal(board({ boardId: ['none'] }), '("board_id" is null)')
  assert.equal(board({ boardId: ['b1', 'none'] }), '(("board_id" in ($2) or "board_id" is null))')
  assert.equal(board({ boardIdNot: ['b1'] }), '(("board_id" is null or "board_id" not in ($2)))')
  assert.equal(board({ boardIdNot: ['none'] }), '("board_id" is not null)')
  assert.equal(board({ boardIdNot: ['none', 'b1'] }), '(("board_id" is not null and "board_id" not in ($2)))')
  assert.equal(board({ boardId: [], boardIdNot: [] }), '"org_id" = $1')
})
