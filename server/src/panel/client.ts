import {LRUCache} from 'lru-cache'
import {z} from 'zod'
import {ApiError} from '../action-result.ts'
import {type CacheEntry, type CacheSnapshot, snapshot} from './cache.ts'
import {clientTraffic, parseHumanAgoToISO} from './parse.ts'
import {type PeerSet, PeerSnapshot, type ProtocolState} from './peer-snapshot.ts'

export const PanelUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.string().optional(),
  telegramId: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v == null || v === '' ? null : String(v))),
  enabled: z.boolean().default(true),
  description: z.string().nullable().optional(),
  traffic_limit: z.number().default(0),
  traffic_used: z.number().default(0),
  traffic_total: z.number().default(0),
  traffic_reset_strategy: z.enum(['daily', 'weekly', 'monthly', 'never']).default('never'),
  last_reset_at: z.string().nullable().optional(),
  expiration_date: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  connections_count: z.number().optional(),
})
export type PanelUser = z.infer<typeof PanelUserSchema>

const UsersEnvelopeSchema = z.object({
  users: z.array(PanelUserSchema),
  total: z.number().optional(),
  page: z.number().optional(),
  size: z.number().optional(),
  pages: z.number().optional(),
})

export interface PanelConnection {
  id: string
  user_id: string
  server_id: number
  protocol: string
  client_id: string
  name: string
  last_bytes: number
  bytes_received: number
  bytes_sent: number
  created_at: string | null
  enabled: boolean
  last_handshake_at: string | null
}

const RawClientSchema = z.object({
  clientId: z.string(),
  userData: z
    .object({
      clientName: z.string().default(''),
      creationDate: z.string().optional(),
      dataReceived: z.string().optional(),
      dataSent: z.string().optional(),
      // Exact counters; the strings above are the same numbers rounded to 2
      // decimals. Anything but a number reads as absent, so we fall back to
      // the string rather than to a silent zero.
      dataReceivedBytes: z.number().optional().catch(undefined),
      dataSentBytes: z.number().optional().catch(undefined),
      latestHandshake: z.string().optional(),
      enabled: z.boolean().optional(),
    })
    .default({clientName: ''}),
})

const ConnectionsEnvelopeSchema = z.object({
  clients: z.array(RawClientSchema),
})

const ConfigEnvelopeSchema = z.object({
  config: z.string().default(''),
  vpn_link: z.string().default(''),
  vpnLink: z.string().optional(),
  link: z.string().optional(),
})

const PingSchema = z.object({
  alive: z.boolean().optional(),
  online: z.boolean().optional(),
  ms: z.number().optional(),
  ping_ms: z.number().optional(),
  uptime_seconds: z.number().nullable().optional(),
  protocols_available: z.array(z.string()).optional(),
})

/** A peer as the panel reports it; traffic is from the client's side. */
export interface PanelPeer {
  client_id: string
  protocol: string
  name: string
  download: number
  upload: number
  created_at: string | null
  enabled: boolean
  last_handshake_at: string | null
}

export interface PanelConfig {
  config: string
  vpn_link: string
}

export interface ServerPing {
  online: boolean
  ping_ms: number | null
  uptime_seconds: number | null
  protocols_available: string[]
}

export interface PanelClientOptions {
  baseUrl: string
  token: string
  serverId: number
  protocols: readonly string[]
  /** Default fetch timeout in ms. */
  requestTimeoutMs?: number
  /** TTL for the in-memory users cache. Set to 0 to disable. */
  usersCacheTtlMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_USERS_CACHE_TTL_MS = 3600 * 1000
const USERS_PAGE_SIZE = 100
const PROFILE_REFRESH_MS = 60 * 1000
const CONFIG_CACHE_TTL_MS = 30 * 24 * 3600 * 1000
const CONFIG_CACHE_MAX = 2000
const PROFILE_CACHE_TTL_MS = 30 * 24 * 3600 * 1000
// The shared peer snapshot: served for up to 10 minutes, refreshed in the
// background every minute (see PeerSnapshot.start in index.ts).
const PEERS_MAX_AGE_MS = 10 * 60 * 1000
// Reported to the app as stale past this age, i.e. a background refresh was missed.
const PEERS_STALE_MS = 2 * 60 * 1000
// Log panel calls slower than this — useful to spot upstream slowdowns.
const SLOW_PANEL_CALL_MS = 1000

export class PanelClient {
  readonly baseUrl: string
  readonly token: string
  readonly serverId: number
  readonly protocols: readonly string[]
  private readonly requestTimeoutMs: number
  private readonly usersCacheTtlMs: number
  private usersCache: {at: number; users: PanelUser[]} | null = null
  private usersInFlight: Promise<PanelUser[]> | null = null
  private profileCache = new LRUCache<string, CacheEntry<PanelUser>>({
    max: 2000,
    ttl: PROFILE_CACHE_TTL_MS,
  })
  private configCache = new LRUCache<string, PanelConfig>({
    max: CONFIG_CACHE_MAX,
    ttl: CONFIG_CACHE_TTL_MS,
  })
  /** Every peer on the server, shared by all users and the metrics endpoint. */
  readonly peers: PeerSnapshot

