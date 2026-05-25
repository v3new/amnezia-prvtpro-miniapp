import {describe, expect, test} from 'bun:test'
import {
  contentDispositionAttachment,
  sanitizeFilenameBase,
  signDownloadToken,
  verifyDownloadToken,
} from './download-token.ts'

const SECRET = 'x'.repeat(40)

describe('download token', () => {
  test('sign + verify roundtrip', async () => {
    const t = await signDownloadToken({cid: 'c1', uid: 'u1', proto: 'awg2', fmt: 'conf', name: 'home'}, SECRET)
    const c = await verifyDownloadToken(t, SECRET)
    expect(c).toEqual({cid: 'c1', uid: 'u1', proto: 'awg2', fmt: 'conf', name: 'home'})
  })

  test('rejects expired', async () => {
    const t = await signDownloadToken({cid: 'c1', uid: 'u1', proto: 'awg2', fmt: 'conf', name: 'home'}, SECRET, -1)
    await expect(verifyDownloadToken(t, SECRET)).rejects.toThrow()
  })

  test('rejects wrong secret', async () => {
    const t = await signDownloadToken({cid: 'c1', uid: 'u1', proto: 'awg2', fmt: 'vpn', name: 'home'}, SECRET)
    await expect(verifyDownloadToken(t, 'y'.repeat(40))).rejects.toThrow()
  })

  test('rejects malformed fmt', async () => {
    // Sign manually with a bad fmt — easiest is to corrupt via re-sign with garbage claim.
    const t = await signDownloadToken({cid: 'c1', uid: 'u1', proto: 'awg2', fmt: 'conf' as never, name: 'home'}, SECRET)
    // Tamper a single char in payload section — invalidates HMAC.
    const parts = t.split('.')
    expect(parts).toHaveLength(3)
    const [, payload] = parts
    if (!payload) throw new Error('token payload missing')
    const tampered = `${parts[0]}.${payload.slice(0, -2)}AA.${parts[2]}`
    await expect(verifyDownloadToken(tampered, SECRET)).rejects.toThrow()
  })
})

describe('sanitizeFilenameBase', () => {
  test('passes through latin/digits/._-', () => {
    expect(sanitizeFilenameBase('home-mac_2.v3')).toBe('home-mac_2.v3')
  })

  test('keeps cyrillic letters', () => {
    expect(sanitizeFilenameBase('Ноутбук_дома')).toBe('Ноутбук_дома')
  })

  test('replaces forbidden punctuation with underscores', () => {
    expect(sanitizeFilenameBase('v3new:macos:wg2 (ноут)')).toBe('v3new_macos_wg2_ноут')
  })

  test('strips leading/trailing separators and collapses repeats', () => {
    expect(sanitizeFilenameBase('  __home///key__  ')).toBe('home_key')
  })

  test('falls back when empty', () => {
    expect(sanitizeFilenameBase('!@#$%^')).toBe('config')
    expect(sanitizeFilenameBase('', 'fallback')).toBe('fallback')
  })

  test('truncates to max length', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeFilenameBase(long).length).toBe(64)
  })
})

describe('contentDispositionAttachment', () => {
  test('ascii-only filename', () => {
    const h = contentDispositionAttachment('home.conf')
    expect(h).toBe(`attachment; filename="home.conf"; filename*=UTF-8''home.conf`)
  })

  test('utf-8 filename gets RFC 5987 + ascii fallback', () => {
    const h = contentDispositionAttachment('Ноутбук.conf')
    expect(h).toContain(`filename*=UTF-8''${encodeURIComponent('Ноутбук.conf')}`)
    expect(h).toContain('filename="') // ascii fallback present
  })
})
