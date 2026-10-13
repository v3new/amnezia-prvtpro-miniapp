import {describe, expect, test} from 'bun:test'
import {deflateSync, inflateSync} from 'node:zlib'
import {clientLabel, relabelConfig, relabelVlessLink, relabelVpnLink} from './client-label.ts'

// Built the way the panel's amnezia_vpn_key() does: JSON (indent 4), qCompress
// (uint32 BE length + zlib), urlsafe base64 without padding.
function panelKey(payload: Record<string, unknown>): string {
  const json = Buffer.from(JSON.stringify(payload, null, 4), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(json.length)
  return `vpn://${Buffer.concat([header, deflateSync(json, {level: 8})])
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')}`
}

function decodeKey(link: string): {length: number; json: Record<string, unknown>} {
  const packed = Buffer.from(link.slice('vpn://'.length), 'base64url')
  const raw = inflateSync(packed.subarray(4))
  return {length: packed.readUInt32BE(0), json: JSON.parse(raw.toString('utf8'))}
}

const PAYLOAD = {
  containers: [{container: 'amnezia-awg3', awg: {last_config: '{"H1": "1-2"}', port: '55426'}}],
  defaultContainer: 'amnezia-awg3',
  description: 'arbat AWG3',
  dns1: '172.29.172.254',
  hostName: 'hole.v3new.dev',
}

describe('clientLabel', () => {
  test('uses the description and the panel-style protocol tag', () => {
    expect(clientLabel('v3new:mac:wg3 (Рабочий Mac)', 'awg3')).toBe('Рабочий Mac · AWG3')
    expect(clientLabel('rvdubinskiy:router:wg (RickRouter)', 'wireguard')).toBe('RickRouter · WG')
    expect(clientLabel('v3new:appletv:xray (Проектор)', 'xray')).toBe('Проектор · Xray')
  })

  test('falls back to the raw name, and to the tag alone', () => {
    expect(clientLabel('legacy-peer', 'awg2')).toBe('legacy-peer · AWG2')
    expect(clientLabel('', 'awg3')).toBe('AWG3')
    expect(clientLabel('x:y:z (desc)', 'telemt')).toBe('desc · TELEMT')
  })
})

describe('relabelVpnLink', () => {
  test('replaces only the description and keeps a valid qCompress header', () => {
    const out = relabelVpnLink(panelKey(PAYLOAD), 'Рабочий Mac · AWG3')
    const {length, json} = decodeKey(out)
    expect(json).toEqual({...PAYLOAD, description: 'Рабочий Mac · AWG3'})
    expect(length).toBe(Buffer.byteLength(JSON.stringify(json, null, 4), 'utf8'))
    expect(out).not.toContain('=')
  })

  test('keeps key order and values of a key made by the panel itself', () => {
    // Generated with the panel's own recipe in Python: json.dumps(indent=4)
    // (non-ASCII escaped as \uXXXX), zlib.compress(level 8), no padding.
    const pythonKey =
      'vpn://AAAB-njadY8xT8MwEIX3_orIcxthO04bNtShnRADEgNBlWlcYim1I_vSCqL8d3xGNESlN5yf7n3vrOtnSSiytwakNsp5cp-8xhlWf1GRkuePYE-H0Wikh13YcdAIkL4kW1oGVRK6ojnnRcGLRZDLXIhVJkoyD5b2z7V21ZN08LmOWYyA69RA5td_tNYBLhciY_l_ADhpPFK71lmwyHZVSybgMM2NdyMtj0Z9abkIZ_IxNkT19hMklTrIroH1zdyF83unW9DWRMS9S0geXjYjYDxFhy5Zyoo0PiL747Lbbm09PMqjQqK2jUpP3KhzWqnTL2EsRLfs7jLGsHOBPaOxMzIbvgFlE3vs'
    const before = decodeKey(pythonKey)
    const after = decodeKey(relabelVpnLink(pythonKey, 'Рабочий Mac · AWG3'))
    expect(before.json.note).toBe('Тест')
    expect(Object.keys(after.json)).toEqual(Object.keys(before.json))
    expect(after.json).toEqual({...before.json, description: 'Рабочий Mac · AWG3'})
    expect(after.length).toBe(Buffer.byteLength(JSON.stringify(after.json, null, 4), 'utf8'))
  })

  test('leaves undecodable or foreign input untouched', () => {
    expect(relabelVpnLink('vpn://not-base64-zlib', 'X')).toBe('vpn://not-base64-zlib')
    expect(relabelVpnLink('vpn://', 'X')).toBe('vpn://')
    expect(relabelVpnLink(panelKey({hostName: 'h'}), 'X')).toBe(panelKey({hostName: 'h'}))
    expect(relabelVpnLink('', 'X')).toBe('')
  })

  test('renames a bare vless link through its fragment', () => {
    expect(relabelVpnLink('vless://id@hole.v3new.dev:442?security=reality#arbat%20Xray', 'Проектор · Xray')).toBe(
      `vless://id@hole.v3new.dev:442?security=reality#${encodeURIComponent('Проектор · Xray')}`,
    )
  })
})

describe('relabelVlessLink', () => {
  test('adds a fragment when there is none and ignores other configs', () => {
    expect(relabelVlessLink('vless://id@h:442?x=1', 'A B')).toBe('vless://id@h:442?x=1#A%20B')
    expect(relabelVlessLink('  vless://id@h:442#old\n', 'A')).toBe('vless://id@h:442#A')
    // A lone surrogate cannot be URI-encoded; the panel's name is kept instead of failing.
    expect(relabelVlessLink('vless://id@h:442#old', '\uD800')).toBe('vless://id@h:442#old')
    expect(relabelVlessLink('[Interface]\nAddress = 10.8.1.2/32', 'A')).toBe('[Interface]\nAddress = 10.8.1.2/32')
  })
})

describe('relabelConfig', () => {
  test('relabels the link and a vless config, keeps a WireGuard config', () => {
    const wg = {config: '[Interface]\nPrivateKey = k', vpn_link: panelKey(PAYLOAD), extra: 1}
    const out = relabelConfig(wg, 'L')
    expect(out.config).toBe(wg.config)
    expect(out.extra).toBe(1)
    expect(decodeKey(out.vpn_link).json.description).toBe('L')

    const xray = relabelConfig({config: 'vless://id@h:442#old', vpn_link: 'vless://id@h:442#old'}, 'L')
    expect(xray).toEqual({config: 'vless://id@h:442#L', vpn_link: 'vless://id@h:442#L'})
  })
})
