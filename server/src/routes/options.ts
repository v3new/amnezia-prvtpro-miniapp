import {Hono} from 'hono'
import {ok} from '../action-result.ts'
import type {Env} from '../env.ts'
import {DEVICES} from '../lib/devices.ts'
import {DESCRIPTION_MAX, DESCRIPTION_MIN} from '../lib/naming.ts'
import type {PanelClient} from '../panel/client.ts'
import {type AppVariables, activePanelUserMiddleware, authMiddleware} from './middleware.ts'

interface ProtocolDef {
  slug: string
  label: string
  recommended_for: string[]
}

const ALL_PROTOCOLS: Record<string, ProtocolDef> = {
  awg2: {
    slug: 'awg2',
    label: 'AmneziaWG 2.0',
    recommended_for: ['iphone', 'ipad', 'android', 'android_tablet', 'mac', 'windows', 'other'],
  },
  xray: {
    slug: 'xray',
    label: 'Xray (VLESS-Reality)',
    recommended_for: ['linux', 'appletv', 'androidtv'],
  },
  wireguard: {
    slug: 'wireguard',
    label: 'WireGuard',
    recommended_for: ['router'],
  },
  awg: {slug: 'awg', label: 'AmneziaWG', recommended_for: []},
  awg_legacy: {slug: 'awg_legacy', label: 'AmneziaWG (legacy)', recommended_for: []},
}

export function createOptionsRouter(env: Env, panel: PanelClient) {
  const app = new Hono<{Variables: AppVariables}>()
  app.use('*', authMiddleware(env))
  app.use('*', activePanelUserMiddleware(panel))

  const protocols = env.ENABLED_PROTOCOLS.map((slug) => ALL_PROTOCOLS[slug]).filter(
    (p): p is ProtocolDef => p !== undefined,
  )

  app.get('/options', (c) =>
    c.json(
      ok({
        devices: DEVICES,
        protocols,
        admin_contact_url: `https://t.me/${env.TG_ADMIN_HANDLE}`,
        donate_url: env.DONATE_URL,
        vpn_server_host: env.VPN_SERVER_HOST ?? null,
        description_constraints: {
          min_length: DESCRIPTION_MIN,
          max_length: DESCRIPTION_MAX,
          pattern: '^[\\p{L}\\p{N}\\s\\-_,.!?\'"()]+$',
        },
      }),
    ),
  )

  return app
}
