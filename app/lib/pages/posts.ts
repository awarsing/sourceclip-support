// Pure helpers behind the feedback pages: the public board, the dashboard
// feedback table and the dashboard roadmap.
import type { EnumFilterField, FilterCondition } from '../../composables/useFeedbackFilters'
import { findCondition } from '../../composables/useFeedbackFilters'
import { STATUS_CONFIG } from '../../../shared/types/post'

export type FilterFieldKey = 'status' | 'boardId' | 'author' | 'created' | 'merged'
export type FeedbackSort = 'createdAt' | 'votes' | 'comments'

interface PostLike {
  id: string
  boardId?: string | null
  status?: string
  hasVoted?: boolean
  voteCount: number
}
interface PostPage<T> {
  data: T[]
  pagination?: { total: number }
}
export interface PostUpdate {
  id: string
  status?: string
  boardId?: string | null
}

/** Inline colours for a status badge; unknown statuses read as open. */
export function statusStyle(status: string | undefined) {
  const { cssVar } = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open
  return { color: `var(${cssVar})`, backgroundColor: `var(${cssVar}-bg)`, borderColor: `var(${cssVar}-border)` }
}

/** The public board only badges statuses past "open". */
export function showsStatusBadge(status: string | undefined) {
  return !!status && status !== 'open' && status in STATUS_CONFIG
}

/** Whether a post with this field value no longer matches the active filter for that field. */
export function isDroppedByFilter(conditions: FilterCondition[], field: EnumFilterField, value: string) {
  const condition = findCondition(conditions, field)
  if (!condition || !('values' in condition) || !condition.values.length) return false
  return condition.op === 'is' ? !condition.values.includes(value) : condition.values.includes(value)
}

function leavesFilter(conditions: FilterCondition[], updated: PostUpdate) {
  if (updated.status !== undefined && isDroppedByFilter(conditions, 'status', updated.status)) return true
  return updated.boardId !== undefined && isDroppedByFilter(conditions, 'boardId', updated.boardId ?? 'none')
}

/** Remove a post from a loaded page, keeping the total in step. */
export function removePost<T extends { id: string }>(page: PostPage<T> | null | undefined, id: string) {
  const index = page?.data.findIndex((post) => post.id === id) ?? -1
  if (index === -1) return
  page!.data.splice(index, 1)
  if (page!.pagination) page!.pagination.total--
}

/** Apply an edit from the detail modal to the dashboard table: drop it if it left the filter, else patch it. */
export function applyFeedbackUpdate<T extends { id: string }>(
  page: PostPage<T> | null | undefined,
  updated: PostUpdate,
  conditions: FilterCondition[],
) {
  const post = page?.data.find((item) => item.id === updated.id)
  if (!post) return
  if (leavesFilter(conditions, updated)) removePost(page, updated.id)
  else Object.assign(post, updated)
}

/**
 * Apply an edit to the public board list. Returns true when the post moved
 * board, so the per-board counts need a refresh.
 */
export function applyBoardPostUpdate<T extends PostLike>(
  posts: T[],
  updated: PostUpdate,
  activeBoardId: string | null,
) {
  const index = posts.findIndex((post) => post.id === updated.id)
  if (index === -1) return false
  const boardChanged = updated.boardId !== undefined && updated.boardId !== posts[index]!.boardId
  // A post that no longer belongs to the board being viewed leaves the list.
  const leaves = updated.boardId !== undefined && !!activeBoardId && updated.boardId !== activeBoardId
  if (leaves) posts.splice(index, 1)
  else Object.assign(posts[index]!, updated)
  return boardChanged
}

/** Set a post's vote state, adjusting its count only when the state changes. */
export function applyVote(post: PostLike, voted: boolean) {
  if (!!post.hasVoted === voted) return
  post.hasVoted = voted
  post.voteCount += voted ? 1 : -1
}

