// Pure rules for the help components. The leading dash keeps Nuxt from
// registering this module as a component (ignorePrefix).

export interface ArticleForm {
  title: string
  description: string
  content: string
  aiEnabled: boolean
}

interface ArticleFields {
  title: string
  description: string | null
  content: string
  aiEnabled: boolean
}

/** The editable fields of an article, or the empty defaults for a new one. */
export function articleForm(article: ArticleFields | null | undefined): ArticleForm {
  return {
    title: article?.title ?? '',
    description: article?.description ?? '',
    content: article?.content ?? '',
    aiEnabled: article?.aiEnabled ?? true,
  }
}

export function isArticleDirty(form: ArticleForm, article: ArticleFields | null | undefined): boolean {
  const saved = articleForm(article)
  return (
    form.title !== saved.title ||
    form.description !== saved.description ||
    form.content !== saved.content ||
    form.aiEnabled !== saved.aiEnabled
  )
}

/** Leaving needs confirmation when edits are unsaved, or a new draft has text in it. */
export function needsLeaveConfirm(state: {
  leavingAfterWrite: boolean
  dirty: boolean
  isNew: boolean
  form: Pick<ArticleForm, 'title' | 'content'>
}): boolean {
  if (state.leavingAfterWrite) return false
  return state.dirty || (state.isNew && !!(state.form.title || state.form.content))
}

export function articleContentBody(form: ArticleForm) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    content: form.content,
    aiEnabled: form.aiEnabled,
  }
}

/** The i18n key of the first problem that blocks a save, or null. */
export function articleSaveError(form: Pick<ArticleForm, 'title' | 'content'>, requireContent: boolean): string | null {
  if (!form.title.trim()) return 'help.admin.editor.titleRequired'
  if (requireContent && !form.content.trim()) return 'help.admin.editor.contentRequired'
  return null
}

export function nextPublishStatus(status: string | undefined): 'archived' | 'published' {
  return status === 'published' ? 'archived' : 'published'
}

export function articleUrlPath(article: { shortId: string; slug: string } | null | undefined): string {
  return article ? `/help/${article.shortId}-${article.slug}` : ''
}

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** A published article in a hidden collection is unreachable, which the editor warns about. */
export function isHiddenFromReaders(
  status: string | undefined,
  collection: { visible: boolean } | null | undefined,
): boolean {
  return status === 'published' && !!collection && !collection.visible
}

export interface CollectionFormValues<Icon extends string> {
  icon: Icon
  name: string
  description: string
  visible: boolean
}

export function collectionFormValues<Icon extends string>(
  collection: { icon: Icon; name: string; description: string | null; visible: boolean } | null | undefined,
  defaultIcon: Icon,
): CollectionFormValues<Icon> {
  return {
    icon: collection?.icon ?? defaultIcon,
    name: collection?.name ?? '',
    description: collection?.description ?? '',
    visible: collection?.visible ?? true,
  }
}

export function collectionBody<Icon extends string>(values: CollectionFormValues<Icon>) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    icon: values.icon,
    visible: values.visible,
  }
}

/** Splits text into plain and highlighted runs from sorted, non-overlapping ranges. */
export function highlightSegments(text: string, ranges: [number, number][]) {
  const out: { text: string; hit: boolean }[] = []
  let cursor = 0
  for (const [from, to] of ranges) {
    if (from > cursor) out.push({ text: text.slice(cursor, from), hit: false })
    out.push({ text: text.slice(from, to), hit: true })
    cursor = to
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false })
  return out
}

export function isRateLimited(error: unknown): boolean {
  const failure = error as { statusCode?: number; response?: { status?: number } } | null
  return failure?.statusCode === 429 || failure?.response?.status === 429
}

export interface SearchOutcome<Hit> {
  hits: Hit[]
  total: number
  rateLimited: boolean
}

export function searchFailure<Hit>(error: unknown): SearchOutcome<Hit> {
  return { hits: [], total: 0, rateLimited: isRateLimited(error) }
}

export function firstCollectionId(list: { id: string }[]): string {
  return list[0]?.id ?? ''
}
