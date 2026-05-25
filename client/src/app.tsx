import {useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {HashRouter, Navigate, Route, Routes} from 'react-router-dom'
import {ApiError, authenticate, getOptions, getProfile, listConnections} from './api/client.ts'
import type {AuthResponse, ConnectionsList, Options, Profile} from './api/types.ts'
import {ErrorScreen} from './components/error-screen.tsx'
import {InlineLoader} from './components/inline-loader.tsx'
import {Spinner} from './components/spinner.tsx'
import {ToastHost} from './components/toast.tsx'
import {applyTheme, expandTelegramViewport, tg} from './lib/telegram.ts'
import {ConnectionDetailPage} from './pages/connection-detail.tsx'
import {HomePage} from './pages/home.tsx'
import {InstructionsPage} from './pages/instructions.tsx'
import {LimitExceededPage} from './pages/limit-exceeded.tsx'
import {NewConnectionPage} from './pages/new-connection.tsx'

export interface AppContext {
  auth: AuthResponse
  profile: Profile
  options: Options
  connections: ConnectionsList
  setProfile: (next: Profile) => void
  setConnections: (next: ConnectionsList) => void
}

const INLINE_DEMO =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('inline') === 'demo'

export interface AppProps {
  onReady: () => void
}

export function App({onReady}: AppProps) {
  if (INLINE_DEMO) return <InlineLoaderDemo onReady={onReady} />
  return <AppInner onReady={onReady} />
}

function InlineLoaderDemo({onReady}: AppProps) {
  useEffect(() => {
    onReady()
  }, [onReady])

  return (
    <div className="min-h-screen bg-tg-bg p-8 text-tg-text">
      <h1 className="mb-6 text-lg font-semibold">Inline loader demo</h1>
      <div className="grid grid-cols-3 gap-6">
        <DemoCell label="16px badge">
          <InlineLoader size={16} />
        </DemoCell>
        <DemoCell label="40px default">
          <InlineLoader size={40} />
        </DemoCell>
        <DemoCell label="64px hero-of-page">
          <InlineLoader size={64} />
        </DemoCell>
        <DemoCell label="success @ 40">
          <InlineLoader size={40} state="success" />
        </DemoCell>
        <DemoCell label="error @ 40">
          <InlineLoader size={40} state="error" />
        </DemoCell>
        <DemoCell label="64 + hint (5s)">
          <InlineLoader size={64} showHint hintMessage="Ещё работаем…" />
        </DemoCell>
        <DemoCell label="in button">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-tg-button px-4 py-2 text-tg-buttonText"
          >
            <InlineLoader size={16} />
            Сохраняем…
          </button>
        </DemoCell>
        <DemoCell label="in card">
          <div className="flex items-center gap-3 rounded-xl bg-tg-secondaryBg px-4 py-3">
            <InlineLoader size={20} />
            <span className="text-sm">Ждём ответа от сервера</span>
          </div>
        </DemoCell>
      </div>
    </div>
  )
}

function DemoCell({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-tg-secondaryBg p-4">
      <div className="flex h-24 items-center justify-center">{children}</div>
      <div className="text-xs text-tg-hint">{label}</div>
    </div>
  )
}

function AppInner({onReady}: AppProps) {
  const {t} = useTranslation()
  const tRef = useRef(t)
  tRef.current = t
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [options, setOptions] = useState<Options | null>(null)
  const [connections, setConnections] = useState<ConnectionsList | null>(null)
  const [error, setError] = useState<{code: string; message: string} | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const w = tg()
    expandTelegramViewport()
    applyTheme()

    void (async () => {
      try {
        const initData = w?.initData ?? ''
        if (!initData) {
          setError({code: 'no_init_data', message: tRef.current('auth.noTelegram')})
          return
        }
        const a = await authenticate(initData)
        const [opts, conns] = await Promise.all([getOptions(), listConnections()])
        setAuth(a)
        setProfile(a.profile)
        setOptions(opts)
        setConnections(conns)
        void refreshFreshness(setProfile, setConnections)
      } catch (e) {
        if (e instanceof ApiError) setError({code: e.code, message: e.message})
        else setError({code: 'network', message: tRef.current('common.noConnection')})
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!auth) return
    const timer = setInterval(() => {
      void refreshFreshness(setProfile, setConnections)
    }, 60_000)
    return () => clearInterval(timer)
  }, [auth])

  const contentReady = !loading && (!!error || (!!auth && !!profile && !!options && !!connections))
  useEffect(() => {
    if (contentReady) onReady()
  }, [contentReady, onReady])

  // Memo so that `ctx` identity only changes when its actual fields do —
  // otherwise every render produces a new object and any consumer with `ctx`
  // in a deps array (useFocusEffect, useMemo, ...) will tight-loop on its
  // own setState.
  const ctx = useMemo<AppContext | null>(() => {
    if (!auth || !profile || !options || !connections) return null
    return {auth, profile, options, connections, setProfile, setConnections}
  }, [auth, profile, options, connections])
  if (error) return <ErrorScreen code={error.code} message={error.message} />
  if (!ctx) return <Spinner />

  return (
    <HashRouter>
      <ToastHost />
      <Routes>
        <Route path="/" element={<HomePage ctx={ctx} />} />
        <Route path="/new" element={<NewConnectionPage ctx={ctx} />} />
        <Route path="/c/:id" element={<ConnectionDetailPage ctx={ctx} />} />
        <Route path="/limit" element={<LimitExceededPage ctx={ctx} />} />
        <Route path="/instructions" element={<InstructionsPage ctx={ctx} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

async function refreshFreshness(
  setProfile: (next: Profile) => void,
  setConnections: (next: ConnectionsList) => void,
): Promise<void> {
  const [profileResult, connectionsResult] = await Promise.allSettled([getProfile(), listConnections()])
  let retry = false
  if (profileResult.status === 'fulfilled') {
    setProfile(profileResult.value.profile)
    retry = retry || profileResult.value.refresh_in_progress
  }
  if (connectionsResult.status === 'fulfilled') {
    setConnections(connectionsResult.value)
    retry = retry || connectionsResult.value.refresh_in_progress === true
  }
  if (retry) {
    setTimeout(() => {
      void refreshFreshness(setProfile, setConnections)
    }, 2500)
  }
}
