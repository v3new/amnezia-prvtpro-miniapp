import type {PanelPeer} from './client.ts'

// One snapshot of every peer on the server, shared by all users and by the
// metrics endpoint. Each panel listing is a chain of SSH + `docker exec` calls
// that the panel runs one after another (~0.6 s per protocol on arbat), so the
// mini app reads the server through a single refresh stream: a background tick
// every minute, plus a forced refresh after the user changes a connection.

export type ProtocolState = 'up' | 'down' | 'absent'

export interface PeerSet {
  peers: PanelPeer[]
  /** Per protocol: answered, failed, or not installed on the server. */
  states: Record<string, ProtocolState>
}

export interface PeerSnapshotData extends PeerSet {
  /** When the refresh that produced this data started; decides validity after a change. */
  startedAt: number
  fetchedAt: number
  durationMs: number
}

export class PeerSnapshot {
  private data: PeerSnapshotData | null = null
  private running: RefreshEntry | null = null
  /** Data from a refresh that started before this moment no longer reflects the server. */
  private staleSince = 0

  constructor(
    private readonly fetchAll: () => Promise<PeerSet>,
    /** Older data is not served at all; a reader then waits for a refresh. */
    private readonly maxAgeMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  current(): PeerSnapshotData | null {
    return this.data
  }

  isRefreshing(): boolean {
    return this.running !== null
  }

  /** Data that still reflects the server, refreshing first if there is none. */
  async get(): Promise<PeerSnapshotData> {
    const d = this.data
    if (d && d.startedAt >= this.staleSince && this.now() - d.fetchedAt < this.maxAgeMs) return d
    return this.refresh(this.staleSince)
  }

  /** The next read must come from a refresh started after now (call after add/remove/toggle). */
  markStale(): void {
    this.staleSince = this.now()
  }

  /** After a change: mark stale and start the refresh now, so it is usually done by the next read. */
  invalidate(): void {
    this.markStale()
    this.refresh(this.staleSince).catch((e: unknown) => {
      console.warn(`[peers] refresh after change failed: ${(e as Error).message}`)
    })
  }

  /** Protocols whose last listing failed; their peers are the previous ones. */
  downProtocols(): string[] {
    return Object.entries(this.data?.states ?? {})
      .filter(([, state]) => state === 'down')
      .map(([protocol]) => protocol)
  }

  /**
   * Refresh, at most one at a time. A refresh queued at or after `notBefore`,
   * or one queued but not started yet, is reused; otherwise a new one is
   * chained after the current, so the panel never sees two listings from the
   * mini app at once and a burst of changes costs one extra listing.
   */
  refresh(notBefore = 0): Promise<PeerSnapshotData> {
    const current = this.running
    if (current && (current.queuedAt >= notBefore || !current.started)) return current.promise
    const previous = current ? current.promise.then(noop, noop) : Promise.resolve()
    const pending = {queuedAt: this.now(), started: false}
    const promise = previous.then(() => {
      pending.started = true
      return this.run()
    })
    const entry: RefreshEntry = Object.assign(pending, {promise})
    this.running = entry
    entry.promise.then(
      () => this.settle(entry),
      () => this.settle(entry),
    )
    return entry.promise
  }

  /** Background refresh every `intervalMs`, starting now. Returns a stop function. */
  start(intervalMs: number): () => void {
    const tick = () => {
      this.refresh().catch((e: unknown) => console.warn(`[peers] refresh failed: ${(e as Error).message}`))
    }
    tick()
    const timer = setInterval(tick, intervalMs)
    return () => clearInterval(timer)
  }

  private settle(entry: RefreshEntry): void {
    if (this.running === entry) this.running = null
  }

  private async run(): Promise<PeerSnapshotData> {
    const startedAt = this.now()
    const set = await this.fetchAll()
    // A protocol that failed this time keeps its last known peers instead of
    // making its connections vanish from the app.
    const kept = this.data?.peers.filter((p) => set.states[p.protocol] === 'down') ?? []
    const fetchedAt = this.now()
    this.data = {
      peers: [...set.peers, ...kept],
      states: set.states,
      startedAt,
      fetchedAt,
      durationMs: fetchedAt - startedAt,
    }
    return this.data
  }
}

interface RefreshEntry {
  queuedAt: number
  /** Set when the listing begins; until then a newer request can still join it. */
  started: boolean
  promise: Promise<PeerSnapshotData>
}

function noop(): void {}
