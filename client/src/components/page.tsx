import type {ReactNode} from 'react'
import {useTranslation} from 'react-i18next'
import {useNavigate} from 'react-router-dom'

interface PageProps {
  children: ReactNode
  className?: string
}

export function Page({children, className = ''}: PageProps) {
  return <div className={`mx-auto max-w-md space-y-4 p-4 pb-24 ${className}`}>{children}</div>
}

interface PageHeaderProps {
  title?: string
  back?: boolean
}

export function PageHeader({title, back = true}: PageHeaderProps) {
  const {t} = useTranslation()
  const navigate = useNavigate()
  if (!back && !title) return null
  return (
    <div className="flex items-center gap-3">
      {back && (
        <button type="button" onClick={() => navigate(-1)} className="text-tg-link" aria-label={t('common.back')}>
          {t('common.back')}
        </button>
      )}
      {title && <h1 className="text-lg font-semibold">{title}</h1>}
    </div>
  )
}
