import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useFlairStore } from '@/store/flairStore'
import { playUiSound, type UiSound } from '@/utils/uiSounds'

/**
 * Plays the interface sounds (utils/uiSounds) for what the listener does:
 * a click on a button, a switch turned on or off, a song favourited, a page
 * changed. One listener for the whole app; nothing when the sounds are off.
 */
const CLICKABLE = 'button:not(:disabled), a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary'

export function UiSounds(): null {
  const pack = useFlairStore((s) => s.uiSounds)
  const volume = useFlairStore((s) => s.uiVolume)
  const { pathname } = useLocation()
  const first = useRef(true)
  const lastClick = useRef(0)

  useEffect(() => {
    if (pack === 'off') return
    const onClick = (e: MouseEvent): void => {
      const el = e.target instanceof Element ? e.target.closest(CLICKABLE + ', [role="switch"]') : null
      if (!el) return
      lastClick.current = performance.now()
      let sound: UiSound = 'click'
      if (el.getAttribute('role') === 'switch') {
        // the state before this click: turning it on or off
        sound = el.getAttribute('aria-checked') === 'true' ? 'off' : 'on'
      } else if (/favorit/i.test(el.getAttribute('aria-label') ?? '')) {
        sound = 'favorite'
      }
      playUiSound(pack, sound, volume)
    }
    // capture: before the click changes the page (and the switch's aria-checked)
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pack, volume])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    // a page changed by a click already made its sound; this one is for Back, shortcuts…
    if (performance.now() - lastClick.current > 400) playUiSound(pack, 'nav', volume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
