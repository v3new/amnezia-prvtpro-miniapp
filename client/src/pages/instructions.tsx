import {useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import type {AppContext} from '../app.tsx'
import {DeviceIcon} from '../components/device-icon.tsx'
import {InstructionsBlock} from '../components/instructions-block.tsx'
import {Page, PageHeader} from '../components/page.tsx'
import {guessDevice, hapticLight} from '../lib/telegram.ts'

export function InstructionsPage({ctx}: {ctx: AppContext}) {
  const {t} = useTranslation()
  const protocols = ctx.options.protocols
  const devices = ctx.options.devices

  const [protocol, setProtocol] = useState<string>(() => protocols[0]?.slug ?? 'awg2')
  const [device, setDevice] = useState<string>(() => guessDevice())

  const sortedDevices = useMemo(() => {
    const proto = protocols.find((p) => p.slug === protocol)
    if (!proto) return devices
    return [...devices].sort((a, b) => {
      const ar = proto.recommended_for.includes(a.slug) ? 0 : 1
      const br = proto.recommended_for.includes(b.slug) ? 0 : 1
      return ar - br
    })
  }, [protocols, devices, protocol])

  return (
    <Page>
      <PageHeader title={t('instructions.title')} />

      <section>
        <h2 className="mb-2 text-sm font-medium text-tg-hint">{t('instructions.pickProtocol')}</h2>
        <div className="grid grid-cols-3 gap-2">
          {protocols.map((p) => (
            <button
              type="button"
              key={p.slug}
              onClick={() => {
                setProtocol(p.slug)
                hapticLight()
              }}
              className={`rounded-xl p-2 text-xs ${
                protocol === p.slug ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-secondaryBg text-tg-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-tg-hint">{t('instructions.pickDevice')}</h2>
        <div className="grid grid-cols-5 gap-1.5">
          {sortedDevices.map((d) => (
            <button
              type="button"
              key={d.slug}
              onClick={() => {
                setDevice(d.slug)
                hapticLight()
              }}
              className={`flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] leading-tight ${
                device === d.slug ? 'bg-tg-button text-tg-buttonText' : 'bg-tg-secondaryBg text-tg-text'
              }`}
            >
              <DeviceIcon slug={d.slug} fallback={d.icon} className="h-10 w-10" />
              <span className="line-clamp-2">{d.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <InstructionsBlock protocol={protocol} device={device} options={ctx.options} config={null} />
      </section>

      <p className="rounded-xl bg-tg-secondaryBg p-3 text-xs text-tg-hint">{t('instructions.previewNote')}</p>
    </Page>
  )
}
