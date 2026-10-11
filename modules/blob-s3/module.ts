import { defineNuxtModule, addServerPlugin, createResolver } from '@nuxt/kit'

// Self-hosted S3-compatible blob provider. Only loaded into Node /
// Docker builds — Cloudflare uses its R2 binding and Vercel uses Vercel
// Blob via NuxtHub's build-time-selected driver, where shipping
// aws4fetch + the s3 driver would just bloat the bundle.

const NATIVE_BLOB_PRESETS = new Set(['cloudflare-module', 'vercel'])

function usesNativeBlob(preset: string | undefined) {
  return NATIVE_BLOB_PRESETS.has(preset ?? '')
}

export default defineNuxtModule({
  meta: { name: 'blob-s3' },
  setup(_options, nuxt) {
    if (usesNativeBlob(nuxt.options.nitro?.preset || process.env.NITRO_PRESET)) return

    const { resolve } = createResolver(import.meta.url)
    addServerPlugin(resolve('./runtime/server/plugins/blob-s3'))
  },
})
