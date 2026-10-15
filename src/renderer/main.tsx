import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installBridge, storedCompanionKey } from './bridge'
import { PairScreen } from './components/companion/PairScreen'
import './styles/global.css'

installBridge(window, document)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.astrorepoMode === 'companion' && storedCompanionKey(window) === '' ? <PairScreen /> : <App />}
  </React.StrictMode>
)
