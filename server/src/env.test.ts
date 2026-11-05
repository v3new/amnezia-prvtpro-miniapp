import {describe, expect, test} from 'bun:test'
import {z} from 'zod'
import {checkExtraServers, type ExtraServer, parseExtraServers} from './env.ts'

const schema = z.string().transform(parseExtraServers)

describe('METRICS_EXTRA_SERVERS', () => {
  test('parses name:serverId:proto+proto entries and drops repeated protocols', () => {
    expect(schema.parse('yandex:1:awg2+awg3+xray+awg2, spare:2:wireguard')).toEqual([
      {name: 'yandex', serverId: 1, protocols: ['awg2', 'awg3', 'xray']},
      {name: 'spare', serverId: 2, protocols: ['wireguard']},
    ])
  })

  test('empty means no extra servers', () => {
    expect(schema.parse('')).toEqual([])
  })

  test('rejects malformed entries', () => {
    const bad = [
      'yandex',
      'yandex:x:awg2',
      'yandex::awg2',
      'yandex:1.0:awg2',
      'yandex:-1:awg2',
      'yandex:1:',
      'yandex:1:awg9',
      'yandex:1:awg2:junk',
      'Yandex:1:awg2',
    ]
    for (const entry of bad) expect(schema.safeParse(entry).success).toBe(false)
  })
})

describe('checkExtraServers', () => {
  const yandex: ExtraServer = {name: 'yandex', serverId: 1, protocols: ['awg2']}
  const schemaFor = (env: {METRICS_SERVER_NAME?: string; METRICS_EXTRA_SERVERS: ExtraServer[]}) =>
    z.object({}).superRefine((_, ctx) => checkExtraServers({PANEL_SERVER_ID: 0, ...env}, ctx))
  const issues = (env: {METRICS_SERVER_NAME?: string; METRICS_EXTRA_SERVERS: ExtraServer[]}) => {
    const r = schemaFor(env).safeParse({})
    return r.success ? [] : r.error.issues.map((i) => i.message)
  }

  test('accepts a named main server and distinct extras', () => {
    expect(issues({METRICS_SERVER_NAME: 'arbat', METRICS_EXTRA_SERVERS: [yandex]})).toEqual([])
    expect(issues({METRICS_EXTRA_SERVERS: []})).toEqual([])
  })

  test('requires the main server to be named when extras are set', () => {
    expect(issues({METRICS_EXTRA_SERVERS: [yandex]})).toEqual([
      'METRICS_SERVER_NAME is required when METRICS_EXTRA_SERVERS is set',
    ])
  })

  test('rejects clashing ids and names', () => {
    expect(issues({METRICS_SERVER_NAME: 'arbat', METRICS_EXTRA_SERVERS: [{...yandex, serverId: 0}]})).toEqual([
      'server ids must be unique and differ from PANEL_SERVER_ID',
    ])
    expect(issues({METRICS_SERVER_NAME: 'yandex', METRICS_EXTRA_SERVERS: [yandex]})).toEqual([
      'server names must be unique and differ from METRICS_SERVER_NAME',
    ])
    expect(issues({METRICS_SERVER_NAME: 'arbat', METRICS_EXTRA_SERVERS: [yandex, {...yandex, serverId: 2}]})).toEqual([
      'server names must be unique and differ from METRICS_SERVER_NAME',
    ])
  })
})
