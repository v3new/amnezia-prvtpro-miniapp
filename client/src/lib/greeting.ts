export function greetingKey(
  now = new Date(),
): 'greeting.morning' | 'greeting.day' | 'greeting.evening' | 'greeting.night' {
  const h = now.getHours()
  if (h >= 5 && h < 12) return 'greeting.morning'
  if (h >= 12 && h < 18) return 'greeting.day'
  if (h >= 18 && h < 23) return 'greeting.evening'
  return 'greeting.night'
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let value = bytes
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
  return `${trimmed} ${units[i]}`
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'long', year: 'numeric'}).format(d)
}

export interface RelativeAgo {
  key: 'time.justNow' | 'time.minuteAgo' | 'time.hourAgo' | 'time.dayAgo'
  n: number
}

export function relativeAgo(iso: string | null | undefined, now = Date.now()): RelativeAgo | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diffSec = Math.max(0, Math.round((now - t) / 1000))
  if (diffSec < 60) return {key: 'time.justNow', n: 0}
  const min = Math.floor(diffSec / 60)
  if (min < 60) return {key: 'time.minuteAgo', n: min}
  const hr = Math.floor(min / 60)
  if (hr < 24) return {key: 'time.hourAgo', n: hr}
  return {key: 'time.dayAgo', n: Math.floor(hr / 24)}
}
