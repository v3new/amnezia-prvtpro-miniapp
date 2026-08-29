import {describe, expect, test} from 'bun:test'
import {defaultFlowFor, type InstructionEntry, type InstructionSupportedEntry, lookupInstructions} from './index.ts'
import raw from './instructions.json'

// В JSON рядом с бакетами протоколов лежат скалярные $schema_version/_notes,
// поэтому прямой каст к таблице протоколов не проходит — отфильтровываем их.
const table = raw as unknown as Record<string, Record<string, InstructionEntry>>
const PROTOCOLS = Object.keys(table).filter((k) => !k.startsWith('$') && !k.startsWith('_'))

const FLOW_IDS = new Set([
  'qr',
  'link_qr',
  'deeplink',
  'link_paste',
  'config_file',
  'config_clipboard',
  'router_manual',
])

describe('instructions table', () => {
  test('awg3 — протокол по умолчанию — покрывает те же устройства, что и остальные', () => {
    const devices = Object.keys(table.awg3 ?? {})
    expect(devices.length).toBeGreaterThan(0)
    for (const proto of PROTOCOLS) {
      expect(new Set(Object.keys(table[proto] ?? {}))).toEqual(new Set(devices))
    }
  })

  test('каждая запись либо ведёт на рабочий флоу, либо честно отсылает к другому протоколу', () => {
    for (const proto of PROTOCOLS) {
      for (const device of Object.keys(table[proto] ?? {})) {
        const entry = lookupInstructions(proto, device)
        expect(entry).not.toBeNull()
        if (!entry) continue

        if (!entry.supported) {
          // Запасной протокол должен существовать и сам поддерживать это устройство,
          // иначе пользователя отправят по кругу.
          expect(entry.fallback_protocol).toBeString()
          const fallback = lookupInstructions(entry.fallback_protocol as string, device)
          expect(fallback?.supported).toBe(true)
          expect(entry.fallback_protocol).not.toBe(proto)
          continue
        }

        expect(entry.flows.length).toBeGreaterThan(0)
        const ids = entry.flows.map((f) => f.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const flow of entry.flows) {
          expect(FLOW_IDS.has(flow.id)).toBe(true)
          expect(flow.steps.length).toBeGreaterThan(0)
        }
        // default_flow и то, что реально откроется, обязаны быть среди flows.
        expect(ids).toContain(entry.default_flow)
        expect(ids).toContain(defaultFlowFor(entry as InstructionSupportedEntry, device))
        expect(entry.primary_app.store_url).toStartWith('https://')
      }
    }
  })

  test('AWG 3.1 наследует verified у 2.0 — флоу и приложения там те же самые', () => {
    for (const device of Object.keys(table.awg3 ?? {})) {
      const a3 = lookupInstructions('awg3', device)
      const a2 = lookupInstructions('awg2', device)
      if (!a3?.supported || !a2?.supported) continue
      expect(a3.verified).toBe(a2.verified)
    }
  })

  test('там, где клиента 3.1 нет, запасной вариант тоже можно завести', () => {
    // Отсылать на протокол, который сам выведен из обращения, бессмысленно —
    // пользователь упрётся в отказ создания.
    const creatable = new Set(['awg3', 'xray', 'wireguard'])
    for (const device of Object.keys(table.awg3 ?? {})) {
      const entry = lookupInstructions('awg3', device)
      if (entry?.supported !== false) continue
      expect(creatable.has(entry.fallback_protocol as string)).toBe(true)
    }
  })

  test('AWG 3.1 не отсылает к клиентам, застрявшим на 2.0', () => {
    // WG Connect / WG Tunnel не разбирают новые ключи [Interface] из 3.1 —
    // такие связки должны быть помечены unsupported, а не вести к сломанной инструкции.
    const stuckOn2 = ['WG Connect', 'WG Tunnel']
    for (const device of Object.keys(table.awg3 ?? {})) {
      const entry = lookupInstructions('awg3', device)
      if (!entry?.supported) continue
      const apps = [entry.primary_app.name, ...(entry.alternative_apps ?? []).map((a) => a.name)]
      for (const app of apps) {
        expect(stuckOn2).not.toContain(app)
      }
    }
  })
})
