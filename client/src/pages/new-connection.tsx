import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {useNavigate} from 'react-router-dom'
import {ApiError, createConnection} from '../api/client.ts'
import type {AppContext} from '../app.tsx'
import {Button} from '../components/button.tsx'
import {DeviceIcon} from '../components/device-icon.tsx'
import {BusyOverlay} from '../components/loader.tsx'
import {Page, PageHeader} from '../components/page.tsx'
import {hapticLight, tg} from '../lib/telegram.ts'

type FormFactor = 'phone' | 'computer' | 'tv' | 'tablet' | 'router' | 'other'

interface FormFactorDef {
  id: FormFactor
  icon: string
  /** Device slug whose sprite represents this form factor on the tile. */
  representativeDevice: string
  /** device slugs available under this form factor. `null` means the form factor IS the device — skip OS step. */
  osOptions: string[] | null
  /** the single device slug, only when osOptions is null */
  directDevice?: string
}

const FORM_FACTORS: FormFactorDef[] = [
  {id: 'phone', icon: '📱', representativeDevice: 'iphone', osOptions: ['iphone', 'android']},
  {id: 'computer', icon: '💻', representativeDevice: 'mac', osOptions: ['mac', 'windows', 'linux']},
  {id: 'tablet', icon: '📲', representativeDevice: 'ipad', osOptions: ['ipad', 'android_tablet']},
  {id: 'tv', icon: '📺', representativeDevice: 'appletv', osOptions: ['appletv', 'androidtv']},
  {id: 'other', icon: '❓', representativeDevice: 'other', osOptions: null, directDevice: 'other'},
  {id: 'router', icon: '📡', representativeDevice: 'router', osOptions: null, directDevice: 'router'},
]

const PROTO_DESC_KEY: Record<string, string> = {
  awg2: 'wizard.protoDesc.awg2',
  wireguard: 'wizard.protoDesc.wireguard',
  xray: 'wizard.protoDesc.xray',
}

/** OS labels for wizard step 2 — show the OS, not the device brand. */
const OS_LABEL: Record<string, string> = {
  iphone: 'iOS',
  android: 'Android',
  ipad: 'iPadOS',
  android_tablet: 'Android',
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  appletv: 'Apple TV',
  androidtv: 'Android TV',
}

