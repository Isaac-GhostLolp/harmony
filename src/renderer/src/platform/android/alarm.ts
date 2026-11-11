import { App } from '@capacitor/app'
import type { Song } from '@/types'
import { HarmonyPhone } from './phone'
import { api } from '@/services/api'
import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'
import { usePhoneStore } from '@/store/phoneStore'
import { useFocusStore } from '@/store/focusStore'

/**
 * The musical alarm, the page's side: Android rings it (AlarmScheduler /
 * AlarmReceiver) and opens the Harmony; here the chosen music starts from
 * silence and rises slowly to the chosen volume, and the wake-up screen
 * (AlarmScreen) offers to stop, snooze or keep listening.
 */

export const SNOOZE_MIN = 9
/** nobody stopped it: the music pauses by itself after this long */
const GIVE_UP_MS = 30 * 60_000

let started = false
let giveUp: ReturnType<typeof setTimeout> | null = null

export function startAlarmWatch(): void {
  if (started) return
  started = true
  const take = async (): Promise<void> => {
    const { fired } = await HarmonyPhone.consumeAlarm().catch(() => ({ fired: false }))
    if (fired) await ring()
  }
  void take()
  void HarmonyPhone.addListener('alarm', () => void take())
  void App.addListener('resume', () => void take())
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** the alarm's songs: the chosen playlist, else the favourites, else the whole library */
async function alarmSongs(): Promise<Song[]> {
  const { playlistId } = usePhoneStore.getState().alarmMusic
  let songs: Song[] = []
  if (playlistId != null) songs = ((await api.playlists.getSongs(playlistId).catch(() => [])) as Song[]) ?? []
  if (!songs.length) songs = ((await api.favorites.getAll().catch(() => [])) as Song[]) ?? []
  if (!songs.length) songs = ((await api.library.getSongs().catch(() => [])) as Song[]) ?? []
  return songs
}

export async function ring(): Promise<void> {
  const { alarmMusic } = usePhoneStore.getState()
  usePhoneStore.setState({ ringing: true })
  if (useFocusStore.getState().phase) useFocusStore.getState().stop()

  const songs = await alarmSongs()
  const info = await HarmonyPhone.audioInfo().catch(() => null)
  if (info && info.max > 0) {
    await HarmonyPhone.setVolume({ volume: Math.max(1, Math.round(alarmMusic.volume * info.max)) }).catch(() => undefined)
  }
  // silence first, then the slow rise (on the audio clock)
  getEngine().focusRise(alarmMusic.riseSec)
  if (songs.length) {
    const list = alarmMusic.shuffle ? shuffled(songs) : songs
    usePlayerStore.getState().playQueue(list, 0)
  } else if (!usePlayerStore.getState().isPlaying && usePlayerStore.getState().queue.length) {
    usePlayerStore.getState().togglePlay()
  }

  if (giveUp) clearTimeout(giveUp)
  giveUp = setTimeout(() => {
    if (usePhoneStore.getState().ringing) void stopAlarm()
  }, GIVE_UP_MS)
}

function close(): void {
  if (giveUp) clearTimeout(giveUp)
  giveUp = null
  usePhoneStore.setState({ ringing: false })
  void HarmonyPhone.alarmDone().catch(() => undefined)
}

/** "Parar": the music stops */
export async function stopAlarm(): Promise<void> {
  const p = usePlayerStore.getState()
  if (p.isPlaying) p.togglePlay()
  close()
  // full sound again for the next play (it's paused, so no jump)
  setTimeout(() => getEngine().focusFade(1, 0.1), 400)
}

/** "Soneca": quiet now, ring again in a few minutes */
export async function snoozeAlarm(): Promise<number> {
  const { at } = await HarmonyPhone.snooze({ minutes: SNOOZE_MIN })
  await stopAlarm()
  return at
}

/** "Continuar ouvindo": the screen closes and the music goes on, at full sound */
export function keepListening(): void {
  getEngine().focusFade(1, 3)
  close()
}
