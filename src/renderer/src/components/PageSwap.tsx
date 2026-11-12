import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useFlairStore } from '@/store/flairStore'

/**
 * The page transition (Personalização → Detalhes): each page comes in with
 * a fade, a slide or a zoom. Only the entrance animates, so nothing waits.
 */
export function PageSwap({ children }: { children: ReactNode }): JSX.Element {
  const { pathname } = useLocation()
  const transition = useFlairStore((s) => s.transition)
  if (transition === 'none') return <>{children}</>
  return (
    <div key={pathname} className={`page-swap-${transition}`}>
      {children}
    </div>
  )
}
