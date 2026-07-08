import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { MiniPlayer } from './pages/MiniPlayer'
import './styles/globals.css'

// The mini player runs in a second window (#/mini) with no audio engine —
// it mirrors the main window's state via IPC.
const isMini = window.location.hash.startsWith('#/mini')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isMini ? <MiniPlayer /> : <App />}</React.StrictMode>
)
