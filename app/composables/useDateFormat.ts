import { timeAgoParts } from '../lib/time-ago'

export function useTimeAgo() {
  const { t } = useI18n()
  return (dateStr: string | Date): string => {
    const { key, n } = timeAgoParts(Date.now() - new Date(dateStr).getTime())
    return n === undefined ? t(key) : t(key, { n })
  }
}

export function useFormatDate() {
  const { locale } = useI18n()
  return (dateStr: string | Date): string =>
    new Date(dateStr).toLocaleDateString(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
}
