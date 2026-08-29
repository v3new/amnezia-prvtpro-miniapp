import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import type {Options, Profile} from '../api/types.ts'
import {accessSeverity} from '../lib/access-view.ts'
import {formatBytes, formatDate} from '../lib/greeting.ts'
import {tg} from '../lib/telegram.ts'
import {Button} from './button.tsx'

interface Props {
  profile: Profile
  options: Options
}

const TONE = {
  blocked: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
} as const

/**
 * Says *why* access stopped, in place, on the main screen.
 *
 * The point is that the user never has to guess: the headline names the cause,
 * the body carries the actual numbers and the date it comes back, and there is
 * exactly one thing to tap.
 */
export function AccessBanner({profile, options}: Props) {
  const {t, i18n} = useTranslation()
  const {access, traffic} = profile
  const severity = accessSeverity(profile)
  if (severity === 'active' || access.reason === null) return null

  const blocked = severity === 'blocked'
  const headline = t(`access.${access.reason}.${blocked ? 'blockedTitle' : 'warningTitle'}`)

  const detail =
    access.reason === 'traffic_limit'
      ? t(blocked ? 'access.traffic_limit.blockedBody' : 'access.traffic_limit.warningBody', {
          used: formatBytes(traffic.used_bytes),
          limit: formatBytes(traffic.limit_bytes),
          remaining: formatBytes(Math.max(0, traffic.limit_bytes - traffic.used_bytes)),
        })
      : access.reason === 'expired'
        ? t('access.expired.body', {date: formatDate(profile.expiration_date, i18n.language)})
        : t('access.admin.body')

  const resetLine = access.self_heals_at
    ? t('access.willReset', {date: formatDate(access.self_heals_at, i18n.language)})
    : null

  return (
    <div className={`space-y-3 rounded-2xl p-4 ${blocked ? TONE.blocked : TONE.warning}`}>
      <div className="space-y-1">
        <p className="font-semibold">{headline}</p>
        <p className="text-sm opacity-90">{detail}</p>
        {resetLine && <p className="text-sm opacity-90">{resetLine}</p>}
      </div>

      <Button variant="primary" className="w-full" onClick={() => tg()?.openTelegramLink(options.admin_contact_url)}>
        {t('common.writeAdmin')}
      </Button>

      <Link to="/limit" className="block text-center text-sm underline opacity-80">
        {t('access.details')}
      </Link>
    </div>
  )
}
