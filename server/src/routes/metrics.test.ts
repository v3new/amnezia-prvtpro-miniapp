import {describe, expect, test} from 'bun:test'
import type {Bot} from 'grammy'
import {Hono} from 'hono'
import {ApiError} from '../action-result.ts'
import type {Env} from '../env.ts'
import type {PanelClient, PanelPeer, PanelUser} from '../panel/client.ts'
import {createInternalCronRouter} from './internal-cron.ts'
import {createMetricsRouter} from './metrics.ts'

const TOKEN = 'm'.repeat(40)
const AUTH = {headers: {authorization: `Bearer ${TOKEN}`}}

function fakePanel(opts: {usersFail?: boolean} = {}) {
  const calls = {peers: 0}
  const panel = {
    invalidateUsersCache: () => {},
    listUsers: async (): Promise<PanelUser[]> => {
      if (opts.usersFail) throw new Error('panel down')
      return []
    },
    listPeers: async (protocol: string): Promise<PanelPeer[]> => {
      calls.peers += 1
      if (protocol === 'wireguard') throw new Error('ssh down')
      if (protocol === 'awg2') throw new ApiError(400, 'bad_request', 'not installed')
      return []
    },
  } as unknown as PanelClient
  return {panel, calls}
}

function appWith(metricsToken: string | undefined, panel: PanelClient): Hono {
  const env = {
    METRICS_TOKEN: metricsToken,
    CRON_SECRET: 'c'.repeat(20),
    ENABLED_PROTOCOLS: ['awg3', 'wireguard'],
    LEGACY_PROTOCOLS: ['awg2'],
  } as Env
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

  test('serves metrics with the right token, despite the cron secret check', async () => {
    const res = await appWith(TOKEN, fakePanel().panel).request('/internal/metrics', AUTH)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body).toContain('vpn_panel_protocol_up{protocol="awg3"} 1')
    expect(body).toContain('vpn_panel_protocol_up{protocol="wireguard"} 0')
    expect(body).not.toContain('protocol="awg2"')
  })

  test('a failed user list still yields metrics', async () => {
    const res = await appWith(TOKEN, fakePanel({usersFail: true}).panel).request('/internal/metrics', AUTH)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('vpn_panel_users_up 0')
  })

  test('scrapes within the TTL share one collection', async () => {
    const {panel, calls} = fakePanel()
    const app = appWith(TOKEN, panel)
    await Promise.all([app.request('/internal/metrics', AUTH), app.request('/internal/metrics', AUTH)])
    await app.request('/internal/metrics', AUTH)
    expect(calls.peers).toBe(3)
  })

  test('cron endpoints still require the cron secret', async () => {
    const res = await appWith(TOKEN, fakePanel().panel).request('/internal/cron/traffic-alerts', {method: 'POST'})
    expect(res.status).toBe(401)
  })
})
