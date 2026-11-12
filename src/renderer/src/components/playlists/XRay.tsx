import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { Playlist } from '@/types'
import type { PlaylistStats } from '../../../../core/playlistsPlus'
import { api } from '@/services/api'
import { t, tn } from '@/i18n'

/**
 * The playlist's X-ray (Raio-X): how long it is, who's in it, its genres as
 * a "DNA" strip, its decades, and how much of it you've heard.
 */

function hours(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? t('{h} h {m} min', { h, m }) : t('{m} min', { m })
}

/** a stable colour per genre */
function hue(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}

export function XRay({ playlist, onClose }: { playlist: Playlist; onClose: () => void }): JSX.Element {
  const [s, setS] = useState<PlaylistStats | null>(null)
  useEffect(() => {
    void (api.playlists.stats(playlist.id) as Promise<PlaylistStats>).then(setS)
  }, [playlist.id])
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const genreTotal = s ? s.genres.reduce((n, g) => n + g.count, 0) : 0
  const decadeMax = s ? Math.max(1, ...s.decades.map((d) => d.count)) : 1

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="glass fade-in max-h-[90vh] w-[min(96vw,560px)] overflow-y-auto rounded-2xl p-6"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ background: playlist.color ? `linear-gradient(160deg, ${playlist.color}33, var(--bg-base) 60%)` : undefined }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">{t('Raio-X')}</p>
            <h2 className="mt-1 text-xl font-bold">
              {playlist.emoji ? `${playlist.emoji} ` : ''}
              {playlist.name}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label={t('Fechar')}>
            <X size={18} />
          </button>
        </div>
        {!s ? (
          <p className="mt-6 text-sm text-muted">…</p>
        ) : s.songs === 0 ? (
          <p className="mt-6 text-sm text-muted">{t('A playlist está vazia.')}</p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [tn(s.songs, '{n} música', '{n} músicas'), t('no total')],
                [hours(s.duration), t('de duração')],
                [hours(s.listened), t('já ouvidas')],
                [String(s.favorites), t('favoritas')]
              ].map(([big, small]) => (
                <div key={small} className="rounded-xl bg-[var(--bg-raised)] p-3">
                  <p className="text-base font-bold">{big}</p>
                  <p className="text-[11px] text-muted">{small}</p>
                </div>
              ))}
            </div>

            {s.genres.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold">{t('🧬 DNA da playlist')}</p>
                <div className="mt-2 flex h-4 overflow-hidden rounded-full">
                  {s.genres.map((g) => (
                    <div
                      key={g.name}
                      title={`${g.name} · ${g.count}`}
                      style={{ width: `${(g.count / genreTotal) * 100}%`, background: `hsl(${hue(g.name)} 70% 58%)` }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {s.genres.map((g) => (
                    <span key={g.name} className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${hue(g.name)} 70% 58%)` }} />
                      {g.name} · {Math.round((g.count / genreTotal) * 100)}%
                    </span>
                  ))}
                </div>
              </div>
            )}

            {s.artists.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold">{t('🎤 Quem mais aparece')}</p>
                <div className="mt-2 space-y-1.5">
                  {s.artists.map((a) => (
                    <div key={a.name} className="flex items-center gap-2 text-xs">
                      <span className="w-32 truncate">{a.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-raised)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(a.count / s.artists[0].count) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right tabular-nums text-muted">{a.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.decades.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold">{t('📅 Décadas')}</p>
                <div className="mt-2 flex h-20 items-end gap-2">
                  {s.decades.map((d) => (
                    <div key={d.name} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t-md bg-[var(--accent)]" style={{ height: `${(d.count / decadeMax) * 56 + 4}px`, opacity: 0.55 + (d.count / decadeMax) * 0.45 }} />
                      <span className="text-[10px] text-muted">{d.name}</span>
                    </div>
                  ))}
                </div>
                {s.oldest && s.newest && s.oldest !== s.newest && (
                  <p className="mt-1 text-[11px] text-muted">{t('De {a} a {b}', { a: s.oldest, b: s.newest })}</p>
                )}
              </div>
            )}
            <p className="mt-5 text-[11px] text-muted">{tn(s.plays, 'Tocada {n} vez no total', 'Tocada {n} vezes no total')}</p>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
