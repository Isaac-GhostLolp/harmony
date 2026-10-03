/**
 * Edit export — renders the edit to a video file offline, frame by frame.
 *
 * The first version recorded the live preview with MediaRecorder. That ties
 * the video to real time: when the machine can't draw and encode a frame in
 * 1/30 s, the encoder drops it and the clip stutters. Here nothing runs in
 * real time:
 *
 *   1. the song is decoded and the clip rendered through an
 *      OfflineAudioContext (same EQ as the player, short fades at the edges).
 *      The render pauses every 1/60 s of song time to let a private
 *      StageDirector read the same analysers the live stage uses, so kicks
 *      and big hits land exactly where they do in the preview
 *   2. every video frame is drawn at its exact timestamp and handed to the
 *      WebCodecs encoder, which waits for us (never drops). A slow computer
 *      just takes longer; the video is always a smooth 30 fps
 *   3. Mediabunny muxes it: H.264 + AAC in MP4 when the system has an H.264
 *      encoder (almost every Windows / macOS machine), else VP9 + Opus WebM
 */
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat
} from 'mediabunny'
import { StageDirector, type DirectorFrame } from '@/services/stageDirector'
import { activeLineIndex, type LrcLine } from '@/utils/lrc'
import { createEditState, drawEdit, EDIT_W, FORMAT_H, type EditOptions } from './editRenderer'

export const EXPORT_FPS = 30
const SAMPLE_RATE = 48000
const PREROLL = 6 // seconds of song read before the clip so the director is warmed up
const STEP = 1 / 60 // director steps (it is tuned for 60 fps)

export interface EditExportJob {
  /** The encoded song file (any format the browser decodes). */
  audio: ArrayBuffer
  eq: { type: BiquadFilterType; frequency: number; Q: number; gain: number }[]
  start: number
  end: number
  duration: number
  lines: LrcLine[]
  cover: HTMLImageElement | null
  title: string
  artist: string
  accent: [number, number, number]
  opts: EditOptions
  quality: '720' | '1080'
  onProgress: (phase: 'audio' | 'video' | 'finish', progress: number) => void
  isCancelled: () => boolean
}

export interface EditExportResult {
  data: ArrayBuffer
  ext: 'mp4' | 'webm'
}

export class ExportCancelled extends Error {}

interface Beat {
  kick: Float32Array
  hit: Uint8Array
  level: Uint8Array
}

/** Decodes the song and renders the clip, reading the director along the way. */
async function renderAudio(job: EditExportJob, frames: number): Promise<{ clip: AudioBuffer; beat: Beat }> {
  const decoded = await new OfflineAudioContext(2, 1, SAMPLE_RATE).decodeAudioData(job.audio.slice(0))
  const pre = Math.min(PREROLL, job.start)
  const from = job.start - pre
  const length = Math.ceil((job.end - from) * SAMPLE_RATE)
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE)

  const src = ctx.createBufferSource()
  src.buffer = decoded
  let node: AudioNode = src
  for (const f of job.eq) {
    const b = ctx.createBiquadFilter()
    b.type = f.type
    b.frequency.value = f.frequency
    b.Q.value = f.Q
    b.gain.value = f.gain
    node.connect(b)
    node = b
  }
  // the same two taps the live engine has (see audioEngine.ts)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.82
  const detector = ctx.createAnalyser()
  detector.fftSize = 1024
  detector.smoothingTimeConstant = 0.25
  node.connect(analyser)
  node.connect(detector)
  // short fades so the clip doesn't start or stop mid-transient
  const fade = ctx.createGain()
  fade.gain.setValueAtTime(0, 0)
  fade.gain.setValueAtTime(0, pre)
  fade.gain.linearRampToValueAtTime(1, pre + 0.12)
  const clipLen = job.end - job.start
  fade.gain.setValueAtTime(1, pre + Math.max(0.2, clipLen - 0.5))
  fade.gain.linearRampToValueAtTime(0, pre + clipLen)
  node.connect(fade)
  fade.connect(ctx.destination)
  src.start(0, from)

  const director = new StageDirector({
    getAnalyserNode: () => analyser,
    getDetectorNode: () => detector,
    getSampleRate: () => SAMPLE_RATE
  })
  const beat: Beat = { kick: new Float32Array(frames), hit: new Uint8Array(frames), level: new Uint8Array(frames) }
  const steps = Math.floor((job.end - from) / STEP)
  for (let k = 1; k < steps; k++) {
    const at = k * STEP
    ctx.suspend(at).then(() => {
      const songTime = from + at
      const F = director.update(true, job.duration > 0 ? songTime / job.duration : 0, 'edit-export', STEP)
      const n = Math.floor((songTime - job.start) * EXPORT_FPS)
      if (n >= 0 && n < frames) {
        beat.kick[n] = Math.max(beat.kick[n], F.kickTick)
        if (F.impactHit) beat.hit[n] = 1
        beat.level[n] = Math.max(beat.level[n], F.impactLevel)
      }
      if (k % 120 === 0) job.onProgress('audio', at / (job.end - from))
      void ctx.resume()
    })
  }
  const rendered = await ctx.startRendering()

  // keep only the clip itself (drop the pre-roll)
  const offset = Math.round(pre * SAMPLE_RATE)
  const clip = new AudioBuffer({ numberOfChannels: 2, length: rendered.length - offset, sampleRate: SAMPLE_RATE })
  for (let c = 0; c < 2; c++) clip.copyToChannel(rendered.getChannelData(c).subarray(offset), c)
  return { clip, beat }
}

