import {ownedBy, type PanelPeer, type PanelUser} from '../panel/client.ts'
import type {UserActivity} from './app-activity.ts'
import {parseDescription, parseDeviceFromName} from './naming.ts'

// Prometheus text exposition of VPN usage, scraped by VictoriaMetrics on
// moscow. Built from what the mini app already reads from the panel, so the
// numbers match what users see in the app.

/** A WireGuard-family peer counts as online while its last handshake is this fresh. */
export const ONLINE_HANDSHAKE_SEC = 180

const UNASSIGNED = '(unassigned)'

type Labels = Record<string, string>

interface Family {
  help: string
  type: 'gauge' | 'counter'
  samples: Array<{labels: Labels; value: number}>
}

export interface VpnMetricsInput {
  users: PanelUser[]
  /** False when the user list could not be fetched; peers are then reported as unassigned. */
  usersUp: boolean
  peers: PanelPeer[]
  /** Per protocol: answered, failed, or not installed on the server (no series at all). */
  protocolStates: Record<string, 'up' | 'down' | 'absent'>
  /** Mini app opens and requests since the process started. */
  activity: UserActivity[]
  scrapeSeconds: number
  now: number
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
}

function formatLabels(labels: Labels): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`)
  return parts.length ? `{${parts.join(',')}}` : ''
}

function render(families: Record<string, Family>): string {
  const out: string[] = []
  for (const [name, f] of Object.entries(families)) {
    out.push(`# HELP ${name} ${f.help}`, `# TYPE ${name} ${f.type}`)
    for (const s of f.samples) out.push(`${name}${formatLabels(s.labels)} ${s.value}`)
  }
  return `${out.join('\n')}\n`
}

/** Owner of a peer: the user whose name prefixes the peer name, longest match first. */
export function peerOwner(peerName: string, usernames: string[]): string {
  const owners = usernames.filter((u) => ownedBy(peerName, u)).sort((a, b) => b.length - a.length)
  return owners[0] ?? UNASSIGNED
}

function peerLabels(peer: PanelPeer, owner: string): Labels {
  return {
    user: owner,
    protocol: peer.protocol,
    device: parseDeviceFromName(peer.name) ?? '',
    connection: parseDescription(peer.name) ?? peer.name,
    // Keeps series unique for peers whose names do not follow the mini app format.
    client_id: peer.client_id,
  }
}

