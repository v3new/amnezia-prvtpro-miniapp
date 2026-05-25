import {useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import logoRaw from '../assets/amnezia-logo.svg?raw'

export type InlineLoaderState = 'idle' | 'success' | 'error'

export interface InlineLoaderProps {
  size?: number
  state?: InlineLoaderState
  className?: string
  /** Show "still working…" / "slow connection" text under the loader after long idle. */
  showHint?: boolean
  /** Override the hint message manually (skips auto-timing). */
  hintMessage?: string
}

let instanceSeed = 1

function makeRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function applyInlinePanels(svg: SVGSVGElement, seed: number) {
  const group = svg.querySelector('g[mask]')
  if (!group) return
  const paths = Array.from(group.querySelectorAll(':scope > path')) as SVGPathElement[]
  const r = makeRand(seed)

  paths.forEach((path, i) => {
    const bbox = path.getBBox()
    const area = Math.max(bbox.width * bbox.height, 1)
    const weight = Math.min(1, Math.max(0.15, area / (400 * 400)))

    const angleA = r() * Math.PI * 2
    const distA = (1 - weight) * 260 + r() * 120
    const sx = Math.cos(angleA) * distA
    const sy = Math.sin(angleA) * distA
    const sr = (r() - 0.5) * 140 * (1 - weight * 0.3)

    const angleB = (angleA + Math.PI * (0.45 + r() * 0.55)) % (Math.PI * 2)
    const distB = (1 - weight) * 260 + r() * 120
    const ex = Math.cos(angleB) * distB
    const ey = Math.sin(angleB) * distB
    const er = (r() - 0.5) * 140 * (1 - weight * 0.3)

    path.classList.add('inline-loader__panel')
    path.style.setProperty('--sx', `${sx}px`)
    path.style.setProperty('--sy', `${sy}px`)
    path.style.setProperty('--sr', `${sr}deg`)
    path.style.setProperty('--ex', `${ex}px`)
    path.style.setProperty('--ey', `${ey}px`)
    path.style.setProperty('--er', `${er}deg`)
    // Tiny stagger so panels don't lock-step pixel-perfectly.
    const stagger = -((i * 27) % 220)
    path.style.setProperty('--panel-stagger', `${stagger}ms`)
    if (i === paths.length - 1) {
      path.classList.add('inline-loader__panel--falling')
    }
  })
}

export function InlineLoader({
  size = 40,
  state = 'idle',
  className = '',
  showHint = false,
  hintMessage,
}: InlineLoaderProps) {
  const {t} = useTranslation()
  const seed = useMemo(() => {
    instanceSeed = (instanceSeed * 31 + 7) % 999_983
    return instanceSeed
  }, [])
  const hostRef = useRef<HTMLDivElement>(null)
  const [autoHint, setAutoHint] = useState<'none' | 'slow' | 'very-slow'>('none')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const svg = host.querySelector('svg')
    if (svg instanceof SVGSVGElement) {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      svg.classList.add('inline-loader__svg')
      applyInlinePanels(svg, seed)
    }
  }, [seed])

  useEffect(() => {
    if (!showHint || state !== 'idle') {
      setAutoHint('none')
      return
    }
    const slow = setTimeout(() => setAutoHint('slow'), 5000)
    const verySlow = setTimeout(() => setAutoHint('very-slow'), 11_000)
    return () => {
      clearTimeout(slow)
      clearTimeout(verySlow)
    }
  }, [showHint, state])

  const hint =
    hintMessage ??
    (autoHint === 'very-slow' ? t('loader.slowConnection') : autoHint === 'slow' ? t('loader.stillWorking') : null)

  const sizeBucket = size <= 20 ? 'sm' : size >= 56 ? 'lg' : 'md'

  return (
    <div
      className={`inline-loader inline-loader--${state} ${className}`}
      data-size={sizeBucket}
      role="status"
      aria-live="polite"
      aria-label={t('common.loading')}
    >
      <div className="inline-loader__box" style={{width: size, height: size}}>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Logo SVG markup comes from a bundled Vite import. */}
        <div className="inline-loader__svg-wrap" ref={hostRef} dangerouslySetInnerHTML={{__html: logoRaw}} />
        {state === 'success' && (
          <svg
            className="inline-loader__check"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4.5 12.5l4.8 4.8L19.5 7" pathLength={1} />
          </svg>
        )}
      </div>
      {hint && sizeBucket !== 'sm' && <div className="inline-loader__hint">{hint}</div>}
    </div>
  )
}
