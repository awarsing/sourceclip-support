// Keyset pagination helpers shared by the public list endpoints. A cursor is
// the sort value `s` and the row id of the last item on a page, as base64url JSON.

export interface ListCursor {
  s: any
  id: string
}

export function encodeListCursor(data: { s: unknown; id: string }): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url')
}

// An absent or unreadable cursor means the first page.
export function decodeListCursor(cursor: string | undefined): ListCursor | null {
  if (!cursor) return null
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString())
  } catch {
    return null
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Strict variant for timestamp-sorted lists. The contents are checked, not just
// the encoding: the halves go straight into a ::timestamptz / ::uuid cast, and
// Postgres answers anything it can't parse with an error the handler has no way
// to catch. Rejecting here falls back to the first page.
export function decodeTimestampCursor(cursor: string | undefined): { s: string; id: string } | null {
  const parsed = decodeListCursor(cursor) as { s?: unknown; id?: unknown } | null
  if (typeof parsed?.s !== 'string' || Number.isNaN(Date.parse(parsed.s))) return null
  if (typeof parsed.id !== 'string' || !UUID.test(parsed.id)) return null
  return { s: parsed.s, id: parsed.id }
}

// `?pageSize=` style limits: a missing or zero value takes the default, and
// anything larger than `max` is clamped.
export function readPageSize(value: unknown, fallback: number, max: number): number {
  return Math.min(Number(value) || fallback, max)
}

export function readPageNumber(value: unknown): number {
  return Math.max(Number(value) || 1, 1)
}

// Rows are fetched with one extra to learn whether another page exists.
export function splitPage<T>(rows: T[], size: number): { items: T[]; hasMore: boolean } {
  const hasMore = rows.length > size
  return { items: hasMore ? rows.slice(0, size) : rows, hasMore }
}

export function nextListCursor<T>(items: T[], hasMore: boolean, toCursor: (last: T) => ListCursor): string | null {
  const last = items[items.length - 1]
  return hasMore && last ? encodeListCursor(toCursor(last)) : null
}
