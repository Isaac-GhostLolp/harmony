import type { UiSoundPack } from '@/store/flairStore'

/**
 * Interface sounds (Personalização → Sons): tiny sounds for clicks,
 * switches, favouriting and changing pages, synthesised on the spot (no
 * audio files) in four packs. They have their own little AudioContext, apart
 * from the music's, so the equalizer and the music's volume don't touch them.
 */

export type UiSound = 'click' | 'on' | 'off' | 'favorite' | 'nav'

let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null

function audio(): { ctx: AudioContext; out: GainNode } {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    out = ctx.createGain()
    out.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return { ctx, out: out! }
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise
  noise = c.createBuffer(1, Math.round(c.sampleRate * 0.25), c.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noise
}

/** a short tone: `type` wave at `freq`, gliding to `to`, `len` seconds, starting `at` from now */
function tone(c: AudioContext, dest: AudioNode, type: OscillatorType, freq: number, len: number, level: number, at = 0, to?: number): void {
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + len)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(level, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + len + 0.02)
}

/** a burst of filtered noise: a click, a tick, vinyl crackle */
function burst(c: AudioContext, dest: AudioNode, filter: BiquadFilterType, freq: number, len: number, level: number, at = 0): void {
  const t = c.currentTime + at
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  const f = c.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  f.Q.value = 0.8
  const g = c.createGain()
  g.gain.setValueAtTime(level, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  src.connect(f).connect(g).connect(dest)
  src.start(t)
  src.stop(t + len + 0.02)
}

const PACKS: Record<Exclude<UiSoundPack, 'off'>, Record<UiSound, (c: AudioContext, d: AudioNode) => void>> = {
  // round, quiet sine blips
  soft: {
    click: (c, d) => tone(c, d, 'sine', 740, 0.07, 0.25),
    on: (c, d) => tone(c, d, 'sine', 620, 0.09, 0.25, 0, 880),
    off: (c, d) => tone(c, d, 'sine', 880, 0.09, 0.22, 0, 600),
    favorite: (c, d) => {
      tone(c, d, 'sine', 660, 0.1, 0.25)
      tone(c, d, 'sine', 990, 0.16, 0.22, 0.07)
    },
    nav: (c, d) => tone(c, d, 'sine', 520, 0.06, 0.12)
  },
  // a game console's square waves
  '8bit': {
    click: (c, d) => tone(c, d, 'square', 880, 0.04, 0.08),
    on: (c, d) => {
      tone(c, d, 'square', 660, 0.04, 0.08)
      tone(c, d, 'square', 990, 0.05, 0.08, 0.045)
    },
    off: (c, d) => {
      tone(c, d, 'square', 990, 0.04, 0.08)
      tone(c, d, 'square', 660, 0.05, 0.08, 0.045)
    },
    favorite: (c, d) => {
      tone(c, d, 'square', 784, 0.05, 0.08)
      tone(c, d, 'square', 988, 0.05, 0.08, 0.06)
      tone(c, d, 'square', 1319, 0.09, 0.08, 0.12)
    },
    nav: (c, d) => tone(c, d, 'triangle', 440, 0.05, 0.12, 0, 660)
  },
  // a needle on vinyl: crackle and a soft thump
  vinyl: {
    click: (c, d) => {
      burst(c, d, 'bandpass', 2400, 0.03, 0.35)
      tone(c, d, 'sine', 140, 0.06, 0.3, 0, 90)
    },
    on: (c, d) => {
      burst(c, d, 'bandpass', 3000, 0.04, 0.3)
      tone(c, d, 'sine', 180, 0.08, 0.3, 0, 240)
    },
    off: (c, d) => {
      burst(c, d, 'bandpass', 1800, 0.04, 0.3)
      tone(c, d, 'sine', 200, 0.08, 0.3, 0, 120)
    },
    favorite: (c, d) => {
      burst(c, d, 'bandpass', 2600, 0.05, 0.3)
      tone(c, d, 'triangle', 523, 0.12, 0.18, 0.02)
      tone(c, d, 'triangle', 784, 0.18, 0.16, 0.09)
    },
    nav: (c, d) => burst(c, d, 'bandpass', 2000, 0.05, 0.25)
  },
  // a mechanical keyboard
  mech: {
    click: (c, d) => {
      burst(c, d, 'highpass', 3500, 0.018, 0.5)
      burst(c, d, 'lowpass', 900, 0.03, 0.35, 0.012)
    },
    on: (c, d) => {
      burst(c, d, 'highpass', 4200, 0.02, 0.5)
      tone(c, d, 'square', 1200, 0.015, 0.05, 0.01)
    },
    off: (c, d) => {
      burst(c, d, 'highpass', 2800, 0.02, 0.5)
      tone(c, d, 'square', 800, 0.015, 0.05, 0.01)
    },
    favorite: (c, d) => {
      burst(c, d, 'highpass', 3500, 0.018, 0.5)
      burst(c, d, 'highpass', 3800, 0.018, 0.45, 0.06)
    },
    nav: (c, d) => burst(c, d, 'lowpass', 1200, 0.03, 0.3)
  }
}

let last = 0

/** plays `sound` from `pack` at `volume` (0–1); quiet when a sound just played (no machine-gun) */
export function playUiSound(pack: UiSoundPack, sound: UiSound, volume: number): void {
  if (pack === 'off' || volume <= 0) return
  const now = performance.now()
  if (now - last < 35) return
  last = now
  try {
    const { ctx: c, out: o } = audio()
    o.gain.value = Math.min(1, volume) * 0.9
    PACKS[pack][sound](c, o)
  } catch {
    /* no audio output */
  }
}
