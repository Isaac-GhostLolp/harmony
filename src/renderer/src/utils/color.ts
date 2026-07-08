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
