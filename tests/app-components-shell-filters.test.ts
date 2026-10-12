import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  extraValueCount,
  type FilterChipState,
  filterNeedsSearch,
  filterValueLabel,
  isStaleFilter,
  optionInitials,
  quickDateRange,
  toggleFilterValue,
  visibleFilterOptions,
} from '../app/lib/filter-values'

const t = (key: string) => `t:${key}`
const options = [
  { value: 'u1', label: 'Ada Lovelace', sub: 'ada@example.com' },
  { value: 'u2', label: 'Grace Hopper', sub: 'grace@navy.mil' },
  { value: 's1', label: 'Planned', color: '#00f' },
]
const chip = (overrides: Partial<FilterChipState>): FilterChipState => ({
  kind: 'enum',
  op: 'is',
  values: [],
  options,
  ...overrides,
})

test('search shows for searchable or long option lists', () => {
  assert.equal(filterNeedsSearch(true, []), true)
  assert.equal(filterNeedsSearch(false, options), false)
  assert.equal(
    filterNeedsSearch(
      false,
      Array.from({ length: 9 }, (_, i) => ({ value: `${i}`, label: `${i}` })),
    ),
    true,
  )
})

test('options match the label or the secondary line, ignoring case and padding', () => {
  assert.equal(visibleFilterOptions(options, '  '), options)
  assert.deepEqual(
    visibleFilterOptions(options, ' HOPPER ').map((o) => o.value),
    ['u2'],
  )
  assert.deepEqual(
    visibleFilterOptions(options, 'example').map((o) => o.value),
    ['u1'],
  )
  assert.deepEqual(visibleFilterOptions(options, 'zzz'), [])
})

test('single filters replace the value; the others toggle it', () => {
  assert.deepEqual(toggleFilterValue('single', ['a'], 'b'), ['b'])
  assert.deepEqual(toggleFilterValue('enum', ['a'], 'b'), ['a', 'b'])
  assert.deepEqual(toggleFilterValue('enum', ['a', 'b'], 'a'), ['b'])
})

test('quick ranges cover the last N days or the current quarter in local dates', () => {
  const now = new Date(2026, 4, 12, 15, 30)
  assert.deepEqual(quickDateRange(7, now), { from: '2026-05-05', to: '2026-05-12' })
  assert.deepEqual(quickDateRange(30, now), { from: '2026-04-12', to: '2026-05-12' })
  assert.deepEqual(quickDateRange('quarter', now), { from: '2026-04-01', to: '2026-05-12' })
  assert.deepEqual(quickDateRange('quarter', new Date(2026, 11, 31)), { from: '2026-10-01', to: '2026-12-31' })
})

test('initials are the first two letters, upper-cased', () => {
  assert.equal(optionInitials('grace'), 'GR')
})

test('a chip is stale only when loaded options know none of its values', () => {
  assert.equal(isStaleFilter(chip({ values: ['gone'] })), true)
  assert.equal(isStaleFilter(chip({ values: ['gone', 'u2'] })), false)
  assert.equal(isStaleFilter(chip({ values: ['gone'], options: [] })), false)
  assert.equal(isStaleFilter(chip({ values: [] })), false)
  assert.equal(isStaleFilter(chip({ kind: 'date', values: ['gone'] })), false)
})

test('value labels name the first known value, or prompt, or flag a stale chip', () => {
  assert.equal(filterValueLabel(chip({ values: ['gone', 'u2'] }), t), 'Grace Hopper')
  assert.equal(filterValueLabel(chip({ values: ['x'], options: [] }), t), 'x')
  assert.equal(filterValueLabel(chip({ values: [] }), t), 't:dashboard.filter.pickValue')
  assert.equal(filterValueLabel(chip({ values: ['gone'] }), t), 't:dashboard.filter.staleValue')
})

test('date labels show the range, a single bound, or a prompt', () => {
  assert.equal(filterValueLabel(chip({ kind: 'date', op: 'range', from: '2026-01-01' }), t), '2026-01-01 – …')
  assert.equal(filterValueLabel(chip({ kind: 'date', op: 'range', to: '2026-02-01' }), t), '… – 2026-02-01')
  assert.equal(filterValueLabel(chip({ kind: 'date', op: 'after', from: '2026-01-01' }), t), '2026-01-01')
  assert.equal(filterValueLabel(chip({ kind: 'date', op: 'before', to: '2026-02-01' }), t), '2026-02-01')
  assert.equal(filterValueLabel(chip({ kind: 'date', op: 'after' }), t), 't:dashboard.filter.pickDate')
})

test('the extra count covers values past the first, never dates', () => {
  assert.equal(extraValueCount({ kind: 'enum', values: ['a', 'b', 'c'] }), 2)
  assert.equal(extraValueCount({ kind: 'enum', values: [] }), 0)
  assert.equal(extraValueCount({ kind: 'date', values: ['a', 'b'] }), 0)
})
