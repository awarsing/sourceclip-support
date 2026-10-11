// Build-time preload hints for the widget embed route; see module.ts.

const ROUTE_MODULE_RE = /(^|\/)pages\/widget\/embed\.vue$/
// Every layer contributes one vueI18n config, and the i18n plugin — not the
// route — imports them, so they hang off no chunk the route can reach.
const I18N_CONFIG_RE = /(^|\/)i18n\.config\.(ts|js|mjs)$/

export interface ManifestEntry {
  file: string
  css?: string[]
  imports?: string[]
  isEntry?: boolean
}

export interface Hint {
  file: string
  rel: 'modulepreload' | 'preload'
  as?: string
}

function collectModules(manifest: Record<string, ManifestEntry>, id: string, seen: Set<string>) {
  if (seen.has(id) || !manifest[id]) return
  seen.add(id)
  for (const imported of manifest[id]!.imports ?? []) {
    collectModules(manifest, imported, seen)
  }
}

function collectFiles(manifest: Record<string, ManifestEntry>, ids: Set<string>): string[] {
  const files: string[] = []
  for (const id of ids) {
    const entry = manifest[id]!
    if (entry.file) files.push(entry.file)
    files.push(...(entry.css ?? []))
  }
  return files
}

export function collectHints(manifest: Record<string, ManifestEntry>): Hint[] {
  const routeId = Object.keys(manifest).find((id) => ROUTE_MODULE_RE.test(id))
  if (!routeId) return []

  const entryModules = new Set<string>()
  for (const [id, entry] of Object.entries(manifest)) {
    if (entry.isEntry) collectModules(manifest, id, entryModules)
  }
  // Whatever the entry pulls in is already linked in the shell.
  const shipped = new Set(collectFiles(manifest, entryModules))

  const needed = new Set<string>()
  collectModules(manifest, routeId, needed)
  for (const id of Object.keys(manifest)) {
    if (I18N_CONFIG_RE.test(id)) collectModules(manifest, id, needed)
  }

  const hints: Hint[] = []
  for (const file of collectFiles(manifest, needed)) {
    if (shipped.has(file)) continue
    shipped.add(file)
    hints.push(
      file.endsWith('.css') ? { file, rel: 'preload', as: 'style' } : { file, rel: 'modulepreload', as: 'script' },
    )
  }
  return hints
}
