import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { api } from '@/services/api'

/**
 * "✨ Atualizar Metadados" — fetches artist photos and missing covers online,
 * showing live progress. Never overwrites data the user already has. Calls
 * onDone so the caller can refresh its list.
 */
export function RefreshMetadataButton({ onDone }: { onDone?: () => void }): JSX.Element {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null
  )
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    const off = api.metadata?.onProgress((p) => setProgress(p))
    return () => off?.()
  }, [])

  const run = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    setResult(null)
    setProgress({ done: 0, total: 0, label: 'Preparando…' })
    try {
      const r = (await api.metadata.refresh()) as {
        artistsUpdated: number
        coversUpdated: number
        total: number
      }
      setResult(
        r.total === 0
          ? 'Tudo já estava atualizado!'
          : `${r.artistsUpdated} fotos e ${r.coversUpdated} capas atualizadas.`
      )
      onDone?.()
    } catch {
      setResult('Não foi possível atualizar agora.')
    } finally {
      setRunning(false)
      setProgress(null)
      window.setTimeout(() => setResult(null), 5000)
    }
  }

  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="flex items-center gap-3">
      {running && progress && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--bg-raised)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="max-w-[140px] truncate text-[11px] text-muted">{progress.label}</span>
        </div>
      )}
      {result && !running && <span className="text-[11px] text-muted">{result}</span>}
      <button
        onClick={run}
        disabled={running}
        className="press flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {running ? <Spinner size={14} /> : <Sparkles size={14} />}
        Atualizar Metadados
      </button>
    </div>
  )
}
