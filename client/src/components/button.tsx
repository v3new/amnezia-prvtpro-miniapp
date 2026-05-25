import type {ButtonHTMLAttributes, ReactNode} from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'plain'
type Size = 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  children: ReactNode
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-tg-button text-tg-buttonText',
  secondary: 'bg-tg-secondaryBg text-tg-text',
  danger: 'bg-rose-500/10 text-rose-600',
  plain: 'text-tg-text',
}

const SIZE: Record<Size, string> = {
  md: 'rounded-xl p-3 text-sm',
  lg: 'rounded-2xl p-4 font-medium',
}

export function Button({variant = 'secondary', size = 'md', className = '', icon, children, ...rest}: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={`${SIZE[size]} ${VARIANT[variant]} flex items-center justify-center gap-2 text-center leading-tight transition active:scale-[0.98] disabled:opacity-50 ${className}`}
    >
      {icon && <ButtonIcon>{icon}</ButtonIcon>}
      <span>{children}</span>
    </button>
  )
}

export function ButtonIcon({children}: {children: ReactNode}) {
  return <span className="inline-flex shrink-0 items-center justify-center text-base leading-none">{children}</span>
}
