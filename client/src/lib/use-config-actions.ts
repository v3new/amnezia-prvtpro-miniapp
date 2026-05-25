import {useTranslation} from 'react-i18next'
import {ApiError, getDownloadUrls} from '../api/client.ts'
import type {ConnectionConfig} from '../api/types.ts'
import {toast} from '../components/toast.tsx'
import {supportsDownloadFile, tg} from './telegram.ts'

const DOWNLOAD_URL_REVOKE_MS = 1000

export type DownloadFormat = 'conf' | 'vpn'

export interface ConfigActions {
  copyLink: () => void
  copyConfig: () => void
  /**
   * Trigger a download in the most reliable way for the current Telegram client.
   * Pass `null` when the protocol has no file format (VLESS) — the call is a no-op,
   * useful so call sites can keep a single signature.
   */
  download: (format: DownloadFormat | null) => Promise<void>
}

export function useConfigActions(config: ConnectionConfig): ConfigActions {
  const {t} = useTranslation()

  const writeClipboard = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
    tg()?.HapticFeedback.notificationOccurred('success')
    toast(t('common.copied'))
  }

  return {
    copyLink: () => writeClipboard(config.vpn_link),
    copyConfig: () => writeClipboard(config.config),
    download: async (format) => {
      if (!format) return
      const tw = tg()
      try {
        // Telegram clients (8.0+) have a native downloader that saves the file
        // into system storage and shows the right "Save to Files" / "Save"
        // dialog per platform. Older clients can't trigger that, so we route
        // them to an external browser with a .zip — every OS treats .zip as
        // a binary attachment, sidestepping the "open as text" pitfall.
        if (tw && supportsDownloadFile()) {
          const urls = await getDownloadUrls(config.id, format)
          tw.downloadFile?.({url: urls.native_url, file_name: urls.filename}, (accepted) => {
            if (accepted) toast(t('common.downloadStarted'))
          })
          return
        }
        if (tw) {
          const urls = await getDownloadUrls(config.id, format)
          tw.openLink(urls.zip_url)
          toast(t('common.openingBrowser'))
          return
        }
        // No Telegram — plain browser (dev or unsupported embed). The classic
        // blob+anchor trick is the most permissive path here.
        const ext = format
        const filename = `${config.description || 'amnezia'}.${ext}`
        const body = format === 'vpn' ? config.vpn_link : config.config
        const blob = new Blob([body], {type: 'text/plain'})
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_MS)
        toast(t('common.downloaded'))
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : t('common.downloadFailed')
        toast(msg)
      }
    },
  }
}
