import type { Song } from '@/types'
import { mediaUrl } from '@/utils/format'
import { autoSpec, drawCover } from '@/utils/coverArt'
import { FONTS } from '@/utils/appearance'

/**
 * "Compartilhar o que estou ouvindo": a 1080×1920 card for stories — the
 * song's cover blurred behind, tinted with the theme's accent, the cover
 * itself, the title and artist, optionally the line of the lyrics playing
 * right now, and a discreet "feito com Harmony".
 */

export const CARD_W = 1080
export const CARD_H = 1920

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** the cover (or one drawn for the song, like the app's automatic covers) */
async function coverFor(song: Song): Promise<CanvasImageSource> {
  const url = mediaUrl(song.coverPath)
  const img = url ? await loadImage(url) : null
  if (img) return img
  const c = document.createElement('canvas')
  c.width = c.height = 900
  drawCover(c, autoSpec(song.title, song.artist ?? '', FONTS[2].family))
  return c
}

/** breaks `text` into at most `max` lines that fit `width` (the last one ends in "…") */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w
    if (g.measureText(tryLine).width <= width) line = tryLine
    else {
      if (line) lines.push(line)
      line = w
      if (lines.length === max) break
    }
  }
  if (lines.length < max && line) lines.push(line)
  if (lines.length > max) lines.length = max
  const used = lines.join(' ').split(/\s+/).length
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1]
    while (last && g.measureText(last + '…').width > width) last = last.slice(0, -1)
    lines[lines.length - 1] = last.trimEnd() + '…'
  }
  return lines
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export async function makeShareCard(song: Song, opts: { lyric: string | null; madeWith: string }): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const g = canvas.getContext('2d')!
  const css = getComputedStyle(document.documentElement)
  const accent = css.getPropertyValue('--accent').trim() || '#7c6cf4'
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const cover = await coverFor(song)

  // the cover, huge and blurred, behind everything
  g.fillStyle = '#0b0b10'
  g.fillRect(0, 0, CARD_W, CARD_H)
  g.save()
  g.filter = 'blur(70px) saturate(1.3)'
  g.globalAlpha = 0.85
  g.drawImage(cover, -500, -100, CARD_H + 200, CARD_H + 200)
  g.restore()
  // the theme's colour washing over it, darker at the bottom for the text
  const wash = g.createLinearGradient(0, 0, 0, CARD_H)
  wash.addColorStop(0, 'rgba(0,0,0,0.15)')
  wash.addColorStop(0.55, 'rgba(0,0,0,0.35)')
  wash.addColorStop(1, 'rgba(0,0,0,0.8)')
  g.fillStyle = wash
  g.fillRect(0, 0, CARD_W, CARD_H)
  g.globalCompositeOperation = 'soft-light'
  g.fillStyle = accent
  g.globalAlpha = 0.45
  g.fillRect(0, 0, CARD_W, CARD_H)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'

  // the cover itself
  const size = 780
  const cx = (CARD_W - size) / 2
  const cy = 300
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.55)'
  g.shadowBlur = 80
  g.shadowOffsetY = 30
  roundRect(g, cx, cy, size, size, 44)
  g.fillStyle = '#000'
  g.fill()
  g.restore()
  g.save()
  roundRect(g, cx, cy, size, size, 44)
  g.clip()
  g.drawImage(cover, cx, cy, size, size)
  g.restore()

  // title and artist
  g.textAlign = 'center'
  g.fillStyle = '#fff'
  g.font = `800 72px ${font}`
  let y = cy + size + 130
  for (const line of wrap(g, song.title, 920, 2)) {
    g.fillText(line, CARD_W / 2, y)
    y += 84
  }
  g.font = `500 44px ${font}`
  g.fillStyle = 'rgba(255,255,255,0.75)'
  g.fillText(wrap(g, song.artist ?? '', 920, 1)[0] ?? '', CARD_W / 2, y + 6)
  y += 70

  // the line of the lyrics playing now, as a quote
  if (opts.lyric) {
    g.font = `italic 500 46px ${font}`
    g.fillStyle = 'rgba(255,255,255,0.92)'
    const lines = wrap(g, `“${opts.lyric}”`, 880, 3)
    y += 40
    for (const line of lines) {
      g.fillText(line, CARD_W / 2, y)
      y += 62
    }
  }

  // made with Harmony, small at the bottom
  g.font = `600 34px ${font}`
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.fillText(`♪  ${opts.madeWith}`, CARD_W / 2, CARD_H - 110)
  return canvas
}
