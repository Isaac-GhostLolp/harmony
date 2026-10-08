/**
 * Pitch detection for karaoke — a compact McLeod-style normalized
 * autocorrelation. Good enough for a voice (and the singer's band of a mix);
 * it answers "which note is this?", not studio-grade tuning.
 */

/** Fundamental frequency in Hz, or 0 when there is no clear note. */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  opts: { minHz?: number; maxHz?: number; clarity?: number; gate?: number } = {}
): number {
  const minHz = opts.minHz ?? 80
  const maxHz = opts.maxHz ?? 1000
  const clarity = opts.clarity ?? 0.7
  const gate = opts.gate ?? 0.01

  let energy = 0
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i]
  if (Math.sqrt(energy / buf.length) < gate) return 0

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz))
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(buf.length / 2))
  const n = buf.length - maxLag
  if (n <= 0 || maxLag <= minLag) return 0

  // normalized square difference for every candidate lag
  const nsdf = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0
    let m = 0
    for (let i = 0; i < n; i++) {
      const a = buf[i]
      const b = buf[i + lag]
      r += a * b
      m += a * a + b * b
    }
    nsdf[lag] = m > 0 ? (2 * r) / m : 0
  }

  // the first peak that is close to the best one (avoids octave errors)
  let best = 0
  for (let lag = minLag; lag <= maxLag; lag++) if (nsdf[lag] > best) best = nsdf[lag]
  if (best < clarity) return 0
  const threshold = best * 0.9
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (nsdf[lag] >= threshold && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      // parabolic interpolation around the peak
      const a = nsdf[lag - 1]
      const b = nsdf[lag]
      const c = nsdf[lag + 1]
      const den = a - 2 * b + c
      const shift = den !== 0 ? (0.5 * (a - c)) / den : 0
      return sampleRate / (lag + shift)
    }
  }
  return 0
}

/** MIDI note number (A4 = 69) for a frequency. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}

const NAMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si']

/** "Lá", "Dó#"… for a frequency (no octave: karaoke scores the note, not the octave). */
export function noteName(hz: number): string {
  const m = Math.round(hzToMidi(hz))
  return NAMES[((m % 12) + 12) % 12]
}

/**
 * Distance in semitones between two pitches, ignoring the octave (a man
 * singing a woman's melody an octave down is still in tune). 0..6.
 */
export function pitchClassDistance(a: number, b: number): number {
  const d = Math.abs(hzToMidi(a) - hzToMidi(b)) % 12
  return Math.min(d, 12 - d)
}
