import React from 'react'
import ReactDOM from 'react-dom/client'
import { Desktop } from './desktop/Desktop'
import './styles/global.css'
import './styles/desktop.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Desktop />
  </React.StrictMode>,
)
