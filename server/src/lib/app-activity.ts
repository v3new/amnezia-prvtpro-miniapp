// When panel users open the mini app and use it, for the metrics endpoint.
// Kept in memory: VictoriaMetrics stores the history, and a dashboard reading
// max_over_time() still shows the last open after this process restarts.

export interface UserActivity {
  username: string
  /** Last successful /auth, i.e. the app was opened; null if only seen via an older session. */
  lastOpenAt: number | null
  /** Last authenticated API request. */
  lastSeenAt: number
  /** Opens since this process started. */
  opens: number
}

export class AppActivity {
  private readonly users = new Map<string, UserActivity>()

  recordOpen(username: string, now = Date.now()): void {
    const u = this.entry(username, now)
    u.lastOpenAt = now
    u.lastSeenAt = Math.max(u.lastSeenAt, now)
    u.opens += 1
  }

  recordSeen(username: string, now = Date.now()): void {
    const u = this.entry(username, now)
    u.lastSeenAt = Math.max(u.lastSeenAt, now)
  }

  snapshot(): UserActivity[] {
    return [...this.users.values()].map((u) => ({...u}))
  }

  private entry(username: string, now: number): UserActivity {
    let u = this.users.get(username)
    if (!u) {
      u = {username, lastOpenAt: null, lastSeenAt: now, opens: 0}
      this.users.set(username, u)
    }
    return u
  }
}

/** Process-wide store: the auth route and the auth middleware write, the metrics route reads. */
export const appActivity = new AppActivity()
