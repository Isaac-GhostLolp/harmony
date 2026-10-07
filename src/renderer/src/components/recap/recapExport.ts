/**
 * Retrospectiva export — renders the recap video offline with the same
 * engine as the lyric edits (see edit/editExport.ts): the soundtrack is the
 * #1 song of the period, from its strongest stretch, rendered through an
 * OfflineAudioContext with the player's EQ while the stage director reads
 * the beat; then every frame is drawn at its exact time and encoded.
 */
import {
  decodeSong,
  encodeFrames,
  EXPORT_FPS,
  ExportCancelled,
  pickCodecs,
  renderClipAudio,
  SAMPLE_RATE,
  type Beat,
  type EditExportJob,
  type EditExportResult
} from '../edit/editExport'
import {
  createRecapState,
  drawRecap,
  RECAP_H,
  RECAP_W,
  recapLength,
  type RecapAssets,
  type RecapData,
  type Scene
} from './recapRenderer'

export interface RecapExportJob {
  data: RecapData
  assets: RecapAssets
  scenes: Scene[]
  /** the soundtrack file, or null for a silent video */
  audio: ArrayBuffer | null
  eq: EditExportJob['eq']
  quality: '720' | '1080'
  onProgress: (phase: 'audio' | 'video' | 'finish', progress: number) => void
  isCancelled: () => boolean
}

/**
 * Where the song is strongest for `length` seconds: the loudest window,
 * skipping the very start (intros are usually quiet anyway).
 */
export function strongestStart(buf: AudioBuffer, length: number): number {
  const dur = buf.duration
  if (dur <= length + 1) return 0
  const block = 0.5
  const n = Math.floor(dur / block)
  const per = Math.floor(block * buf.sampleRate)
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const energy = new Float64Array(n)
  for (let b = 0; b < n; b++) {
    let sum = 0
    // every 4th sample is plenty for loudness
    for (let i = b * per; i < (b + 1) * per; i += 4) for (const ch of chans) sum += ch[i] * ch[i]
    energy[b] = sum
  }
  const win = Math.ceil(length / block)
  const first = Math.min(Math.floor((dur * 0.08) / block), Math.max(0, n - win))
  let cur = 0
  for (let b = first; b < first + win && b < n; b++) cur += energy[b]
  let best = cur
  let bestAt = first
  for (let b = first + 1; b + win <= n; b++) {
    cur += energy[b + win - 1] - energy[b - 1]
    if (cur > best) {
      best = cur
      bestAt = b
    }
  }
  return bestAt * block
}

/** Pads (or trims) a clip to exactly `length` seconds. */
function fitClip(clip: AudioBuffer, length: number): AudioBuffer {
  const total = Math.ceil(length * SAMPLE_RATE)
  if (clip.length === total) return clip
  const out = new AudioBuffer({ numberOfChannels: 2, length: total, sampleRate: SAMPLE_RATE })
  for (let c = 0; c < 2; c++) out.copyToChannel(clip.getChannelData(Math.min(c, clip.numberOfChannels - 1)).subarray(0, total), c)
  return out
}

export async function exportRecap(job: RecapExportJob): Promise<EditExportResult> {
  const scale = job.quality === '720' ? 720 / RECAP_W : 1
  const width = Math.round(RECAP_W * scale)
  const height = Math.round(RECAP_H * scale)
  const bitrate = job.quality === '720' ? 5_000_000 : 9_000_000
  const codecs = await pickCodecs(width, height, bitrate)

  const length = recapLength(job.scenes)
  const frames = Math.max(1, Math.round(length * EXPORT_FPS))

  job.onProgress('audio', 0)
  let clip: AudioBuffer
  let beat: Beat
  if (job.audio) {
    const decoded = await decodeSong(job.audio)
    const start = strongestStart(decoded, length)
    const r = await renderClipAudio(
      {
        audio: decoded,
        eq: job.eq,
        start,
        end: Math.min(decoded.duration, start + length),
        duration: decoded.duration,
        onProgress: (p) => job.onProgress('audio', p)
      },
      frames
    )
    clip = fitClip(r.clip, length)
    beat = r.beat
  } else {
    clip = fitClip(new AudioBuffer({ numberOfChannels: 2, length: 1, sampleRate: SAMPLE_RATE }), length)
    beat = { kick: new Float32Array(frames), hit: new Uint8Array(frames), level: new Uint8Array(frames) }
  }
  if (job.isCancelled()) throw new ExportCancelled()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const S = createRecapState()
  const frame = { time: 0, kick: 0, hit: false }

  const result = await encodeFrames({
    codecs,
    canvas,
    bitrate,
    frames,
    clip,
    isCancelled: job.isCancelled,
    onProgress: (p) => job.onProgress('video', p),
    draw: (n) => {
      frame.time = n / EXPORT_FPS
      frame.kick = Math.min(1, beat.kick[n] * 2)
      frame.hit = beat.hit[n] === 1 && beat.level[n] >= 3
      drawRecap(ctx, S, job.data, job.assets, job.scenes, frame, scale)
    }
  })
  job.onProgress('finish', 1)
  return result
}
