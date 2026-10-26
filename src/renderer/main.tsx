import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installBridge, storedCompanionKey } from './bridge'
import { PairScreen } from './components/companion/PairScreen'
import { ThemeProvider } from './contexts/ThemeContext'
import '@fontsource-variable/archivo/wdth.css'
import './styles/global.css'
import { applyCachedTheme } from './theme'

installBridge(window, document)
// The last theme this screen used, before the first paint; ThemeProvider then reads the saved one.
applyCachedTheme(window)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {window.astrorepoMode === 'companion' && storedCompanionKey(window) === '' ? <PairScreen /> : <App />}
    </ThemeProvider>
  </React.StrictMode>
)
