// Pure helpers behind the dashboard help center list.
import type { HelpArticleStatus, HelpCollectionIcon } from '../../../shared/constants/help'

interface InlineArticle {
  id: string
  title: string
  aiEnabled: boolean
  status: HelpArticleStatus
  position: number
  updatedAt: string
}

export interface AdminCollection {
  id: string
  name: string
  description: string | null
  icon: HelpCollectionIcon
  visible: boolean
  position: number
  articleCount: number
  articles: InlineArticle[]
}

export type BulkAction = 'publish' | 'unpublish' | 'ai-visibility'
export type SelectionState = 'none' | 'some' | 'all'

interface HelpStats {
  collectionCount: number
  articleCount: number
}

/** A copy of the set with the id added or removed. */
export function toggledSet(set: ReadonlySet<string>, id: string) {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** A copy of the set without the id. */
export function withoutId(set: ReadonlySet<string>, id: string) {
  const next = new Set(set)
  next.delete(id)
  return next
}

export function hasNoContent(stats: HelpStats | null | undefined) {
  return !stats?.collectionCount && !stats?.articleCount
}

/** How many of a collection's articles are selected: none, some or all. */
export function selectionState(articleIds: string[], selected: ReadonlySet<string>): SelectionState {
  if (!articleIds.length) return 'none'
  const hit = articleIds.filter((id) => selected.has(id)).length
  if (hit === 0) return 'none'
  return hit === articleIds.length ? 'all' : 'some'
}

/**
 * Clicking a collection's checkbox clears it when every article is selected,
 * otherwise selects them all. Returns the new selection and whether the
 * collection should open so the picked articles are visible.
 */
export function toggleCollectionArticles(articleIds: string[], selected: ReadonlySet<string>) {
  const clear = selectionState(articleIds, selected) === 'all'
  const next = new Set(selected)
  for (const id of articleIds) {
    if (clear) next.delete(id)
    else next.add(id)
  }
  return { selected: next, expand: !clear }
}

/** Body for a bulk endpoint; only the AI-visibility action carries a flag. */
export function bulkBody(ids: string[], aiEnabled?: boolean) {
  return aiEnabled === undefined ? { ids } : { ids, aiEnabled }
}

/** The toast after a bulk action: the AI toggle has a fixed message, the others report a count. */
export function bulkResultMessage(action: BulkAction, affected: number) {
  if (action === 'ai-visibility') return { key: 'help.admin.aiUpdated', n: undefined }
  return { key: `help.admin.${action}Result`, n: affected }
}

/** First and last row shown on a page, both zero for an empty list. */
export function shownRange(page: number, pageSize: number, total: number) {
  if (total === 0) return { from: 0, to: 0 }
  return { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total) }
}

export function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}
