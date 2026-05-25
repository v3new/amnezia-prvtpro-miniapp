import {Link} from 'react-router-dom'
import type {Connection, Options} from '../api/types.ts'
import {DeviceIcon} from './device-icon.tsx'
import {OnlineBadge} from './online-badge.tsx'
import {TrafficLine} from './traffic-line.tsx'

interface Props {
  connection: Connection
  options: Options
}

export function ConnectionCard({connection, options}: Props) {
  const device = options.devices.find((d) => d.slug === connection.device)
  const title = connection.description || connection.name

  return (
    <Link
      to={`/c/${encodeURIComponent(connection.id)}`}
      className="flex items-start gap-3 rounded-2xl bg-tg-secondaryBg p-4 transition active:scale-[0.98]"
    >
      <DeviceIcon slug={connection.device} fallback={device?.icon ?? '❓'} className="h-12 w-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate font-medium">{title}</div>
          <OnlineBadge online={connection.online} lastHandshakeAt={connection.last_handshake_at} />
        </div>
        <div className="mt-0.5 text-xs text-tg-hint">{connection.protocol_label}</div>
        <TrafficLine bytesReceived={connection.bytes_received} bytesSent={connection.bytes_sent} className="mt-1" />
      </div>
    </Link>
  )
}
