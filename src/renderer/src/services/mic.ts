import { detectPitch } from '@/utils/pitch'

/**
 * The microphone for karaoke scoring. It is only listened to — never played
 * back (that would echo and feed back through the speakers). Echo
 * cancellation keeps most of the song itself out of the reading.
 */
export class MicInput {
  private constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    private analyser: AnalyserNode,
    private buf: Float32Array<ArrayBuffer>
  ) {}

  static async open(): Promise<MicInput> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    ctx.createMediaStreamSource(stream).connect(analyser)
    return new MicInput(ctx, stream, analyser, new Float32Array(analyser.fftSize))
  }

  /** Reads the latest window; returns the loudness (RMS) and the sung pitch in Hz (0 = none). */
  read(): { level: number; pitch: number } {
    this.analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i]
    const level = Math.sqrt(sum / this.buf.length)
    const pitch = detectPitch(this.buf, this.ctx.sampleRate, { minHz: 70, maxHz: 1100, clarity: 0.8, gate: 0.015 })
    return { level, pitch }
  }

  close(): void {
    for (const t of this.stream.getTracks()) t.stop()
    void this.ctx.close().catch(() => {})
  }
}
