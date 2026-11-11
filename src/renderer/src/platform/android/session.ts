import { MediaSession } from '@jofr/capacitor-media-session'
import { autoSpec, drawCover } from '@/utils/coverArt'
import { FONTS } from '@/utils/appearance'
import { HarmonyPhone, type WidgetCommand } from './phone'

/**
 * The player notification, lock screen and headset buttons: Android's media
 * session, fed from the same state the desktop sends to the mini player.
 * While music plays it also runs a foreground service, which keeps Android
 * (and MIUI's battery saver) from stopping the app with the screen off.
 *
 * The home-screen widget (PlayerWidget.java) is fed from here too, with the
 * same cover, and its buttons arrive as the same commands.
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

  // the widget's buttons: the same commands as the notification's
  const fromWidget = (cmd: WidgetCommand): void => {
    if (cmd === 'toggle') send(lastPlaying ? 'pause' : 'play')
    else send(cmd)
  }
  void HarmonyPhone.addListener('widget', (e) => fromWidget(e.cmd)).catch(() => undefined)
  // a button pressed with the app closed opened it: carry it out once the last song is back
  void HarmonyPhone.consumeWidgetCommand()
    .then(({ cmd }) => {
      if (!cmd) return
      const started = Date.now()
      const wait = setInterval(() => {
        if (lastMeta || Date.now() - started > 8000) {
          clearInterval(wait)
          if (lastMeta) fromWidget(cmd)
        }
      }, 250)
    })
    .catch(() => undefined)
}

/** a CSS colour as Android's 0xAARRGGBB */
function argb(css: string, fallback: number): number {
  const c = document.createElement('canvas').getContext('2d')
  if (!c) return fallback
  c.fillStyle = '#000'
  c.fillStyle = css
  const hex = String(c.fillStyle)
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  return m ? (0xff000000 | parseInt(m[1], 16)) | 0 : fallback
}

function widgetColours(): { accent: number; onAccent: number } {
  const css = getComputedStyle(document.documentElement)
  const accent = argb(css.getPropertyValue('--accent').trim() || '#7c6cf4', 0xff7c6cf4 | 0)
  const r = (accent >> 16) & 255
  const g = (accent >> 8) & 255
  const b = accent & 255
  // dark icon on a light accent, white on a dark one
  const onAccent = 0.299 * r + 0.587 * g + 0.114 * b > 170 ? 0xff111116 | 0 : 0xffffffff | 0
  return { accent, onAccent }
}

/** what the widget shows; `art` (a JPEG data URL) only when the song changes */
function pushWidget(s: PlayerState, art?: string): void {
  void HarmonyPhone.updateWidget({
    title: s.title,
    artist: s.artist,
    // the cover may arrive after a play/pause: the latest state wins
    playing: lastPlaying ?? s.isPlaying,
    ...widgetColours(),
    ...(art !== undefined ? { art: art.split(',')[1] ?? '' } : {})
  }).catch(() => undefined)
}

const SIZE = 320

/** the cover as a small JPEG data URL (the notification can't read the app's local URLs) */
async function coverArt(url: string): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height)
    const w = bitmap.width * scale
    const h = bitmap.height * scale
    canvas.getContext('2d')!.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}

/** a cover drawn for the song, like the app's automatic covers */
function drawnArt(title: string, artist: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  drawCover(canvas, autoSpec(title, artist, FONTS[2].family))
  return canvas.toDataURL('image/jpeg', 0.85)
}

const artCache = new Map<string, string>()
async function artwork(s: PlayerState): Promise<string> {
  const key = `${s.cover ?? ''}|${s.title}|${s.artist}`
  const hit = artCache.get(key)
  if (hit) return hit
  const art = (s.cover ? await coverArt(s.cover) : null) ?? drawnArt(s.title ?? '', s.artist ?? '')
  if (artCache.size > 40) artCache.clear()
  artCache.set(key, art)
  return art
}

let lastMeta = ''
let lastPlaying: boolean | null = null
let lastPosition = 0

export function updateSession(s: PlayerState): void {
  wire()
  const meta = `${s.title}|${s.artist}|${s.cover}`
  if (s.title && meta !== lastMeta) {
    lastMeta = meta
    // one call, always with an image: the plugin crashes the app (natively)
    // when setMetadata comes without an artwork list
    void artwork(s).then((art) => {
      if (lastMeta !== meta) return
      pushWidget(s, art)
      void MediaSession.setMetadata({
        title: s.title ?? '',
        artist: s.artist ?? '',
        album: '',
        artwork: [{ src: art, sizes: `${SIZE}x${SIZE}`, type: 'image/jpeg' }]
      }).catch(() => undefined)
    })
  }
  if (s.isPlaying !== lastPlaying) {
    lastPlaying = s.isPlaying
    if (s.title) pushWidget(s)
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
