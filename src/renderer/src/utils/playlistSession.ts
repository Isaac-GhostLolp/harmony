import type { Playlist, Song } from '@/types'
import type { PlayMode, Vibe } from '../../../core/playlistsPlus'
import { api } from '@/services/api'
import { usePlayerStore } from '@/store/playerStore'
import { useUiStore } from '@/store/uiStore'
import { useEqStore } from '@/store/eqStore'
import { useAppearanceStore } from '@/store/appearanceStore'
import { useSleepStore } from '@/store/sleepStore'
import { applyCursor, useCursorStore, type CursorPack } from '@/utils/cursor'

/**
 * A playlist's own way of playing and its mood (Personalizar → Clima / Como
 * ela toca): while music from that playlist plays, the Harmony can change
 * its living World, theme, equalizer and cursor, shuffle, use its own
 * crossfade, stop after some minutes and remember where it was left. When
 * something else starts playing, everything goes back as it was.
 *
 * "From that playlist" = the queue the player was given is exactly its
 * songs. The playlist page registers the open playlist; a new queue
 * (the player's `epoch`) is matched against it.
 */

export function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const DEFAULT_PLAY: PlayMode = { shuffle: false, crossfade: null, resume: false, minutes: null }
export const EMPTY_VIBE: Vibe = { world: null, theme: null, eq: null, cursor: null }

interface Before {
  world: string | null
  theme: string
  eqEnabled: boolean
  eqPreset: string
  cursor: CursorPack
  crossfade: number
}

/** what the Harmony looked like before a mood took over (kept on disk: the app may close meanwhile) */
const RESTORE_KEY = 'harmony.vibeRestore'

let candidate: { playlist: Playlist; ids: Set<number> } | null = null
let active: {
  playlist: Playlist
  /** its songs: only these count as "where it was left" */
  ids: Set<number>
  before: Before | null
  timer: number
  /** the sleep timer this playlist started (cancelled when it's over, if it's still that one) */
  sleepEndsAt: number | null
} | null = null
/** the shuffle the listener had before a playlist flipped it */
let shuffleBefore: boolean | null = null
let started = false

/** the playlist page tells which playlist is open (and its songs) */
export function openPlaylist(playlist: Playlist | null, songs: Song[]): void {
  candidate = playlist ? { playlist, ids: new Set(songs.map((s) => s.id)) } : null
}

/** "Tocar" on the playlist page: its way of playing (resume, shuffle) from the first song */
export function playPlaylist(playlist: Playlist, songs: Song[], shuffleNow = false): void {
  if (!songs.length) return
  openPlaylist(playlist, songs)
  const mode = { ...DEFAULT_PLAY, ...parseJson<PlayMode>(playlist.play) }
  const player = usePlayerStore.getState()
  if ((mode.shuffle || shuffleNow) !== player.shuffle) {
    shuffleBefore ??= player.shuffle
    player.toggleShuffle()
  }
  let index = shuffleNow ? Math.floor(Math.random() * songs.length) : 0
  let at = 0
  if (mode.resume && !shuffleNow) {
    const r = parseJson<{ songId: number; time: number }>(playlist.resume)
    const i = r ? songs.findIndex((s) => s.id === r.songId) : -1
    if (i >= 0) {
      index = i
      at = r!.time
    }
  }
  // the song loads already at that second (seeking afterwards raced the loading)
  if (at > 3) usePlayerStore.setState({ startAt: at })
  usePlayerStore.getState().playQueue(songs, index)
}

function snapshot(): Before {
  return {
    world: useUiStore.getState().world,
    theme: useAppearanceStore.getState().source,
    eqEnabled: useEqStore.getState().enabled,
    eqPreset: useEqStore.getState().preset,
    cursor: useCursorStore.getState().pack,
    crossfade: useUiStore.getState().crossfade
  }
}

