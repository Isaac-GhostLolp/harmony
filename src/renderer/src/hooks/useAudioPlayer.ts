import { useEffect } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useEqStore } from '@/store/eqStore'
import { useUiStore } from '@/store/uiStore'
import { applyAccentFromCover } from '@/utils/color'
import { mediaUrl } from '@/utils/format'
import { api } from '@/services/api'
import { persistSettingDebounced } from '@/utils/persistSetting'
import { getEngine } from '@/services/audioEngine'

/**
 * A song counts as played (history: Meu Mundo, Mais tocadas, Retrospectiva…)
 * only once it has really been listened to: 30 seconds of it, or half of a
 * very short one — like the big streaming apps. Before, it counted the moment
 * it started, so songs skipped on shuffle (and double clicks) piled up as
 * plays: a genre barely heard could become the favourite one.
 *
 * Listening time is added up from the clock as it moves forward; a seek
 * moves the starting point instead, so jumping ahead in the song doesn't
 * count as having heard it.
 */
const LISTEN_SEC = 30
let listen: { songId: number; need: number; heard: number; last: number } | null = null

function countWhenHeard(songId: number, duration: number, from = 0): void {
  const need = duration > 0 ? Math.min(LISTEN_SEC, Math.max(5, duration / 2)) : LISTEN_SEC
  listen = { songId, need, heard: 0, last: from }
}

function heard(t: number): void {
  if (!listen) return
  const step = t - listen.last
  listen.last = t
  // a few ticks a second (further apart with the screen off on a phone); seeks are handled apart
  if (step > 0 && step < 20) listen.heard += step
  if (listen.heard >= listen.need) {
    void api.history.add(listen.songId)
    listen = null
  }
}

/**
 * Bridges the Zustand player store to the AudioEngine singleton.
 * Mount exactly once (in App). UI components only mutate the store;
 * this hook is the only place that touches actual audio.
 */
export function useAudioPlayer(): void {
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const epoch = usePlayerStore((s) => s.epoch)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const seekPosition = usePlayerStore((s) => s.seekPosition)
  const eqGains = useEqStore((s) => (s.enabled ? s.gains : null))
  const crossfade = useUiStore((s) => s.crossfade)

  // Engine callbacks (set once)
  useEffect(() => {
    const engine = getEngine()

    engine.onTime = (t) => {
      usePlayerStore.getState().setCurrentTime(t)
      heard(t)
    }

    engine.onEnded = () => {
      const s = usePlayerStore.getState()
      // Repeat-one, or repeat-all with a single song: same track restarts —
      // the store state wouldn't change, so we drive the engine directly.
      if (s.repeat === 'one' || (s.repeat === 'all' && s.queue.length === 1)) {
        engine.seek(0)
        engine.play()
        const again = s.queue[s.currentIndex]
        if (again) countWhenHeard(again.id, again.duration)
        return
      }
      s.next()
    }

    engine.onAutoNext = () => {
      const s = usePlayerStore.getState()
      if (s.repeat === 'one' || s.queue.length <= 1) return 'stay'
      const isLast = s.currentIndex >= s.queue.length - 1
      if (isLast && s.repeat !== 'all') return 'stay'
      s.next()
      return 'advanced'
    }
  }, [])

  // Song change (epoch bumps even when the same song is re-selected). The
  // app can be redrawn while a song plays (switching the language remounts
  // it): the song already in the engine is not loaded again.
  useEffect(() => {
    if (!song) return
    const key = `${song.id}:${epoch}`
    if (key === loadedKey) return
    loadedKey = key
    const engine = getEngine()
    const { resumeAt } = usePlayerStore.getState()
    if (resumeAt !== null) {
      // picked up where the listener left off: paused, and not a new play
      usePlayerStore.setState({ resumeAt: null })
      engine.load(mediaUrl(song.path)!, resumeAt, false)
      listen = null
    } else {
      const { startAt } = usePlayerStore.getState()
      if (startAt !== null) usePlayerStore.setState({ startAt: null })
      engine.load(mediaUrl(song.path)!, startAt ?? 0)
      countWhenHeard(song.id, song.duration, startAt ?? 0)
    }
    applyAccentFromCover(mediaUrl(song.coverPath))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, epoch])

  // Missing cover? Ask the online providers (Deezer/iTunes/MusicBrainz).
  useEffect(() => {
    if (!song || song.coverPath) return
    let cancelled = false
    api.online.fetchCover(song.id).then((cover) => {
      if (cancelled || typeof cover !== 'string') return
      usePlayerStore.getState().updateSongCover(song.id, cover)
      applyAccentFromCover(mediaUrl(cover))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id])

  // Play / pause
  useEffect(() => {
    const engine = getEngine()
    if (isPlaying) engine.play()
    else engine.pause()
  }, [isPlaying])

  // Volume: apply to the audio graph immediately (cheap), but debounce the
  // settings write. Dragging the slider fires dozens of changes/second, and
  // persisting each one to SQLite over IPC was freezing the UI.
  useEffect(() => {
    getEngine().setVolume(volume)
    persistSettingDebounced('volume', volume)
  }, [volume])

  // Seek (one-shot request from UI)
  useEffect(() => {
    if (seekPosition === null) return
    getEngine().seek(seekPosition)
    // a jump isn't listening: the count goes on from the new spot
    if (listen) listen.last = seekPosition
    usePlayerStore.getState().clearSeek()
  }, [seekPosition])

  // Equalizer
  useEffect(() => {
    getEngine().setEqGains(eqGains ?? EQ_FLAT)
  }, [eqGains])

  // Crossfade duration
  useEffect(() => {
    getEngine().crossfadeSec = crossfade
  }, [crossfade])
}

/** which song (and selection) the engine holds; lives outside React */
let loadedKey = ''

const EQ_FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
