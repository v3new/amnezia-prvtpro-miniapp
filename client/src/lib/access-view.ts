import type {Profile} from '../api/types.ts'

export type AccessSeverity = 'active' | 'warning' | 'blocked'

/**
 * How bad things actually are, for copy purposes.
 *
 * The server marks a user `warning` while the panel still has them enabled —
 * but the panel polls traffic counters on its own schedule, so a user can sit
 * at 0 bytes left and still read as `warning`. Telling them their traffic is
 * "running low" when it is already gone is exactly the confusion this whole
 * screen exists to remove, so an exhausted limit reads as blocked either way.
 */
export function accessSeverity(profile: Profile): AccessSeverity {
  if (profile.access.status === 'blocked') return 'blocked'
  if (profile.access.status === 'active') return 'active'
  const {used_bytes, limit_bytes} = profile.traffic
  return limit_bytes > 0 && used_bytes >= limit_bytes ? 'blocked' : 'warning'
}
