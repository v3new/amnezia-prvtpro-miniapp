/**
 * Dev-only мок Telegram WebApp + fetch к /api/v1.
 * Активируется только в dev-режиме и только если в URL есть `?dev`.
 * В production-бандле этот модуль не импортируется.
 */

import type {Access} from '../api/types.ts'

interface ResponseJson {
  ok: boolean
  data?: unknown
  error?: {code: string; message: string}
}

function res(data: unknown): ResponseJson {
  return {ok: true, data}
}

/**
 * Dev switch for the access states: `?dev&access=limit|warning|expired|admin`.
 * Without it the profile is a healthy one.
 */
type AccessScenario = 'limit' | 'warning' | 'expired' | 'admin'

function accessScenario(): AccessScenario | null {
  const v = new URLSearchParams(window.location.search).get('access')
  return v === 'limit' || v === 'warning' || v === 'expired' || v === 'admin' ? v : null
}

/**
 * Dev switch for a per-user slot override: `?dev&slots=12`.
 * Mirrors what the server resolves from a `#slots=N` tag on the panel user.
 * Without it the mock reports the stock limit.
 */
const DEFAULT_SLOTS = 6

function slotsScenario(): number {
  const raw = new URLSearchParams(window.location.search).get('slots')
  if (raw === null) return DEFAULT_SLOTS
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_SLOTS
}

const BASE_PROFILE = {
  username: 'v3new',
  first_name: 'Sasha',
  language_code: 'ru',
  tg_id: 123456789,
  enabled: true,
  expiration_date: '2026-12-31T23:59:59',
  expires_in_days: 222,
  traffic: {
    used_bytes: 12_884_901_888,
    limit_bytes: 53_687_091_200,
    total_bytes: 412_316_860_416,
    reset_strategy: 'monthly' as const,
    next_reset_at: '2026-06-01T00:00:00',
    percent_used: 24,
  },
  access: {status: 'active', reason: null, self_heals_at: null} as Access,
}

function buildMockProfile(): typeof BASE_PROFILE {
  const scenario = accessScenario()
  if (!scenario) return BASE_PROFILE
  const reset = BASE_PROFILE.traffic.next_reset_at

  if (scenario === 'warning') {
    return {
      ...BASE_PROFILE,
      traffic: {...BASE_PROFILE.traffic, used_bytes: 45_097_156_608, percent_used: 84},
      access: {status: 'warning', reason: 'traffic_limit', self_heals_at: reset},
    }
  }
  if (scenario === 'limit') {
    return {
      ...BASE_PROFILE,
      enabled: false,
      traffic: {...BASE_PROFILE.traffic, used_bytes: BASE_PROFILE.traffic.limit_bytes, percent_used: 100},
      access: {status: 'blocked', reason: 'traffic_limit', self_heals_at: reset},
    }
  }
  if (scenario === 'expired') {
    return {
      ...BASE_PROFILE,
      enabled: false,
      expiration_date: '2026-01-31T23:59:59',
      expires_in_days: -30,
      access: {status: 'blocked', reason: 'expired', self_heals_at: null},
    }
  }
  return {
    ...BASE_PROFILE,
    enabled: false,
    access: {status: 'blocked', reason: 'admin', self_heals_at: null},
  }
}

const PROFILE = buildMockProfile()

