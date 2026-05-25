import raw from './instructions.json'

export type FlowId = 'qr' | 'deeplink' | 'link_paste' | 'config_file' | 'router_manual'

export interface InstructionApp {
  name: string
  store_url: string
  store_label?: string
  /**
   * Native config format expected by this app. Drives the "download" button:
   *   • "conf" — plain WireGuard ini (AmneziaWG, wg-quick, WG Tunnel).
   *   • "vpn"  — AmneziaVPN-native, content = `vpn://...` URL.
   *   • omitted — no file format (VLESS clients import via URI/clipboard).
   *               Download button is hidden; only copy actions remain.
   */
  format?: 'conf' | 'vpn'
}

export interface InstructionFlow {
  id: FlowId
  title: string
  summary?: string
  steps: string[]
}

export interface InstructionSupportedEntry {
  supported: true
  verified: boolean
  primary_app: InstructionApp
  alternative_apps?: InstructionApp[]
  default_flow: FlowId
  flows: InstructionFlow[]
}

export interface InstructionUnsupportedEntry {
  supported: false
  fallback_protocol?: string
  fallback_reason?: string
}

export type InstructionEntry = InstructionSupportedEntry | InstructionUnsupportedEntry

type RawTable = {
  $schema_version?: number
  _notes?: string
  [protocol: string]: unknown
}

const table = raw as RawTable

export function lookupInstructions(protocol: string, device: string): InstructionEntry | null {
  const protoBucket = table[protocol]
  if (!protoBucket || typeof protoBucket !== 'object') return null
  const entry = (protoBucket as Record<string, InstructionEntry | undefined>)[device]
  return entry ?? null
}

export function defaultFlowFor(entry: InstructionSupportedEntry, device: string): FlowId {
  const isMobile = device === 'iphone' || device === 'ipad' || device === 'android' || device === 'android_tablet'
  // Phones / tablets prefer the QR flow when available — deeplinks are flaky
  // (AmneziaWG on iOS, for one, doesn't honour them).
  if (isMobile) {
    const qr = entry.flows.find((f) => f.id === 'qr')
    if (qr) return 'qr'
  }
  return entry.default_flow
}
