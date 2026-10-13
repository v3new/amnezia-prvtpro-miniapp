import {describe, expect, test} from 'bun:test'
import {AppActivity} from './app-activity.ts'

describe('AppActivity', () => {
  test('counts opens and keeps the latest times', () => {
    const a = new AppActivity()
    a.recordOpen('v3new', 1_000)
    a.recordSeen('v3new', 5_000)
    a.recordOpen('v3new', 3_000)
    expect(a.snapshot()).toEqual([{username: 'v3new', lastOpenAt: 3_000, lastSeenAt: 5_000, opens: 2}])
  })

  test('a request on an older session is seen but not an open', () => {
    const a = new AppActivity()
    a.recordSeen('konstantin', 2_000)
    expect(a.snapshot()).toEqual([{username: 'konstantin', lastOpenAt: null, lastSeenAt: 2_000, opens: 0}])
  })

  test('snapshot is a copy', () => {
    const a = new AppActivity()
    a.recordOpen('x', 1)
    const [first] = a.snapshot()
    if (first) first.opens = 99
    expect(a.snapshot()[0]?.opens).toBe(1)
  })
})
