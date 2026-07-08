import { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import type { SearchResults } from '@/types'
import { api } from '@/services/api'
import { SongList } from '@/components/SongList'
import { EmptyState } from '@/components/EmptyState'

export function Search(): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)

  // Debounced real-time search
  useEffect(() => {
    if (!query.trim()) return setResults(null)
    const t = setTimeout(async () => {
      setResults((await api.library.search(query.trim())) as SearchResults)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div>
      <div className="glass mb-6 flex items-center gap-3 rounded-full px-4 py-2.5">
        <SearchIcon size={16} className="text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar músicas, álbuns, artistas, playlists…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      {!results && (
        <EmptyState title="O que você quer ouvir?" hint="Pesquise por título, artista, álbum ou gênero." />
      )}

      {results && (
        <div className="flex flex-col gap-6">
          {results.songs.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">Músicas</h2>
              <SongList songs={results.songs} />
            </section>
          )}
          {results.artists.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">Artistas</h2>
              <div className="flex flex-wrap gap-2">
                {results.artists.map((a) => (
                  <span key={a.id} className="glass rounded-full px-4 py-1.5 text-xs">{a.name}</span>
                ))}
              </div>
            </section>
          )}
          {results.albums.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">Álbuns</h2>
              <div className="flex flex-wrap gap-2">
                {results.albums.map((a) => (
                  <span key={a.id} className="glass rounded-full px-4 py-1.5 text-xs">
                    {a.title} <span className="text-muted">· {a.artist ?? '—'}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
          {results.songs.length + results.albums.length + results.artists.length === 0 && (
            <EmptyState title="Nenhum resultado" hint={`Nada encontrado para "${query}".`} />
          )}
        </div>
      )}
    </div>
  )
}
