import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {useLocation, useNavigate, useParams} from 'react-router-dom'
import {ApiError, deleteConnection, getConnectionConfig, listConnections} from '../api/client.ts'
import type {Connection, ConnectionConfig} from '../api/types.ts'
import type {AppContext} from '../app.tsx'
import {DeviceIcon} from '../components/device-icon.tsx'
import {TrashIcon} from '../components/icons.tsx'
import {InstructionsBlock} from '../components/instructions-block.tsx'
import {BusyOverlay} from '../components/loader.tsx'
import {Spinner} from '../components/spinner.tsx'
import {formatBytes, relativeAgo} from '../lib/greeting.ts'
import {tg} from '../lib/telegram.ts'
import {useFocusEffect} from '../lib/use-focus-effect.ts'

export function ConnectionDetailPage({ctx}: {ctx: AppContext}) {
  const {t} = useTranslation()
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation() as {state?: {initialConfig?: ConnectionConfig}}
  const id = params.id ?? ''
  const [config, setConfig] = useState<ConnectionConfig | null>(location.state?.initialConfig ?? null)
  const [meta, setMeta] = useState<Connection | null>(null)
  const [busy, setBusy] = useState<null | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)

  const hasConfig = config !== null
  useFocusEffect(async () => {
    try {
      const list = await listConnections()
      ctx.setConnections(list)
      const found = list.connections.find((c) => c.id === id) ?? null
      setMeta(found)
      if (!hasConfig && found) {
        const cfg = await getConnectionConfig(id)
        setConfig(cfg)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('detail.loadFailed'))
    }
  })

  if (error) return <div className="p-6 text-center text-rose-500">{error}</div>
  if (!config || !meta) return <Spinner />

  const onDelete = () => {
    const w = tg()
    const proceed = async () => {
      setBusy('delete')
      const previous = ctx.connections
      ctx.setConnections({
        ...ctx.connections,
        connections: ctx.connections.connections.filter((c) => c.id !== id),
        used_slots: Math.max(0, ctx.connections.used_slots - 1),
      })
      try {
        await deleteConnection(id)
        navigate('/')
      } catch (e) {
        ctx.setConnections(previous)
        tg()?.showPopup({message: e instanceof ApiError ? e.message : t('common.internalError')})
        setBusy(null)
      }
    }
    const msg = t('detail.confirmDelete')
    if (w) w.showConfirm(msg, (ok) => ok && void proceed())
    else if (confirm(msg)) void proceed()
  }

  const device = ctx.options.devices.find((d) => d.slug === meta.device)
  const deviceLabel = device?.label ?? meta.device
  const ago = relativeAgo(meta.last_handshake_at)

  const statusText = meta.online ? t('common.online') : ago ? t(ago.key, {n: ago.n}) : t('detail.neverConnected')

  const busyMessage = busy === 'delete' ? t('common.deleting') : undefined

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-24">
      <BusyOverlay visible={busy !== null} message={busyMessage} />
      <button type="button" onClick={() => navigate('/')} className="text-tg-link">
        {t('common.back')}
      </button>

      {/* Hero: device portrait + identity + tiny destructive action */}
      <div className="relative flex items-center gap-4 rounded-2xl bg-tg-secondaryBg p-4 pr-12">
        <DeviceIcon slug={meta.device} fallback={device?.icon ?? '❓'} className="h-20 w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight">{config.description || config.name}</h1>
          <div className="mt-0.5 truncate text-xs text-tg-hint">
            {deviceLabel} · {meta.protocol_label}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {meta.online && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />}
            <span className={`text-xs ${meta.online ? 'text-emerald-600' : 'text-tg-hint'}`}>{statusText}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy !== null}
          aria-label={t('detail.delete')}
          title={t('detail.delete')}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-tg-hint transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>

      {/* Traffic strip */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-tg-secondaryBg p-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-tg-hint">
            <span className="text-sm leading-none text-emerald-500">↓</span>
            <span>{t('detail.trafficIn')}</span>
          </div>
          <div className="mt-1 text-base font-medium text-emerald-500">{formatBytes(meta.bytes_received)}</div>
        </div>
        <div className="rounded-2xl bg-tg-secondaryBg p-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-tg-hint">
            <span className="text-sm leading-none text-sky-500">↑</span>
            <span>{t('detail.trafficOut')}</span>
          </div>
          <div className="mt-1 text-base font-medium text-sky-500">{formatBytes(meta.bytes_sent)}</div>
        </div>
      </div>

      <InstructionsBlock protocol={meta.protocol} device={meta.device} options={ctx.options} config={config} />
    </div>
  )
}
