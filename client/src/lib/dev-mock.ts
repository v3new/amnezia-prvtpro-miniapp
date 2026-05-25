/**
 * Dev-only мок Telegram WebApp + fetch к /api/v1.
 * Активируется только в dev-режиме и только если в URL есть `?dev`.
 * В production-бандле этот модуль не импортируется.
 */

interface ResponseJson {
  ok: boolean
  data?: unknown
  error?: {code: string; message: string}
}

function res(data: unknown): ResponseJson {
  return {ok: true, data}
}

const PROFILE = {
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
}

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
      slug: 'awg2',
      label: 'AmneziaWG 2.0',
      recommended_for: ['iphone', 'ipad', 'android', 'android_tablet', 'mac', 'windows', 'appletv', 'other'],
    },
    {slug: 'wireguard', label: 'WireGuard', recommended_for: ['androidtv', 'router']},
    {slug: 'xray', label: 'Xray (VLESS-Reality)', recommended_for: ['linux']},
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
    name: 'v3new:iphone:wg2 (личный)',
    description: 'личный',
    device: 'iphone',
    protocol: 'awg2',
    protocol_label: 'AmneziaWG 2.0',
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
    created_at: '2026-02-01T10:00:00',
    last_bytes: 2_100_000_000,
    bytes_received: 1_800_000_000,
    bytes_sent: 300_000_000,
    enabled: false,
    last_handshake_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
    online: false,
  },
]

const MOCK_CONFIG = {
  id: 'c1',
  name: 'v3new:iphone:wg2 (личный)',
  description: 'личный',
  config: '[Interface]\nPrivateKey=AAAA...\nAddress=10.0.0.2/32\n[Peer]\nPublicKey=BBBB...',
  vpn_link: 'vpn://demo-link',
  qr_payload: 'vpn://demo-link',
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
    if (path === '/api/v1/server/status')
      return json(
        res({
          online: true,
          ping_ms: 18,
          uptime_seconds: 1_200_000,
          protocols_available: ['awg2', 'wireguard'],
        }),
      )
    if (path === '/api/v1/connections' && method === 'GET')
      return json(res({connections: CONNECTIONS, limit: 6, used_slots: CONNECTIONS.length}))
    if (path === '/api/v1/connections' && method === 'POST') return json(res(MOCK_CONFIG))
    if (path.match(/^\/api\/v1\/connections\/[^/]+\/config$/)) return json(res(MOCK_CONFIG))
    if (path.match(/^\/api\/v1\/connections\/[^/]+\/download-url$/) && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body as string) : {format: 'conf'}
      const fmt = body.format === 'vpn' ? 'vpn' : 'conf'
      const text = fmt === 'vpn' ? MOCK_CONFIG.vpn_link : MOCK_CONFIG.config
      // Mimic server sanitisation of the panel-side connection name.
      const base = (MOCK_CONFIG.name || 'amnezia')
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
