import {useEffect, useRef, useState} from 'react'

const TOAST_DURATION_MS = 1800

let publish: ((msg: string) => void) | null = null

export function toast(msg: string): void {
  publish?.(msg)
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    publish = (m) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      setMsg(m)
      timerRef.current = setTimeout(() => {
        setMsg((cur) => (cur === m ? null : cur))
        timerRef.current = null
      }, TOAST_DURATION_MS)
    }
    return () => {
      publish = null
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="rounded-xl bg-black/85 px-4 py-2 text-sm text-white shadow-lg backdrop-blur dark:bg-white/90 dark:text-black">
        {msg}
      </div>
    </div>
  )
}
