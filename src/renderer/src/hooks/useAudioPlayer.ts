import { useEffect } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useEqStore } from '@/store/eqStore'
import { useUiStore } from '@/store/uiStore'
import { applyAccentFromCover } from '@/utils/color'
import { mediaUrl } from '@/utils/format'
import { api } from '@/services/api'
import { getEngine } from '@/services/audioEngine'

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

    engine.onTime = (t) => usePlayerStore.getState().setCurrentTime(t)

    engine.onEnded = () => {
      const s = usePlayerStore.getState()
      // Repeat-one, or repeat-all with a single song: same track restarts —
      // the store state wouldn't change, so we drive the engine directly.
      if (s.repeat === 'one' || (s.repeat === 'all' && s.queue.length === 1)) {
        engine.seek(0)
        engine.play()
        if (s.queue[s.currentIndex]) api.history.add(s.queue[s.currentIndex].id)
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

  // Song change (epoch bumps even when the same song is re-selected)
  useEffect(() => {
    if (!song) return
    const engine = getEngine()
    engine.load(mediaUrl(song.path)!)
    api.history.add(song.id)
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

  // Volume (persisted)
  useEffect(() => {
    getEngine().setVolume(volume)
    api.settings.set('volume', volume)
  }, [volume])

  // Seek (one-shot request from UI)
  useEffect(() => {
    if (seekPosition === null) return
    getEngine().seek(seekPosition)
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

const EQ_FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