const OPTIONS = {
  devices: [
    {slug: 'iphone', label: 'iPhone', icon: '📱', name_examples: ['Айфон', 'Личный']},
    {slug: 'ipad', label: 'iPad', icon: '📲', name_examples: ['iPad']},
    {slug: 'android', label: 'Android', icon: '🤖', name_examples: ['Андроид']},
    {slug: 'android_tablet', label: 'Android планшет', icon: '📲', name_examples: ['Планшет', 'Samsung Tab']},
    {slug: 'androidtv', label: 'Android TV', icon: '📺', name_examples: ['Телевизор']},
    {slug: 'mac', label: 'Mac', icon: '💻', name_examples: ['MacBook', 'iMac']},
    {slug: 'windows', label: 'Windows', icon: '🖥', name_examples: ['ПК']},
    {slug: 'linux', label: 'Linux', icon: '🐧', name_examples: ['Linux']},
    {slug: 'appletv', label: 'Apple TV', icon: '📺', name_examples: ['Apple TV']},
    {slug: 'router', label: 'Роутер', icon: '📡', name_examples: ['Дача']},
    {slug: 'other', label: 'Другое', icon: '❓', name_examples: ['Устройство']},
  ],
  protocols: [
    {
      slug: 'awg3',
      label: 'AmneziaWG 3.1',
      recommended_for: ['iphone', 'ipad', 'android', 'android_tablet', 'mac', 'windows', 'other'],
      legacy: false,
    },
    {slug: 'wireguard', label: 'WireGuard', recommended_for: ['router'], legacy: false},
    {slug: 'xray', label: 'Xray (VLESS-Reality)', recommended_for: ['linux', 'appletv', 'androidtv'], legacy: false},
    // Заводить нельзя — остаются ради инструкций к уже выданным конфигам.
    {slug: 'awg2', label: 'AmneziaWG 2.0', recommended_for: [], legacy: true},
    {slug: 'awg_legacy', label: 'AmneziaWG (legacy)', recommended_for: [], legacy: true},
  ],
  admin_contact_url: 'https://t.me/admin',
  donate_url: 'https://example.com/donate',
  description_constraints: {
    min_length: 2,
    max_length: 30,
    pattern: '^[\\p{L}\\p{N}\\s\\-_,.!?\'"()]+$',
  },
}

const CONNECTIONS = [
  {
    id: 'c1',
    name: 'v3new:iphone:wg3 (личный)',
    description: 'личный',
    device: 'iphone',
    protocol: 'awg3',
    protocol_label: 'AmneziaWG 3.1',
    legacy: false,
    created_at: '2026-04-10T18:22:00',
    last_bytes: 12_245_678_000,
    bytes_received: 9_245_678_000,
    bytes_sent: 3_000_000_000,
    enabled: true,
    last_handshake_at: new Date(Date.now() - 60_000).toISOString(),
    online: true,
  },
  {
    id: 'c2',
    name: 'v3new:mac:wg2 (работа)',
    description: 'работа',
    device: 'mac',
    protocol: 'awg2',
    protocol_label: 'AmneziaWG 2.0',
    legacy: true,
    created_at: '2026-03-01T10:00:00',
    last_bytes: 5_200_000_000,
    bytes_received: 4_000_000_000,
    bytes_sent: 1_200_000_000,
    enabled: true,
    last_handshake_at: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    online: false,
  },
  {
    id: 'c3',
    name: 'v3new:appletv:wg2 (телевизор у мамы)',
    description: 'телевизор у мамы',
    device: 'appletv',
    protocol: 'awg2',
    protocol_label: 'AmneziaWG 2.0',
    legacy: true,
    created_at: '2026-02-01T10:00:00',
    last_bytes: 2_100_000_000,
    bytes_received: 1_800_000_000,
    bytes_sent: 300_000_000,
    enabled: false,
    last_handshake_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
    online: false,
  },
]

const MOCK_WG_CONFIG = {
  id: 'c1',
  name: 'v3new:iphone:wg3 (личный)',
  description: 'личный',
  config: '[Interface]\nPrivateKey=AAAA...\nAddress=10.0.0.2/32\n[Peer]\nPublicKey=BBBB...',
  vpn_link: 'vpn://demo-link',
  qr_payload: '[Interface]\nPrivateKey=AAAA...\nAddress=10.0.0.2/32\n[Peer]\nPublicKey=BBBB...',
}

function mockConfigFor(protocol: string, device: string, description: string) {
  if (protocol === 'xray') {
    const link =
      'vless://b275536f-38d5-421a-a80a-bc3a65d6471d@example.com:443?type=tcp&security=reality&fp=chrome&flow=xtls-rprx-vision#demo'
    return {
      id: 'c-xray',
      name: `v3new:${device}:xray (${description})`,
      description,
      config: link,
      vpn_link: 'vpn://legacy-xray-demo',
      qr_payload: link,
    }
  }
  return MOCK_WG_CONFIG
}

