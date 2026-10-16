import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { t } from '@/i18n'

/**
 * If one screen breaks, only that screen shows a message — the player, the
 * navigation and the music keep going. Changing screens tries again.
 */
export function ScreenGuard({ children }: { children: ReactNode }): JSX.Element {
  const { pathname } = useLocation()
  return <Guard key={pathname}>{children}</Guard>
}

class Guard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('Harmony: a screen failed', error)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid place-items-center px-6 py-20 text-center">
        <p className="text-3xl">🎧</p>
        <h2 className="mt-3 text-sm font-semibold">{t('Esta tela tropeçou')}</h2>
        <p className="mt-1 max-w-sm text-xs text-muted">
          {t('Algo deu errado ao mostrar esta parte do Harmony. A música continua tocando.')}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--on-accent,#fff)]"
        >
          {t('Tentar de novo')}
        </button>
      </div>
    )
  }
}
