import {formatBytes} from '../lib/greeting.ts'

interface Props {
  bytesReceived: number
  bytesSent: number
  className?: string
}

export function TrafficLine({bytesReceived, bytesSent, className = ''}: Props) {
  return (
    <div className={`flex gap-3 text-sm ${className}`}>
      <span className="text-emerald-500">↓ {formatBytes(bytesReceived)}</span>
      <span className="text-sky-500">↑ {formatBytes(bytesSent)}</span>
    </div>
  )
}
