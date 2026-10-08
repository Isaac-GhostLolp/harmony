/**
 * Ultra Fast Mode — a fast, economical Harmony for weak machines.
 *
 * One switch, read by everything heavy:
 *   • the UI (globals.css, `html.ultra-fast`): no backdrop blur, no shadows,
 *     no animations or transitions, no blurred cover behind the app;
 *   • canvases (Worlds, Visualizer): drawn at 1× pixel density and capped at
 *     30 fps, which cuts their cost to roughly a quarter on HiDPI screens;
 *   • small loops (the LED logo, breathing covers, the intro) stand still;
 *   • the karaoke clock ticks at 30 fps instead of 60.
 *
 * The flag lives in a module (not React) so render loops can read it every
 * frame for free; components that need to re-render use useUltraFast(). It is
 * kept in localStorage so it applies before the first paint (no flash of the
 * heavy UI on a slow machine), and mirrored to the app settings.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'harmony.ultraFast'

let ultra = (() => {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
})()
if (ultra) document.documentElement.classList.add('ultra-fast')

const listeners = new Set<(on: boolean) => void>()

export function isUltraFast(): boolean {
  return ultra
}

export function setUltraFast(on: boolean): void {
  if (on === ultra) return
  ultra = on
  document.documentElement.classList.toggle('ultra-fast', on)
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* the class still applies for this session */
  }
  window.harmony?.settings.set('ultraFast', on)
  for (const fn of listeners) fn(on)
}

export function onUltraFastChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Pixel density for canvases: 1× in Ultra Fast Mode, up to 2× otherwise. */
export function canvasDpr(): number {
  return ultra ? 1 : Math.min(window.devicePixelRatio || 1, 2)
}

/** Minimum time between frames for the big canvases, in ms (0 = every frame). */
export function frameBudgetMs(): number {
  return ultra ? 1000 / 30 - 2 : 0
}

/** React: re-renders when the mode is switched. */
export function useUltraFast(): boolean {
  return useSyncExternalStore(onUltraFastChange, isUltraFast)
}
