import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initTheme } from './store/themeStore'
import './styles/global.css'
import './styles/desktop.css'

// Apply saved theme (or default) before first render so variables are set.
initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