export async function exportEdit(job: EditExportJob): Promise<EditExportResult> {
  const H = FORMAT_H[job.opts.format]
  const scale = job.quality === '720' ? 720 / EDIT_W : 1
  const width = Math.round(EDIT_W * scale)
  const height = Math.round(H * scale)
  const bitrate = job.quality === '720' ? 5_000_000 : 8_000_000

  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width, height, bitrate })
  if (!videoCodec) throw new Error('no-encoder')
  const mp4 = videoCodec === 'avc'
  const audioCodec = await getFirstEncodableAudioCodec(mp4 ? ['aac', 'opus'] : ['opus'], {
    numberOfChannels: 2,
    sampleRate: SAMPLE_RATE,
    bitrate: 192_000
  })
  if (!audioCodec) throw new Error('no-encoder')

  const frames = Math.max(1, Math.round((job.end - job.start) * EXPORT_FPS))
  job.onProgress('audio', 0)
  const { clip, beat } = await renderAudio(job, frames)
  if (job.isCancelled()) throw new ExportCancelled()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const S = createEditState()

  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget()
  })
  const video = new CanvasSource(canvas, { codec: videoCodec, bitrate, keyFrameInterval: 2 })
  const audio = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 })
  output.addVideoTrack(video, { frameRate: EXPORT_FPS })
  output.addAudioTrack(audio)
  await output.start()

  try {
    await audio.add(clip)
    audio.close()

    // only the fields the edit renderer reads
    const F = { kickTick: 0, impactHit: false, impactLevel: 0 } as unknown as DirectorFrame
    let yieldAt = performance.now()
    for (let n = 0; n < frames; n++) {
      if (job.isCancelled()) throw new ExportCancelled()
      const time = job.start + n / EXPORT_FPS
      F.kickTick = beat.kick[n]
      F.impactHit = beat.hit[n] === 1
      F.impactLevel = beat.level[n]
      drawEdit(
        ctx,
        S,
        {
          time,
          duration: job.duration,
          lines: job.lines,
          active: activeLineIndex(job.lines, time),
          cover: job.cover,
          title: job.title,
          artist: job.artist,
          accent: job.accent,
          F,
          opts: job.opts
        },
        scale
      )
      await video.add(n / EXPORT_FPS, 1 / EXPORT_FPS)
      // let the app breathe (input, the progress bar) every ~50 ms
      if (performance.now() - yieldAt > 50) {
        job.onProgress('video', n / frames)
        await new Promise((r) => setTimeout(r, 0))
        yieldAt = performance.now()
      }
    }
    video.close()
    job.onProgress('finish', 1)
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }
  const data = (output.target as BufferTarget).buffer
  if (!data) throw new Error('empty')
  return { data, ext: mp4 ? 'mp4' : 'webm' }
}
