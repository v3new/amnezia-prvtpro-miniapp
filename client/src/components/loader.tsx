import {InlineLoader} from './inline-loader.tsx'

interface BusyOverlayProps {
  visible: boolean
  message?: string
}

export function BusyOverlay({visible, message}: BusyOverlayProps) {
  if (!visible) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md"
      aria-live="polite"
    >
      <div className="flex min-w-[220px] flex-col items-center gap-4 rounded-2xl bg-tg-bg px-6 py-5 shadow-2xl ring-1 ring-black/10 dark:ring-white/10">
        <InlineLoader size={56} />
        {message && <div className="text-center text-sm font-medium text-tg-text">{message}</div>}
      </div>
    </div>
  )
}