function applyMood(vibe: Vibe, mode: PlayMode): Before | null {
  const touches = vibe.world || vibe.theme || vibe.eq || vibe.cursor || mode.crossfade != null
  if (!touches) return null
  const before = snapshot()
  try {
    localStorage.setItem(RESTORE_KEY, JSON.stringify(before))
  } catch {
    /* restored in this session anyway */
  }
  if (vibe.world) useUiStore.getState().setWorld(vibe.world)
  if (vibe.theme) useAppearanceStore.getState().choose(vibe.theme)
  if (vibe.eq) {
    useEqStore.getState().setPreset(vibe.eq)
    if (!useEqStore.getState().enabled) useEqStore.getState().setEnabled(true)
  }
  if (vibe.cursor) {
    // for now only: the listener's own choice stays saved
    useCursorStore.setState({ pack: vibe.cursor as CursorPack })
    void applyCursor()
  }
  if (mode.crossfade != null) useUiStore.getState().setCrossfade(mode.crossfade)
  return before
}

function restore(b: Before): void {
  const ui = useUiStore.getState()
  if (ui.world !== b.world) ui.setWorld(b.world)
  if (useAppearanceStore.getState().source !== b.theme) useAppearanceStore.getState().choose(b.theme)
  const eq = useEqStore.getState()
  if (eq.preset !== b.eqPreset) eq.setPreset(b.eqPreset)
  if (eq.enabled !== b.eqEnabled) eq.setEnabled(b.eqEnabled)
  if (useCursorStore.getState().pack !== b.cursor) {
    useCursorStore.setState({ pack: b.cursor })
    void applyCursor()
  }
  if (ui.crossfade !== b.crossfade) ui.setCrossfade(b.crossfade)
  try {
    localStorage.removeItem(RESTORE_KEY)
  } catch {
    /* nothing kept */
  }
}

function end(): void {
  if (!active) return
  window.clearInterval(active.timer)
  saveResume()
  if (active.before) restore(active.before)
  const sleep = useSleepStore.getState()
  if (active.sleepEndsAt && sleep.endsAt === active.sleepEndsAt) sleep.cancel()
  if (shuffleBefore !== null && usePlayerStore.getState().shuffle !== shuffleBefore) usePlayerStore.getState().toggleShuffle()
  shuffleBefore = null
  active = null
}

function saveResume(): void {
  if (!active) return
  const mode = { ...DEFAULT_PLAY, ...parseJson<PlayMode>(active.playlist.play) }
  if (!mode.resume) return
  const p = usePlayerStore.getState()
  const song = p.queue[p.currentIndex]
  // when something else has just started, the song playing isn't this playlist's
  if (song && active.ids.has(song.id)) void api.playlists.setResume(active.playlist.id, song.id, p.currentTime)
}

function begin(playlist: Playlist, ids: Set<number>): void {
  end()
  const mode = { ...DEFAULT_PLAY, ...parseJson<PlayMode>(playlist.play) }
  const vibe = { ...EMPTY_VIBE, ...parseJson<Vibe>(playlist.vibe) }
  const before = applyMood(vibe, mode)
  let sleepEndsAt: number | null = null
  if (mode.minutes) {
    useSleepStore.getState().startMinutes(mode.minutes)
    sleepEndsAt = useSleepStore.getState().endsAt
  }
  active = { playlist, ids, before, timer: window.setInterval(saveResume, 5000), sleepEndsAt }
}

/** listens to the player: a queue that is the open playlist starts its session; anything else ends it */
export function startPlaylistSessions(): void {
  if (started) return
  started = true
  // the app closed during a mood: put the listener's look back
  const left = parseJson<Before>(localStorage.getItem(RESTORE_KEY))
  if (left) restore(left)
  usePlayerStore.subscribe((s, prev) => {
    if (s.epoch === prev.epoch) return
    const ids = s.originalQueue.map((x) => x.id)
    const match =
      candidate && ids.length === candidate.ids.size && ids.every((id) => candidate!.ids.has(id)) ? candidate.playlist : null
    if (match && active?.playlist.id === match.id) return
    // a queue brought back paused at start-up ("continuar de onde parou") isn't the playlist starting
    if (match && s.isPlaying) begin(match, candidate!.ids)
    else if (!match) end()
  })
  window.addEventListener('beforeunload', () => saveResume())
}

/** the playlist's settings changed while it plays: apply them again */
export function refreshActive(playlist: Playlist): void {
  if (active?.playlist.id === playlist.id) begin(playlist, active.ids)
  if (candidate?.playlist.id === playlist.id) candidate = { ...candidate, playlist }
}
