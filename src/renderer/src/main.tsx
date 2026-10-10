import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { MiniPlayer } from './pages/MiniPlayer'
import './styles/globals.css'
import { useLang } from './i18n'

// The mini player runs in a second window (#/mini) with no audio engine —
// it mirrors the main window's state via IPC.
const isMini = window.location.hash.startsWith('#/mini')

/** Switching the language redraws the whole app in it (the audio engine
 * lives outside React, so the music keeps playing). */
function LangRoot(): JSX.Element {
  const lang = useLang()
  return isMini ? <MiniPlayer key={lang} /> : <App key={lang} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangRoot />
  </React.StrictMode>
)
