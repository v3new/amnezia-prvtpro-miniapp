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
  if (activeFlowId === 'config_file' || activeFlowId === 'config_clipboard' || activeFlowId === 'router_manual') {
    return null
  }

  if (format === 'conf') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button icon={<CopyIcon />} onClick={actions.copyConfig}>
          {t('instructionsBlock.copyConfigShort')}
        </Button>
        <Button variant="primary" icon={<DownloadIcon />} onClick={() => actions.download(format)}>
          {t('instructionsBlock.downloadConf')}
        </Button>
      </div>
    )
  }

  if (format === 'vpn') {
    return (
      <Button variant="primary" icon={<DownloadIcon />} onClick={() => actions.download(format)} className="w-full">
        {t('instructionsBlock.downloadVpn')}
      </Button>
    )
  }

  return (
    <Button icon={<CopyIcon />} onClick={actions.copyLink} className="w-full">
      {t('instructionsBlock.copyLink')}
    </Button>
  )
}
