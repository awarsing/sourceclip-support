// @ts-expect-error virtual module, filled in by the widget-preload module
import hints from '#widget-preload/hints'
// @ts-expect-error virtual file, resolved when the server bundle is built
import { buildAssetsURL } from '#internal/nuxt/paths'
import { type I18nPublicConfig, widgetEmbedLocale } from '../utils/embed-locale'

// Replaced at build time by @nuxtjs/i18n with `/_i18n/<deployment hash>`. The
// hash reaches neither runtimeConfig nor any importable module, so this define
// is the server's only handle on it.
declare const __I18N_SERVER_ROUTE__: string

interface Hint {
  file: string
  rel: string
  as?: string
}

const links = (hints as Hint[])
  .map((hint) => `<link rel="${hint.rel}" as="${hint.as}" crossorigin href="${buildAssetsURL(hint.file)}">`)
  .join('')

export default defineNitroPlugin((nitroApp) => {
  if (!links) return

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const i18n = useRuntimeConfig(event).public?.i18n as I18nPublicConfig | undefined
    const locale = widgetEmbedLocale(event.path, i18n)
    if (!locale) return

    // `as="fetch"` is matched only against a CORS-mode request, which is what
    // the `crossorigin` attribute asks for; without it Chrome fetches the
    // messages, then discards the result over a credentials-mode mismatch.
    html.head.push(
      `${links}<link rel="preload" as="fetch" crossorigin href="${__I18N_SERVER_ROUTE__}/${locale}/messages.json">`,
    )
  })
})
