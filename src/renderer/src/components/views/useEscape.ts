import { useEffect } from 'react'

/**
 * Close a dialog with Esc. A dialog opened over another one passes `top`, so
 * its Esc closes only itself (it hears the key first and keeps it).
 */
export function useEscape(onClose: () => void, top = false): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (top) e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, top)
    return () => window.removeEventListener('keydown', onKey, top)
  }, [onClose, top])
}
