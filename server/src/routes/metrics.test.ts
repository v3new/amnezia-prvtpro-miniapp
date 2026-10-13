import {describe, expect, test} from 'bun:test'
import type {Bot} from 'grammy'
import {Hono} from 'hono'
import type {Env} from '../env.ts'
import type {PanelClient, PanelUser} from '../panel/client.ts'
import type {PeerSnapshotData} from '../panel/peer-snapshot.ts'
import {createInternalCronRouter} from './internal-cron.ts'
import {createMetricsRouter} from './metrics.ts'

const TOKEN = 'm'.repeat(40)
const AUTH = {headers: {authorization: `Bearer ${TOKEN}`}}

function fakePanel(opts: {usersFail?: boolean; snapshot?: PeerSnapshotData | null} = {}) {
  const calls = {get: 0}
  const snap: PeerSnapshotData = opts.snapshot ?? {
    peers: [],
    states: {awg3: 'up', wireguard: 'down', awg2: 'absent'},
    startedAt: Date.now() - 2_000,
    fetchedAt: Date.now() - 1_000,
    durationMs: 1_000,
  }
  const panel = {
    invalidateUsersCache: () => {},
    listUsers: async (): Promise<PanelUser[]> => {
      if (opts.usersFail) throw new Error('panel down')
      return []
    },
    peers: {
      current: () => (opts.snapshot === null ? null : snap),
      get: async () => {
        calls.get += 1
        return snap
      },
    },
  } as unknown as PanelClient
  return {panel, calls}
}

function appWith(metricsToken: string | undefined, panel: PanelClient): Hono {
  const env = {METRICS_TOKEN: metricsToken, CRON_SECRET: 'c'.repeat(20)} as Env
  const app = new Hono()
  app.route('/internal', createMetricsRouter(env, panel))
  app.route('/internal', createInternalCronRouter(env, panel, {} as Bot))
  return app
}

describe('GET /internal/metrics', () => {
  test('is off without METRICS_TOKEN', async () => {
    expect((await appWith(undefined, fakePanel().panel).request('/internal/metrics')).status).toBe(404)
  })

  test('rejects a missing or wrong bearer token', async () => {
    const app = appWith(TOKEN, fakePanel().panel)
    expect((await app.request('/internal/metrics')).status).toBe(401)
    const wrong = await app.request('/internal/metrics', {headers: {authorization: `Bearer ${'x'.repeat(40)}`}})
    expect(wrong.status).toBe(401)
  })

  test('serves the shared snapshot without listing the panel itself', async () => {
    const {panel, calls} = fakePanel()
    const res = await appWith(TOKEN, panel).request('/internal/metrics', AUTH)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body).toContain('vpn_panel_protocol_up{protocol="awg3"} 1')
    expect(body).toContain('vpn_panel_protocol_up{protocol="wireguard"} 0')
    expect(body).not.toContain('protocol="awg2"')
    expect(body).toMatch(/^vpn_peers_snapshot_age_seconds 1(\.\d)?$/m)
    expect(calls.get).toBe(0)
  })

  test('waits for the first snapshot right after start', async () => {
    const {panel, calls} = fakePanel({snapshot: null})
    expect((await appWith(TOKEN, panel).request('/internal/metrics', AUTH)).status).toBe(200)
    expect(calls.get).toBe(1)
  })

  test('a failed user list still yields metrics', async () => {
    const res = await appWith(TOKEN, fakePanel({usersFail: true}).panel).request('/internal/metrics', AUTH)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('vpn_panel_users_up 0')
  })

  test('cron endpoints still require the cron secret', async () => {
    const res = await appWith(TOKEN, fakePanel().panel).request('/internal/cron/traffic-alerts', {method: 'POST'})
    expect(res.status).toBe(401)
  })
})
