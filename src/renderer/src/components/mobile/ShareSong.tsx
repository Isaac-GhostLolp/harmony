import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Share2 } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Song, LyricsResult } from '@/types'
import { api } from '@/services/api'
import { usePlayerStore } from '@/store/playerStore'
import { parseLrc, activeLineIndex } from '@/utils/lrc'
import { makeShareCard } from '@/utils/shareCard'
import { Spinner } from '@/components/Spinner'
import { t } from '@/i18n'
import { useBackCloses } from './back'

/**
 * Tocando agora's share button: a card of the song for stories (see
 * utils/shareCard) shown first as a preview — with or without the line of
 * the lyrics playing — then handed to Android's share sheet.
 */
export function ShareSongButton({ song }: { song: Song }): JSX.Element {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useBackCloses(open, close)
  return (
    <>
      <button onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center" aria-label={t('Compartilhar')}>
        <Share2 size={21} />
      </button>
      {open && createPortal(<ShareSheet song={song} onClose={close} />, document.body)}
    </>
  )
}

function ShareSheet({ song, onClose }: { song: Song; onClose: () => void }): JSX.Element {
  const [lyric, setLyric] = useState<string | null>(null)
  const [withLyric, setWithLyric] = useState(true)
  const [card, setCard] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  // the line of the lyrics playing right now (only synced lyrics know it)
  useEffect(() => {
    let live = true
    void (api.lyrics.resolve(song.id, false) as Promise<LyricsResult | null>)
      .then((r) => {
        if (!live || !r?.synced) return
        const lines = parseLrc(r.synced)
        const i = activeLineIndex(lines, usePlayerStore.getState().currentTime)
        const text = (lines[i]?.text ?? lines.find((l) => l.text.trim())?.text ?? '').trim()
        if (text) setLyric(text)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [song.id])

  useEffect(() => {
    let live = true
    setCard(null)
    void makeShareCard(song, { lyric: withLyric ? lyric : null, madeWith: t('feito com Harmony') }).then((c) => {
      if (live) setCard(c)
    })
    return () => {
      live = false
    }
  }, [song, lyric, withLyric])

  const share = async (): Promise<void> => {
    if (!card) return
    setBusy(true)
    setError(false)
    const text = song.artist
      ? t('Ouvindo “{title}”, de {artist}, no Harmony 🎧', { title: song.title, artist: song.artist })
      : t('Ouvindo “{title}” no Harmony 🎧', { title: song.title })
    try {
      const dataUrl = card.toDataURL('image/png')
      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({
          path: `share/harmony-${Date.now()}.png`,
          data: dataUrl.split(',')[1],
          directory: Directory.Cache,
          recursive: true
        })
        await Share.share({ title: t('Compartilhar'), text, files: [uri], dialogTitle: t('Compartilhar a música') })
      } else {
        // in a browser (development): download the image
        const a = Object.assign(document.createElement('a'), { href: dataUrl, download: 'harmony.png' })
        a.click()
      }
      onClose()
    } catch (e) {
      // the share sheet closed without sharing is not an error
      if (!String((e as Error)?.message ?? '').toLowerCase().includes('cancel')) setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="fade-rise flex max-h-[94vh] w-full flex-col items-center rounded-t-3xl bg-[var(--bg-base)] px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 h-1 w-10 rounded-full bg-[var(--bg-raised)]" />
        <div className="grid aspect-[9/16] h-[52vh] place-items-center overflow-hidden rounded-2xl bg-[var(--bg-raised)] shadow-xl">
          {card ? <img src={card.toDataURL('image/jpeg', 0.85)} alt="" className="h-full w-full object-cover" /> : <Spinner size={22} />}
        </div>
        {lyric && (
          <label className="mt-4 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={withLyric} onChange={(e) => setWithLyric(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            {t('Incluir o trecho da letra que está tocando')}
          </label>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{t('Não deu para compartilhar agora. Tente de novo.')}</p>}
        <button
          onClick={() => void share()}
          disabled={!card || busy}
          className="mt-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent,#fff)] disabled:opacity-50"
        >
          {busy ? <Spinner size={14} /> : <Share2 size={16} />} {t('Compartilhar')}
        </button>
      </div>
    </div>
  )
}
