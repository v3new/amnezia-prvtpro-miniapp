import type {ConnectionConfig} from '../api/types.ts'

const XRAY_LINK_PREFIXES = ['vless://', 'vmess://', 'trojan://', 'ss://', 'socks://', 'hy2://']

export function getImportLink(protocol: string, config: ConnectionConfig): string {
  const nativeConfig = config.config.trim()
  if (protocol === 'xray' && XRAY_LINK_PREFIXES.some((prefix) => nativeConfig.startsWith(prefix))) {
    return nativeConfig
  }
  if (protocol === 'xray' && nativeConfig) return nativeConfig
  return config.vpn_link || nativeConfig
}
