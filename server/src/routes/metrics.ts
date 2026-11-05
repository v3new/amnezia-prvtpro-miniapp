import {Hono} from 'hono'
import type {Env} from '../env.ts'
import {appActivity} from '../lib/app-activity.ts'
import {safeEqual} from '../lib/safe-equal.ts'
import {buildVpnMetrics, type NamedServerPeers} from '../lib/vpn-metrics.ts'
import type {PanelClient, PanelUser} from '../panel/client.ts'

const BEARER = /^Bearer\s+(.+)$/i

/** A panel server watched for metrics only (METRICS_EXTRA_SERVERS). */
export interface ExtraMetricsServer {
  name: string
  panel: PanelClient
}

// GET /internal/metrics for VictoriaMetrics. Off (404) unless METRICS_TOKEN is
// set; scrapers authenticate with `Authorization: Bearer <METRICS_TOKEN>`.
// Peers come from the shared snapshot that the background refresh keeps
// current, so a scrape never adds its own listing on the panel.
export function createMetricsRouter(env: Env, panel: PanelClient, extra: ExtraMetricsServer[] = []) {
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
    // Extra servers are read from their last snapshot only: a slow or dead
    // server must not hold up the scrape, it just has no series until ready.
    const extraServers: NamedServerPeers[] = []
    for (const s of extra) {
      const d = s.panel.peers.current()
      if (!d) continue
      extraServers.push({
        name: s.name,
        peers: d.peers,
        protocolStates: d.states,
        refreshSeconds: d.durationMs / 1000,
        snapshotAgeSeconds: (now - d.fetchedAt) / 1000,
      })
    }
    const body = buildVpnMetrics({
      users: users ?? [],
      usersUp: users !== null,
      serverName: env.METRICS_SERVER_NAME,
      peers: snap.peers,
      protocolStates: snap.states,
      extraServers,
      activity: appActivity.snapshot(),
      refreshSeconds: snap.durationMs / 1000,
      snapshotAgeSeconds: (now - snap.fetchedAt) / 1000,
      now,
    })
    return c.text(body, 200, {'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store'})
  })

  return app
}
