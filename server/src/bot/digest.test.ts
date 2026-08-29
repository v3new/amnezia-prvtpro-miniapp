import {describe, expect, test} from 'bun:test'
import type {PanelUser} from '../panel/client.ts'
import {renderDigest} from './digest.ts'

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

describe('renderDigest', () => {
  test('a healthy user gets the normal digest', () => {
    const text = renderDigest(user(), [], 'admin')
    expect(text).toContain('Глянем, как у тебя дела')
    expect(text).not.toContain('не работает')
  })

  test('a user out of traffic is told why, not just that they are cut off', () => {
    const text = renderDigest(user({enabled: false, traffic_used: 100}), [], 'admin')
    expect(text).toContain('Трафик закончился')
    expect(text).toContain('обнулится')
    expect(text).toContain('вернётся сам')
  })

  test('an expired user is not promised a traffic reset', () => {
    const text = renderDigest(
      user({enabled: false, traffic_used: 100, expiration_date: '2020-01-01T00:00:00.000Z'}),
      [],
      'admin',
    )
    expect(text).toContain('Срок доступа закончился')
    expect(text).not.toContain('вернётся сам')
  })

  test('a blocked user is not invited to create a connection', () => {
    const text = renderDigest(user({enabled: false, traffic_used: 100}), [], 'admin')
    expect(text).not.toContain('сделай первое')
    expect(text).toContain('когда доступ вернётся')
  })
})
