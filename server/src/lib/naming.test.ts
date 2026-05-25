import {describe, expect, test} from 'bun:test'
import {
  buildConnectionName,
  normalizeDescription,
  parseDescription,
  parseDeviceFromName,
  validateDescription,
} from './naming.ts'

describe('naming', () => {
  test('buildConnectionName uses proto short', () => {
    expect(buildConnectionName('v3new', 'iphone', 'awg2', 'личный')).toBe('v3new:iphone:wg2 (личный)')
    expect(buildConnectionName('v3new', 'router', 'wireguard', 'дача')).toBe('v3new:router:wg (дача)')
  })

  test('parseDescription extracts description', () => {
    expect(parseDescription('v3new:iphone:wg2 (личный)')).toBe('личный')
    expect(parseDescription('v3new:appletv:wg2 (телевизор у мамы)')).toBe('телевизор у мамы')
    expect(parseDescription('not-a-name')).toBeNull()
  })

  test('parseDeviceFromName', () => {
    expect(parseDeviceFromName('v3new:iphone:wg2 (личный)')).toBe('iphone')
    expect(parseDeviceFromName('garbage')).toBeNull()
  })

  test('normalizeDescription lowercases and trims', () => {
    expect(normalizeDescription('  Личный ')).toBe('личный')
  })

  test('validateDescription accepts Cyrillic with allowed punctuation', () => {
    expect(validateDescription('личный').ok).toBe(true)
    expect(validateDescription('ТВ у мамы').ok).toBe(true)
    expect(validateDescription('work-laptop').ok).toBe(true)
    expect(validateDescription('Apple TV (гостиная)').ok).toBe(true)
  })

  test('validateDescription rejects bad input', () => {
    expect(validateDescription('a').ok).toBe(false)
    expect(validateDescription('x'.repeat(31)).ok).toBe(false)
    expect(validateDescription('colon:bad').ok).toBe(false)
    expect(validateDescription('line\nbreak').ok).toBe(false)
    expect(validateDescription('symb@l').ok).toBe(false)
    expect(validateDescription(42 as unknown as string).ok).toBe(false)
  })
})
