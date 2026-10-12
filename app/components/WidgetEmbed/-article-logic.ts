// Link rules for WidgetEmbedArticle. The leading dash keeps Nuxt from
// registering this module as a component (ignorePrefix).

export type ArticleLinkTarget = { kind: 'article'; slug: string } | { kind: 'external' } | { kind: 'other' }

/** A same-origin help article opens inside the widget; other web links open in a new tab. */
export function articleLinkTarget(href: string, origin: string): ArticleLinkTarget {
  const target = new URL(href, origin)
  const match = target.pathname.match(/^\/help\/([a-zA-Z0-9]{6}-.+)$/)
  if (target.origin === origin && match) return { kind: 'article', slug: match[1]! }
  if (['http:', 'https:'].includes(target.protocol)) return { kind: 'external' }
  return { kind: 'other' }
}

export function articleApiPath(slug: string): string {
  return `/api/help/articles/${encodeURIComponent(slug.split('-')[0]!)}`
}
