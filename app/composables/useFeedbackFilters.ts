// The one copy of the admin feedback filter conditions: the chip bar, the
// quick-filter rail and the address bar all read and write this shape.

export type EnumFilterField = 'status' | 'boardId' | 'author'

export type FilterCondition =
  | { field: EnumFilterField; op: 'is' | 'not'; values: string[] }
  | { field: 'created'; op: 'before' | 'after' | 'range'; from?: string; to?: string }
  | { field: 'merged'; value: string }

const ENUM_FIELDS: EnumFilterField[] = ['status', 'boardId', 'author']

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

function list(v: unknown): string[] | undefined {
  const s = str(v)
  if (!s) return undefined
  const items = s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

type CreatedCondition = Extract<FilterCondition, { field: 'created' }>
type EnumCondition = Extract<FilterCondition, { op: 'is' | 'not' }>
type FilterExtra = { q?: string; sort?: string; order?: string; page?: number }

// `status!=open` excludes; `status=open` includes. Exclusion wins if both are present.
function enumKey(c: Pick<EnumCondition, 'field' | 'op'>): string {
  return `${c.field}${c.op === 'not' ? '!' : ''}`
}

function parseEnumCondition(query: Record<string, unknown>, field: EnumFilterField): FilterCondition | undefined {
  const not = list(query[`${field}!`])
  if (not) return { field, op: 'not', values: not }
  const is = list(query[field])
  return is ? { field, op: 'is', values: is } : undefined
}

function parseCreatedCondition(query: Record<string, unknown>): FilterCondition | undefined {
  const from = str(query.createdFrom)
  const to = str(query.createdTo)
  if (!from && !to) return undefined
  return { field: 'created', op: from && to ? 'range' : from ? 'after' : 'before', from, to }
}

function parseMergedCondition(query: Record<string, unknown>): FilterCondition | undefined {
  const merged = str(query.merged)
  return merged && merged !== 'canonical_only' ? { field: 'merged', value: merged } : undefined
}

export function parseFilterQuery(query: Record<string, unknown>): FilterCondition[] {
  return [
    ...ENUM_FIELDS.map((field) => parseEnumCondition(query, field)),
    parseCreatedCondition(query),
    parseMergedCondition(query),
  ].filter((c): c is FilterCondition => c !== undefined)
}

// The bounds a created condition actually uses: `before` ignores `from`, `after` ignores `to`.
function createdBounds(c: CreatedCondition): { from?: string; to?: string } {
  return {
    from: c.op !== 'before' && c.from ? c.from : undefined,
    to: c.op !== 'after' && c.to ? c.to : undefined,
  }
}

function conditionParams(c: FilterCondition): string[] {
  if (c.field === 'created') {
    const { from, to } = createdBounds(c)
    return [from && `createdFrom=${from}`, to && `createdTo=${to}`].filter((p): p is string => !!p)
  }
  if (c.field === 'merged') return c.value !== 'canonical_only' ? [`merged=${c.value}`] : []
  return c.values.length ? [`${enumKey(c)}=${c.values.map(encodeURIComponent).join(',')}`] : []
}

function trailingParams(extra: FilterExtra): string[] {
  const parts: string[] = []
  if (extra.sort && extra.sort !== 'createdAt') parts.push(`sort=${extra.sort}`)
  if (extra.order === 'asc') parts.push('order=asc')
  if (extra.page && extra.page > 1) parts.push(`page=${extra.page}`)
  return parts
}

// Hand-rolled instead of URLSearchParams, which percent-encodes the `!` in a
// parameter name and leaves `status%21=open` in the address bar.
export function serializeFilterQuery(conditions: FilterCondition[], extra: FilterExtra = {}): string {
  const search = extra.q ? [`q=${encodeURIComponent(extra.q)}`] : []
  return [...search, ...conditions.flatMap(conditionParams), ...trailingParams(extra)].join('&')
}

// `to` is exclusive: the boundary is the day after, in the browser's timezone.
function dayBoundary(date: string, plusDays = 0): string | undefined {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d + plusDays).toISOString()
}

function conditionApiQuery(c: FilterCondition): Record<string, string | undefined> {
  if (c.field === 'created') {
    const { from, to } = createdBounds(c)
    return {
      ...(from ? { createdFrom: dayBoundary(from) } : {}),
      ...(to ? { createdTo: dayBoundary(to, 1) } : {}),
    }
  }
  if (c.field === 'merged') return { merged: c.value }
  return c.values.length ? { [enumKey(c)]: c.values.join(',') } : {}
}

export function filterApiQuery(
  conditions: FilterCondition[],
  extra: FilterExtra & { pageSize?: number } = {},
): Record<string, string | number | undefined> {
  const query: Record<string, string | number | undefined> = { merged: 'canonical_only', ...extra }
  for (const c of conditions) Object.assign(query, conditionApiQuery(c))
  return query
}

export function findCondition(conditions: FilterCondition[], field: string): FilterCondition | undefined {
  return conditions.find((c) => c.field === field)
}

export function railValue(conditions: FilterCondition[], field: EnumFilterField): string | null {
  const c = findCondition(conditions, field)
  if (!c || c.field === 'created' || c.field === 'merged') return null
  return c.op === 'is' && c.values.length === 1 ? c.values[0]! : null
}

export function toggleRail(conditions: FilterCondition[], field: EnumFilterField, value: string): FilterCondition[] {
  if (railValue(conditions, field) === value) return conditions.filter((c) => c.field !== field)
  return [...conditions.filter((c) => c.field !== field), { field, op: 'is', values: [value] }]
}
