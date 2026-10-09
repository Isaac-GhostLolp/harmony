import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'
import { isUltraFast } from '@/utils/perf'

/**
 * One small loop for every sticker that dances to the music. Zones holding
 * a 'beat' sticker register their layer here; while anything is registered
 * and a song plays, the loop reads the lows from the analyser (~30 fps),
 * finds the kicks (the lows jumping above their recent average, like the
 * LED logo) and writes the pulse to `--stk-kick` on those layers only, so
 * the restyle stays inside a few tiny subtrees. With nothing registered,
 * the loop is off.
 */

const layers = new Set<HTMLElement>()
let raf = 0
let last = 0
let avg = 0
let pulse = 0
let freq: Uint8Array<ArrayBuffer> | null = null

function frame(now: number): void {
  raf = 0
  if (!layers.size) return
  raf = requestAnimationFrame(frame)
  if (now - last < 32) return
  const dt = Math.min(0.1, (now - last) / 1000 || 0.03)
  last = now

  const playing = usePlayerStore.getState().isPlaying && !isUltraFast()
  if (playing) {
    const an = getEngine().getAnalyserNode()
    if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(freq)
    // the lowest ~180 Hz
    const top = Math.max(2, Math.min(freq.length, Math.round((180 / (an.context.sampleRate / 2)) * freq.length)))
    let sum = 0
    for (let i = 1; i < top; i++) sum += freq[i]
    const bass = Math.pow(sum / (top - 1) / 255, 1.4)
    if (bass > avg * 1.25 + 0.06 && pulse < 0.45) pulse = 1
    avg += (bass - avg) * Math.min(1, dt * 4)
  } else {
    avg *= 0.9
  }
  const was = pulse
  pulse = Math.max(0, pulse - dt * 4)
  if (was === 0 && pulse === 0) return
  // ease out: a quick swell that settles
  const v = (pulse * pulse).toFixed(3)
  for (const el of layers) el.style.setProperty('--stk-kick', v)
}

export function watchBeat(el: HTMLElement): () => void {
  layers.add(el)
  if (!raf) raf = requestAnimationFrame(frame)
  return () => {
    layers.delete(el)
    el.style.removeProperty('--stk-kick')
  }
}
