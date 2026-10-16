import { MediaSession } from '@jofr/capacitor-media-session'

/**
 * The player notification, lock screen and headset buttons: Android's media
 * session, fed from the same state the desktop sends to the mini player.
 * While music plays it also runs a foreground service, which keeps Android
 * (and MIUI's battery saver) from stopping the app with the screen off.
 */
export interface PlayerState {
  title: string | null
  artist: string | null
  cover: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
}

type Command = (cmd: string) => void

const commands = new Set<Command>()
const send = (cmd: string): void => commands.forEach((c) => c(cmd))

export function onSessionCommand(cb: Command): () => void {
  commands.add(cb)
  return () => commands.delete(cb)
}

let wired = false
function wire(): void {
  if (wired) return
  wired = true
  const on = (action: Parameters<typeof MediaSession.setActionHandler>[0]['action'], cmd: (d: { seekTime?: number | null }) => string): void =>
    void MediaSession.setActionHandler({ action }, (d) => send(cmd(d))).catch(() => undefined)
  on('play', () => 'play')
  on('pause', () => 'pause')
  on('nexttrack', () => 'next')
  on('previoustrack', () => 'prev')
  on('seekto', (d) => `seek:${d.seekTime ?? 0}`)
}

/** a small JPEG data URL of the cover (the notification can't read the app's local URLs) */
const artCache = new Map<string, string | null>()
async function artwork(url: string): Promise<string | null> {
  if (artCache.has(url)) return artCache.get(url) ?? null
  let out: string | null = null
  try {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob())
    const size = 320
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const scale = Math.max(size / bitmap.width, size / bitmap.height)
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    canvas.getContext('2d')!.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
    out = canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    out = null
  }
  if (artCache.size > 40) artCache.clear()
  artCache.set(url, out)
  return out
}

let lastMeta = ''
let lastPlaying: boolean | null = null
let lastPosition = 0

export function updateSession(s: PlayerState): void {
  wire()
  const meta = `${s.title}|${s.artist}|${s.cover}`
  if (s.title && meta !== lastMeta) {
    lastMeta = meta
    const base = { title: s.title, artist: s.artist ?? '', album: '' }
    void MediaSession.setMetadata(base).catch(() => undefined)
    if (s.cover)
      void artwork(s.cover).then((art) => {
        if (art && lastMeta === meta) void MediaSession.setMetadata({ ...base, artwork: [{ src: art }] }).catch(() => undefined)
      })
  }
  if (s.isPlaying !== lastPlaying) {
    lastPlaying = s.isPlaying
    void MediaSession.setPlaybackState({ playbackState: s.title ? (s.isPlaying ? 'playing' : 'paused') : 'none' }).catch(
      () => undefined
    )
  }
  // the notification's progress bar moves on its own; correct it every few seconds or on a jump
  if (s.duration > 0 && (Math.abs(s.currentTime - lastPosition) > 3 || !s.isPlaying)) {
    lastPosition = s.currentTime
    void MediaSession.setPositionState({
      duration: s.duration,
      position: Math.min(s.currentTime, s.duration),
      playbackRate: s.isPlaying ? 1 : 0
    }).catch(() => undefined)
  }
}
