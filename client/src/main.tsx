import {expandTelegramViewport, readyTelegramApp} from './lib/telegram.ts'
import {mountSplashScreen} from './splash-screen.ts'
import './splash-screen.css'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')
const appRoot = root

expandTelegramViewport()
const splash = mountSplashScreen()
readyTelegramApp()

void start()

async function start() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('dev')) {
    const {installDevMock} = await import('./lib/dev-mock.ts')
    installDevMock()
  }

  const {startApp} = await import('./bootstrap.tsx')
  startApp(appRoot, {
    onReady: splash.finish,
  })
}
