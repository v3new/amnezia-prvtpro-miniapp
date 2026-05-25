import React from 'react'
import ReactDOM from 'react-dom/client'
import {App} from './app.tsx'
import './i18n/index.ts'
import './styles.css'

export interface StartAppOptions {
  onReady: () => void
}

export function startApp(root: HTMLElement, options: StartAppOptions) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App onReady={options.onReady} />
    </React.StrictMode>,
  )
}
