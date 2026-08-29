import {describe, expect, test} from 'bun:test'
import type {PanelUser} from '../panel/client.ts'
import {AlertLedger, crossedThreshold, renderTrafficAlert} from './traffic-alerts.ts'

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
    expiration_date: null,
    ...over,
  }
}

describe('crossedThreshold', () => {
  test('reports the highest threshold reached', () => {
    expect(crossedThreshold(10)).toBeNull()
    expect(crossedThreshold(79.9)).toBeNull()
    expect(crossedThreshold(80)).toBe(80)
    expect(crossedThreshold(94)).toBe(80)
    expect(crossedThreshold(95)).toBe(95)
    expect(crossedThreshold(100)).toBe(100)
    expect(crossedThreshold(180)).toBe(100)
  })
})

describe('AlertLedger', () => {
  test('remembers what was already announced', () => {
    const ledger = new AlertLedger()
    const u = user()
    expect(ledger.lastSent(u)).toBeNull()
    ledger.record(u, 80)
    expect(ledger.lastSent(u)).toBe(80)
  })

  test('a panel reset re-arms every threshold', () => {
    const ledger = new AlertLedger()
    ledger.record(user(), 100)
    expect(ledger.lastSent(user({last_reset_at: '2026-09-01T00:00:00.000Z'}))).toBeNull()
  })

  test('raising the limit re-arms every threshold', () => {
    const ledger = new AlertLedger()
    ledger.record(user(), 100)
    expect(ledger.lastSent(user({traffic_limit: 200}))).toBeNull()
  })

  test('ledgers are per user', () => {
    const ledger = new AlertLedger()
    ledger.record(user(), 95)
    expect(ledger.lastSent(user({id: 'u2'}))).toBeNull()
  })
})

describe('renderTrafficAlert', () => {
  test('the 100 percent message names the cause and the way back', () => {
    const text = renderTrafficAlert(user({traffic_used: 100}), 100, 'admin')
    expect(text).toContain('трафик закончился')
    expect(text).toContain('обнулится')
    expect(text).toContain('@admin')
  })

  test('the warning message says how much is left', () => {
    const text = renderTrafficAlert(user({traffic_used: 80}), 80, 'admin')
    expect(text).toContain('на исходе')
    expect(text).toContain('осталось')
  })

  test('without an automatic reset it does not promise one', () => {
    const text = renderTrafficAlert(user({traffic_used: 100, traffic_reset_strategy: 'never'}), 100, 'admin')
    expect(text).not.toContain('обнулится сам')
    expect(text).toContain('руками')
  })
})
