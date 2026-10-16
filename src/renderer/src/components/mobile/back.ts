import { useEffect } from 'react'

/**
 * Android's back button/gesture closes whatever is open on top (the player,
 * a sheet, the queue) before it goes back a page. Each open layer registers
 * a closer; the newest one wins.
 */
const closers: (() => void)[] = []

export function useBackCloses(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    closers.push(close)
    return () => {
      const i = closers.lastIndexOf(close)
      if (i >= 0) closers.splice(i, 1)
    }
  }, [open, close])
}

/** closes the top layer; false when nothing was open */
export function closeTopLayer(): boolean {
  const close = closers.pop()
  if (!close) return false
  close()
  return true
}
