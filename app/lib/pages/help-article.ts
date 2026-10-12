// Pure helpers behind the public help article page.
import { CJK_RANGE } from '../../../shared/constants/help'

const NON_SLUG = new RegExp(`[^a-z0-9${CJK_RANGE}]+`, 'g')

/** A heading's anchor base: lower-cased, non-word runs as dashes, or "section-N" when nothing is left. */
export function headingSlug(text: string | undefined, index: number) {
  return (
    String(text ?? '')
      .toLowerCase()
      .replace(NON_SLUG, '-')
      .replace(/^-|-$/g, '') || `section-${index}`
  )
}

/**
 * The editor's heading-id callback. It renders headings in order, so an index
 * that does not move forward starts a new render and resets the duplicate
 * counter; repeated slugs within one render get "-2", "-3" and so on.
 */
export function createAnchorIds() {
  const seen = new Map<string, number>()
  let lastIndex = Number.POSITIVE_INFINITY
  return (heading: { text?: string; index?: number }) => {
    const index = heading?.index ?? 0
    if (index <= lastIndex) seen.clear()
    lastIndex = index
    const base = headingSlug(heading?.text, index)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count ? `${base}-${count + 1}` : base
  }
}

/**
 * The table-of-contents entry to highlight: the last one once the page is
 * scrolled to the bottom, otherwise the last heading above the offset line.
 */
export function activeHeading(headings: { id: string; top: number }[], offset: number, atBottom: boolean) {
  if (atBottom && headings.length) return headings[headings.length - 1]!.id
  let current = headings[0]?.id ?? ''
  for (const heading of headings) {
    if (heading.top <= offset + 1) current = heading.id
  }
  return current
}

/** Classes for one table-of-contents entry, by heading level and whether it is active. */
export function tocItemClass(level: number, active: boolean) {
  const nested = level === 3
  const weight = active ? 'font-semibold' : nested ? 'font-medium' : ''
  return [
    nested ? 'pl-7 text-[12.5px]' : 'pl-3.5 text-[13px]',
    weight,
    active ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground',
  ]
}
