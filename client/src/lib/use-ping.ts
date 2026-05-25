import {useEffect, useState} from 'react'

const POLL_INTERVAL_MS = 15_000
const TIMEOUT_MS = 5_000

interface Channel {
  cached: number | null
  subscribers: Set<(ms: number | null) => void>
  timer: ReturnType<typeof setInterval> | null
}

// One channel per URL — два разных хоста не топчут друг друга.
const channels = new Map<string, Channel>()

function emit(ch: Channel, next: number | null) {
  ch.cached = next
  for (const sub of ch.subscribers) sub(next)
}

function buildProbeUrl(host: string): string {
  // Cache-buster: иначе браузер может отдать кэш и RTT станет ~0.
  return `https://${host}/?_=${Date.now()}`
}

async function probe(host: string): Promise<number | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const started = performance.now()
  try {
    // mode:'no-cors' — нам не нужно читать тело, только время до ответа.
    // Это сработает и для HTTPS-хоста без CORS-заголовков, и для Reality/nginx fallback.
    await fetch(buildProbeUrl(host), {mode: 'no-cors', cache: 'no-store', signal: ctrl.signal})
    return Math.round(performance.now() - started)
  } catch {
    // Сетевой отказ / таймаут / TLS failure — RTT не определён.
    return null
  } finally {
    clearTimeout(timer)
  }
}

function startPoller(host: string, ch: Channel) {
  if (ch.timer !== null) return
  void probe(host).then((ms) => emit(ch, ms))
  ch.timer = setInterval(() => {
    void probe(host).then((ms) => emit(ch, ms))
  }, POLL_INTERVAL_MS)
}

/** Измеренный RTT в мс до VPN-хоста, или null если не пингуется / host не задан. */
export function usePing(host: string | null): number | null {
  const [ms, setMs] = useState<number | null>(() => (host ? (channels.get(host)?.cached ?? null) : null))

  useEffect(() => {
    if (!host) {
      setMs(null)
      return
    }
    let ch = channels.get(host)
    if (!ch) {
      ch = {cached: null, subscribers: new Set(), timer: null}
      channels.set(host, ch)
    }
    ch.subscribers.add(setMs)
    setMs(ch.cached)
    startPoller(host, ch)
    return () => {
      ch?.subscribers.delete(setMs)
    }
  }, [host])

  return ms
}
