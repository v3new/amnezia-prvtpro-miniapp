import {useTranslation} from 'react-i18next'
import {relativeAgo} from '../lib/greeting.ts'

interface Props {
  online: boolean
  lastHandshakeAt: string | null
  size?: 'sm' | 'xs'
}

export function OnlineBadge({online, lastHandshakeAt, size = 'xs'}: Props) {
  const {t} = useTranslation()
  const ago = relativeAgo(lastHandshakeAt)
  if (online) {
    return (
      <span
        className={`shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 ${size === 'xs' ? 'text-xs' : 'text-sm'}`}
      >
        {t('common.online')}
      </span>
    )
  }
  if (!ago) return null
  return (
    <span className={`shrink-0 text-tg-hint ${size === 'xs' ? 'text-xs' : 'text-sm'}`}>{t(ago.key, {n: ago.n})}</span>
  )
}
