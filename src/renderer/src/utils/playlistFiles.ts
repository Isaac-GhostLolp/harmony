import type { Playlist, Song } from '@/types'
import type { ExportedPlaylist } from '../../../core/playlistsPlus'
import { mediaUrl } from '@/utils/format'
import { IS_ANDROID } from '@/platform'

/**
 * A playlist leaving the Harmony, or arriving: an .m3u (any player reads it),
 * the Harmony's own file (it keeps the cover, emoji, colour and description),
 * and a card for stories. On the desktop they're saved as files; on the
 * phone they go to Android's share sheet.
 */

const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'playlist'

export function toM3U(p: ExportedPlaylist): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${p.name}`]
  for (const s of p.songs) {
    lines.push(`#EXTINF:${Math.round(s.duration || -1)},${s.artist ? `${s.artist} - ` : ''}${s.title}`)
    lines.push(s.path ?? '')
  }
  return lines.join('\n') + '\n'
}

/** an .m3u/.m3u8 as a Harmony playlist (songs found later by path, or by "Artist - Title" and length) */
export function fromM3U(text: string, fileName: string): ExportedPlaylist {
  const songs: ExportedPlaylist['songs'] = []
  let name = fileName.replace(/\.m3u8?$/i, '')
  let pending: { title: string; artist: string | null; duration: number } | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#PLAYLIST:')) name = line.slice(10).trim() || name
    else if (line.startsWith('#EXTINF:')) {
      const m = /^#EXTINF:(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line)
      const info = m?.[2] ?? ''
      const dash = info.indexOf(' - ')
      pending = {
        duration: Math.max(0, Number(m?.[1] ?? 0)),
        artist: dash > 0 ? info.slice(0, dash).trim() : null,
        title: (dash > 0 ? info.slice(dash + 3) : info).trim()
      }
    } else if (!line.startsWith('#')) {
      const file = line.replace(/^file:\/\//, '')
      const fallback = decodeURIComponent(file.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '')
      songs.push({ title: pending?.title || fallback, artist: pending?.artist ?? null, album: null, duration: pending?.duration ?? 0, path: decodeURI(file) })
      pending = null
    }
  }
  return { format: 'harmony-playlist', version: 1, name, description: null, emoji: null, color: null, image: null, songs }
}

/** reads an imported file: the Harmony's own (JSON) or an .m3u */
export async function readPlaylistFile(file: File): Promise<ExportedPlaylist | null> {
  const text = await file.text()
  if (/\.m3u8?$/i.test(file.name) || text.trimStart().startsWith('#EXTM3U')) return fromM3U(text, file.name)
  try {
    const data = JSON.parse(text) as ExportedPlaylist
    return data?.format === 'harmony-playlist' && Array.isArray(data.songs) ? data : null
  } catch {
    return null
  }
}

/** saves (desktop) or shares (phone) a file the Harmony made */
export async function deliver(name: string, mime: string, data: string | Blob, shareTitle: string): Promise<void> {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data
  if (IS_ANDROID) {
    const [{ Filesystem, Directory }, { Share }, { Capacitor }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
      import('@capacitor/core')
    ])
    if (Capacitor.isNativePlatform()) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
        r.onerror = reject
        r.readAsDataURL(blob)
      })
      const { uri } = await Filesystem.writeFile({ path: `share/${name}`, data: base64, directory: Directory.Cache, recursive: true })
      await Share.share({ title: shareTitle, files: [uri], dialogTitle: shareTitle })
      return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const fileNameFor = (p: { name: string }, ext: string): string => `${safeName(p.name)}.${ext}`

// ── the stories card ─────────────────────────────────────────────────

const W = 1080
const H = 1920

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text
  let t = text
  while (t && g.measureText(t + '…').width > width) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

/** a 1080×1920 card: the cover (or the mosaic), the name, its size and its first songs */
export async function makePlaylistCard(
  p: Playlist,
  songs: Song[],
  mosaic: string[],
  words: { songs: string; madeWith: string }
): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const colour = p.color || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6cf4'

  const tiles = p.image
    ? [await load(p.image)]
    : await Promise.all(mosaic.slice(0, 4).map((m) => load(mediaUrl(m) ?? '')))
  const pics = tiles.filter((x): x is HTMLImageElement => Boolean(x))

  // background: the first picture blurred, or the colour
  g.fillStyle = '#0b0b10'
  g.fillRect(0, 0, W, H)
  if (pics[0]) {
    g.save()
    g.filter = 'blur(70px) saturate(1.3)'
    g.globalAlpha = 0.8
    g.drawImage(pics[0], -500, -100, H + 200, H + 200)
    g.restore()
  }
  const wash = g.createLinearGradient(0, 0, 0, H)
  wash.addColorStop(0, `${colour}55`)
  wash.addColorStop(0.5, 'rgba(0,0,0,0.35)')
  wash.addColorStop(1, 'rgba(0,0,0,0.85)')
  g.fillStyle = wash
  g.fillRect(0, 0, W, H)

  // the cover
  const size = 720
  const x0 = (W - size) / 2
  const y0 = 220
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.55)'
  g.shadowBlur = 80
  g.shadowOffsetY = 30
  rounded(g, x0, y0, size, size, 44)
  g.fillStyle = colour
  g.fill()
  g.restore()
  g.save()
  rounded(g, x0, y0, size, size, 44)
  g.clip()
  if (pics.length >= 2) {
    const half = size / 2
    for (let i = 0; i < 4; i++) g.drawImage(pics[i % pics.length], x0 + (i % 2) * half, y0 + Math.floor(i / 2) * half, half, half)
  } else if (pics[0]) {
    g.drawImage(pics[0], x0, y0, size, size)
  } else {
    const grad = g.createLinearGradient(x0, y0, x0 + size, y0 + size)
    grad.addColorStop(0, colour)
    grad.addColorStop(1, '#111116')
    g.fillStyle = grad
    g.fillRect(x0, y0, size, size)
  }
  if (p.emoji && !p.image) {
    g.font = `260px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(p.emoji, W / 2, y0 + size / 2)
  }
  g.restore()

  // name, size, first songs
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#fff'
  g.font = `800 76px ${font}`
  let y = y0 + size + 140
  g.fillText(fit(g, p.name, 940), W / 2, y)
  y += 70
  g.font = `500 40px ${font}`
  g.fillStyle = 'rgba(255,255,255,0.75)'
  g.fillText(words.songs, W / 2, y)
  y += 90
  g.textAlign = 'left'
  for (const [i, s] of songs.slice(0, 5).entries()) {
    g.font = `700 38px ${font}`
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.fillText(String(i + 1), 150, y)
    g.font = `600 40px ${font}`
    g.fillStyle = '#fff'
    g.fillText(fit(g, s.title, 640), 210, y)
    g.font = `400 32px ${font}`
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.fillText(fit(g, s.artist ?? '', 640), 210, y + 40)
    y += 100
  }
  g.textAlign = 'center'
  g.font = `600 34px ${font}`
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.fillText(`♪  ${words.madeWith}`, W / 2, H - 100)
  return c
}
