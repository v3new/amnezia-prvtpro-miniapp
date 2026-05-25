import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import {ApiError, getProfile, listConnections} from '../api/client.ts'
import type {AppContext} from '../app.tsx'
import {Button, ButtonIcon} from '../components/button.tsx'
import {ConnectionCard} from '../components/connection-card.tsx'
import {PlusIcon} from '../components/icons.tsx'
import {Page} from '../components/page.tsx'
import {ServerStatusBadge} from '../components/server-status.tsx'
import {TrafficCard} from '../components/traffic-card.tsx'
import {compareByFormFactorThenName} from '../lib/device-order.ts'
import {formatDate, greetingKey} from '../lib/greeting.ts'
import {hapticLight, tg} from '../lib/telegram.ts'
import {useFocusEffect} from '../lib/use-focus-effect.ts'
import {usePing} from '../lib/use-ping.ts'
import {useServerStatus} from '../lib/use-server-status.ts'

export function HomePage({ctx}: {ctx: AppContext}) {
  const {t, i18n} = useTranslation()
  const {connections, limit} = ctx.connections
  const [error, setError] = useState<string | null>(null)
  const status = useServerStatus()
  const clientPing = usePing(ctx.options.vpn_server_host)

  useFocusEffect(async () => {
    try {
      const [profileResult, listResult] = await Promise.allSettled([getProfile(), listConnections()])
      if (profileResult.status === 'fulfilled') ctx.setProfile(profileResult.value.profile)
      if (listResult.status === 'fulfilled') ctx.setConnections(listResult.value)
      if (profileResult.status === 'rejected' && listResult.status === 'rejected') throw listResult.reason
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.noConnection'))
    }
  })

  if (error && connections.length === 0) return <ErrorView msg={error} />

  const {profile} = ctx
  const limitReached = profile.traffic.limit_bytes > 0 && profile.traffic.used_bytes >= profile.traffic.limit_bytes
  const expiresSoon = profile.expires_in_days !== null && profile.expires_in_days >= 0 && profile.expires_in_days <= 7
  const maxSlots = Math.max(limit, connections.length)
  const atLimit = connections.length >= maxSlots
  const sortedConnections = [...connections].sort(compareByFormFactorThenName)

  return (
    <Page>
      <h1 className="text-xl font-semibold">{t(greetingKey(), {name: profile.first_name})}</h1>

      <TrafficCard traffic={profile.traffic} />

      <ServerStatusBadge status={status} clientPingMs={clientPing} />

      {profile.expiration_date && (
        <div
          className={`rounded-xl p-3 text-sm ${expiresSoon ? 'bg-amber-500/10 text-amber-700' : 'bg-tg-secondaryBg text-tg-hint'}`}
        >
          {t('home.subscriptionUntil', {
            date: formatDate(profile.expiration_date, i18n.language),
          })}
          {expiresSoon && (
            <button
              type="button"
              className="ml-2 text-tg-link underline"
              onClick={() => tg()?.openTelegramLink(ctx.options.admin_contact_url)}
            >
              {t('common.writeAdmin')}
            </button>
          )}
        </div>
      )}

      {limitReached && (
        <Link to="/limit" className="block rounded-xl bg-rose-500/10 p-3 text-center text-sm text-rose-600">
          {t('home.limitExceededOpen')}
        </Link>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-tg-hint">
          {t('home.connections', {current: connections.length, max: maxSlots})}
        </h2>
        {connections.length === 0 && (
          <div className="rounded-2xl bg-tg-secondaryBg p-4 text-sm text-tg-hint">{t('home.empty')}</div>
        )}
        {sortedConnections.map((c) => (
          <ConnectionCard key={c.id} connection={c} options={ctx.options} />
        ))}
      </section>

      {!atLimit && (
        <Link
          to="/new"
          onClick={hapticLight}
          className="flex items-center justify-center gap-2 rounded-2xl bg-tg-button p-4 text-center font-medium text-tg-buttonText transition active:scale-[0.98]"
        >
          <ButtonIcon>
            <PlusIcon />
          </ButtonIcon>
          <span>{t('home.newConnection')}</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button icon="💬" onClick={() => tg()?.openTelegramLink(ctx.options.admin_contact_url)} className="min-h-12">
          {t('home.admin')}
        </Button>
        <Button
          variant="plain"
          icon="💸"
          onClick={() => tg()?.openLink(ctx.options.donate_url)}
          className="min-h-12 bg-emerald-500/30"
        >
          {t('home.donate')}
        </Button>
      </div>
    </Page>
  )
}

function ErrorView({msg}: {msg: string}) {
  const {t} = useTranslation()
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p>{msg}</p>
      <Button variant="primary" onClick={() => location.reload()}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
