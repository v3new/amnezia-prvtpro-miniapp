import {InlineLoader} from './inline-loader.tsx'

export function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-tg-bg">
      <InlineLoader size={64} showHint />
    </div>
  )
}