  constructor(opts: PanelClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.token = opts.token
    this.serverId = opts.serverId
    this.protocols = opts.protocols
    this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.usersCacheTtlMs = opts.usersCacheTtlMs ?? DEFAULT_USERS_CACHE_TTL_MS
    this.peers = new PeerSnapshot(() => this.fetchAllPeers(), PEERS_MAX_AGE_MS)
  }

  private async request<S extends z.ZodTypeAny>(
    method: string,
    path: string,
    body: unknown,
    schema: S,
  ): Promise<z.output<S>> {
    const startedAt = Date.now()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.requestTimeoutMs)
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      })
    } catch (e) {
      const elapsed = Date.now() - startedAt
      if ((e as Error)?.name === 'AbortError') {
        console.warn(`[panel] ${method} ${path} timeout after ${elapsed}ms`)
        throw new ApiError(504, 'panel_timeout', `Panel ${method} ${path}: timeout after ${this.requestTimeoutMs}ms`)
      }
      console.warn(`[panel] ${method} ${path} unreachable after ${elapsed}ms: ${(e as Error).message}`)
      throw new ApiError(502, 'panel_unreachable', `Panel ${method} ${path}: ${(e as Error).message}`)
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    const parsed = text ? safeJson(text) : null
    const elapsed = Date.now() - startedAt
    if (!res.ok) {
      const message =
        (parsed &&
        typeof parsed === 'object' &&
        'detail' in parsed &&
        typeof (parsed as {detail: unknown}).detail === 'string'
          ? (parsed as {detail: string}).detail
          : res.statusText) || 'panel error'
      console.warn(`[panel] ${method} ${path} → ${res.status} (${elapsed}ms): ${message}`)
      throw new ApiError(res.status === 404 ? 404 : 502, 'panel_error', `Panel ${method} ${path}: ${message}`)
    }
    if (elapsed >= SLOW_PANEL_CALL_MS) {
      console.warn(`[panel] ${method} ${path} slow: ${elapsed}ms`)
    }
    return schema.parse(parsed) as z.output<S>
  }

  async listUsers(): Promise<PanelUser[]> {
    const now = Date.now()
    if (this.usersCache && now - this.usersCache.at < this.usersCacheTtlMs) {
      console.log('[panel] listUsers cache hit')
      return this.usersCache.users
    }
    if (this.usersInFlight) {
      console.log('[panel] listUsers in-flight reuse')
      return this.usersInFlight
    }
    this.usersInFlight = this.fetchUsersFresh().finally(() => {
      this.usersInFlight = null
    })
    return this.usersInFlight
  }

  private async fetchUsersFresh(): Promise<PanelUser[]> {
    const users: PanelUser[] = []
    let page = 1

    while (true) {
      const data = await this.request(
        'GET',
        `/api/users?page=${page}&size=${USERS_PAGE_SIZE}`,
        undefined,
        UsersEnvelopeSchema,
      )
      users.push(...data.users)

      // Older panel builds may omit pagination metadata. In that case, keep
      // the historical one-request behavior; current builds always expose
      // `pages`, so newly added users cannot be hidden on page 2+.
      if (!data.pages || page >= data.pages || data.users.length === 0) break
      page += 1
    }

    this.usersCache = {at: Date.now(), users}
    return users
  }

  /** Bypass cache — call after mutating user state on the panel. */
  invalidateUsersCache(): void {
    this.usersCache = null
  }

  async findUserById(userId: string): Promise<PanelUser | null> {
    // First try cached list; on miss, invalidate and refetch once before
    // declaring "not found". Catches users added through the panel admin
    // outside of our app's flow without us paying per-request panel latency.
    const cached = await this.listUsers()
    const hit = cached.find((u) => u.id === userId)
    if (hit) return hit
    this.invalidateUsersCache()
    const fresh = await this.listUsers()
    return fresh.find((u) => u.id === userId) ?? null
  }

  async findUserByTelegramId(tgId: number | string): Promise<PanelUser | null> {
    const needle = String(tgId)
    const cached = await this.listUsers()
    const hit = cached.find((u) => String(u.telegramId ?? '') === needle)
    if (hit) return hit
    this.invalidateUsersCache()
    const fresh = await this.listUsers()
    return fresh.find((u) => String(u.telegramId ?? '') === needle) ?? null
  }

  async getProfile(userId: string): Promise<CacheSnapshot<PanelUser | null>> {
    const cached = this.profileCache.get(userId)
    if (cached) {
      if (Date.now() - cached.fetchedAt >= PROFILE_REFRESH_MS) {
        this.refreshProfile(userId, cached)
      }
      return snapshot(cached, PROFILE_REFRESH_MS)
    }
    const user = await this.findUserById(userId)
    const entry: CacheEntry<PanelUser | null> = {value: user, fetchedAt: Date.now()}
    if (user) this.profileCache.set(userId, entry as CacheEntry<PanelUser>)
    return snapshot(entry, PROFILE_REFRESH_MS)
  }

  private refreshProfile(userId: string, entry: CacheEntry<PanelUser>): void {
    if (entry.refreshPromise) return
    entry.refreshPromise = this.fetchUsersFresh()
      .then((users) => {
        const fresh = users.find((u) => u.id === userId)
        if (!fresh) {
          this.profileCache.delete(userId)
          throw new ApiError(403, 'user_not_provisioned', 'User is not provisioned')
        }
        entry.value = fresh
        entry.fetchedAt = Date.now()
        return fresh
      })
      .catch((e) => {
        console.warn(`[panel] refreshProfile(${userId}) failed: ${(e as Error).message}`)
        return entry.value
      })
      .finally(() => {
        entry.refreshPromise = undefined
      })
  }

  async listConnections(userId: string): Promise<PanelConnection[]> {
    return (await this.getConnections(userId)).value
  }

  async getConnections(userId: string): Promise<CacheSnapshot<PanelConnection[]>> {
    const [user, snap] = await Promise.all([this.findUserById(userId), this.peers.get()])
    const owned = user ? snap.peers.filter((p) => ownedBy(p.name, user.username)) : []
    // Stale when the snapshot missed refreshes, or when a protocol this user is
    // on failed its last listing and still shows its previous peers. Only then
    // does the app poll again (every 2.5 s, served from memory).
    const down = this.peers.downProtocols()
    const stale = Date.now() - snap.fetchedAt >= PEERS_STALE_MS || owned.some((p) => down.includes(p.protocol))
    return {
      value: owned.map((p) => this.toPanelConnection(p, userId)),
      cached_at: new Date(snap.fetchedAt).toISOString(),
      is_stale: stale,
      refresh_in_progress: stale,
    }
  }

  /** One listing of every protocol: the unit of work behind the shared snapshot. */
  private async fetchAllPeers(): Promise<PeerSet> {
    const results = await Promise.all(
      this.protocols.map(async (protocol): Promise<[string, ProtocolState, PanelPeer[]]> => {
        try {
          return [protocol, 'up', await this.listPeers(protocol)]
        } catch (e) {
          // The panel answers 400/404 for a protocol that is not installed on the server.
          if (e instanceof ApiError && (e.status === 400 || e.status === 404)) return [protocol, 'absent', []]
          console.warn(`[panel] ${protocol} peers failed: ${(e as Error).message}`)
          return [protocol, 'down', []]
        }
      }),
    )
    return {
      peers: results.flatMap(([, , peers]) => peers),
      states: Object.fromEntries(results.map(([protocol, state]) => [protocol, state])),
    }
  }

  /** After add/remove/toggle: the next read waits for a listing that started after the change. */
  invalidateConnectionsCache(): void {
    this.peers.invalidate()
  }

  async findOwnedConnection(userId: string, connectionId: string): Promise<PanelConnection | null> {
    const conns = await this.listConnections(userId)
    return conns.find((c) => c.id === connectionId) ?? null
  }

  private toPanelConnection(peer: PanelPeer, userId: string): PanelConnection {
    return {
      id: peer.client_id,
      user_id: userId,
      server_id: this.serverId,
      protocol: peer.protocol,
      client_id: peer.client_id,
      name: peer.name,
      last_bytes: peer.upload + peer.download,
      bytes_received: peer.download,
      bytes_sent: peer.upload,
      created_at: peer.created_at,
      enabled: peer.enabled,
      last_handshake_at: peer.last_handshake_at,
    }
  }

  async addConnection(userId: string, body: {protocol: string; name: string}): Promise<PanelConnection & PanelConfig> {
    const raw = await this.request(
      'POST',
      `/api/servers/${this.serverId}/connections/add`,
      {protocol: body.protocol, name: body.name, user_id: userId},
      z.unknown(),
    )
    this.invalidateConnectionsCache()
    const cfg = extractConfig(raw)
    const clientId = extractClientId(raw)
    if (!clientId) {
      throw new ApiError(502, 'panel_bad_response', 'Panel did not return created connection id')
    }
    return {
      id: clientId,
      user_id: userId,
      server_id: this.serverId,
      protocol: body.protocol,
      client_id: clientId,
      name: body.name,
      last_bytes: 0,
      bytes_received: 0,
      bytes_sent: 0,
      created_at: new Date().toISOString(),
      enabled: true,
      last_handshake_at: null,
      config: cfg.config,
      vpn_link: cfg.vpn_link,
    }
  }

  async removeConnection(protocol: string, clientId: string): Promise<{ok: boolean}> {
    await this.request(
      'POST',
      `/api/servers/${this.serverId}/connections/remove`,
      {protocol, client_id: clientId},
      z.unknown(),
    )
    this.configCache.delete(configCacheKey(protocol, clientId))
    this.invalidateConnectionsCache()
    return {ok: true}
  }

  async toggleConnection(protocol: string, clientId: string, enable: boolean): Promise<{enabled: boolean}> {
    await this.request(
      'POST',
      `/api/servers/${this.serverId}/connections/toggle`,
      {protocol, client_id: clientId, enable},
      z.unknown(),
    )
    this.invalidateConnectionsCache()
    return {enabled: enable}
  }

  async getConnectionConfig(protocol: string, clientId: string): Promise<PanelConfig> {
    const key = configCacheKey(protocol, clientId)
    const cached = this.configCache.get(key)
    if (cached) {
      console.log(`[panel] getConnectionConfig(${key}) cache hit`)
      return cached
    }
    const raw = await this.request(
      'POST',
      `/api/servers/${this.serverId}/connections/config`,
      {protocol, client_id: clientId},
      z.unknown(),
    )
    const value = extractConfig(raw)
    if (value.config || value.vpn_link) {
      this.configCache.set(key, value)
    }
    return value
  }

  async ping(): Promise<ServerPing> {
    const raw = await this.request('GET', `/api/servers/${this.serverId}/ping`, undefined, PingSchema)
    return {
      online: raw.alive ?? raw.online ?? false,
      ping_ms: raw.ms ?? raw.ping_ms ?? null,
      uptime_seconds: raw.uptime_seconds ?? null,
      protocols_available: raw.protocols_available ?? [],
    }
  }

  /** Every peer of one protocol with its counters, uncached: one SSH round-trip on the panel. */
  async listPeers(protocol: string): Promise<PanelPeer[]> {
    const data = await this.request(
      'GET',
      `/api/servers/${this.serverId}/connections?protocol=${encodeURIComponent(protocol)}`,
      undefined,
      ConnectionsEnvelopeSchema,
    )
    return data.clients.map((raw) => ({
      client_id: raw.clientId,
      protocol,
      name: raw.userData.clientName,
      // Panel counters are server-side; clientTraffic() turns them around.
      ...clientTraffic(raw.userData),
      created_at: raw.userData.creationDate ?? null,
      enabled: raw.userData.enabled ?? true,
      last_handshake_at: parseHumanAgoToISO(raw.userData.latestHandshake),
    }))
  }
}

function configCacheKey(protocol: string, clientId: string): string {
  return `${protocol}:${clientId}`
}

export function ownedBy(clientName: string, username: string): boolean {
  if (!username || !clientName) return false
  if (clientName === username) return true
  const lowerName = clientName.toLowerCase()
  const lowerUser = username.toLowerCase()
  return lowerName === lowerUser || lowerName.startsWith(`${lowerUser}:`) || lowerName.startsWith(`${lowerUser}-`)
}

function extractConfig(raw: unknown): PanelConfig {
  const parsed = ConfigEnvelopeSchema.partial().safeParse(raw)
  if (!parsed.success) return {config: '', vpn_link: ''}
  const d = parsed.data
  return {
    config: d.config ?? '',
    vpn_link: d.vpn_link ?? d.vpnLink ?? d.link ?? '',
  }
}

function extractClientId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  for (const key of ['clientId', 'client_id', 'id']) {
    const v = obj[key]
    if (typeof v === 'string') return v
  }
  return null
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
