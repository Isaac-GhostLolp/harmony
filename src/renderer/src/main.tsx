import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { MiniPlayer } from './pages/MiniPlayer'
import './styles/globals.css'
import { useLang } from './i18n'
import { IS_ANDROID } from './platform'

// The mini player runs in a second window (#/mini) with no audio engine —
// it mirrors the main window's state via IPC.
const isMini = window.location.hash.startsWith('#/mini')

/** Switching the language redraws the whole app in it (the audio engine
 * lives outside React, so the music keeps playing). */
function LangRoot(): JSX.Element {
  const lang = useLang()
  return isMini ? <MiniPlayer key={lang} /> : <App key={lang} />
}

async function start(): Promise<void> {
  // on Android the platform API (database, music, player notification) is
  // set up in the page first; the desktop gets it from Electron's preload
  if (IS_ANDROID) {
    document.documentElement.classList.add('platform-android')
    const { installAndroidApi } = await import('./platform/android/api')
    await installAndroidApi()
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LangRoot />
    </React.StrictMode>
  )
}

void start()
