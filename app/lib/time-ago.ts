// The i18n key and count for an elapsed time, in the largest unit that fits.
// Months are 30 days and years 12 such months, which is close enough for "ago".
const UNITS: { key: string; size: number; limit: number }[] = [
  { key: 'time.minutesAgo', size: 60, limit: 60 },
  { key: 'time.hoursAgo', size: 60, limit: 24 },
  { key: 'time.daysAgo', size: 24, limit: 30 },
  { key: 'time.monthsAgo', size: 30, limit: 12 },
  { key: 'time.yearsAgo', size: 12, limit: Number.POSITIVE_INFINITY },
]

export function timeAgoParts(elapsedMs: number): { key: string; n?: number } {
  let n = Math.floor(elapsedMs / 1000)
  if (n < 60) return { key: 'time.justNow' }
  let key = 'time.justNow'
  for (const unit of UNITS) {
    n = Math.floor(n / unit.size)
    key = unit.key
    if (n < unit.limit) break
  }
  return { key, n }
}
