import { useState } from 'react'
import { Palette, X } from 'lucide-react'
import type { Song } from '@/types'
import { api } from '@/services/api'
import { FONTS } from '@/utils/appearance'
import { autoSpec, coverBytes } from '@/utils/coverArt'
import { groupAlbums } from '@/components/views/albums'
import { announceCover } from './CoverCreator'
import { t, tn } from '@/i18n'

const DISMISS_KEY = 'harmony.missingCoversHint'

/**
 * A quiet note above the library when some albums have no cover: one click
 * draws a cover for each of them (style and colours picked from the album's
 * name, so each one looks different but always the same for that album).
 */
export function MissingCovers({ songs }: { songs: Song[] }): JSX.Element | null {
  const missing = groupAlbums(songs.filter((s) => !s.coverPath))
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === String(missing.length)
    } catch {
      return false
    }
  })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  if (missing.length === 0 || (dismissed && !progress)) return null

  const run = async (): Promise<void> => {
    const font = FONTS[2].family
    await document.fonts.load(`800 40px ${font}`)
    setProgress({ done: 0, total: missing.length })
    for (let i = 0; i < missing.length; i++) {
      const a = missing[i]
      try {
        const bytes = await coverBytes(autoSpec(a.title, a.artist ?? '', font), 800)
        const res = (await api.covers.saveCustom(a.songs[0].id, bytes)) as { albumId: number; cover: string | null } | null
        if (res?.cover) announceCover(a.songs[0].id, res.albumId, res.cover)
      } catch {
        /* skip this one, keep going */
      }
      setProgress({ done: i + 1, total: missing.length })
      // let the UI breathe between covers
      await new Promise((r) => setTimeout(r, 0))
    }
    setProgress(null)
  }

  return (
    <div className="fade-rise mb-4 flex items-center gap-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3">
      <Palette size={18} className="shrink-0 text-[var(--accent)]" />
      <div className="min-w-0 flex-1 text-xs">
        {progress ? (
          <>
            <p className="font-semibold">
              {t('Criando capas…')} {progress.done}/{progress.total}
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-raised)]">
              <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="font-semibold">
              {tn(missing.length, '{n} álbum está sem capa', '{n} álbuns estão sem capa')}
            </p>
            <p className="text-muted">{t('O Harmony pode criar uma capa única para cada um — ou use “🎨 Criar capa” no menu ⋯ de uma música.')}</p>
          </>
        )}
      </div>
      {!progress && (
        <>
          <button onClick={run} className="press shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white">
            {t('Criar capas')}
          </button>
          <button
            onClick={() => {
              setDismissed(true)
              try {
                localStorage.setItem(DISMISS_KEY, String(missing.length))
              } catch {
                /* hidden for this session */
              }
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
            aria-label={t('Dispensar')}
          >
            <X size={14} />
          </button>
        </>
      )}
    </div>
  )
}
