import { ROADMAP_STATUSES, type RoadmapStatus } from '../../shared/types/post'

// Column state for the roadmap kanban. The board mutates these objects in
// place, because they live inside a deep useFetch ref and every mutation must
// stay reactive.

export interface RoadmapEntry {
  id: string
  createdAt: string
}

export interface RoadmapColumnData<T extends RoadmapEntry> {
  data: T[]
  total: number
  nextCursor?: string | null
}

export type RoadmapBoardData<T extends RoadmapEntry> = Record<RoadmapStatus, RoadmapColumnData<T>>

export type RoadmapRenderItem<T> = { type: 'card' | 'ghost' | 'pending'; key: string; post: T }

export interface RoadmapGhost<T> {
  status: RoadmapStatus
  index: number
  post: T
}

export interface RoadmapPendingDrop<T> {
  postId: string
  post: T
  fromStatus: RoadmapStatus
  toStatus: RoadmapStatus
  index: number
}

export function isRoadmapStatus(value: unknown): value is RoadmapStatus {
  return (ROADMAP_STATUSES as readonly unknown[]).includes(value)
}

export function roadmapColumnSummary<T extends RoadmapEntry>(
  data: RoadmapBoardData<T> | null | undefined,
  status: RoadmapStatus,
) {
  const column = data?.[status]
  return {
    items: column?.data ?? [],
    total: column?.total ?? 0,
    nextCursor: column?.nextCursor ?? null,
  }
}

// Newest first; ties broken by the larger id, matching the API order.
export function findInsertIndex(list: readonly RoadmapEntry[], item: RoadmapEntry): number {
  const itemTime = new Date(item.createdAt).getTime()
  const index = list.findIndex((current) => {
    const listTime = new Date(current.createdAt).getTime()
    return itemTime > listTime || (itemTime === listTime && item.id > current.id)
  })
  return index === -1 ? list.length : index
}

function placeholdersAt<T extends RoadmapEntry>(
  status: RoadmapStatus,
  index: number,
  atEnd: boolean,
  ghost: RoadmapGhost<T> | null,
  pending: RoadmapPendingDrop<T> | null,
): RoadmapRenderItem<T>[] {
  const hit = (target: RoadmapStatus, at: number) => target === status && (atEnd ? at >= index : at === index)
  const result: RoadmapRenderItem<T>[] = []
  // Keyed by post id so a ghost, its pending drop and the real card merge.
  if (ghost && hit(ghost.status, ghost.index)) result.push({ type: 'ghost', key: ghost.post.id, post: ghost.post })
  if (pending && hit(pending.toStatus, pending.index))
    result.push({ type: 'pending', key: pending.postId, post: pending.post })
  return result
}

// Flat render list for one column: cards with the hover ghost and the pending
// drop interleaved at their insert positions.
export function buildRenderList<T extends RoadmapEntry>(
  items: readonly T[],
  status: RoadmapStatus,
  ghost: RoadmapGhost<T> | null,
  pending: RoadmapPendingDrop<T> | null,
): RoadmapRenderItem<T>[] {
  const result = items.flatMap((item, index) => [
    ...placeholdersAt(status, index, false, ghost, pending),
    { type: 'card' as const, key: item.id, post: item },
  ])
  return [...result, ...placeholdersAt(status, items.length, true, ghost, pending)]
}

// A column renders its list while it has cards or a drag placeholder targets it.
export function columnHasEntries<T extends RoadmapEntry>(
  status: RoadmapStatus,
  items: readonly T[],
  ghost: RoadmapGhost<T> | null,
  pending: RoadmapPendingDrop<T> | null,
): boolean {
  return items.length > 0 || ghost?.status === status || pending?.toStatus === status
}

export function findRoadmapPost<T extends RoadmapEntry>(
  data: RoadmapBoardData<T> | null | undefined,
  status: RoadmapStatus | null,
  id: string | null,
): T | null {
  if (!data || !status || !id) return null
  return data[status].data.find((post) => post.id === id) ?? null
}

export function findRoadmapStatus<T extends RoadmapEntry>(
  data: RoadmapBoardData<T> | null | undefined,
  id: string,
): RoadmapStatus | null {
  return ROADMAP_STATUSES.find((status) => data?.[status].data.some((post) => post.id === id)) ?? null
}