function parseCreateBody(body: BodyInit | null | undefined): {device: string; protocol: string; description: string} {
  if (typeof body !== 'string') return {device: 'iphone', protocol: 'awg3', description: 'личный'}
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return {device: 'iphone', protocol: 'awg3', description: 'личный'}
  }
  if (!parsed || typeof parsed !== 'object') return {device: 'iphone', protocol: 'awg3', description: 'личный'}
  const obj = parsed as Record<string, unknown>
  return {
    device: typeof obj.device === 'string' ? obj.device : 'iphone',
    protocol: typeof obj.protocol === 'string' ? obj.protocol : 'awg3',
    description: typeof obj.description === 'string' ? obj.description : 'личный',
  }
}

export function installDevMock(): void {
  if (typeof window === 'undefined') return
  window.Telegram = {
    WebApp: {
      initData: 'mock=1',
      initDataUnsafe: {user: {id: 1, first_name: 'Sasha', language_code: 'ru'}},
      colorScheme: 'light',
      platform: 'ios',
      version: '8.0',
      themeParams: {},
      ready: () => {},
      expand: () => {},
      openLink: (url: string) => console.log('[mock] openLink', url),
      openTelegramLink: (url: string) => console.log('[mock] openTelegramLink', url),
      showPopup: (p: {message: string}) => alert(p.message),
      showConfirm: (m: string, cb: (ok: boolean) => void) => cb(confirm(m)),
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {},
        selectionChanged: () => {},
      },
      MainButton: {
        text: '',
        show: () => {},
        hide: () => {},
        enable: () => {},
        disable: () => {},
        onClick: () => {},
        offClick: () => {},
        setText: () => {},
        setParams: () => {},
      },
    },
  }

  const origFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    const method = (init?.method ?? 'GET').toUpperCase()

    const json = (body: ResponseJson, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {'Content-Type': 'application/json'},
      })

    if (path === '/api/v1/auth') return json(res({token: 'mock-jwt', expires_in: 86400, profile: PROFILE}))
    if (path === '/api/v1/options') return json(res(OPTIONS))
    if (path === '/api/v1/profile')
      return json(
        res({
          profile: PROFILE,
          cached_at: new Date().toISOString(),
          is_stale: false,
          refresh_in_progress: false,
        }),
      )
    if (path === '/api/v1/server/status')
      return json(
        res({
          online: true,
          ping_ms: 18,
          uptime_seconds: 1_200_000,
          protocols_available: ['awg3', 'xray', 'wireguard'],
        }),
      )
    if (path === '/api/v1/connections' && method === 'GET')
      return json(res({connections: CONNECTIONS, limit: slotsScenario(), used_slots: CONNECTIONS.length}))
    if (path === '/api/v1/connections' && method === 'POST') {
      const body = parseCreateBody(init?.body)
      return json(res(mockConfigFor(body.protocol, body.device, body.description)))
    }
    if (path.match(/^\/api\/v1\/connections\/[^/]+\/config$/)) return json(res(MOCK_WG_CONFIG))
    if (path.match(/^\/api\/v1\/connections\/[^/]+\/download-url$/) && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body as string) : {format: 'conf'}
      const fmt = body.format === 'vpn' ? 'vpn' : 'conf'
      const text = fmt === 'vpn' ? MOCK_WG_CONFIG.vpn_link : MOCK_WG_CONFIG.config
      // Mimic server sanitisation of the panel-side connection name.
      const base = (MOCK_WG_CONFIG.name || 'amnezia')
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}._-]+/gu, '_')
        .replace(/^_+|_+$/g, '')
      const filename = `${base}.${fmt}`
      const blob = new Blob([text], {type: 'text/plain'})
      const nativeUrl = URL.createObjectURL(blob)
      // No real ZIP in dev — point zip_url at the same blob; in dev the TG
      // fallback path won't run anyway (supportsDownloadFile checks for real TG).
      return json(
        res({
          native_url: nativeUrl,
          zip_url: nativeUrl,
          filename,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        }),
      )
    }
    if (path.match(/^\/api\/v1\/connections\/[^/]+$/) && method === 'DELETE') return json(res({deleted: true}))

    return origFetch(input, init)
  }
}
