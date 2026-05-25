import {useTranslation} from 'react-i18next'
import type {ConnectionConfig} from '../api/types.ts'
import type {FlowId} from '../instructions/index.ts'
import {type DownloadFormat, useConfigActions} from '../lib/use-config-actions.ts'
import {Button} from './button.tsx'
import {CopyIcon, DownloadIcon} from './icons.tsx'

export function InstructionExtraActions({
  activeFlowId,
  config,
  format,
}: {
  activeFlowId: FlowId
  config: ConnectionConfig
  format: DownloadFormat | null
}) {
  const {t} = useTranslation()
  const actions = useConfigActions(config)

  if (format === 'conf') {
    const showDownload = activeFlowId !== 'config_file'
    const showLink = activeFlowId !== 'link_paste'
    return (
      <div className="space-y-2 rounded-2xl bg-tg-secondaryBg p-4">
        <div className="text-sm font-medium">{t('instructionsBlock.otherAppsTitle')}</div>
        <div className={`grid gap-2 ${showDownload && showLink ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {showDownload && (
            <Button variant="primary" icon={<DownloadIcon />} onClick={() => actions.download(format)}>
              {t('instructionsBlock.downloadConf')}
            </Button>
          )}
          {showLink && (
            <Button icon={<CopyIcon />} onClick={actions.copyLink}>
              {t('instructionsBlock.copyLinkShort')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (format === 'vpn') {
    if (activeFlowId === 'config_file') return null
    return (
      <Button variant="primary" icon={<DownloadIcon />} onClick={() => actions.download(format)} className="w-full">
        {t('instructionsBlock.downloadVpn')}
      </Button>
    )
  }

  if (activeFlowId === 'link_paste') return null
  return (
    <Button icon={<CopyIcon />} onClick={actions.copyLink} className="w-full">
      {t('instructionsBlock.copyLink')}
    </Button>
  )
}