export function voteMethod(wasVoted: boolean) {
  return wasVoted ? 'DELETE' : 'POST'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `?b=` accepts a board id or its name, so pre-filled links can be hand-written
 * without looking up a uuid in the dashboard. Board names carry no uniqueness
 * constraint, so the first by position wins.
 */
export function resolveBoardId(raw: unknown, boards: { id: string; name: string }[]) {
  if (!raw || typeof raw !== 'string') return null
  if (UUID_RE.test(raw)) return raw
  const wanted = raw.trim().toLowerCase()
  return boards.find((board) => board.name.toLowerCase() === wanted)?.id ?? null
}

export function boardQuery(boardId: string | null): Record<string, string> {
  return boardId ? { b: boardId } : {}
}

function capped(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}

/**
 * Pre-filled submit links: /?new=1&title=...&body=...&b=... Caps mirror the
 * form's own limits. Returns the draft and the query without its one-shot
 * params (`b` stays: it is the list's filter, not part of the draft), or null
 * when the link does not ask for the form. `?new` with no value parses to
 * null, so bare presence counts as enabled.
 */
export function submitPrefillFromQuery(query: Record<string, unknown>) {
  if (query.new === undefined || query.new === '0' || query.new === 'false') return null
  const { new: _new, title, body, ...rest } = query
  return { prefill: { title: capped(title, 200), body: capped(body, 10000) }, query: rest }
}

const FEEDBACK_SORTS: FeedbackSort[] = ['createdAt', 'votes', 'comments']

export function parseFeedbackSort(value: unknown): FeedbackSort {
  return FEEDBACK_SORTS.includes(value as FeedbackSort) ? (value as FeedbackSort) : 'createdAt'
}

/** Clicking the active column flips its order; another column starts descending. */
export function nextSortOrder(current: FeedbackSort, order: 'asc' | 'desc', column: FeedbackSort) {
  return current === column && order === 'desc' ? 'asc' : 'desc'
}

/** All pages when there are few, otherwise a run of three starting just before the current page. */
export function compactPageNumbers(total: number, current: number) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.max(1, current - 1)
  const end = Math.min(total, start + 2)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

/** A sliding window of up to `max` pages centred on the current one. */
export function windowPageNumbers(total: number, current: number, max = 5) {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(current - Math.floor(max / 2), total - max + 1))
  return Array.from({ length: max }, (_, i) => start + i)
}

/** First and last row numbers shown on a page. */
export function pageRange(page: number, pageSize: number, total: number) {
  return { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total }
}

/** An empty condition for a field picked from the Filters menu. */
export function blankCondition(key: FilterFieldKey): FilterCondition {
  if (key === 'created') return { field: 'created', op: 'after' }
  if (key === 'merged') return { field: 'merged', value: '' }
  return { field: key, op: 'is', values: [] }
}

export function conditionHasValue(condition: FilterCondition) {
  if (condition.field === 'created') return Boolean(condition.from || condition.to)
  if (condition.field === 'merged') return Boolean(condition.value)
  return condition.values.length > 0
}

/** Replace the condition for a field, dropping it when the edit leaves it empty. */
export function upsertCondition(conditions: FilterCondition[], next: FilterCondition) {
  const rest = conditions.filter((condition) => condition.field !== next.field)
  return conditionHasValue(next) ? [...rest, next] : rest
}

/** The props a filter chip or value panel takes for a condition. */
export function conditionBinding(condition: FilterCondition) {
  return {
    op: 'op' in condition ? condition.op : 'is',
    values: conditionValues(condition),
    from: 'from' in condition ? condition.from : undefined,
    to: 'to' in condition ? condition.to : undefined,
  }
}

function conditionValues(condition: FilterCondition) {
  if ('values' in condition) return condition.values
  return 'value' in condition ? [condition.value] : []
}

/** Single-choice fields store one value; the others store a list. */
export function valuesPatch(kind: string, values: string[]) {
  return kind === 'single' ? { value: values[0] } : { values }
}

/** A card added from a roadmap column other than "open" needs its status set after creation. */
export function needsStatusUpdate(status: string | null) {
  return !!status && status !== 'open'
}
