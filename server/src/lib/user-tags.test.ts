import {describe, expect, test} from 'bun:test'
import {lexTags, resolveConnectionLimit, SLOTS_MAX, type TaggedUser} from './user-tags.ts'

const DEFAULT = 6

function user(description: string | null | undefined): TaggedUser {
  return {username: 'tester', description}
}

function limit(description: string | null | undefined): number {
  return resolveConnectionLimit(user(description), DEFAULT)
}

describe('lexTags', () => {
  test('pulls a tag out of surrounding prose', () => {
    expect(lexTags('Вася, друг с работы. Платит вперёд. #slots=12')).toEqual([{key: 'slots', value: '12'}])
  })

  test('prose without tags yields nothing', () => {
    expect(lexTags('Просто описание пользователя')).toEqual([])
  })

  test('empty and missing descriptions are not an error', () => {
    expect(lexTags('')).toEqual([])
    expect(lexTags(null)).toEqual([])
    expect(lexTags(undefined)).toEqual([])
  })

  test('keeps unknown keys so a tag can be written before the release that reads it', () => {
    expect(lexTags('#plan=pro #slots=9')).toEqual([
      {key: 'plan', value: 'pro'},
      {key: 'slots', value: '9'},
    ])
  })

  test('keys are case-insensitive', () => {
    expect(lexTags('#SLOTS=12')).toEqual([{key: 'slots', value: '12'}])
  })

  test('a namespaced key parses, reserving the escape hatch', () => {
    expect(lexTags('#mp:slots=15')).toEqual([{key: 'mp:slots', value: '15'}])
  })

  test('sentence punctuation is not part of the value', () => {
    expect(lexTags('Лимит поднят #slots=12.')).toEqual([{key: 'slots', value: '12'}])
    expect(lexTags('Заметка, #slots=10, платит вперёд')).toEqual([{key: 'slots', value: '10'}])
  })

  test('prose with an equals sign is not a tag', () => {
    expect(lexTags('цена=500 рублей, slots=12')).toEqual([])
  })

  test('list-shaped values survive for future keys', () => {
    expect(lexTags('#proto=xray,awg3')).toEqual([{key: 'proto', value: 'xray,awg3'}])
  })
})

describe('resolveConnectionLimit', () => {
  test('no tag falls back to the global default', () => {
    expect(limit('Вася, друг с работы')).toBe(DEFAULT)
    expect(limit(null)).toBe(DEFAULT)
  })

  test('a tagged user gets their override', () => {
    expect(limit('Вася. #slots=12')).toBe(12)
  })

  test('other keys do not disturb the limit', () => {
    expect(limit('#plan=pro #beta=1')).toBe(DEFAULT)
  })

  test('the last occurrence wins, matching how people append to a text field', () => {
    expect(limit('старое #slots=8 новое #slots=12')).toBe(12)
  })

  test('a typo never lands below the default', () => {
    // Losing access you already had is the worse failure, so garbage, decimals
    // and negatives all degrade to the default rather than to zero.
    expect(limit('#slots=много')).toBe(DEFAULT)
    expect(limit('#slots=abc')).toBe(DEFAULT)
    expect(limit('#slots=6.5')).toBe(DEFAULT)
    expect(limit('#slots=-5')).toBe(DEFAULT)
    expect(limit('Вася#slots=12тест')).toBe(DEFAULT)
  })

  test('an oversized grant is clamped, not rejected', () => {
    expect(limit('#slots=999')).toBe(SLOTS_MAX)
    expect(limit(`#slots=${SLOTS_MAX + 1}`)).toBe(SLOTS_MAX)
    expect(limit(`#slots=${SLOTS_MAX}`)).toBe(SLOTS_MAX)
  })

  test('zero freezes new connections without disabling the user', () => {
    expect(limit('#slots=0')).toBe(0)
  })

  test('a bad value does not undo a good one written earlier', () => {
    expect(limit('#slots=12 позже дописали #slots=abc')).toBe(12)
  })
})
