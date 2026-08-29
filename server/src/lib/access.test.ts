import {describe, expect, test} from 'bun:test'
import type {PanelUser} from '../panel/client.ts'
import {computeAccess} from './profile.ts'

const NOW = new Date('2026-08-29T12:00:00Z')
const RESET = '2026-09-01T00:00:00.000Z'

function user(over: Partial<PanelUser> = {}): PanelUser {
  return {
    id: 'u1',
    username: 'tester',
    telegramId: '1',
    enabled: true,
    traffic_limit: 100,
    traffic_used: 10,
    traffic_total: 10,
    traffic_reset_strategy: 'monthly',
    last_reset_at: '2026-08-01T00:00:00.000Z',
    expiration_date: '2027-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('computeAccess', () => {
  test('healthy user is active', () => {
    expect(computeAccess(user(), RESET, NOW)).toEqual({status: 'active', reason: null, self_heals_at: null})
  })

  test('disabled after burning the limit reads as traffic_limit, not a ban', () => {
    const access = computeAccess(user({enabled: false, traffic_used: 100}), RESET, NOW)
    expect(access).toEqual({status: 'blocked', reason: 'traffic_limit', self_heals_at: RESET})
  })

  test('expiry outranks the traffic limit when both are hit', () => {
    // Telling this user to wait for a traffic reset would be a lie: the reset
    // arrives and they are still expired.
    const access = computeAccess(
      user({enabled: false, traffic_used: 100, expiration_date: '2026-08-01T00:00:00.000Z'}),
      RESET,
      NOW,
    )
    expect(access).toEqual({status: 'blocked', reason: 'expired', self_heals_at: null})
  })

  test('disabled with traffic to spare is an admin action', () => {
    const access = computeAccess(user({enabled: false, traffic_used: 10}), RESET, NOW)
    expect(access).toEqual({status: 'blocked', reason: 'admin', self_heals_at: null})
  })

  test('a limit that never resets does not promise a reset date', () => {
    const access = computeAccess(user({enabled: false, traffic_used: 100}), null, NOW)
    expect(access.reason).toBe('traffic_limit')
    expect(access.self_heals_at).toBeNull()
  })

  test('warns at 80 percent while still enabled', () => {
    expect(computeAccess(user({traffic_used: 79}), RESET, NOW).status).toBe('active')
    expect(computeAccess(user({traffic_used: 80}), RESET, NOW)).toEqual({
      status: 'warning',
      reason: 'traffic_limit',
      self_heals_at: RESET,
    })
  })

  test('over the limit but not yet switched off is a warning, not a lie', () => {
    // The panel polls counters on its own schedule; this is that window.
    expect(computeAccess(user({traffic_used: 120}), RESET, NOW).status).toBe('warning')
  })

  test('unlimited users never warn', () => {
    expect(computeAccess(user({traffic_limit: 0, traffic_used: 10 ** 12}), RESET, NOW).status).toBe('active')
  })

  test('an unparseable expiry date does not fabricate an expired block', () => {
    const access = computeAccess(user({enabled: false, traffic_used: 100, expiration_date: 'not-a-date'}), RESET, NOW)
    expect(access.reason).toBe('traffic_limit')
  })
})
