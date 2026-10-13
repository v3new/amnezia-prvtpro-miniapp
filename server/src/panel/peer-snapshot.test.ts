import {describe, expect, test} from 'bun:test'
import type {PanelPeer} from './client.ts'
import {type PeerSet, PeerSnapshot} from './peer-snapshot.ts'

function peer(name: string, protocol = 'awg3'): PanelPeer {
  return {
    client_id: name,
    protocol,
    name,
    download: 0,
    upload: 0,
    created_at: null,
    enabled: true,
    last_handshake_at: null,
  }
}

/** A fetchAll whose calls stay pending until the test resolves them. */
function controlledFetch() {
  const pending: Array<(set: PeerSet) => void> = []
  const fetchAll = () => new Promise<PeerSet>((resolve) => pending.push(resolve))
  return {fetchAll, pending}
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const up = (peers: PanelPeer[]): PeerSet => ({peers, states: {awg3: 'up'}})

describe('PeerSnapshot', () => {
  test('first read fetches once; later reads within max age are served from memory', async () => {
    let calls = 0
    const snap = new PeerSnapshot(async () => {
      calls += 1
      return up([peer('a')])
    }, 600_000)
    expect((await snap.get()).peers).toHaveLength(1)
    await snap.get()
    expect(calls).toBe(1)
  })

  test('concurrent refreshes share one panel listing', async () => {
    const f = controlledFetch()
    const snap = new PeerSnapshot(f.fetchAll, 600_000)
    const reads = [snap.get(), snap.get(), snap.refresh()]
    await tick()
    expect(f.pending).toHaveLength(1)
    f.pending[0]?.(up([peer('a')]))
    for (const r of await Promise.all(reads)) expect(r.peers).toHaveLength(1)
  })

  test('a forced refresh waits for the running one: one stream, never two listings at once', async () => {
    let clock = 1_000
    const f = controlledFetch()
    const snap = new PeerSnapshot(f.fetchAll, 600_000, () => clock)
    const stale = snap.refresh()
    await tick()
    clock = 2_000
    snap.markStale()
    const fresh = snap.get()
    await tick()
    expect(f.pending).toHaveLength(1)

    f.pending[0]?.(up([]))
    await stale
    await tick()
    expect(f.pending).toHaveLength(2)
    f.pending[1]?.(up([peer('new')]))
    expect((await fresh).peers.map((p) => p.name)).toEqual(['new'])
    expect((await snap.get()).peers.map((p) => p.name)).toEqual(['new'])
  })

  test('data older than max age is refreshed before it is served', async () => {
    let clock = 0
    let calls = 0
    const snap = new PeerSnapshot(
      async () => {
        calls += 1
        return up([peer(`v${calls}`)])
      },
      600_000,
      () => clock,
    )
    await snap.get()
    clock = 600_001
    expect((await snap.get()).peers[0]?.name).toBe('v2')
  })

  test('a protocol that fails keeps its last known peers', async () => {
    let round = 0
    const snap = new PeerSnapshot(async () => {
      round += 1
      return round === 1
        ? {peers: [peer('a', 'awg3'), peer('x', 'xray')], states: {awg3: 'up', xray: 'up'}}
        : {peers: [peer('b', 'awg3')], states: {awg3: 'up', xray: 'down'}}
    }, 600_000)
    await snap.refresh()
    const second = await snap.refresh(Number.MAX_SAFE_INTEGER)
    expect(second.peers.map((p) => p.name).sort()).toEqual(['b', 'x'])
    expect(second.states.xray).toBe('down')
  })

  test('a failed refresh keeps the previous data', async () => {
    let fail = false
    const snap = new PeerSnapshot(async () => {
      if (fail) throw new Error('panel down')
      return up([peer('a')])
    }, 600_000)
    await snap.refresh()
    fail = true
    await expect(snap.refresh(Number.MAX_SAFE_INTEGER)).rejects.toThrow('panel down')
    expect(snap.current()?.peers).toHaveLength(1)
    expect(snap.isRefreshing()).toBe(false)
  })

  test('a burst of changes joins the queued refresh instead of adding one each', async () => {
    let clock = 1_000
    const f = controlledFetch()
    const snap = new PeerSnapshot(f.fetchAll, 600_000, () => clock)
    const first = snap.refresh()
    await tick()
    for (let i = 0; i < 3; i++) {
      clock += 100
      snap.invalidate()
    }
    const read = snap.get()
    f.pending[0]?.(up([]))
    await first
    await tick()
    expect(f.pending).toHaveLength(2)
    f.pending[1]?.(up([peer('after')]))
    expect((await read).peers.map((p) => p.name)).toEqual(['after'])
    await tick()
    expect(f.pending).toHaveLength(2)
  })

  test('reports protocols whose last listing failed', async () => {
    const snap = new PeerSnapshot(async () => ({peers: [], states: {awg3: 'up', xray: 'down'}}), 600_000)
    await snap.refresh()
    expect(snap.downProtocols()).toEqual(['xray'])
  })
})
