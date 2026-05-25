import {useEffect, useState} from 'react'
import {getServerStatus} from '../api/client.ts'
import type {ServerStatus} from '../api/types.ts'

const POLL_INTERVAL_MS = 10_000

// Module-level cache: persists across HomePage remounts (e.g. back navigation).
let cachedStatus: ServerStatus | null = null
const subscribers = new Set<(s: ServerStatus | null) => void>()
let pollerTimer: ReturnType<typeof setInterval> | null = null

function emit(next: ServerStatus | null) {
  cachedStatus = next
  for (const sub of subscribers) sub(next)
}

async function tick() {
  try {
    const srv = await getServerStatus()
    // Amnezia-Panel-Web периодически ложно сообщает online=false. Не перезаписываем
    // последнее «нормальное» состояние, пока не получим следующий online=true.
    if (srv.online) emit(srv)
  } catch {
    // Network/API failure — don't clobber the last known value either.
  }
}

function startPoller() {
  if (pollerTimer !== null) return
  void tick()
  pollerTimer = setInterval(() => void tick(), POLL_INTERVAL_MS)
}

export function useServerStatus(): ServerStatus | null {
  const [status, setStatus] = useState<ServerStatus | null>(cachedStatus)

  useEffect(() => {
    subscribers.add(setStatus)
    startPoller()
    return () => {
      subscribers.delete(setStatus)
    }
  }, [])

  return status
}
