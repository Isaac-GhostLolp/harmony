import { mediaUrl } from '@/utils/format'

/**
 * The real shape of a song, for the "Forma de onda" progress bar: its
 * loudness in PEAKS slices, 0..1. The file is decoded at a low sample rate
 * (8 kHz mono: a 4-minute song is ~8 MB instead of ~85 MB at full quality),
 * one song at a time, and the result is kept for the session (the last
 * CACHE songs). Big files and failures give null; the bar then stays flat.
 */

export const PEAKS = 200
const CACHE = 120
const MAX_BYTES = 80 * 1024 * 1024

const cache = new Map<string, Float32Array | null>()
const pending = new Map<string, Promise<Float32Array | null>>()
let queue: Promise<unknown> = Promise.resolve()

export function cachedPeaks(path: string): Float32Array | null | undefined {
  return cache.get(path)
}

export function songPeaks(path: string): Promise<Float32Array | null> {
  if (cache.has(path)) return Promise.resolve(cache.get(path)!)
  const running = pending.get(path)
  if (running) return running
  // one decode at a time: they are short, but each one is a burst of CPU
  const job = queue.then(() => compute(path)).then(
    (v) => remember(path, v),
    () => remember(path, null)
  )
  queue = job
  pending.set(path, job)
  return job
}

function remember(path: string, v: Float32Array | null): Float32Array | null {
  pending.delete(path)
  cache.set(path, v)
  if (cache.size > CACHE) cache.delete(cache.keys().next().value!)
  return v
}

async function compute(path: string): Promise<Float32Array | null> {
  const url = mediaUrl(path)
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) return null
  const size = Number(res.headers.get('content-length') ?? 0)
  if (size > MAX_BYTES) return null
  const data = await res.arrayBuffer()
  if (data.byteLength > MAX_BYTES) return null
  const ctx = new OfflineAudioContext(1, 1, 8000)
  const audio = await ctx.decodeAudioData(data)
  // mix down to one channel's worth of loudness per slice (RMS)
  const n = audio.length
  const chans = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c))
  const out = new Float32Array(PEAKS)
  const step = n / PEAKS
  let max = 0
  for (let i = 0; i < PEAKS; i++) {
    const a = Math.floor(i * step)
    const b = Math.max(a + 1, Math.floor((i + 1) * step))
    let sum = 0
    for (const ch of chans) for (let j = a; j < b; j++) sum += ch[j] * ch[j]
    const rms = Math.sqrt(sum / ((b - a) * chans.length))
    out[i] = rms
    if (rms > max) max = rms
  }
  if (max <= 0) return out
  // normalise, with a little lift so quiet parts still show
  for (let i = 0; i < PEAKS; i++) out[i] = Math.pow(out[i] / max, 0.75)
  return out
}
