import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installBridge, storedCompanionKey } from './bridge'
import { PairScreen } from './components/companion/PairScreen'
import './styles/global.css'
import { applyCachedTheme } from './theme'

installBridge(window, document)
// The last theme this screen used, before the first paint; ThemeProvider then reads the saved one.
applyCachedTheme(window)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.astrorepoMode === 'companion' && storedCompanionKey(window) === '' ? <PairScreen /> : <App />}
  </React.StrictMode>
)