export function buildVpnMetrics(input: VpnMetricsInput): string {
  const {users, usersUp, peers, protocolStates, activity, scrapeSeconds, now} = input
  const usernames = users.map((u) => u.username)
  const families: Record<string, Family> = {
    vpn_users: {help: 'Panel users by state.', type: 'gauge', samples: []},
    vpn_user_traffic_used_bytes: {help: 'Traffic used in the current limit period.', type: 'gauge', samples: []},
    vpn_user_traffic_limit_bytes: {help: 'Traffic limit per period; 0 means unlimited.', type: 'gauge', samples: []},
    vpn_user_traffic_total_bytes: {help: 'All-time traffic accounted by the panel.', type: 'gauge', samples: []},
    vpn_user_enabled: {help: '1 if the user is enabled in the panel.', type: 'gauge', samples: []},
    vpn_connections: {help: 'Peers per protocol.', type: 'gauge', samples: []},
    vpn_connection_download_bytes_total: {
      help: 'Bytes the client downloaded; resets when the protocol container restarts.',
      type: 'counter',
      samples: [],
    },
    vpn_connection_upload_bytes_total: {
      help: 'Bytes the client uploaded; resets when the protocol container restarts.',
      type: 'counter',
      samples: [],
    },
    vpn_connection_enabled: {help: '1 if the peer is enabled.', type: 'gauge', samples: []},
    vpn_connection_last_handshake_timestamp_seconds: {
      help: 'Unix time of the last handshake (WireGuard family only).',
      type: 'gauge',
      samples: [],
    },
    vpn_connection_online: {
      help: `1 if the last handshake is under ${ONLINE_HANDSHAKE_SEC}s old (WireGuard family only).`,
      type: 'gauge',
      samples: [],
    },
    vpn_panel_protocol_up: {
      help: '1 if the panel answered for this protocol on this scrape.',
      type: 'gauge',
      samples: [],
    },
    vpn_panel_users_up: {help: '1 if the panel answered the user list on this scrape.', type: 'gauge', samples: []},
    miniapp_last_open_timestamp_seconds: {
      help: 'Unix time the user last opened the mini app (successful auth).',
      type: 'gauge',
      samples: [],
    },
    miniapp_last_seen_timestamp_seconds: {
      help: "Unix time of the user's last authenticated mini app request.",
      type: 'gauge',
      samples: [],
    },
    miniapp_opens_total: {help: 'Mini app opens since the process started.', type: 'counter', samples: []},
    vpn_metrics_scrape_duration_seconds: {help: 'Time spent collecting from the panel.', type: 'gauge', samples: []},
  }
  const add = (name: string, labels: Labels, value: number) => {
    const family = families[name]
    if (!family) throw new Error(`metric family ${name} is not declared`)
    family.samples.push({labels, value})
  }

  const enabledUsers = users.filter((u) => u.enabled).length
  add('vpn_users', {state: 'enabled'}, enabledUsers)
  add('vpn_users', {state: 'disabled'}, users.length - enabledUsers)
  for (const u of users) {
    add('vpn_user_traffic_used_bytes', {user: u.username}, u.traffic_used)
    add('vpn_user_traffic_limit_bytes', {user: u.username}, u.traffic_limit)
    add('vpn_user_traffic_total_bytes', {user: u.username}, u.traffic_total)
    add('vpn_user_enabled', {user: u.username}, u.enabled ? 1 : 0)
  }

  add('vpn_panel_users_up', {}, usersUp ? 1 : 0)
  for (const [protocol, state] of Object.entries(protocolStates)) {
    if (state === 'absent') continue
    add('vpn_panel_protocol_up', {protocol}, state === 'up' ? 1 : 0)
    if (state === 'up') add('vpn_connections', {protocol}, peers.filter((p) => p.protocol === protocol).length)
  }

  for (const peer of peers) {
    const labels = peerLabels(peer, peerOwner(peer.name, usernames))
    add('vpn_connection_download_bytes_total', labels, peer.download)
    add('vpn_connection_upload_bytes_total', labels, peer.upload)
    add('vpn_connection_enabled', labels, peer.enabled ? 1 : 0)
    if (peer.last_handshake_at) {
      const at = Date.parse(peer.last_handshake_at) / 1000
      add('vpn_connection_last_handshake_timestamp_seconds', labels, Math.round(at))
      add('vpn_connection_online', labels, now / 1000 - at < ONLINE_HANDSHAKE_SEC ? 1 : 0)
    } else if (peer.protocol !== 'xray') {
      add('vpn_connection_online', labels, 0)
    }
  }

  // Every known user gets an opens counter, starting at 0, so the first open
  // after a restart shows up as an increase instead of a new series at 1.
  const seen = new Set(activity.map((a) => a.username))
  if (usersUp) {
    for (const u of users) if (!seen.has(u.username)) add('miniapp_opens_total', {user: u.username}, 0)
  }
  for (const a of activity) {
    if (a.lastOpenAt !== null)
      add('miniapp_last_open_timestamp_seconds', {user: a.username}, Math.round(a.lastOpenAt / 1000))
    add('miniapp_last_seen_timestamp_seconds', {user: a.username}, Math.round(a.lastSeenAt / 1000))
    add('miniapp_opens_total', {user: a.username}, a.opens)
  }

  add('vpn_metrics_scrape_duration_seconds', {}, Number(scrapeSeconds.toFixed(3)))
  return render(families)
}
