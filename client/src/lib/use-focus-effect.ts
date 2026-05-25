import {useEffect, useRef} from 'react'

/**
 * Runs `callback` once on mount and again whenever the tab regains visibility
 * or window focus. Designed so the callback can call setState freely without
 * causing a re-fetch loop: we keep a ref to the latest callback and only
 * subscribe focus listeners ONCE on mount.
 *
 * `deps` is intentionally not threaded into the effect — pass it for future
 * extension or omit. Earlier versions of this hook re-subscribed on every deps
 * change, which combined with `[ctx]` (a value rebuilt on each render) caused
 * an unbounded fetch loop.
 */
export function useFocusEffect(callback: () => void | Promise<void>): void {
  const ref = useRef(callback)
  ref.current = callback

  useEffect(() => {
    void ref.current()
    const fire = () => {
      void ref.current()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') fire()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', fire)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', fire)
    }
  }, [])
}
