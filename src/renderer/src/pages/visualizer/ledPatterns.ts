/**
 * LED wall animation library.
 *
 * Every animation is a pure function (col, row, grid, frame) → brightness
 * 0..1 plus an optional hue shift, all driven by the StageDirector frame —
 * so every panel in every Show Pack stays alive and in sync with the music.
 * No allocations: everything is math on the fly.
 */
import type { DirectorFrame } from '@/services/stageDirector'

export interface LedSample {
  v: number // brightness 0..1
  hueShift: number // degrees added to the pack's base hue
}

export type LedPatternId =
  | 'equalizer'
  | 'pixelRain'
  | 'audioWave'
  | 'pulseRings'
  | 'matrix'
  | 'cyberLines'
  | 'spectrumMirror'
  | 'triangles'
  | 'noise'
  | 'geometricPulse'
  | 'glitch'
  | 'tunnel'
  | 'aurora'
  | 'checker'

export const LED_PATTERNS: LedPatternId[] = [
  'equalizer',
  'pixelRain',
  'audioWave',
  'pulseRings',
  'matrix',
  'cyberLines',
  'spectrumMirror',
  'triangles',
  'noise',
  'geometricPulse',
  'glitch',
  'tunnel',
  'aurora',
  'checker'
]

/** Deterministic pseudo-random per cell (no allocations, stable per frame-ish). */
function hash(c: number, r: number, seed: number): number {
  const x = Math.sin(c * 127.1 + r * 311.7 + seed * 74.7) * 43758.5453
  return x - Math.floor(x)
}

const out: LedSample = { v: 0, hueShift: 0 }

export function sampleLed(
  id: LedPatternId,
  c: number,
  r: number,
  cols: number,
  rows: number,
  F: DirectorFrame
): LedSample {
  const cx = c / (cols - 1)
  const cy = r / (rows - 1)
  const t = F.t
  const pulse = Math.min(1, F.flash + F.kickTick * 0.6)
  out.hueShift = 0

  switch (id) {
    case 'equalizer': {
      const level = F.bars[Math.floor(cx * (F.bars.length - 1))] ?? 0
      out.v = 1 - cy <= level ? 0.35 + level * 0.65 : 0
      out.hueShift = (1 - cy) * 40
      break
    }
    case 'pixelRain': {
      const speed = 0.5 + F.energy / 140
      const drop = (hash(c, 0, 7) * 10 + t * speed * (1 + hash(c, 1, 3))) % 1.3
      const d = Math.abs(cy - drop)
      out.v = Math.max(0, 1 - d * 6) * (0.4 + pulse * 0.6)
      out.hueShift = hash(c, 2, 5) * 30
      break
    }
    case 'audioWave': {
      const level = F.bars[Math.floor(cx * (F.bars.length - 1))] ?? 0
      const wave = 0.5 + Math.sin(cx * 6 + t * 2) * 0.12 - level * 0.3
      out.v = Math.max(0, 1 - Math.abs(cy - wave) * 7) * (0.5 + level * 0.5)
      break
    }
    case 'pulseRings': {
      const dx = cx - 0.5
      const dy = (cy - 0.5) * 0.6
      const d = Math.sqrt(dx * dx + dy * dy)
      const ring = (t * (0.4 + F.energy / 200)) % 0.8
      out.v = Math.max(0, 1 - Math.abs(d - ring) * 10) * (0.4 + pulse * 0.6)
      break
    }
    case 'matrix': {
      const fall = (t * (1 + hash(c, 3, 9) * 1.5) + hash(c, 4, 2) * 8) % 1.6
      const head = Math.abs(cy - fall)
      const trail = cy < fall && fall - cy < 0.5 ? (0.5 - (fall - cy)) * 1.4 : 0
      out.v = Math.max(head < 0.06 ? 1 : 0, trail) * (0.35 + F.hihats * 0.5)
      out.hueShift = head < 0.06 ? 40 : 0
      break
    }
    case 'cyberLines': {
      const h = Math.abs(Math.sin(cy * rows * 0.7 + t * 1.4)) > 0.92 ? 1 : 0
      const vline = Math.abs(Math.sin(cx * cols * 0.5 - t * 2.1)) > 0.95 ? 1 : 0
      out.v = Math.max(h, vline) * (0.3 + F.flux * 0.6 + pulse * 0.3)
      out.hueShift = vline ? 60 : 0
      break
    }
    case 'spectrumMirror': {
      const level = F.bars[Math.floor(Math.abs(cx - 0.5) * 2 * (F.bars.length - 1))] ?? 0
      out.v = Math.abs(cy - 0.5) * 2 <= level ? 0.35 + level * 0.6 : 0
      out.hueShift = Math.abs(cx - 0.5) * 90
      break
    }
    case 'triangles': {
      const zig = Math.abs(((cx * 6 + (r % 2 === 0 ? t : -t) * 0.7) % 1) - 0.5) * 2
      out.v = zig > 0.72 ? 0.35 + pulse * 0.6 : 0.03
      break
    }
    case 'noise': {
      const n = hash(c, r, Math.floor(t * (4 + F.energy / 12)))
      out.v = n > 0.75 ? n * (0.3 + F.rms * 0.7) : 0
      out.hueShift = n * 50
      break
    }
    case 'geometricPulse': {
      const dx = Math.abs(cx - 0.5) * 2
      const dy = Math.abs(cy - 0.5) * 2
      const diamond = Math.max(dx, dy)
      const ring = (t * 0.6) % 1
      out.v = Math.max(0, 1 - Math.abs(diamond - ring) * 8) * (0.4 + pulse * 0.6)
      break
    }
    case 'glitch': {
      const rowJump = hash(0, r, Math.floor(t * 9)) > 0.85 - F.flux * 0.3
      const block = hash(Math.floor(c / 4), r, Math.floor(t * 6))
      out.v = rowJump ? block * 0.9 : block > 0.9 ? 0.5 : 0.03
      out.hueShift = rowJump ? 120 : 0
      break
    }
    case 'tunnel': {
      const dx = cx - 0.5
      const dy = (cy - 0.5) * 0.7
      const d = Math.sqrt(dx * dx + dy * dy) + 0.05
      const stripe = Math.sin(1 / d * 1.6 - t * (2 + F.energy / 40)) * 0.5 + 0.5
      out.v = stripe * Math.min(1, d * 3) * (0.35 + pulse * 0.5)
      out.hueShift = (1 / d) * 8
      break
    }
    case 'aurora': {
      const band1 = Math.sin(cx * 4 + t * 0.7) * 0.22 + 0.35
      const band2 = Math.sin(cx * 3 - t * 0.5 + 2) * 0.2 + 0.62
      const g1 = Math.max(0, 1 - Math.abs(cy - band1) * 4.5)
      const g2 = Math.max(0, 1 - Math.abs(cy - band2) * 5)
      out.v = (g1 * 0.8 + g2 * 0.6) * (0.35 + F.vocals * 0.4 + F.breath * 0.15)
      out.hueShift = g1 > g2 ? 0 : 70
      break
    }
    default: {
      // checker: classic beat-flipping checkerboard
      const phase = Math.floor(t * 2) % 2
      out.v = (c + r) % 2 === phase ? 0.25 + pulse * 0.75 : 0.02
    }
  }
  return out
}
