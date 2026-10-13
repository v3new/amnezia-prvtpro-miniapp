import {describe, expect, test} from 'bun:test'
import type {PanelPeer, PanelUser} from '../panel/client.ts'
import {buildVpnMetrics, ONLINE_HANDSHAKE_SEC, peerOwner} from './vpn-metrics.ts'

const NOW = Date.parse('2026-10-13T12:00:00Z')

function user(username: string, extra: Partial<PanelUser> = {}): PanelUser {
  return {
    id: `id-${username}`,
    username,
    telegramId: null,
    enabled: true,
    traffic_limit: 0,
    traffic_used: 0,
    traffic_total: 0,
    traffic_reset_strategy: 'never',
    ...extra,
  }
}

function peer(name: string, protocol: string, extra: Partial<PanelPeer> = {}): PanelPeer {
  return {
    client_id: `c-${name}`,
    protocol,
    name,
    download: 0,
    upload: 0,
    created_at: null,
    enabled: true,
    last_handshake_at: null,
    ...extra,
  }
}

function sample(text: string, metric: string, labels: string): string | undefined {
  return text.split('\n').find((l) => l.startsWith(`${metric}${labels} `))
}

describe('peerOwner', () => {
  test('matches by name prefix and prefers the longest username', () => {
    expect(peerOwner('v3new:mac:wg3 (Рабочий Mac)', ['v3new', 'v3'])).toBe('v3new')
    expect(peerOwner('V3NEW:mac:wg3 (x)', ['v3new'])).toBe('v3new')
    expect(peerOwner('stranger:mac:wg3 (x)', ['v3new'])).toBe('(unassigned)')
  })
})

