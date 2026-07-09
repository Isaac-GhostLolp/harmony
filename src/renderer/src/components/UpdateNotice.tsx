import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { api } from '@/services/api'

type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

/**
 * A quiet update prompt. It only becomes visible while an update is being
 * downloaded or once it's ready to install — never nags, and the user chooses
 * when to restart. Wired to the electron-updater flow in the main process.
 */
export function UpdateNotice(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'none' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let mounted = true
    api.updater?.get().then((s) => {
      if (mounted && s) setStatus(s as UpdateStatus)
    })
    const off = api.updater?.onStatus((s) => {
      setStatus(s as UpdateStatus)
      setDismissed(false) // a new event is worth showing again
    })
    return () => {
      mounted = false
      off?.()
    }
  }, [])

  const show =
    !dismissed &&
    (status.state === 'downloading' || status.state === 'ready')
  if (!show) return null

  return (
    <div className="glass fixed bottom-24 right-4 z-[90] w-72 rounded-2xl p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)]">
          {status.state === 'ready' ? (
            <RefreshCw size={16} className="text-[var(--accent)]" />
          ) : (
            <Download size={16} className="text-[var(--accent)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {status.state === 'downloading' ? (
            <>
              <p className="text-xs font-semibold text-ink">Baixando atualização…</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-raised)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                  style={{ width: `${status.percent}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink">
                Atualização pronta{status.state === 'ready' ? ` (v${status.version})` : ''}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                Reinicie para aplicar. Seus dados são preservados.
              </p>
              <button
                onClick={() => api.updater?.install()}
                className="mt-2 w-full rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:scale-[1.02]"
              >
                Reiniciar e atualizar
              </button>
            </>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted hover:text-ink"
          aria-label="Dispensar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
