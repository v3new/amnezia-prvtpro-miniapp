export interface TgWebApp {
  initData: string
  initDataUnsafe: {user?: {id: number; first_name?: string; language_code?: string}}
  colorScheme: 'light' | 'dark'
  platform: string
  /** Bot API version, e.g. "8.0". Present since 6.7. */
  version: string
  themeParams: Record<string, string>
  isExpanded?: boolean
  ready(): void
  expand(): void
  openLink(url: string, options?: {try_instant_view?: boolean; try_browser?: string}): void
  /**
   * Bot API 8.0+. Shows a native "Download file?" popup and saves the file
   * to the system storage via Telegram's downloader.
   * `cb` receives `true` when the user accepted, `false` when cancelled.
   */
  downloadFile?(p: {url: string; file_name: string}, cb?: (accepted: boolean) => void): void
  openTelegramLink(url: string): void
  showPopup(
    p: {
      title?: string
      message: string
      buttons?: Array<{id?: string; type?: string; text?: string}>
    },
    cb?: (id: string) => void,
  ): void
  showConfirm(message: string, cb: (ok: boolean) => void): void
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
  MainButton: {
    text: string
    show(): void
    hide(): void
    enable(): void
    disable(): void
    onClick(cb: () => void): void
    offClick(cb: () => void): void
    setText(text: string): void
    setParams(p: {text?: string; is_active?: boolean; is_visible?: boolean}): void
  }
}

declare global {
  interface Window {
    Telegram?: {WebApp?: TgWebApp}
  }
}

export function tg(): TgWebApp | null {
  return window.Telegram?.WebApp ?? null
}

export function expandTelegramViewport(): void {
  const w = tg()
  if (!w) return
  w.expand()
}

export function readyTelegramApp(): void {
  tg()?.ready()
}

/**
 * Telegram Bot API 8.0 introduced `downloadFile` (native save-to-files popup).
 * Older clients lack both the method and a recent `version` — we treat them
 * as unsupported and fall back to `openLink(zip)`.
 */
export function supportsDownloadFile(): boolean {
  const w = tg()
  if (!w || typeof w.downloadFile !== 'function') return false
  const v = w.version ?? '6.0'
  const [majStr, minStr = '0'] = v.split('.')
  const maj = Number(majStr) || 0
  const min = Number(minStr) || 0
  return maj > 8 || (maj === 8 && min >= 0)
}

export function hapticLight(): void {
  tg()?.HapticFeedback.impactOccurred('light')
}

export function guessDevice(): string {
  const p = tg()?.platform ?? ''
  switch (p) {
    case 'ios':
      return 'iphone'
    case 'android':
      return 'android'
    case 'macos':
      return 'mac'
    case 'tdesktop':
      return 'windows'
    default:
      return 'iphone'
  }
}

export function applyTheme(): void {
  const t = tg()
  if (!t) return
  document.documentElement.classList.toggle('dark', t.colorScheme === 'dark')
}
