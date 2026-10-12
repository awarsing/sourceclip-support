import { defineNuxtModule, addServerPlugin, createResolver } from '@nuxt/kit'
import { collectHints, type Hint, type ManifestEntry } from './hints'

// The frame is served as an SPA shell (`ssr: false`), which advertises only
// the entry chunk: the route's own chunk, the chunks it shares and its
// stylesheet are each discovered a round trip after the previous one has run.
// Server code cannot read the client manifest (`#build/*` is barred from the
// nitro runtime), so resolve those chunk chains here at build time and hand
// them to the runtime plugin as a virtual module. `build:manifest` never fires
// in dev, which leaves the list empty and the plugin inert.

export default defineNuxtModule({
  meta: { name: 'widget-preload' },
  setup(_options, nuxt) {
    let hints: Hint[] = []

    nuxt.hook('build:manifest', (manifest) => {
      hints = collectHints(manifest as Record<string, ManifestEntry>)
    })

    // Read back when Nitro bundles, which is after the client build has filled
    // the list in.
    nuxt.hook('nitro:config', (nitro) => {
      nitro.virtual = {
        ...nitro.virtual,
        '#widget-preload/hints': () => `export default ${JSON.stringify(hints)}`,
      }
    })

    const { resolve } = createResolver(import.meta.url)
    addServerPlugin(resolve('./runtime/server/plugins/widget-embed-preload'))
  },
})
