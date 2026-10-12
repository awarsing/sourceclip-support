// Pure helpers for the public changelog and its dashboard list.

const PUBLIC_CATEGORY_CLASS: Record<string, string> = {
  new: 'bg-primary/10 text-primary border-primary/25',
  improved: 'bg-chart-2/15 text-chart-2 border-chart-2/25',
  fixed: 'bg-success/10 text-success border-success/30',
}

/** Category pill on the public changelog. */
export function categoryBadgeClass(category: string) {
  const tone = PUBLIC_CATEGORY_CLASS[category] ?? 'bg-secondary text-secondary-foreground border-border'
  return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${tone}`
}

const ADMIN_TYPE_CLASS: Record<string, string> = {
  new: 'text-primary bg-primary/10 border-primary/25',
  improved: 'text-chart-2 bg-chart-2/10 border-chart-2/25',
}

/** Category pill in the dashboard list. */
export function adminTypeBadgeClass(type: string) {
  return ADMIN_TYPE_CLASS[type] ?? 'text-success bg-success/10 border-success/25'
}

const ADMIN_STATUS: Record<string, { tone: string; icon: string }> = {
  published: { tone: 'border-success/40 text-success bg-background', icon: 'lucide:check-circle' },
  needs_update: { tone: 'border-chart-2/50 text-chart-2 bg-background', icon: 'lucide:alert-circle' },
  draft: {
    tone: 'border-orange-400/50 text-orange-600 dark:text-orange-400 bg-background',
    icon: 'lucide:pencil-line',
  },
}

/** Status pill styling in the dashboard list; anything unknown reads as a draft-coloured warning. */
export function adminStatusBadge(status: string) {
  return ADMIN_STATUS[status] ?? { tone: ADMIN_STATUS.draft!.tone, icon: 'lucide:alert-circle' }
}

export function formatListDate(iso: string | null) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}
