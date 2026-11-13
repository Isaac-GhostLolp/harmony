import { useEffect, useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { api } from '@/services/api'
import { t, tn } from '@/i18n'

/**
 * "✨ Atualizar metadados" — fetches artist photos, missing covers and genres
 * online, showing live progress, and tidies the artist list (no more artists
 * with zero songs). The usual button looks only for what was never looked
 * for, so a second run is quick; "Buscar tudo de novo" tries everything
 * missing again. Never overwrites data the user already has. Calls onDone so
 * the caller can refresh its list.
 */
interface Result {
  artistsUpdated: number
  coversUpdated: number
  genresUpdated: number
  total: number
  /** missing things looked for recently, not tried again this time */
  waiting?: number
  /** artists with no songs that were tidied away */
  artistsRemoved?: number
}

export function RefreshMetadataButton({ onDone }: { onDone?: () => void }): JSX.Element {
  const [running, setRunning] = useState<'new' | 'all' | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    const off = api.metadata?.onProgress((p) => setProgress(p))
    return () => off?.()
  }, [])

  const run = async (mode: 'new' | 'all'): Promise<void> => {
    if (running) return
    setRunning(mode)
    setResult(null)
    setProgress({ done: 0, total: 0, label: t('Preparando…') })
    try {
      const r = (await api.metadata.refresh(mode)) as Result
      const parts: string[] = []
      if (r.total > 0)
        parts.push(
          t('{photos} fotos, {covers} capas e {genres} gêneros atualizados.', {
            photos: r.artistsUpdated,
            covers: r.coversUpdated,
            genres: r.genresUpdated
          })
        )
      else parts.push(t('Nada novo para buscar.'))
      if (r.artistsRemoved) parts.push(tn(r.artistsRemoved, '{n} artista sem músicas removido.', '{n} artistas sem músicas removidos.'))
      if (mode === 'new' && r.waiting) parts.push(t('(o que já foi buscado sem sucesso fica para “Buscar tudo de novo”)'))
      setResult(parts.join(' '))
      onDone?.()
    } catch {
      setResult(t('Não foi possível atualizar agora.'))
    } finally {
      setRunning(null)
      setProgress(null)
      window.setTimeout(() => setResult(null), 8000)
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {running && progress && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--bg-raised)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="max-w-[160px] truncate text-[11px] text-muted">
            {progress.total > 0 ? `${progress.done}/${progress.total} · ` : ''}
            {progress.label}
          </span>
        </div>
      )}
      {result && !running && <span className="max-w-[320px] text-[11px] text-muted">{result}</span>}
      <button
        onClick={() => void run('all')}
        disabled={running !== null}
        title={t('Procura de novo tudo o que ainda falta, mesmo o que já foi buscado sem sucesso. Demora mais.')}
        className="press flex items-center gap-1.5 rounded-full bg-[var(--bg-raised)] px-3.5 py-2 text-xs font-medium text-muted hover:text-ink disabled:opacity-60"
      >
        {running === 'all' ? <Spinner size={13} /> : <RotateCcw size={13} />}
        {t('Buscar tudo de novo')}
      </button>
      <button
        onClick={() => void run('new')}
        disabled={running !== null}
        title={t('Busca só o que é novo (o que nunca foi procurado) e arruma a lista de artistas. Rápido.')}
        className="press flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {running === 'new' ? <Spinner size={14} /> : <Sparkles size={14} />}
        {t('Atualizar metadados')}
      </button>
    </div>
  )
}
