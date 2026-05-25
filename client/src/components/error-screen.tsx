import {useTranslation} from 'react-i18next'
import {tg} from '../lib/telegram.ts'

interface Props {
  code: string
  message: string
  adminHandle?: string
}

export function ErrorScreen({code, message, adminHandle}: Props) {
  const {t} = useTranslation()
  const showAdmin = code === 'user_not_provisioned' && adminHandle
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-tg-bg p-6 text-center text-tg-text">
      <div className="text-6xl">🔒</div>
      <p className="text-lg font-medium">{message}</p>
      {showAdmin && (
        <button
          type="button"
          className="rounded-xl bg-tg-button px-5 py-3 text-tg-buttonText"
          onClick={() => tg()?.openTelegramLink(`https://t.me/${adminHandle}`)}
        >
          {t('common.writeAdmin')}
        </button>
      )}
      <button type="button" className="text-sm text-tg-link underline" onClick={() => location.reload()}>
        {t('common.tryAgain')}
      </button>
    </div>
  )
}
