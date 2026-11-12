import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileMusic, Image as ImageIcon, X } from 'lucide-react'
import type { Playlist, Song } from '@/types'
import type { ExportedPlaylist } from '../../../../core/playlistsPlus'
import { api } from '@/services/api'
import { deliver, fileNameFor, makePlaylistCard, toM3U } from '@/utils/playlistFiles'
import { Spinner } from '@/components/Spinner'
import { IS_ANDROID } from '@/platform'
import { t, tn } from '@/i18n'

/** Share and export a playlist: a card for stories, an .m3u, or the Harmony's own file */
export function SharePlaylist({
  playlist,
  songs,
  mosaic,
  onClose
}: {
  playlist: Playlist
  songs: Song[]
  mosaic: string[]
  onClose: () => void
}): JSX.Element {
  const [card, setCard] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const minutes = Math.round(songs.reduce((n, s) => n + (s.duration || 0), 0) / 60)
    const words = {
      songs: `${tn(songs.length, '{n} música', '{n} músicas')} · ${minutes >= 60 ? t('{h} h {m} min', { h: Math.floor(minutes / 60), m: minutes % 60 }) : t('{m} min', { m: minutes })}`,
      madeWith: t('feito com Harmony')
    }
    void makePlaylistCard(playlist, songs, mosaic, words).then((c) => live && setCard(c))
    return () => {
      live = false
    }
  }, [playlist, songs, mosaic])

  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const run = async (what: string, job: () => Promise<void>): Promise<void> => {
    setBusy(what)
    setDone(null)
    try {
      await job()
      setDone(what)
    } catch {
      /* the share sheet was closed */
    } finally {
      setBusy(null)
    }
  }

  const exported = async (): Promise<ExportedPlaylist> => (await api.playlists.exportOne(playlist.id)) as ExportedPlaylist

  const button = 'flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-4 py-2.5 text-xs font-medium hover:text-ink disabled:opacity-50'

  return createPortal(
    <div className="fixed inset-0 z-[140] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="glass fade-in flex max-h-[94vh] w-[min(96vw,720px)] flex-col gap-5 overflow-y-auto rounded-2xl p-6 sm:flex-row" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mx-auto grid aspect-[9/16] h-[52vh] max-h-[480px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--bg-raised)] shadow-xl">
          {card ? <img src={card.toDataURL('image/jpeg', 0.85)} alt="" className="h-full w-full object-cover" /> : <Spinner size={22} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-bold">{t('📤 Compartilhar a playlist')}</h2>
            <button onClick={onClose} className="text-muted hover:text-ink" aria-label={t('Fechar')}>
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-muted">{t('Um cartão para os stories, ou a playlist em arquivo para levar a outro player (ou a outro Harmony).')}</p>
          <button
            disabled={!card || busy !== null}
            onClick={() =>
              void run('card', async () => {
                const blob = await new Promise<Blob>((res, rej) => card!.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png'))
                await deliver(fileNameFor(playlist, 'png'), 'image/png', blob, t('Compartilhar a playlist'))
              })
            }
            className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent,#fff)] disabled:opacity-50"
          >
            {busy === 'card' ? <Spinner size={14} /> : <ImageIcon size={16} />}
            {IS_ANDROID ? t('Compartilhar o cartão') : t('Salvar o cartão (imagem)')}
          </button>
          <p className="mt-2 text-xs font-semibold">{t('Exportar')}</p>
          <button
            disabled={busy !== null}
            onClick={() => void run('m3u', async () => deliver(fileNameFor(playlist, 'm3u'), 'audio/x-mpegurl', toM3U(await exported()), playlist.name))}
            className={button}
          >
            <FileMusic size={15} /> {t('.m3u — abre em quase qualquer player')}
          </button>
          <button
            disabled={busy !== null}
            onClick={() =>
              void run('harmony', async () =>
                deliver(fileNameFor(playlist, 'harmony.json'), 'application/json', JSON.stringify(await exported()), playlist.name)
              )
            }
            className={button}
          >
            <Download size={15} /> {t('Arquivo do Harmony — leva capa, emoji e cor')}
          </button>
          {done && <p className="text-xs text-[var(--accent)]">{t('Pronto!')}</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}
