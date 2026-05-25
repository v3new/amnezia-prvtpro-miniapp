import {useMemo} from 'react'
import {useTranslation} from 'react-i18next'
import {pickUnknownReply} from '../lib/unknown-replies.ts'

interface Props {
  code: string
  message: string
  adminHandle?: string
}

export function ErrorScreen({code, message}: Props) {
  const {t} = useTranslation()
  const isUnknown = code === 'user_not_provisioned'
  const unknownReply = useMemo(() => (isUnknown ? pickUnknownReply() : null), [isUnknown])

  if (isUnknown && unknownReply) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-tg-bg p-6 text-center text-tg-text">
        <p className="text-lg font-medium">{unknownReply}</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-tg-bg p-6 text-center text-tg-text">
      <div className="text-6xl">🔒</div>
      <p className="text-lg font-medium">{message}</p>
      <button type="button" className="text-sm text-tg-link underline" onClick={() => location.reload()}>
        {t('common.tryAgain')}
      </button>
    </div>
  )
}
