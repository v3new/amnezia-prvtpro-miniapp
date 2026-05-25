import logoRaw from './assets/amnezia-logo.svg?raw'

type Phase = 'noise' | 'assemble' | 'flash' | 'name' | 'hold' | 'exit'

export interface SplashScreenController {
  finish: () => void
}

interface NoiseCell {
  x: number
  y: number
  c0: string
  c1: string
  c2: string
  c3: string
  delay: number
  duration: number
}

const PALETTE = [
  '#F18928',
  '#FEDAA5',
  '#80C9C1',
  '#87ADD4',
  '#95C7DB',
  '#9B8BC1',
  '#6E5EA6',
  '#F8B570',
  '#F8C9D1',
  '#DDC4E0',
  '#A29EA1',
  '#797AAA',
]

const GRID = 16
const STAGE_PX = 320
const MIN_DURATION_MS = 2600
const EXIT_DURATION_MS = 420

function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)] as T
}

function computeNoise(): NoiseCell[] {
  const r = rand(42)
  const cells: NoiseCell[] = []
  const cellSize = STAGE_PX / GRID
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      cells.push({
        x: x * cellSize,
        y: y * cellSize,
        c0: pick(PALETTE, r),
        c1: pick(PALETTE, r),
        c2: pick(PALETTE, r),
        c3: pick(PALETTE, r),
        delay: Math.floor(r() * 320),
        duration: 160 + Math.floor(r() * 200),
      })
    }
  }
  return cells
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function getPhasePin(): Phase | null {
  const p = new URLSearchParams(window.location.search).get('hero')
  const valid: Phase[] = ['noise', 'assemble', 'flash', 'name', 'hold']
  return valid.includes(p as Phase) ? (p as Phase) : null
}

interface TelegramWebAppLite {
  initDataUnsafe?: {
    user?: {
      language_code?: string
    }
  }
  themeParams?: Record<string, string>
}

function getTelegramWebApp(): TelegramWebAppLite | undefined {
  return (window as typeof window & {Telegram?: {WebApp?: TelegramWebAppLite}}).Telegram?.WebApp
}

function applyTelegramTheme() {
  const params = getTelegramWebApp()?.themeParams
  if (!params) return
  const root = document.documentElement
  if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color)
  if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color)
}

function getTagline() {
  const language =
    getTelegramWebApp()?.initDataUnsafe?.user?.language_code ?? document.documentElement.lang ?? navigator.language
  if (language.toLowerCase().startsWith('en')) {
    return {lead: 'Internet freedom', accent: 'has a name'}
  }
  return {lead: 'У свободного интернета', accent: 'есть имя'}
}

function createNoiseMarkup() {
  const cellSize = STAGE_PX / GRID + 0.5
  return computeNoise()
    .map(
      (c) =>
        `<rect x="${c.x}" y="${c.y}" width="${cellSize}" height="${cellSize}" class="hero-loader__cell" style="--c0:${c.c0};--c1:${c.c1};--c2:${c.c2};--c3:${c.c3};--cell-delay:${c.delay}ms;--cell-duration:${c.duration}ms"></rect>`,
    )
    .join('')
}

function applyPanelAnimations(root: SVGSVGElement) {
  const group = root.querySelector('g[mask]')
  if (!group) return
  const paths = Array.from(group.querySelectorAll(':scope > path')) as SVGPathElement[]
  const r = rand(13)
  paths.forEach((path, i) => {
    const bbox = path.getBBox()
    const area = Math.max(bbox.width * bbox.height, 1)
    const weight = Math.min(1, Math.max(0.15, area / (400 * 400)))
    const angle = r() * Math.PI * 2
    const dist = (1 - weight) * 140 + r() * 60
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist
    const rot = (r() - 0.5) * 110 * (1 - weight * 0.3)
    const delay = Math.floor(r() * 320)
    const duration = 620 + Math.floor(r() * 280)
    path.classList.add('hero-loader__panel')
    path.style.setProperty('--dx', `${dx}px`)
    path.style.setProperty('--dy', `${dy}px`)
    path.style.setProperty('--rot', `${rot}deg`)
    path.style.setProperty('--panel-delay', `${delay}ms`)
    path.style.setProperty('--panel-duration', `${duration}ms`)
    path.style.setProperty('--panel-index', String(i))
  })
}

function setPhase(root: HTMLElement, phase: Phase) {
  root.dataset.phase = phase
}

export function mountSplashScreen(): SplashScreenController {
  applyTelegramTheme()
  const phasePin = getPhasePin()
  const start = Date.now()
  const tagline = getTagline()
  const root = document.createElement('div')
  root.className = 'hero-loader'
  root.dataset.phase = phasePin ?? 'noise'
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('aria-label', 'Loading')
  root.innerHTML = `
    <div class="hero-loader__stage">
      <div class="hero-loader__svg-wrap">${logoRaw}</div>
      <svg class="hero-loader__noise" viewBox="0 0 ${STAGE_PX} ${STAGE_PX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${createNoiseMarkup()}</svg>
      <div class="hero-loader__flash" aria-hidden="true"></div>
    </div>
    <div class="hero-loader__name">
      <span class="hero-loader__name-display">
        <span class="hero-loader__name-lead">${tagline.lead}</span>
        <span class="hero-loader__name-accent">${tagline.accent}</span>
      </span>
    </div>
  `
  document.body.append(root)

  const svg = root.querySelector('svg:not(.hero-loader__noise)')
  if (svg instanceof SVGSVGElement) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svg.classList.add('hero-loader__svg')
    applyPanelAnimations(svg)
  }

  if (!phasePin && prefersReducedMotion()) setPhase(root, 'hold')
  else if (!phasePin) {
    window.setTimeout(() => setPhase(root, 'assemble'), 380)
    window.setTimeout(() => setPhase(root, 'flash'), 1000)
    window.setTimeout(() => setPhase(root, 'name'), 1200)
    window.setTimeout(() => setPhase(root, 'hold'), 1900)
  }

  let finishing = false
  return {
    finish: () => {
      if (phasePin || finishing) return
      finishing = true
      const elapsed = Date.now() - start
      const wait = Math.max(0, MIN_DURATION_MS - elapsed)
      window.setTimeout(() => {
        root.classList.add('hero-loader--exit')
        setPhase(root, 'exit')
        window.setTimeout(() => root.remove(), EXIT_DURATION_MS)
      }, wait)
    },
  }
}
