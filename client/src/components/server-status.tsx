import {useTranslation} from 'react-i18next'
import type {ServerStatus} from '../api/types.ts'

interface Props {
  status: ServerStatus | null
  /** Измеренный клиентом RTT до VPN-хоста. Если задан — приоритетнее status.ping_ms. */
  clientPingMs?: number | null
}

export function ServerStatusBadge({status, clientPingMs}: Props) {
  const {t} = useTranslation()
  const online = !!status?.online
  const ping = clientPingMs ?? status?.ping_ms ?? null
  const label = !online
    ? t('home.serverWaiting')
    : ping != null
      ? t('home.serverOnline', {ping})
      : t('home.serverOnlineNoPing')

  return (
    <div
      className={`flex items-center gap-2 rounded-xl p-3 text-sm transition-colors duration-300 ${
        online ? 'bg-emerald-500/10 text-emerald-600' : 'bg-tg-secondaryBg text-tg-hint'
      }`}
      aria-live="polite"
    >
      <span
        className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${
          online ? 'bg-emerald-500' : 'animate-pulse bg-tg-hint/40'
        }`}
      />
      <span>{label}</span>
    </div>
  )
}
