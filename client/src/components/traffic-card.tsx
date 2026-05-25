import {Trans, useTranslation} from 'react-i18next'
import type {Profile} from '../api/types.ts'
import {formatBytes, formatDate} from '../lib/greeting.ts'

interface Props {
  traffic: Profile['traffic']
}

export function TrafficCard({traffic}: Props) {
  const {t, i18n} = useTranslation()
  const {used_bytes, limit_bytes, percent_used, reset_strategy, next_reset_at} = traffic
  const color = percent_used < 80 ? 'bg-emerald-500' : percent_used < 95 ? 'bg-amber-500' : 'bg-rose-500'

  const resetLine =
    reset_strategy === 'never'
      ? t('home.noReset')
      : next_reset_at
        ? t('home.resetOn', {
            date: formatDate(next_reset_at, i18n.language),
            days: Math.max(0, Math.ceil((new Date(next_reset_at).getTime() - Date.now()) / 86_400_000)),
          })
        : ''

  return (
    <div className="rounded-2xl bg-tg-secondaryBg p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-tg-hint">{t('home.traffic')}</span>
        <span className="text-sm font-medium">{percent_used}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className={`h-full ${color}`} style={{width: `${Math.min(100, percent_used)}%`}} />
      </div>
      <div className="mt-3 text-sm">
        {limit_bytes > 0 ? (
          <Trans
            i18nKey="home.usedOfLimit"
            values={{used: formatBytes(used_bytes), limit: formatBytes(limit_bytes)}}
            components={{b: <b />}}
          />
        ) : (
          <Trans i18nKey="home.usedNoLimit" values={{used: formatBytes(used_bytes)}} components={{b: <b />}} />
        )}
      </div>
      {resetLine && <div className="mt-1 text-xs text-tg-hint">{resetLine}</div>}
    </div>
  )
}
