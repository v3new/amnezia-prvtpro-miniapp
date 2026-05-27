import {useTranslation} from 'react-i18next'
import type {ConnectionConfig} from '../api/types.ts'
import type {FlowId} from '../instructions/index.ts'
import {getImportLink} from '../lib/config-artifacts.ts'
import {hapticLight, tg} from '../lib/telegram.ts'
import {type DownloadFormat, useConfigActions} from '../lib/use-config-actions.ts'
import {Button} from './button.tsx'
import {CopyIcon, DownloadIcon} from './icons.tsx'
import {InstructionQrCard} from './instruction-qr-card.tsx'

export function InstructionArtifactBlock({
  flowId,
  protocol,
  config,
  appName,
  format,
}: {
  flowId: FlowId
  protocol: string
  config: ConnectionConfig
  appName: string
  format: DownloadFormat | null
}) {
  const {t} = useTranslation()
  const actions = useConfigActions(config)
  const importLink = getImportLink(protocol, config)
  const onOpenLink = () => {
    hapticLight()
    const w = tg()
    if (w) w.openLink(importLink)
    else window.open(importLink, '_blank')
  }

  if (flowId === 'qr') {
    return <InstructionQrCard value={config.qr_payload} />
  }

  if (flowId === 'link_qr') {
    return <InstructionQrCard value={importLink} />
  }

  if (flowId === 'deeplink') {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={onOpenLink}
          className="w-full rounded-2xl bg-tg-button p-4 font-medium text-tg-buttonText"
        >
          {t('instructionsBlock.openInApp', {app: appName})}
        </button>
        <button
          type="button"
          onClick={() => actions.copyLink(importLink)}
          className="w-full rounded-xl bg-tg-secondaryBg p-2 text-xs text-tg-hint"
        >
          {t('instructionsBlock.orCopyLink')}
        </button>
      </div>
    )
  }

  if (flowId === 'link_paste') {
    return (
      <div className="space-y-2">
        <textarea readOnly value={importLink} className="h-20 w-full rounded-xl bg-tg-secondaryBg p-3 text-xs" />
        <Button variant="primary" icon={<CopyIcon />} onClick={() => actions.copyLink(importLink)} className="w-full">
          {t('instructionsBlock.copyLink')}
        </Button>
      </div>
    )
  }

  if (flowId === 'config_clipboard') {
    return (
      <div className="space-y-2">
        <textarea
          readOnly
          value={config.config}
          className="h-48 w-full rounded-xl bg-tg-secondaryBg p-3 font-mono text-xs"
        />
        <Button variant="primary" icon={<CopyIcon />} onClick={actions.copyConfig} className="w-full">
          {t('instructionsBlock.copyConfig')}
        </Button>
      </div>
    )
  }

  if (flowId === 'config_file' || flowId === 'router_manual') {
    if (format === 'vpn') {
      return (
        <Button variant="primary" icon={<DownloadIcon />} onClick={() => actions.download(format)} className="w-full">
          {t('instructionsBlock.downloadVpn')}
        </Button>
      )
    }

    return (
      <div className="space-y-2">
        <textarea
          readOnly
          value={config.config}
          className="h-48 w-full rounded-xl bg-tg-secondaryBg p-3 font-mono text-xs"
        />
        <div className={`grid gap-2 ${format ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Button icon={<CopyIcon />} onClick={actions.copyConfig}>
            {t('detail.copy')}
          </Button>
          {format && (
            <Button variant="primary" icon={<DownloadIcon />} onClick={() => actions.download(format)}>
              {t('instructionsBlock.downloadConf')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return null
}
