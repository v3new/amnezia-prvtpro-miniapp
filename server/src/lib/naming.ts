export const PROTO_SHORT: Record<string, string> = {
  awg2: 'wg2',
  awg: 'wg-awg',
  awg_legacy: 'wg-legacy',
  wireguard: 'wg',
  xray: 'xray',
}

export const PROTO_LABEL: Record<string, string> = {
  awg2: 'AmneziaWG 2.0',
  awg: 'AmneziaWG',
  awg_legacy: 'AmneziaWG (legacy)',
  wireguard: 'WireGuard',
  xray: 'Xray (VLESS-Reality)',
}

export const DESCRIPTION_PATTERN = /^[\p{L}\p{N}\s\-_,.!?'"()]+$/u
export const DESCRIPTION_MIN = 2
export const DESCRIPTION_MAX = 30

const NAME_REGEX = /^[a-z0-9_-]+:[a-z_]+:[a-z0-9-]+\s*\((.+)\)$/i

export function buildConnectionName(username: string, device: string, protocol: string, description: string): string {
  const short = PROTO_SHORT[protocol] ?? protocol
  return `${username}:${device}:${short} (${description.trim()})`
}

export function parseDescription(name: string): string | null {
  const m = NAME_REGEX.exec(name)
  return m?.[1] ?? null
}

export function parseDeviceFromName(name: string): string | null {
  const m = /^[a-z0-9_-]+:([a-z_]+):/i.exec(name)
  return m ? (m[1] ?? null) : null
}

export function normalizeDescription(d: string): string {
  return d.trim().toLowerCase()
}

export type DescriptionValidation =
  | {ok: true; value: string}
  | {ok: false; code: 'description_invalid'; message: string}

export function validateDescription(input: unknown): DescriptionValidation {
  if (typeof input !== 'string') {
    return {ok: false, code: 'description_invalid', message: 'Описание обязательно'}
  }
  const trimmed = input.trim()
  if (trimmed.length < DESCRIPTION_MIN) {
    return {
      ok: false,
      code: 'description_invalid',
      message: `Минимум ${DESCRIPTION_MIN} символа`,
    }
  }
  if (trimmed.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      code: 'description_invalid',
      message: `Максимум ${DESCRIPTION_MAX} символов`,
    }
  }
  if (trimmed.includes(':') || /[\n\r\t\f\v]/.test(trimmed)) {
    return {ok: false, code: 'description_invalid', message: 'Недопустимые символы'}
  }
  if (!DESCRIPTION_PATTERN.test(trimmed)) {
    return {ok: false, code: 'description_invalid', message: 'Недопустимые символы'}
  }
  return {ok: true, value: trimmed}
}
