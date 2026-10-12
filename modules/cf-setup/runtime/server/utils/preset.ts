import { createError } from 'h3'

// The setup flow exists only on Cloudflare Workers; every other preset
// migrates before it listens.
export function isCloudflare(preset: string | undefined = import.meta.preset): boolean {
  return preset === 'cloudflare-module' || preset === 'cloudflare-pages'
}

// Endpoints of the setup flow answer 404 on any other preset.
export function assertCloudflare(): void {
  if (!isCloudflare()) throw createError({ statusCode: 404 })
}
