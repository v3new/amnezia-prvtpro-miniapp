import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import type {AppContext} from '../app.tsx'
import {Button} from '../components/button.tsx'
import {formatDate} from '../lib/greeting.ts'
import {tg} from '../lib/telegram.ts'

export function LimitExceededPage({ctx}: {ctx: AppContext}) {
  const {t, i18n} = useTranslation()
  const reset = ctx.profile.traffic.next_reset_at
  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <div className="text-6xl">🚦</div>
      <h1 className="text-xl font-semibold">{t('limit.title')}</h1>
      {reset && (
        <p className="text-sm text-tg-hint">{t('limit.willReset', {date: formatDate(reset, i18n.language)})}</p>
      )}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => tg()?.openTelegramLink(ctx.options.admin_contact_url)}
      >
        {t('common.writeAdmin')}
      </Button>
      <Link to="/" className="block text-sm text-tg-link">
        {t('common.back')}
      </Link>
    </div>
  )
}
