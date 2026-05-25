import {jwtVerify, SignJWT} from 'jose'

export type DownloadFormat = 'conf' | 'vpn'

export interface DownloadClaims {
  /** Connection id (panel client_id). */
  cid: string
  /** Panel user id of the requester. */
  uid: string
  /** Panel protocol slug — pinned at issue time, used to look up the config without re-listing. */
  proto: string
  /** Native file format. */
  fmt: DownloadFormat
  /** Filename without extension (already sanitized). */
  name: string
}

export const DOWNLOAD_TOKEN_TTL_SEC = 600

export async function signDownloadToken(
  claims: DownloadClaims,
  secret: string,
  ttlSec = DOWNLOAD_TOKEN_TTL_SEC,
): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({...claims})
    .setProtectedHeader({alg: 'HS256'})
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(key)
}

export async function verifyDownloadToken(token: string, secret: string): Promise<DownloadClaims> {
  const key = new TextEncoder().encode(secret)
  const {payload} = await jwtVerify(token, key, {algorithms: ['HS256']})
  const cid = String(payload.cid ?? '')
  const uid = String(payload.uid ?? '')
  const proto = String(payload.proto ?? '')
  const fmt = payload.fmt
  const name = String(payload.name ?? '')
  if (!cid || !uid || !proto || !name || (fmt !== 'conf' && fmt !== 'vpn')) {
    throw new Error('invalid download token payload')
  }
  return {cid, uid, proto, fmt, name}
}

const FILENAME_MAX_LEN = 64

// macOS forbids `:`, Windows forbids `<>:"/\|?*`, parentheses and spaces cause
// friction in shells/email clients. Collapse anything outside the allowlist
// (latin/cyrillic letters, digits, ._-) to underscores. UTF-8 stays via
// RFC 5987 Content-Disposition, but we still drop punctuation for sanity.
export function sanitizeFilenameBase(input: string, fallback = 'config'): string {
  const cleaned = input
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, FILENAME_MAX_LEN)
  return cleaned || fallback
}

// RFC 5987 / RFC 6266 — attachment with UTF-8 filename* fallback.
export function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(filename)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
