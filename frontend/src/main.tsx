import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initTheme } from './store/themeStore'
import './styles/global.css'
import './styles/desktop.css'

if (import.meta.env.VITE_DEMO) {
  import('./demo/mockApi').then(({ setupDemoMode }) => setupDemoMode())
    .then(boot)
} else {
  boot()
}

function boot() {
  initTheme()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
