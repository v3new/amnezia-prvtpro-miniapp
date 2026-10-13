import {Hono} from 'hono'
import {ApiError} from '../action-result.ts'
import type {Env} from '../env.ts'
import {safeEqual} from '../lib/safe-equal.ts'
import {buildVpnMetrics, type VpnMetricsInput} from '../lib/vpn-metrics.ts'
import type {PanelClient, PanelPeer, PanelUser} from '../panel/client.ts'

const BEARER = /^Bearer\s+(.+)$/i
// Scrapes inside this window share one collection, so retries or a second
// scraper do not multiply the SSH-backed panel calls.
const COLLECTION_TTL_MS = 30_000

type ProtocolResult = {protocol: string; state: 'up' | 'down' | 'absent'; peers: PanelPeer[]}

async function collectProtocol(panel: PanelClient, protocol: string): Promise<ProtocolResult> {
  try {
    return {protocol, state: 'up', peers: await panel.listPeers(protocol)}
  } catch (e) {
    // The panel answers 400/404 for a protocol that is not installed on the server.
    if (e instanceof ApiError && (e.status === 400 || e.status === 404)) return {protocol, state: 'absent', peers: []}
    console.warn(`[metrics] ${protocol} peers failed: ${(e as Error).message}`)
    return {protocol, state: 'down', peers: []}
  }
}

async function collect(env: Env, panel: PanelClient): Promise<string> {
  const started = performance.now()
  const protocols = [...new Set([...env.ENABLED_PROTOCOLS, ...env.LEGACY_PROTOCOLS])]
  // The users cache lives an hour; metrics need current traffic and new users.
  panel.invalidateUsersCache()
  const [users, results] = await Promise.all([
    panel.listUsers().then(
      (u): PanelUser[] | null => u,
      (e: unknown) => {
        console.warn(`[metrics] users failed: ${(e as Error).message}`)
        return null
      },
    ),
    Promise.all(protocols.map((p) => collectProtocol(panel, p))),
  ])
  const input: VpnMetricsInput = {
    users: users ?? [],
    usersUp: users !== null,
    peers: results.flatMap((r) => r.peers),
    protocolStates: Object.fromEntries(results.map((r) => [r.protocol, r.state])),
    scrapeSeconds: (performance.now() - started) / 1000,
    now: Date.now(),
  }
  return buildVpnMetrics(input)
}

// GET /internal/metrics for VictoriaMetrics. Off (404) unless METRICS_TOKEN is
// set; scrapers authenticate with `Authorization: Bearer <METRICS_TOKEN>`.
export function createMetricsRouter(env: Env, panel: PanelClient) {
  const app = new Hono()
  let cached: {at: number; body: Promise<string>} | null = null

  app.get('/metrics', async (c) => {
    if (!env.METRICS_TOKEN) return c.text('not found', 404)
    const token = BEARER.exec(c.req.header('authorization') ?? '')?.[1] ?? ''
    if (!safeEqual(token, env.METRICS_TOKEN)) return c.text('unauthorized', 401)

    if (!cached || Date.now() - cached.at > COLLECTION_TTL_MS) {
      const body = collect(env, panel)
      cached = {at: Date.now(), body}
      body.catch(() => {
        cached = null
      })
    }
    return c.text(await cached.body, 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    })
  })

  return app
}