describe('buildVpnMetrics', () => {
  const users = [user('v3new', {traffic_used: 5, traffic_limit: 100, traffic_total: 50}), user('off', {enabled: false})]
  const recent = new Date(NOW - 30_000).toISOString()
  const stale = new Date(NOW - (ONLINE_HANDSHAKE_SEC + 60) * 1000).toISOString()
  const peers = [
    peer('v3new:mac:wg3 (Рабочий "Mac")', 'awg3', {download: 900, upload: 100, last_handshake_at: recent}),
    peer('v3new:ipad:wg3 (Планшет)', 'awg3', {last_handshake_at: stale, enabled: false}),
    peer('v3new:appletv:xray (Проектор)', 'xray', {download: 7}),
    peer('legacy-peer', 'wireguard'),
  ]
  const text = buildVpnMetrics({
    users,
    usersUp: true,
    peers,
    protocolStates: {awg3: 'up', xray: 'up', wireguard: 'down', awg2: 'absent'},
    activity: [
      {username: 'v3new', lastOpenAt: NOW - 60_000, lastSeenAt: NOW - 1_000, opens: 3},
      {username: 'konstantin', lastOpenAt: null, lastSeenAt: NOW - 5_000, opens: 0},
    ],
    scrapeSeconds: 0.1234,
    now: NOW,
  })

  test('declares every family once with HELP and TYPE', () => {
    expect(text.match(/^# TYPE vpn_connection_download_bytes_total counter$/gm)).toHaveLength(1)
    expect(text.match(/^# TYPE vpn_users gauge$/gm)).toHaveLength(1)
    expect(text.endsWith('\n')).toBe(true)
  })

  test('user gauges', () => {
    expect(sample(text, 'vpn_users', '{state="enabled"}')).toBe('vpn_users{state="enabled"} 1')
    expect(sample(text, 'vpn_users', '{state="disabled"}')).toBe('vpn_users{state="disabled"} 1')
    expect(sample(text, 'vpn_user_traffic_limit_bytes', '{user="v3new"}')).toBe(
      'vpn_user_traffic_limit_bytes{user="v3new"} 100',
    )
    expect(sample(text, 'vpn_user_enabled', '{user="off"}')).toBe('vpn_user_enabled{user="off"} 0')
  })

  test('per-connection labels, escaping and counters', () => {
    const labels =
      '{user="v3new",protocol="awg3",device="mac",connection="Рабочий \\"Mac\\"",client_id="c-v3new:mac:wg3 (Рабочий \\"Mac\\")"}'
    expect(sample(text, 'vpn_connection_download_bytes_total', labels)).toBe(
      `vpn_connection_download_bytes_total${labels} 900`,
    )
    expect(sample(text, 'vpn_connection_upload_bytes_total', labels)).toBe(
      `vpn_connection_upload_bytes_total${labels} 100`,
    )
    expect(sample(text, 'vpn_connection_online', labels)).toBe(`vpn_connection_online${labels} 1`)
  })

  test('online uses the handshake age; xray has no handshake series', () => {
    const ipad =
      '{user="v3new",protocol="awg3",device="ipad",connection="Планшет",client_id="c-v3new:ipad:wg3 (Планшет)"}'
    expect(sample(text, 'vpn_connection_online', ipad)).toBe(`vpn_connection_online${ipad} 0`)
    expect(sample(text, 'vpn_connection_enabled', ipad)).toBe(`vpn_connection_enabled${ipad} 0`)
    expect(text).not.toContain('vpn_connection_online{user="v3new",protocol="xray"')
    expect(text).not.toContain('vpn_connection_last_handshake_timestamp_seconds{user="v3new",protocol="xray"')
  })

  test('unassigned peers and failed protocols', () => {
    expect(text).toContain(
      'vpn_connection_online{user="(unassigned)",protocol="wireguard",device="",connection="legacy-peer",client_id="c-legacy-peer"} 0',
    )
    expect(sample(text, 'vpn_panel_protocol_up', '{protocol="wireguard"}')).toBe(
      'vpn_panel_protocol_up{protocol="wireguard"} 0',
    )
    expect(sample(text, 'vpn_connections', '{protocol="awg3"}')).toBe('vpn_connections{protocol="awg3"} 2')
    expect(sample(text, 'vpn_connections', '{protocol="wireguard"}')).toBeUndefined()
    expect(sample(text, 'vpn_metrics_scrape_duration_seconds', '')).toBe('vpn_metrics_scrape_duration_seconds 0.123')
  })

  test('protocols that are not installed get no series; users status is reported', () => {
    expect(text).not.toContain('protocol="awg2"')
    expect(sample(text, 'vpn_panel_users_up', '')).toBe('vpn_panel_users_up 1')
  })

  test('two peers with the same name stay distinct series', () => {
    const dup = buildVpnMetrics({
      users: [],
      usersUp: false,
      peers: [peer('phone', 'awg3', {client_id: 'a'}), peer('phone', 'awg3', {client_id: 'b'})],
      protocolStates: {awg3: 'up'},
      activity: [],
      scrapeSeconds: 0,
      now: NOW,
    })
    const series = dup.split('\n').filter((l) => l.startsWith('vpn_connection_download_bytes_total{'))
    expect(new Set(series).size).toBe(2)
    expect(sample(dup, 'vpn_panel_users_up', '')).toBe('vpn_panel_users_up 0')
  })

  test('mini app activity', () => {
    const at = Math.round(NOW / 1000)
    expect(sample(text, 'miniapp_last_open_timestamp_seconds', '{user="v3new"}')).toBe(
      `miniapp_last_open_timestamp_seconds{user="v3new"} ${at - 60}`,
    )
    expect(sample(text, 'miniapp_last_seen_timestamp_seconds', '{user="v3new"}')).toBe(
      `miniapp_last_seen_timestamp_seconds{user="v3new"} ${at - 1}`,
    )
    expect(sample(text, 'miniapp_opens_total', '{user="v3new"}')).toBe('miniapp_opens_total{user="v3new"} 3')
    expect(sample(text, 'miniapp_last_open_timestamp_seconds', '{user="konstantin"}')).toBeUndefined()
    expect(text.match(/^# TYPE miniapp_opens_total counter$/gm)).toHaveLength(1)
    // Users without opens start at 0, so their first open is a visible increase.
    expect(sample(text, 'miniapp_opens_total', '{user="off"}')).toBe('miniapp_opens_total{user="off"} 0')
    expect(text.match(/^miniapp_opens_total\{user="v3new"\}/gm)).toHaveLength(1)
  })
})
