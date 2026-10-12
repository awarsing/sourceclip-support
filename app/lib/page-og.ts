import { type MaybeRefOrGetter, toValue } from 'vue'
import { generateExcerpt } from '../../shared/utils/markdown'

// Per-page title + description for usePageOg. Copy has two variants on the
// portal's isDefault: the org name woven in, or generic first-person for the
// unnamed default org.
export type OgPage =
  | { kind: 'home' }
  | { kind: 'roadmap' }
  | { kind: 'changelogList' }
  | { kind: 'post'; title: MaybeRefOrGetter<string | undefined>; content: MaybeRefOrGetter<string | undefined> }
  | { kind: 'helpHome' }
  | {
      kind: 'helpCollection'
      title: MaybeRefOrGetter<string | undefined>
      description: MaybeRefOrGetter<string | null | undefined>
    }
  | {
      kind: 'helpArticle'
      title: MaybeRefOrGetter<string | undefined>
      description: MaybeRefOrGetter<string | null | undefined>
      content: MaybeRefOrGetter<string | undefined>
      publishedAt?: MaybeRefOrGetter<string | undefined>
    }
  | {
      kind: 'changelogEntry'
      title: MaybeRefOrGetter<string | undefined>
      content: MaybeRefOrGetter<string | undefined>
      publishedAt?: MaybeRefOrGetter<string | undefined>
    }

export interface PageMeta {
  title: string
  description: string
  ogType: 'website' | 'article'
  publishedTime?: string
}

export interface OgContext {
  name: string
  isDefault: boolean
  t: (key: string, params: Record<string, string>) => string
}

type ListingKind = 'home' | 'roadmap' | 'changelogList' | 'helpHome'
type DiscussionPage = Extract<OgPage, { kind: 'post' | 'changelogEntry' }>

interface Copy {
  generic: string
  named: (name: string) => string
}

const LISTING_COPY: Record<ListingKind, Copy & { titleKey: string }> = {
  home: {
    titleKey: 'seo.portalTitle',
    generic: "Give us feedback, vote on feature requests, and help shape what we're building next.",
    named: (name) => `Give feedback to ${name}, vote on feature requests, and help shape the roadmap.`,
  },
  roadmap: {
    titleKey: 'seo.roadmapTitle',
    generic: "See what we're working on, what's planned, and what's shipped.",
    named: (name) => `See what ${name} is building, what's planned, and what's shipped.`,
  },
  changelogList: {
    titleKey: 'seo.changelogTitle',
    generic: 'The latest product updates, improvements, and fixes.',
    named: (name) => `The latest product updates, improvements, and fixes from ${name}.`,
  },
  helpHome: {
    titleKey: 'seo.helpTitle',
    generic: 'Guides and answers to the questions people ask most.',
    named: (name) => `Guides and answers to the questions ${name} users ask most.`,
  },
}

const DISCUSSION_COPY: Record<DiscussionPage['kind'], Copy & { fallbackKey: string }> = {
  post: {
    fallbackKey: 'seo.postFallback',
    generic: 'Vote and join the discussion.',
    named: (name) => `Vote and join the discussion on ${name}.`,
  },
  changelogEntry: {
    fallbackKey: 'seo.changelogFallback',
    generic: "What's new.",
    named: (name) => `What's new at ${name}.`,
  },
}

function copyFor(copy: Copy, ctx: OgContext): string {
  return ctx.isDefault ? copy.generic : copy.named(ctx.name)
}

function pageTitle(title: MaybeRefOrGetter<string | undefined>, fallbackKey: string, ctx: OgContext): string {
  return (toValue(title) ?? '') || ctx.t(fallbackKey, {})
}

function excerptOf(content: MaybeRefOrGetter<string | undefined>, maxLength?: number): string {
  const body = toValue(content) ?? ''
  return body ? generateExcerpt(body, maxLength) : ''
}

function listingMeta(kind: ListingKind, ctx: OgContext): PageMeta {
  const copy = LISTING_COPY[kind]
  return { title: ctx.t(copy.titleKey, { name: ctx.name }), description: copyFor(copy, ctx), ogType: 'website' }
}

function helpCollectionMeta(page: Extract<OgPage, { kind: 'helpCollection' }>, ctx: OgContext): PageMeta {
  const title = pageTitle(page.title, 'seo.helpFallback', ctx)
  return {
    title: ctx.t('seo.helpTitleWithOrg', { title, name: ctx.name }),
    description: toValue(page.description) || `${title} — ${ctx.name} Help Center.`,
    ogType: 'website',
  }
}

function helpArticleMeta(page: Extract<OgPage, { kind: 'helpArticle' }>, ctx: OgContext): PageMeta {
  const title = pageTitle(page.title, 'seo.helpFallback', ctx)
  return {
    title: ctx.t('seo.helpTitleWithOrg', { title, name: ctx.name }),
    description: toValue(page.description) || excerptOf(page.content, 155),
    ogType: 'article',
    publishedTime: toValue(page.publishedAt),
  }
}

// A feedback post and a changelog entry share one shape: the page's own title
// (the org woven in unless it is the default org) and an excerpt of the body.
function discussionMeta(page: DiscussionPage, ctx: OgContext): PageMeta {
  const copy = DISCUSSION_COPY[page.kind]
  const title = pageTitle(page.title, copy.fallbackKey, ctx)
  return {
    title: ctx.isDefault ? title : ctx.t('seo.titleWithOrg', { title, name: ctx.name }),
    description: excerptOf(page.content) || copyFor(copy, ctx),
    ogType: 'article',
    publishedTime: page.kind === 'changelogEntry' ? toValue(page.publishedAt) : undefined,
  }
}

export function buildPageMeta(page: OgPage, ctx: OgContext): PageMeta {
  switch (page.kind) {
    case 'helpCollection':
      return helpCollectionMeta(page, ctx)
    case 'helpArticle':
      return helpArticleMeta(page, ctx)
    case 'post':
    case 'changelogEntry':
      return discussionMeta(page, ctx)
    default:
      return listingMeta(page.kind, ctx)
  }
}
