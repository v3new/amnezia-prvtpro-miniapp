import type {PanelUser} from '../panel/client.ts'

export interface TrafficView {
  used_bytes: number
  limit_bytes: number
  total_bytes: number
  reset_strategy: 'daily' | 'weekly' | 'monthly' | 'never'
  next_reset_at: string | null
  percent_used: number
}

/** Why the panel is refusing to pass traffic for this user. */
export type AccessReason = 'traffic_limit' | 'expired' | 'admin'

export interface AccessView {
  /** `warning` = still working but close to (or at) the limit. */
  status: 'active' | 'warning' | 'blocked'
  reason: AccessReason | null
  /**
   * When a traffic-limit block clears itself through the panel's own reset.
   * Null when the block needs a human (admin bump, renewal, manual re-enable).
   */
  self_heals_at: string | null
}

export interface ProfileView {
  username: string
  first_name: string
  language_code: string
  tg_id: number
  enabled: boolean
  expiration_date: string | null
  expires_in_days: number | null
  traffic: TrafficView
  access: AccessView
}

/** Percent of the traffic limit that flips the profile into `warning`. */
export const TRAFFIC_WARN_PERCENT = 80

export function computeNextReset(
  lastResetAt: string | null | undefined,
  strategy: string,
  now: Date = new Date(),
): string | null {
  if (strategy === 'never') return null
  const last = lastResetAt ? new Date(lastResetAt) : now
  if (Number.isNaN(last.getTime())) return null
  // Anchor to the later of `last_reset_at` and `now` — panel resets on the next
  // calendar boundary after the user's last reset, but if that boundary is
  // already in the past (e.g. counters haven't been polled yet) the next visible
  // reset is the boundary after now.
  const anchor = last.getTime() > now.getTime() ? last : now
  switch (strategy) {
    case 'daily': {
      const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + 1))
      return next.toISOString()
    }
    case 'weekly': {
      // Panel uses ISO weeks (Mon-Sun). Next reset = next Monday 00:00 UTC.
      const dow = anchor.getUTCDay() // 0=Sun..6=Sat
      const daysUntilMonday = (8 - (dow === 0 ? 7 : dow)) % 7 || 7
      const next = new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + daysUntilMonday),
      )
      return next.toISOString()
    }
    case 'monthly': {
      const next = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1))
      return next.toISOString()
    }
    default:
      return null
  }
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diff = Math.ceil((t - Date.now()) / 86_400_000)
  return diff
}

export function computeAccess(user: PanelUser, nextResetAt: string | null, now: Date = new Date()): AccessView {
  const limit = user.traffic_limit ?? 0
  const used = user.traffic_used ?? 0
  const limitReached = limit > 0 && used >= limit
  const expiresAt = user.expiration_date ? new Date(user.expiration_date) : null
  const expired = expiresAt !== null && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()

  if (!user.enabled) {
    // Expiry outranks the traffic limit: when the subscription is over, a
    // traffic reset alone would not bring the user back, so telling them to
    // wait for it would be a lie.
    const reason: AccessReason = expired ? 'expired' : limitReached ? 'traffic_limit' : 'admin'
    return {
      status: 'blocked',
      reason,
      self_heals_at: reason === 'traffic_limit' ? nextResetAt : null,
    }
  }

  // Still enabled but at or past the limit: the panel polls counters on its
  // own schedule, so there is a window where the user is over the limit and
  // not yet switched off. Warn instead of pretending everything is fine.
  if (limit > 0 && (used / limit) * 100 >= TRAFFIC_WARN_PERCENT) {
    return {status: 'warning', reason: 'traffic_limit', self_heals_at: nextResetAt}
  }
  return {status: 'active', reason: null, self_heals_at: null}
}

export function buildProfile(
  user: PanelUser,
  tg: {id: number; first_name: string; language_code?: string},
): ProfileView {
  const limit = user.traffic_limit ?? 0
  const used = user.traffic_used ?? 0
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const strategy = (user.traffic_reset_strategy ?? 'never') as TrafficView['reset_strategy']
  const nextResetAt = computeNextReset(user.last_reset_at, strategy)
  return {
    username: user.username,
    first_name: tg.first_name,
    language_code: tg.language_code ?? 'ru',
    tg_id: tg.id,
    enabled: user.enabled,
    expiration_date: user.expiration_date ?? null,
    expires_in_days: daysUntil(user.expiration_date ?? null),
    traffic: {
      used_bytes: used,
      limit_bytes: limit,
      total_bytes: user.traffic_total ?? 0,
      reset_strategy: strategy,
      next_reset_at: nextResetAt,
      percent_used: percent,
    },
    access: computeAccess(user, nextResetAt),
  }
}
