import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderPlus, RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { SongList } from '@/components/SongList'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { FilterChips, type FilterChip } from '@/components/FilterChips'

type LibFilter =
  | 'all'
  | 'recent'
  | 'most'
  | 'never'
  | 'lastPlayed'
  | 'favorites'
  | `genre:${string}`

/** Applies the active filter (sort/subset) to the song list. */
function applyFilter(songs: Song[], filter: LibFilter): Song[] {
  switch (filter) {
    case 'recent':
      return [...songs].sort((a, b) => b.addedAt - a.addedAt)
    case 'most':
      return songs.filter((s) => s.playCount > 0).sort((a, b) => b.playCount - a.playCount)
    case 'never':
      return songs.filter((s) => s.playCount === 0)
    case 'lastPlayed':
      return songs
        .filter((s) => s.lastPlayed)
        .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    case 'favorites':
      return songs.filter((s) => s.favorite)
    default:
      if (filter.startsWith('genre:')) {
        const g = filter.slice(6)
        return songs.filter((s) => (s.genre ?? 'Sem gênero') === g)
      }
      return songs
  }
}

export function Library(): JSX.Element {
  const [songs, setSongs] = useState<Song[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [filter, setFilter] = useState<LibFilter>('all')

  // Build the chip list: fixed filters + a chip per genre present in the library.
  const chips = useMemo<FilterChip<LibFilter>[]>(() => {
    const genres = Array.from(
      new Set(songs.map((s) => s.genre).filter((g): g is string => Boolean(g)))
    ).sort()
    const base: FilterChip<LibFilter>[] = [
      { id: 'all', label: 'Todas' },
      { id: 'recent', label: 'Adicionadas recentemente' },
      { id: 'most', label: 'Mais reproduzidas' },
      { id: 'never', label: 'Nunca reproduzidas' },
      { id: 'lastPlayed', label: 'Última reprodução' },
      { id: 'favorites', label: 'Favoritas' }
    ]
    return [...base, ...genres.map((g) => ({ id: `genre:${g}` as LibFilter, label: g }))]
  }, [songs])

  const filtered = useMemo(() => applyFilter(songs, filter), [songs, filter])

  const load = useCallback(async () => {
    setSongs((await api.library.getSongs()) as Song[])
  }, [])

  useEffect(() => {
    load()
    const off = api.library.onScanProgress((p) => setProgress(p))
    return off
  }, [load])

  const refreshLibrary = async (): Promise<void> => {
    setScanning(true)
    setRefreshMsg(null)
    try {
      const r = (await api.library.refresh()) as { added: number; removed: number }
      setRefreshMsg(
        r.added === 0 && r.removed === 0
          ? 'Tudo em dia — nenhuma mudança nas pastas.'
          : `${r.added} nova(s) adicionada(s), ${r.removed} removida(s).`
      )
      await load()
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  const importFolder = async (): Promise<void> => {
    setScanning(true)
    try {
      const result = await api.library.selectAndScan()
      if (result) {
        await api.settings.set('libraryFolder', (result as { folder: string }).folder)
        await load()
      }
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p))
    if (paths.length === 0) return
    setScanning(true)
    try {
      await api.library.importPaths(paths)
      await load()
    } finally {
      setScanning(false)
    }
  }

  return (
    <div
      className={`relative h-full ${dragOver ? 'outline-dashed outline-2 outline-[var(--accent)] rounded-2xl' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <PageHeader
        title="Biblioteca"
        subtitle={
          refreshMsg ?? `${songs.length} músicas · arraste arquivos ou pastas para importar`
        }
        actions={
          <div className="flex items-center gap-2">
          <button
            onClick={refreshLibrary}
            disabled={scanning}
            title="Procura músicas novas nas pastas já importadas e remove as que sumiram do disco"
            className="flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-4 py-2 text-xs font-semibold text-ink transition-transform hover:scale-[1.03] disabled:opacity-60"
          >
            {scanning ? <Spinner size={14} icon="rotate" /> : <RefreshCw size={14} />} Atualizar
          </button>
          <button
            onClick={importFolder}
            disabled={scanning}
            className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
          >
            {scanning ? <Spinner size={14} /> : <FolderPlus size={14} />}
            {scanning
              ? progress
                ? `Analisando ${progress.processed}/${progress.total}`
                : 'Importando…'
              : 'Importar pasta'}
          </button>
          </div>
        }
      />

      {songs.length === 0 && !scanning ? (
        <EmptyState
          title="Sua biblioteca está vazia"
          hint="Clique em Importar pasta ou arraste seus arquivos MP3, FLAC, WAV, OGG, AAC ou M4A para cá."
        />
      ) : (
        <>
          {songs.length > 0 && (
            <FilterChips chips={chips} active={filter} onChange={setFilter} />
          )}
          {filtered.length === 0 ? (
            <div className="fade-in">
              <EmptyState
                title={
                  filter === 'never'
                    ? 'Você já ouviu tudo!'
                    : filter === 'favorites'
                      ? 'Nenhuma favorita ainda'
                      : 'Nada por aqui'
                }
                hint={
                  filter === 'never'
                    ? 'Não há músicas sem reprodução — sua biblioteca está bem aproveitada.'
                    : filter === 'favorites'
                      ? 'Toque no coração de uma música para guardá-la aqui.'
                      : 'Nenhuma música corresponde a este filtro.'
                }
              />
            </div>
          ) : (
            <div key={filter} className="fade-in">
              <SongList songs={filtered} onChanged={load} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