export function NewConnectionPage({ctx}: {ctx: AppContext}) {
  const {t} = useTranslation()
  const navigate = useNavigate()
  const [formFactor, setFormFactor] = useState<FormFactor | null>(null)
  const [device, setDevice] = useState<string | null>(null)
  const [protocol, setProtocol] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const constraints = ctx.options.description_constraints
  const currentDevice = ctx.options.devices.find((d) => d.slug === device)
  const examples = currentDevice?.name_examples ?? []

  const currentForm = formFactor ? FORM_FACTORS.find((f) => f.id === formFactor) : null
  const needsOsStep = currentForm?.osOptions != null
  const availableProtocols = device ? sortProtocols(ctx.options.protocols, device) : []

  const valid = useMemo(() => {
    if (!device || !protocol) return false
    const trimmed = name.trim()
    if (trimmed.length < constraints.min_length) return false
    if (trimmed.length > constraints.max_length) return false
    try {
      return new RegExp(constraints.pattern, 'u').test(trimmed) && !trimmed.includes(':')
    } catch {
      return true
    }
  }, [name, constraints, device, protocol])

  const hasMainButton = Boolean(tg()?.MainButton)

  const submit = useCallback(async () => {
    if (!valid || busy || !device || !protocol) return
    setBusy(true)
    setError(null)
    hapticLight()
    try {
      const created = await createConnection({device, protocol, description: name.trim()})
      const label = ctx.options.protocols.find((p) => p.slug === protocol)?.label ?? protocol
      ctx.setConnections({
        ...ctx.connections,
        connections: [
          ...ctx.connections.connections.filter((c) => c.id !== created.id),
          {
            id: created.id,
            name: created.name,
            description: created.description,
            device,
            protocol,
            protocol_label: label,
            created_at: new Date().toISOString(),
            last_bytes: 0,
            bytes_received: 0,
            bytes_sent: 0,
            enabled: true,
            last_handshake_at: null,
            online: false,
          },
        ],
        used_slots: Math.max(ctx.connections.used_slots, ctx.connections.connections.length + 1),
      })
      navigate(`/c/${encodeURIComponent(created.id)}`, {state: {initialConfig: created}})
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'max_connections_reached') {
          tg()?.showPopup({message: e.message})
          navigate('/')
          return
        }
        setError(e.message)
      } else {
        setError(t('common.noConnection'))
      }
    } finally {
      setBusy(false)
    }
  }, [valid, busy, device, protocol, name, navigate, t, ctx])

  // Register the MainButton handler once; keep a ref to the latest submit so we
  // don't re-bind on every keystroke (the wizard re-renders on every char).
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    const main = tg()?.MainButton
    if (!main) return
    main.setText(t('wizard.create'))
    const handler = () => void submitRef.current()
    main.onClick(handler)
    return () => {
      main.offClick(handler)
      main.hide()
    }
  }, [t])

  useEffect(() => {
    const main = tg()?.MainButton
    if (!main) return
    main.setParams({is_visible: valid, is_active: valid && !busy})
  }, [valid, busy])

  function pickFormFactor(f: FormFactorDef) {
    hapticLight()
    setError(null)
    setFormFactor(f.id)
    if (f.osOptions == null && f.directDevice) {
      setDevice(f.directDevice)
    } else {
      setDevice(null)
    }
    setProtocol(null)
    setName('')
  }

  function pickDevice(slug: string) {
    hapticLight()
    setError(null)
    setDevice(slug)
    setProtocol(null)
    setName('')
  }

  function pickProtocol(slug: string) {
    hapticLight()
    setError(null)
    setProtocol(slug)
  }

  function resetToStep(step: 'form' | 'os' | 'protocol' | 'name') {
    hapticLight()
    setError(null)
    if (step === 'form') {
      setFormFactor(null)
      setDevice(null)
      setProtocol(null)
      setName('')
    } else if (step === 'os') {
      setDevice(null)
      setProtocol(null)
      setName('')
    } else if (step === 'protocol') {
      setProtocol(null)
      setName('')
    } else if (step === 'name') {
      setName('')
    }
  }

  // Step state: which step is "active" (next to fill)
  const showFormStep = formFactor == null
  const showOsStep = formFactor != null && needsOsStep && device == null
  const showProtocolStep = device != null && protocol == null
  const showNameStep = device != null && protocol != null

  return (
    <Page className="space-y-3 pb-28">
      <BusyOverlay visible={busy} message={t('common.creating')} />
      <PageHeader />

      {/* Step 1: form factor */}
      {showFormStep ? (
        <Section title={t('wizard.stepDevice')}>
          <div className="grid grid-cols-3 gap-2">
            {FORM_FACTORS.map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => pickFormFactor(f)}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-tg-secondaryBg p-4 transition active:scale-[0.98]"
              >
                <DeviceIcon slug={f.representativeDevice} fallback={f.icon} showBadge={false} className="h-14 w-14" />
                <span className="text-xs leading-tight">{t(`wizard.form.${f.id}`)}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : (
        <CollapsedRow
          title={t('wizard.stepDevice')}
          icon={
            currentForm ? (
              <DeviceIcon
                slug={currentForm.representativeDevice}
                fallback={currentForm.icon}
                showBadge={false}
                className="h-8 w-8 shrink-0"
              />
            ) : (
              ''
            )
          }
          value={t(`wizard.form.${formFactor}`)}
          onChange={() => resetToStep('form')}
          changeLabel={t('wizard.change')}
        />
      )}

      {/* Step 2: OS (only when form factor has multiple OS) */}
      {needsOsStep &&
        (showOsStep ? (
          <Section title={t('wizard.stepOs')}>
            <div className="grid grid-cols-2 gap-2">
              {(currentForm?.osOptions ?? []).map((slug) => {
                const d = ctx.options.devices.find((x) => x.slug === slug)
                if (!d) return null
                return (
                  <button
                    type="button"
                    key={slug}
                    onClick={() => pickDevice(slug)}
                    className="flex items-center gap-2 rounded-xl bg-tg-secondaryBg p-3 transition active:scale-[0.98]"
                  >
                    <DeviceIcon slug={slug} fallback={d.icon} className="h-10 w-10 shrink-0" />
                    <span className="text-sm">{OS_LABEL[slug] ?? d.label}</span>
                  </button>
                )
              })}
            </div>
          </Section>
        ) : (
          device != null &&
          currentDevice && (
            <CollapsedRow
              title={t('wizard.stepOs')}
              icon={<DeviceIcon slug={currentDevice.slug} fallback={currentDevice.icon} className="h-8 w-8 shrink-0" />}
              value={OS_LABEL[currentDevice.slug] ?? currentDevice.label}
              onChange={() => resetToStep('os')}
              changeLabel={t('wizard.change')}
            />
          )
        ))}

      {/* Step 3: protocol */}
      {showProtocolStep ? (
        <Section title={t('wizard.stepProtocol')}>
          <div className="space-y-2">
            {availableProtocols.map((p) => {
              const isRecommended = device ? p.recommended_for.includes(device) : false
              const descKey = PROTO_DESC_KEY[p.slug]
              return (
                <button
                  type="button"
                  key={p.slug}
                  onClick={() => pickProtocol(p.slug)}
                  className="w-full rounded-xl bg-tg-secondaryBg p-3 text-left transition active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.label}</span>
                    {isRecommended && (
                      <span className="rounded-full bg-tg-button px-2 py-0.5 text-[10px] text-tg-buttonText">
                        {t('wizard.recommended')}
                      </span>
                    )}
                  </div>
                  {descKey && <p className="mt-1 text-xs text-tg-hint">{t(descKey)}</p>}
                </button>
              )
            })}
          </div>
        </Section>
      ) : (
        protocol != null && (
          <CollapsedRow
            title={t('wizard.stepProtocol')}
            icon="🔐"
            value={ctx.options.protocols.find((p) => p.slug === protocol)?.label ?? protocol}
            onChange={() => resetToStep('protocol')}
            changeLabel={t('wizard.change')}
          />
        )
      )}

      {/* Step 4: name */}
      {showNameStep && (
        <Section title={t('wizard.stepName')}>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setError(null)
              setName(e.target.value)
            }}
            placeholder={examples[0] ?? t('wizard.namePlaceholder')}
            maxLength={constraints.max_length}
            className="w-full rounded-xl border border-black/10 bg-tg-secondaryBg p-3 outline-none focus:border-tg-button dark:border-white/10"
          />
          <div className="mt-1 flex justify-between text-xs text-tg-hint">
            <span>{error && <span className="text-rose-500">{error}</span>}</span>
            <span>
              {name.trim().length}/{constraints.max_length}
            </span>
          </div>
          {examples.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {examples.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => {
                    setError(null)
                    setName(ex)
                    hapticLight()
                  }}
                  className="rounded-full bg-tg-secondaryBg px-3 py-1 text-xs text-tg-hint"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {!hasMainButton && valid && (
            <Button variant="primary" size="lg" className="mt-4 w-full" disabled={busy} onClick={submit}>
              {busy ? t('wizard.creating') : t('wizard.create')}
            </Button>
          )}
        </Section>
      )}
    </Page>
  )
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-tg-hint">{title}</h2>
      {children}
    </section>
  )
}

function CollapsedRow({
  title,
  icon,
  value,
  onChange,
  changeLabel,
}: {
  title: string
  icon: React.ReactNode
  value: string
  onChange: () => void
  changeLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center justify-between rounded-xl bg-tg-secondaryBg/60 p-3 text-left transition active:scale-[0.99]"
    >
      <div className="flex min-w-0 items-center gap-3">
        {typeof icon === 'string' ? <span className="text-xl">{icon}</span> : icon}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-tg-hint">{title}</div>
          <div className="truncate text-sm font-medium">{value}</div>
        </div>
      </div>
      <span className="text-xs text-tg-link">{changeLabel}</span>
    </button>
  )
}

function sortProtocols<T extends {slug: string; recommended_for: string[]}>(arr: T[], device: string): T[] {
  return [...arr].sort((a, b) => {
    const ar = a.recommended_for.includes(device) ? 0 : 1
    const br = b.recommended_for.includes(device) ? 0 : 1
    return ar - br
  })
}
