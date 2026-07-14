import type { World, WorldContext } from './types'

/**
 * 🖼️ Custom world — lets non-developers turn their own PNG/JPG (or an animated
 * source) into a living background. The image is drawn to fill the canvas with
 * a gentle music-reactive drift/zoom (Ken Burns style), so even a static photo
 * breathes with the track. Video is handled separately by the ThemeDirector via
 * a real <video> element (canvas video decoding is costly); this module covers
 * the image path and the subtle motion both share.
 *
 * The user's media is provided through a module-level setter so the registry
 * entry stays a plain World with no constructor args (keeping the SDK contract
 * identical for everyone).
 */

let img: HTMLImageElement | null = null
let imgUrl: string | null = null

/** Set (or clear) the custom image. Called when the user picks a file. */
export function setCustomImage(dataUrl: string | null): void {
  imgUrl = dataUrl
  if (!dataUrl) {
    img = null
    return
  }
  const el = new Image()
  el.onload = () => {
    img = el
  }
  el.src = dataUrl
}

export function getCustomImageUrl(): string | null {
  return imgUrl
}

export const customWorld: World = {
  id: 'custom',
  name: 'Meu fundo',
  spectrumBins: 16,

  frame(c: WorldContext): void {
    const { ctx, width, height, time } = c

    // base fill so gaps never flash white
    ctx.fillStyle = '#05060b'
    ctx.fillRect(0, 0, width, height)

    if (!img) {
      // no image yet — a soft accent gradient as a friendly placeholder
      const [r, g, b] = c.accent
      const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7
      )
      grad.addColorStop(0, `rgba(${r},${g},${b},0.25)`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
      return
    }

    // Ken Burns: slow zoom + drift, nudged by the music so it feels alive.
    const zoom = 1.08 + Math.sin(time * 0.05) * 0.03 + c.energy * 0.04
    const driftX = Math.sin(time * 0.06) * 20 + c.sway * 15
    const driftY = Math.cos(time * 0.045) * 14

    // cover-fit the image to the canvas
    const scale = Math.max(width / img.width, height / img.height) * zoom
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = (width - dw) / 2 + driftX
    const dy = (height - dh) / 2 + driftY
    ctx.drawImage(img, dx, dy, dw, dh)

    // a very soft darkening so the UI panels stay readable on bright photos
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(0, 0, width, height)

    // subtle accent bloom on the kick, so the background pulses with the beat
    if (c.kick > 0.02) {
      const [r, g, b] = c.accent
      ctx.globalAlpha = c.kick * 0.12
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 1
    }
  }
}
