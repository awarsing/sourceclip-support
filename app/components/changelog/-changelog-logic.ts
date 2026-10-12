// Pure rules for the changelog components. The leading dash keeps Nuxt from
// registering this module as a component (ignorePrefix).
import type { ChangelogCategory } from '../../../shared/types/changelog'

export interface ChangelogDraft {
  title: string
  content: string
  categories: ChangelogCategory[]
  cover: string | null
}

export function changelogBody(draft: ChangelogDraft) {
  return { title: draft.title.trim(), content: draft.content, categories: draft.categories, cover: draft.cover }
}

export function hasTitleAndContent(draft: Pick<ChangelogDraft, 'title' | 'content'>): boolean {
  return !!draft.title.trim() && !!draft.content.trim()
}

export function toggleCategory(list: ChangelogCategory[], type: ChangelogCategory): ChangelogCategory[] {
  return list.includes(type) ? list.filter((entry) => entry !== type) : [...list, type]
}

export function typeToggleClass(type: ChangelogCategory, isActive: boolean): string {
  if (!isActive) return 'border-border bg-background text-muted-foreground hover:bg-muted'
  if (type === 'new') return 'border-primary/25 bg-primary/10 text-primary'
  if (type === 'improved') return 'border-chart-2/25 bg-chart-2/10 text-chart-2'
  return 'border-success/25 bg-success/10 text-success'
}

export function typeIcon(type: ChangelogCategory): string {
  if (type === 'new') return 'lucide:sparkles'
  if (type === 'improved') return 'lucide:zap'
  return 'lucide:wrench'
}

/** Moves one reaction on or off for the viewer, never below zero. */
export function shiftReaction(
  counts: Record<string, number>,
  picked: Record<string, boolean>,
  emoji: string,
  on: boolean,
): void {
  picked[emoji] = on
  counts[emoji] = on ? (counts[emoji] ?? 0) + 1 : Math.max((counts[emoji] ?? 0) - 1, 0)
}

/** Replaces the optimistic state with what the server recorded. */
export function applyServerReactions(
  counts: Record<string, number>,
  picked: Record<string, boolean>,
  result: { reactionCounts: Record<string, number>; userReactions: string[] },
  emojis: readonly string[],
): void {
  for (const [emoji, count] of Object.entries(result.reactionCounts)) counts[emoji] = count
  for (const emoji of emojis) picked[emoji] = result.userReactions.includes(emoji)
}

export function reactionPath(changelogId: string, emoji: string, removing: boolean): string {
  const base = `/api/changelogs/${changelogId}/reactions`
  return removing ? `${base}?emoji=${encodeURIComponent(emoji)}` : base
}

export function isOutsideClick(
  open: boolean,
  root: { contains(node: unknown): boolean } | null,
  target: unknown,
): boolean {
  if (!open || !root) return false
  return !!target && !root.contains(target)
}

export function canGenerateChangelog(feedbackIds: string[], changeContent: string): boolean {
  return feedbackIds.length > 0 || !!changeContent.trim()
}

/** Adds or removes a selection, refusing new picks once the limit is reached. */
export function toggleLimitedSelection(ids: string[], id: string, max: number): string[] {
  if (ids.includes(id)) return ids.filter((entry) => entry !== id)
  return ids.length >= max ? ids : [...ids, id]
}

export function pickedFeedback(
  ids: string[],
  sources: { id: string; title: string }[],
): { id: string; title: string }[] {
  return ids.flatMap((id) => {
    const source = sources.find((entry) => entry.id === id)
    return source ? [{ id: source.id, title: source.title }] : []
  })
}

export function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(' ', '_')
}
