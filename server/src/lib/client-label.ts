import {deflateSync, inflateSync} from 'node:zlib'
import {z} from 'zod'
import {PROTO_TAG, parseDescription} from './naming.ts'

// The name AmneziaVPN shows for an imported connection is baked into the
// config itself: the `description` of the qCompress'd JSON inside a `vpn://`
// key, or the `#fragment` of a bare `vless://` link. The panel fills it with
// `<server> <protocol>` ("arbat AWG3") because it never sees the client's
// name, so every device a user imports ends up with the same label. We
// rewrite it here, where the connection name is known.

const VPN_SCHEME = 'vpn://'
const VLESS_SCHEME = 'vless://'
// qCompress prefix: the uncompressed length as a big-endian uint32.
const QCOMPRESS_HEADER_BYTES = 4
// The level the panel uses for the same payload.
const PANEL_DEFLATE_LEVEL = 8

// z.record keeps the input's key order, so `description` stays where the panel
// put it and is the only thing that changes.
const AmneziaKeySchema = z
  .record(z.string(), z.unknown())
  .refine((key) => typeof key.description === 'string', 'description must be a string')

export interface LabelledConfig {
  config: string
  vpn_link: string
}

/** "v3new:mac:wg3 (Рабочий Mac)" + awg3 -> "Рабочий Mac · AWG3". */
export function clientLabel(name: string, protocol: string): string {
  const description = (parseDescription(name) ?? name).trim()
  const tag = PROTO_TAG[protocol] ?? protocol.toUpperCase()
  return description ? `${description} · ${tag}` : tag
}

/** Replace the name in a `vless://` link; anything else is returned as is. */
export function relabelVlessLink(text: string, label: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith(VLESS_SCHEME)) return text
  const [link = trimmed] = trimmed.split('#', 1)
  try {
    return `${link}#${encodeURIComponent(label)}`
  } catch {
    // encodeURIComponent throws on a lone surrogate; keep the panel's name.
    return text
  }
}

/**
 * Replace the description inside an Amnezia `vpn://` key (or a bare vless
 * link). A key that does not decode is returned untouched: a config with the
 * panel's generic name still works, a corrupted one does not.
 */
export function relabelVpnLink(link: string, label: string): string {
  if (!link.startsWith(VPN_SCHEME)) return relabelVlessLink(link, label)
  try {
    const packed = Buffer.from(link.slice(VPN_SCHEME.length), 'base64url')
    if (packed.length <= QCOMPRESS_HEADER_BYTES) return link
    const parsed = AmneziaKeySchema.safeParse(
      JSON.parse(inflateSync(packed.subarray(QCOMPRESS_HEADER_BYTES)).toString('utf8')),
    )
    if (!parsed.success) return link
    const key = {...parsed.data, description: label}
    const json = Buffer.from(JSON.stringify(key, null, 4), 'utf8')
    const header = Buffer.alloc(QCOMPRESS_HEADER_BYTES)
    header.writeUInt32BE(json.length)
    const body = deflateSync(json, {level: PANEL_DEFLATE_LEVEL})
    return VPN_SCHEME + Buffer.concat([header, body]).toString('base64url')
  } catch {
    return link
  }
}

/** Give a panel config the connection's own label in every form we hand out. */
export function relabelConfig<T extends LabelledConfig>(cfg: T, label: string): T {
  return {...cfg, config: relabelVlessLink(cfg.config, label), vpn_link: relabelVpnLink(cfg.vpn_link, label)}
}
