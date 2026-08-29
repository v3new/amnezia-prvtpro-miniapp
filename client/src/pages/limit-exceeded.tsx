import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import type {AppContext} from '../app.tsx'
import {Button} from '../components/button.tsx'
import {Page} from '../components/page.tsx'
import {accessSeverity} from '../lib/access-view.ts'
import {formatBytes, formatDate} from '../lib/greeting.ts'
import {tg} from '../lib/telegram.ts'

const ICON: Record<string, string> = {
  traffic_limit: '🚦',
  expired: '⌛️',
  admin: '🔌',
}

/**
 * The long-form answer to "why did my VPN stop, and what happens now".
 *
 * The home banner states the cause; this screen carries the detail that does
 * not fit there — what still works, what comes back on its own, and what needs
 * a human.
 */
export function LimitExceededPage({ctx}: {ctx: AppContext}) {
  const {t, i18n} = useTranslation()
  const {profile, options} = ctx
  const {access, traffic} = profile
  const reason = access.reason ?? 'admin'
  const blocked = accessSeverity(profile) === 'blocked'

  const summary =
    reason === 'traffic_limit'
      ? t(blocked ? 'access.traffic_limit.blockedBody' : 'access.traffic_limit.warningBody', {
          used: formatBytes(traffic.used_bytes),
          limit: formatBytes(traffic.limit_bytes),
          remaining: formatBytes(Math.max(0, traffic.limit_bytes - traffic.used_bytes)),
        })
      : reason === 'expired'
        ? t('access.expired.body', {date: formatDate(profile.expiration_date, i18n.language)})
        : t('access.admin.body')

  return (
    <Page>
      <div className="space-y-3 text-center">
        <div className="text-6xl">{ICON[reason]}</div>
        <h1 className="text-xl font-semibold">{t(`access.${reason}.${blocked ? 'blockedTitle' : 'warningTitle'}`)}</h1>
        <p className="text-sm text-tg-hint">{summary}</p>
      </div>

      {access.self_heals_at && (
        <div className="rounded-2xl bg-tg-secondaryBg p-4 text-sm">
          <p className="font-medium">
            {t('access.willReset', {date: formatDate(access.self_heals_at, i18n.language)})}
          </p>
          <p className="mt-1 text-tg-hint">{t('access.willResetHint')}</p>
        </div>
      )}

      <div className="rounded-2xl bg-tg-secondaryBg p-4 text-sm">
        <p className="font-medium">{t('access.stillWorksTitle')}</p>
        <ul className="mt-2 space-y-1 text-tg-hint">
          <li>{t('access.stillWorksConfigs')}</li>
          <li>{t('access.stillWorksTraffic')}</li>
          <li>{t('access.stillWorksNoNew')}</li>
        </ul>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => tg()?.openTelegramLink(options.admin_contact_url)}
      >
        {t('common.writeAdmin')}
      </Button>

      <Link to="/" className="block text-center text-sm text-tg-link">
        {t('common.back')}
      </Link>
    </Page>
  )
}
