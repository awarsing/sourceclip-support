const ROUTE = 'widget/embed'

export interface I18nPublicConfig {
  locales?: Array<string | { code: string }>
  defaultLocale?: string
}

function embedLocale(path: string, locales: string[], defaultLocale: string): string | undefined {
  const segments = path.replace(/\?.*$/, '').split('/').filter(Boolean)
  const locale = segments.length > 2 ? segments.shift()! : defaultLocale
  if (segments.join('/') !== ROUTE) return undefined
  return locales.includes(locale) ? locale : undefined
}

// The locale of a widget embed request, or undefined for any other page.
export function widgetEmbedLocale(path: string, i18n: I18nPublicConfig | undefined): string | undefined {
  const locales = (i18n?.locales ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.code))
  return embedLocale(path, locales, i18n?.defaultLocale ?? '')
}
