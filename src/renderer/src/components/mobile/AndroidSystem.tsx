import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { useUiStore } from '@/store/uiStore'
import { closeTopLayer } from './back'
import { startResume } from '@/platform/android/resume'
import { HarmonyMedia } from '@/platform/android/media'
import { usePlayerStore } from '@/store/playerStore'
import { startEveryday } from '@/platform/android/everyday'
import { startAlarmWatch } from '@/platform/android/alarm'

/** the app can be redrawn (a language switch remounts it): resume runs once */
let resumeStarted = false

/**
 * The Android-only bits of the app shell: the back button (close the top
 * layer, then go back a page, and on the first page send the app to the
 * background — the music keeps playing), and a status bar in the theme's
 * colour.
 */
export function AndroidSystem(): null {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // headphones out (or the Bluetooth headset gone): pause instead of playing out loud
  useEffect(() => {
    const sub = HarmonyMedia.addListener('becomingNoisy', () => {
      const p = usePlayerStore.getState()
      if (p.isPlaying) p.togglePlay()
    })
    return () => {
      void sub.then((h) => h.remove())
    }
  }, [])

  // pick up where the listener left off (once per app start)
  useEffect(() => {
    if (resumeStarted) return
    resumeStarted = true
    void startResume()
    // ear care, battery saving, shake to skip, beat vibration; and the musical alarm
    startEveryday()
    startAlarmWatch()
  }, [])

  useEffect(() => {
    const sub = App.addListener('backButton', () => {
      if (closeTopLayer()) return
      const ui = useUiStore.getState()
      if (ui.queueOpen) return ui.toggleQueue()
      if (pathname !== '/') return navigate(-1)
      void App.minimizeApp()
    })
    return () => {
      void sub.then((s) => s.remove())
    }
  }, [navigate, pathname])

  useEffect(() => {
    const paint = (): void => {
      const bg = getComputedStyle(document.body).backgroundColor // "rgb(r, g, b)"
      const [r, g, b] = (bg.match(/\d+/g) ?? ['11', '11', '16']).map(Number)
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
      const light = 0.299 * r + 0.587 * g + 0.114 * b > 150
      void StatusBar.setBackgroundColor({ color: hex }).catch(() => undefined)
      void StatusBar.setStyle({ style: light ? Style.Light : Style.Dark }).catch(() => undefined)
    }
    paint()
    const obs = new MutationObserver(() => requestAnimationFrame(paint))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] })
    return () => obs.disconnect()
  }, [])

  return null
}
