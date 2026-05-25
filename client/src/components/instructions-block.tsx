import {useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import type {ConnectionConfig, Options} from '../api/types.ts'
import {
  defaultFlowFor,
  type FlowId,
  type InstructionFlow,
  type InstructionSupportedEntry,
  lookupInstructions,
} from '../instructions/index.ts'
import {hapticLight, tg} from '../lib/telegram.ts'
import {type DownloadFormat, useConfigActions} from '../lib/use-config-actions.ts'
import {Button} from './button.tsx'
import {CopyIcon, DownloadIcon} from './icons.tsx'
import {InstructionExtraActions} from './instruction-extra-actions.tsx'
import {InstructionQrCard} from './instruction-qr-card.tsx'

interface Props {
  protocol: string
  device: string
  options: Options
  /** Real artifacts (QR / link / config). When null — preview mode (no buttons, only steps). */
  config: ConnectionConfig | null
}

const FLOW_ICON: Record<FlowId, string> = {
  qr: '📷',
  link_qr: '📷',
  deeplink: '📲',
  link_paste: '🔗',
  config_file: '💾',
  config_clipboard: '📋',
  router_manual: '📡',
}

export function InstructionsBlock({protocol, device, options, config}: Props) {
  const {t} = useTranslation()
  const entry = lookupInstructions(protocol, device)

  if (!entry) {
    return (
      <div className="rounded-2xl bg-tg-secondaryBg p-4 text-sm text-tg-hint">{t('instructionsBlock.noEntry')}</div>
    )
  }

  if (!entry.supported) {
    const fallbackLabel = entry.fallback_protocol
      ? (options.protocols.find((p) => p.slug === entry.fallback_protocol)?.label ?? entry.fallback_protocol)
      : null
    return (
      <div className="space-y-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
        <div className="font-medium">{t('instructionsBlock.unsupportedTitle')}</div>
        {entry.fallback_reason && <div>{entry.fallback_reason}</div>}
        {entry.fallback_protocol && (
          <Link
            to={`/new?protocol=${encodeURIComponent(entry.fallback_protocol)}&device=${encodeURIComponent(device)}`}
            className="inline-block rounded-xl bg-tg-button px-4 py-2 text-tg-buttonText"
          >
            {t('instructionsBlock.useFallback', {protocol: fallbackLabel ?? ''})}
          </Link>
        )}
      </div>
    )
  }

  return <SupportedInstructions entry={entry} device={device} options={options} config={config} />
}

function SupportedInstructions({
  entry,
  device,
  config,
}: {
  entry: InstructionSupportedEntry
  device: string
  options: Options
  config: ConnectionConfig | null
}) {
  const {t} = useTranslation()
  const initialFlow = useMemo(() => defaultFlowFor(entry, device), [entry, device])
  const [flowId, setFlowId] = useState<FlowId>(initialFlow)

  const activeFlow: InstructionFlow | undefined = entry.flows.find((f) => f.id === flowId) ?? entry.flows[0]
  if (!activeFlow) return null

  return (
    <div className="space-y-3">
      {/* Primary app card */}
      <PrimaryAppCard entry={entry} />

      {/* Flow switcher: segmented control makes "either/or" obvious */}
      {entry.flows.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex gap-1 rounded-xl bg-tg-secondaryBg p-1">
            {entry.flows.map((f) => {
              const active = flowId === f.id
              return (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => {
                    setFlowId(f.id)
                    hapticLight()
                  }}
                  className={`flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-xs leading-tight transition ${
                    active ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
                  }`}
                >
                  <span className="inline-flex shrink-0 items-center justify-center text-base leading-none">
                    {FLOW_ICON[f.id]}
                  </span>
                  <span className="flex-1 text-center">{f.title}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Steps */}
      <ol className="space-y-2 rounded-2xl bg-tg-secondaryBg p-4 text-sm">
        {activeFlow.steps.map((s, idx) => (
          <li key={`${activeFlow.id}-${s}`} className="flex gap-2">
            <span className="shrink-0 text-tg-hint">{idx + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      {/* Artifact block — only when we have a real config */}
      {config && (
        <ArtifactBlock
          flowId={activeFlow.id}
          config={config}
          appName={entry.primary_app.name}
          format={entry.primary_app.format ?? null}
        />
      )}

      {/* Alternative apps — always visible, no toggle */}
      {entry.alternative_apps && entry.alternative_apps.length > 0 && (
        <div className="rounded-2xl bg-tg-secondaryBg p-4">
          <div className="text-sm font-medium">{t('instructionsBlock.alternatives')}</div>
          <ul className="mt-2 space-y-1 text-sm">
            {entry.alternative_apps.map((a) => (
              <li key={a.store_url}>
                <button
                  type="button"
                  onClick={() => tg()?.openLink(a.store_url) ?? window.open(a.store_url)}
                  className="text-tg-link underline"
                >
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {config && (
        <InstructionExtraActions
          activeFlowId={activeFlow.id}
          config={config}
          format={entry.primary_app.format ?? null}
        />
      )}
    </div>
  )
}

function PrimaryAppCard({entry}: {entry: InstructionSupportedEntry}) {
  const {t} = useTranslation()
  const onInstall = () => {
    hapticLight()
    const w = tg()
    if (w) w.openLink(entry.primary_app.store_url)
    else window.open(entry.primary_app.store_url, '_blank')
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-tg-secondaryBg p-3">
      <div className="min-w-0">
        <div className="text-xs text-tg-hint">{t('instructionsBlock.recommendedApp')}</div>
        <div className="truncate font-medium">{entry.primary_app.name}</div>
      </div>
      <button
        type="button"
        onClick={onInstall}
        className="shrink-0 rounded-xl bg-tg-button px-4 py-2 text-sm text-tg-buttonText"
      >
        {entry.primary_app.store_label ?? t('instructionsBlock.install')}
      </button>
    </div>
  )
}

function ArtifactBlock({
  flowId,
  config,
  appName,
  format,
}: {
  flowId: FlowId
  config: ConnectionConfig
  appName: string
  format: DownloadFormat | null
}) {
  const {t} = useTranslation()
  const actions = useConfigActions(config)
  const onOpenLink = () => {
    hapticLight()
    const w = tg()
    if (w) w.openLink(config.vpn_link)
    else window.open(config.vpn_link, '_blank')
  }

  if (flowId === 'qr') {
    return <InstructionQrCard value={config.qr_payload} />
  }

  if (flowId === 'link_qr') {
    return <InstructionQrCard value={config.vpn_link} />
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
          onClick={actions.copyLink}
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
        <textarea readOnly value={config.vpn_link} className="h-20 w-full rounded-xl bg-tg-secondaryBg p-3 text-xs" />
        <Button variant="primary" icon={<CopyIcon />} onClick={actions.copyLink} className="w-full">
          {t('instructionsBlock.copyLink')}
        </Button>
      </div>
    )
  }

  if (flowId === 'config_file' || flowId === 'config_clipboard' || flowId === 'router_manual') {
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
