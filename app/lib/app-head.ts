// Head entries app.vue adds per request.

// A configured org logo is the favicon on every surface (dashboard included),
// so the tab mirrors the brand the admin just set. Each keyed static icon slot
// is overridden rather than appended — otherwise the browser keeps preferring
// the bundled SVG. All slots point at the one logo so selection is deterministic.
export function logoFaviconLinks(logo: string | null | undefined) {
  if (!logo) return []
  return [
    { key: 'favicon-svg', rel: 'icon' as const, href: logo },
    { key: 'favicon-png', rel: 'icon' as const, href: logo },
    { key: 'favicon-ico', rel: 'shortcut icon' as const, href: logo },
    { key: 'favicon-apple', rel: 'apple-touch-icon' as const, href: logo },
  ]
}

// `system` renders light at SSR; this inline script corrects it before paint.
export function systemThemeScripts(followsSystem: boolean) {
  if (!followsSystem) return []
  return [
    {
      key: 'portal-system-theme',
      innerHTML:
        "try{document.documentElement.classList.toggle('dark',window.matchMedia('(prefers-color-scheme: dark)').matches)}catch(e){}",
    },
  ]
}

export function brandStyles(css: string) {
  return css ? [{ key: 'portal-brand-vars', innerHTML: css }] : []
}
