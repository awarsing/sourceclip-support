const CHANGELOG_CATEGORIES = ['new', 'improved', 'fixed'] as const
export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number]

export const CHANGELOG_EMOJIS = [
  '\u{1F44D}',
  '\u{2764}\u{FE0F}',
  '\u{1F389}',
  '\u{2728}',
  '\u{1F440}',
  '\u{1F914}',
] as const

const AI_STYLES = ['concise', 'structured', 'benefit-led', 'witty'] as const
export type AiStyle = (typeof AI_STYLES)[number]

interface ChangelogAuthor {
  id: string
  name: string | null
  image: string | null
}

// Public list/detail item (reads published_* fields)
export interface ChangelogListItem {
  id: string
  slug: string
  title: string
  content: string
  categories: string[]
  cover: string | null
  publishedAt: string
  reactionCounts: Record<string, number>
  userReactions: string[]
}

// Admin list item (reads editing fields)
export interface ChangelogAdminListItem {
  id: string
  slug: string
  title: string
  status: string
  categories: string[]
  cover: string | null
  publishedAt: string | null
  updatedAt: string
  author: ChangelogAuthor
}

// Admin edit detail
export interface ChangelogAdminDetail {
  id: string
  slug: string
  status: string
  title: string
  content: string
  categories: string[]
  cover: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

// AI generation result
export interface ChangelogAiResult {
  title: string
  categories: string[]
  content: string
}
