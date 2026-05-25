const BYTE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  KIB: 1024,
  MB: 1024 ** 2,
  MIB: 1024 ** 2,
  GB: 1024 ** 3,
  GIB: 1024 ** 3,
  TB: 1024 ** 4,
  TIB: 1024 ** 4,
}

export function parseHumanBytes(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input
  if (!input) return 0
  const m = /^([\d.]+)\s*([A-Za-z]+)/.exec(input.trim())
  if (!m) return 0
  const value = Number(m[1])
  const unit = (m[2] ?? '').toUpperCase()
  const mult = BYTE_UNITS[unit] ?? 1
  return Math.round(value * mult)
}

const AGO_UNITS: Record<string, number> = {
  s: 1,
  sec: 1,
  second: 1,
  m: 60,
  min: 60,
  minute: 60,
  h: 3600,
  hr: 3600,
  hour: 3600,
  d: 86_400,
  day: 86_400,
  w: 604_800,
  week: 604_800,
  mo: 2_592_000,
  mon: 2_592_000,
  month: 2_592_000,
  y: 31_536_000,
  yr: 31_536_000,
  year: 31_536_000,
}

export function parseHumanAgoToISO(input: string | null | undefined, now = Date.now()): string | null {
  if (!input) return null
  const cleaned = input.trim().replace(/\s+ago$/i, '')
  if (!cleaned) return null
  let totalSec = 0
  const re = /(\d+)\s*([A-Za-z]+)/g
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
  while ((match = re.exec(cleaned)) !== null) {
    const n = Number(match[1])
    const rawUnit = (match[2] ?? '').toLowerCase()
    const unit = rawUnit.length > 1 ? rawUnit.replace(/s$/, '') : rawUnit
    const mult = AGO_UNITS[unit]
    if (mult) totalSec += n * mult
  }
  if (totalSec === 0) return null
  return new Date(now - totalSec * 1000).toISOString()
}
