import {describe, expect, test} from 'bun:test'
import {clientTraffic, parseHumanAgoToISO, parseHumanBytes} from './parse.ts'

describe('parseHumanBytes', () => {
  test('parses common units', () => {
    expect(parseHumanBytes('9.03 GiB')).toBe(Math.round(9.03 * 1024 ** 3))
    expect(parseHumanBytes('234.67 MiB')).toBe(Math.round(234.67 * 1024 ** 2))
    expect(parseHumanBytes('0 B')).toBe(0)
    expect(parseHumanBytes('1024')).toBe(0)
  })
  test('passes through numbers', () => {
    expect(parseHumanBytes(42)).toBe(42)
    expect(parseHumanBytes(null)).toBe(0)
  })
})

describe('parseHumanAgoToISO', () => {
  test('parses compound durations', () => {
    const iso = parseHumanAgoToISO('5h, 1m, 21s ago', new Date('2026-05-23T15:00:00Z').getTime())
    expect(iso).toBe('2026-05-23T09:58:39.000Z')
  })
  test('parses days', () => {
    const iso = parseHumanAgoToISO('37d, 18h, 6m, 49s ago', Date.parse('2026-05-23T15:00:00Z'))
    expect(iso?.startsWith('2026-04-15')).toBe(true)
  })
  test('parses full word forms', () => {
    const now = Date.parse('2026-05-23T15:00:00Z')
    expect(parseHumanAgoToISO('1 minute, 14 seconds ago', now)).toBe('2026-05-23T14:58:46.000Z')
    expect(parseHumanAgoToISO('2 hours, 2 minutes, 17 seconds ago', now)).toBe('2026-05-23T12:57:43.000Z')
    expect(parseHumanAgoToISO('1 minute, 45 seconds ago', now)).toBe('2026-05-23T14:58:15.000Z')
  })

  test('nullish on garbage', () => {
    expect(parseHumanAgoToISO('never')).toBeNull()
    expect(parseHumanAgoToISO('')).toBeNull()
    expect(parseHumanAgoToISO(null)).toBeNull()
  })
})

describe('clientTraffic', () => {
  test('wg family: server-side counters are flipped to the client view', () => {
    // `wg show` on the server: received = what the peer uploaded.
    const t = clientTraffic('awg3', {dataReceivedBytes: 300, dataSentBytes: 9000})
    expect(t).toEqual({download: 9000, upload: 300})
    expect(clientTraffic('wireguard', {dataReceivedBytes: 1, dataSentBytes: 2}).download).toBe(2)
  })

  test('xray: stats are already client-side and stay put', () => {
    // Xray statsquery: dataReceived carries the downlink.
    expect(clientTraffic('xray', {dataReceivedBytes: 9000, dataSentBytes: 300})).toEqual({
      download: 9000,
      upload: 300,
    })
  })

  test('falls back to the rounded strings when the panel sends no numbers', () => {
    expect(clientTraffic('awg3', {dataReceived: '234.67 MiB', dataSent: '9.03 GiB'})).toEqual({
      download: Math.round(9.03 * 1024 ** 3),
      upload: Math.round(234.67 * 1024 ** 2),
    })
  })

  test('prefers the exact numbers over the rounded strings', () => {
    expect(
      clientTraffic('awg3', {dataReceived: '1 GiB', dataSent: '1 GiB', dataReceivedBytes: 7, dataSentBytes: 9}),
    ).toEqual({download: 9, upload: 7})
  })

  test('a peer that never transferred reads as zero', () => {
    expect(clientTraffic('awg3', {})).toEqual({download: 0, upload: 0})
    expect(clientTraffic('awg3', {dataReceived: '', dataSent: ''})).toEqual({download: 0, upload: 0})
  })
})
