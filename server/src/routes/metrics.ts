import {Hono} from 'hono'
import type {Env} from '../env.ts'
import {appActivity} from '../lib/app-activity.ts'
import {safeEqual} from '../lib/safe-equal.ts'
import {buildVpnMetrics} from '../lib/vpn-metrics.ts'
import type {PanelClient, PanelUser} from '../panel/client.ts'

const BEARER = /^Bearer\s+(.+)$/i

// GET /internal/metrics for VictoriaMetrics. Off (404) unless METRICS_TOKEN is
// set; scrapers authenticate with `Authorization: Bearer <METRICS_TOKEN>`.
// Peers come from the shared snapshot that the background refresh keeps
// current, so a scrape never adds its own listing on the panel.
export function createMetricsRouter(env: Env, panel: PanelClient) {
  const app = new Hono()

  app.get('/metrics', async (c) => {
    if (!env.METRICS_TOKEN) return c.text('not found', 404)
    const token = BEARER.exec(c.req.header('authorization') ?? '')?.[1] ?? ''
    if (!safeEqual(token, env.METRICS_TOKEN)) return c.text('unauthorized', 401)

    // The users cache lives an hour; metrics need current traffic and new users.
    panel.invalidateUsersCache()
    const [users, snap] = await Promise.all([
      panel.listUsers().then(
        (u): PanelUser[] | null => u,
        (e: unknown) => {
          console.warn(`[metrics] users failed: ${(e as Error).message}`)
          return null
        },
      ),
      panel.peers.current() ?? panel.peers.get(),
    ])
    const now = Date.now()
    const body = buildVpnMetrics({
      users: users ?? [],
      usersUp: users !== null,
      peers: snap.peers,
      protocolStates: snap.states,
      activity: appActivity.snapshot(),
      refreshSeconds: snap.durationMs / 1000,
      snapshotAgeSeconds: (now - snap.fetchedAt) / 1000,
      now,
    })
    return c.text(body, 200, {'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store'})
  })

  return app
}
