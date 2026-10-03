/**
 * Extracts a dominant accent color from an album cover and applies it as
 * CSS variables (--accent / --accent-soft), driving the "living" UI glow.
 */
export async function applyAccentFromCover(url: string | undefined): Promise<void> {
  const root = document.documentElement
  if (!url) {
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-soft')
    return
  }
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })
    const canvas = document.createElement('canvas')
    const size = 32
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    let r = 0, g = 0, b = 0, count = 0
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i], pg = data[i + 1], pb = data[i + 2]
      const max = Math.max(pr, pg, pb)
      const min = Math.min(pr, pg, pb)
      // skip near-gray pixels so the accent stays vivid
      if (max - min < 24) continue
      r += pr; g += pg; b += pb; count++
    }
    if (count === 0) return
    r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count)

    root.style.setProperty('--accent', `rgb(${r} ${g} ${b})`)
    root.style.setProperty('--accent-soft', `rgb(${r} ${g} ${b} / 0.18)`)
  } catch {
    /* covers are optional; keep the theme accent */
  }
}

let accentInline: string | null = null
let accentTheme: string | null = null
let accentValue = ''

/**
 * The current --accent value, for canvases that draw with it every frame.
 * getComputedStyle() forces a full style recalculation whenever anything on
 * the page has changed (a hover, the seek bar), so calling it per frame made
 * every mouse move cost a document-wide recalc. The accent only changes when
 * the cover sets it inline or the theme switches, so we only re-read then.
 */
export function readAccent(): string {
  const root = document.documentElement
  const inline = root.style.getPropertyValue('--accent')
  const theme = root.getAttribute('data-theme')
  if (inline !== accentInline || theme !== accentTheme) {
    accentInline = inline
    accentTheme = theme
    accentValue = (inline || getComputedStyle(root).getPropertyValue('--accent')).trim()
  }
  return accentValue
}
