// Pure helpers shared by the default and dashboard layouts.

/** Avatar fallback: the first two characters of a name, upper-cased. */
export function initialsOf(name: string | null | undefined) {
  return (name || '').slice(0, 2).toUpperCase()
}

/** Unread badges cap at 99 so the pill keeps its size. */
export function badgeLabel(count: number) {
  return count > 99 ? '99+' : String(count)
}

/** The nav entry whose path is the longest prefix of the current route. */
export function activeNavItem<T extends { to: string }>(items: T[], path: string, resolve: (to: string) => string) {
  return items
    .filter((item) => {
      const to = resolve(item.to)
      return path === to || path.startsWith(`${to}/`)
    })
    .sort((a, b) => b.to.length - a.to.length)[0]
}

export type NavVariant = 'mobile' | 'desktop'

const NAV_CLASSES = {
  mobile: {
    toggle: 'flex',
    heading: '',
    link: 'px-3',
    icon: '',
    label: '',
    badge: 'ml-auto text-[10px]',
  },
  desktop: {
    toggle: 'hidden min-[1360px]:flex',
    heading: 'hidden min-[1360px]:block',
    link: 'relative justify-center min-[1360px]:justify-start px-0 min-[1360px]:px-3',
    icon: 'shrink-0',
    label: 'hidden min-[1360px]:inline',
    badge:
      'absolute right-0 top-0 text-[9px] font-semibold min-[1360px]:static min-[1360px]:ml-auto min-[1360px]:text-[10px]',
  },
} as const

/** Classes for a sidebar nav group: the mobile sheet shows everything, the desktop rail hides labels below 1360px. */
export function navGroupClasses(variant: NavVariant) {
  return NAV_CLASSES[variant]
}

/**
 * A collapsed group hides its links: in the mobile sheet entirely, on desktop
 * only at the wide breakpoint, since the narrow rail has no group headings.
 */
export function navGroupVisibility(variant: NavVariant, collapsed: boolean) {
  return {
    shown: !(variant === 'mobile' && collapsed),
    listClass: variant === 'desktop' && collapsed ? 'min-[1360px]:hidden' : '',
  }
}