function insertRoadmapItem<T extends RoadmapEntry>(column: RoadmapColumnData<T>, item: T) {
  column.data.splice(findInsertIndex(column.data, item), 0, item)
  column.total++
}

function removeAt<T extends RoadmapEntry>(column: RoadmapColumnData<T>, index: number) {
  column.data.splice(index, 1)
  column.total--
}

function removeRoadmapItemFrom<T extends RoadmapEntry>(column: RoadmapColumnData<T>, postId: string) {
  const index = column.data.findIndex((post) => post.id === postId)
  if (index !== -1) removeAt(column, index)
}

export function removeRoadmapItem<T extends RoadmapEntry>(data: RoadmapBoardData<T>, postId: string) {
  const status = findRoadmapStatus(data, postId)
  if (status) removeRoadmapItemFrom(data[status], postId)
}

// Appends a loaded page, skipping posts the column already shows.
export function appendRoadmapPage<T extends RoadmapEntry>(
  column: RoadmapColumnData<T> | undefined,
  page: { data: T[]; pagination: { nextCursor: string | null } } | null | undefined,
) {
  if (!column || !page) return
  const existing = new Set(column.data.map((post) => post.id))
  column.data.push(...page.data.filter((post) => !existing.has(post.id)))
  column.nextCursor = page.pagination.nextCursor
}

export type RoadmapUpdate = { id: string; status?: string; [key: string]: unknown }

function updateInPlace<T extends RoadmapEntry>(
  column: RoadmapColumnData<T>,
  index: number,
  updated: RoadmapUpdate,
  boardId: string | null | undefined,
) {
  Object.assign(column.data[index]!, updated)
  // A card whose board no longer matches the active board filter leaves the view.
  if (boardId && 'boardId' in updated && updated.boardId !== boardId) removeAt(column, index)
}

function updateFound<T extends RoadmapEntry>(
  data: RoadmapBoardData<T>,
  found: RoadmapStatus,
  updated: RoadmapUpdate,
  boardId: string | null | undefined,
) {
  const column = data[found]
  const index = column.data.findIndex((post) => post.id === updated.id)
  const newStatus = updated.status ?? found
  if (newStatus === found) return updateInPlace(column, index, updated, boardId)
  const item = column.data[index]!
  removeAt(column, index)
  // A status off the roadmap (e.g. back to open) just drops the card.
  if (isRoadmapStatus(newStatus)) insertRoadmapItem(data[newStatus], { ...item, ...updated } as T)
}

function addUnseen<T extends RoadmapEntry>(data: RoadmapBoardData<T>, updated: RoadmapUpdate) {
  if (!isRoadmapStatus(updated.status)) return
  const column = data[updated.status]
  // A partial update cannot be rendered as a card; only the count moves.
  if (updated.title && updated.createdAt) insertRoadmapItem(column, updated as unknown as T)
  else column.total++
}

// Applies a post edit made elsewhere (detail sidebar, create dialog) to the board.
export function applyRoadmapUpdate<T extends RoadmapEntry>(
  data: RoadmapBoardData<T>,
  updated: RoadmapUpdate,
  boardId?: string | null,
) {
  const found = findRoadmapStatus(data, updated.id)
  if (found) updateFound(data, found, updated, boardId)
  else addUnseen(data, updated)
}

// Commits a confirmed drag: insert into the target column first so the pending
// placeholder's key carries over to the real card, then remove the source card.
export function commitRoadmapMove<T extends RoadmapEntry & { status?: string }>(
  data: RoadmapBoardData<T>,
  drop: RoadmapPendingDrop<T>,
  clearPending: () => void,
) {
  insertRoadmapItem(data[drop.toStatus], { ...drop.post, status: drop.toStatus })
  clearPending()
  removeRoadmapItemFrom(data[drop.fromStatus], drop.postId)
}

export function roadmapPageQuery(status: RoadmapStatus, cursor: string, boardId: string | null | undefined) {
  return { status, sort: 'createdAt', cursor, pageSize: 10, boardId: boardId || undefined }
}
