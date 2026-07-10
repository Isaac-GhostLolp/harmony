/**
 * Extracts a pleasant dominant color from an image data URL by averaging
 * sampled pixels in a small offscreen canvas, then nudging saturation so the
 * result reads as an accent rather than a muddy average. Returns an `hsl()`
 * string, or null if it can't decode.
 */
export async function extractDominantColor(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const size = 32
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0, size, size)
      let data: Uint8ClampedArray
      try {
        data = ctx.getImageData(0, 0, size, size).data
      } catch {
        return resolve(null)
      }
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]
        if (a < 200) continue
        // skip near-white and near-black so the accent is vivid
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        if (lum > 240 || lum < 12) continue
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        count++
      }
      if (count === 0) return resolve(null)
      r = Math.round(r / count)
      g = Math.round(g / count)
      b = Math.round(b / count)
      resolve(rgbToVividHsl(r, g, b))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

function rgbToVividHsl(r: number, g: number, b: number): string {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r:
        h = ((g - b) / d) % 6
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  // boost saturation, keep a mid lightness so it works as an accent
  const sat = Math.min(1, s * 1.25 + 0.15)
  const light = Math.min(0.6, Math.max(0.42, l))
  return `hsl(${Math.round(h)} ${Math.round(sat * 100)}% ${Math.round(light * 100)}%)`
}
