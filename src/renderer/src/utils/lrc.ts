export interface LrcWord {
  time: number
  text: string
}

export interface LrcLine {
  time: number
  text: string
  /** Present when the LRC has enhanced word timestamps: <mm:ss.xx>word */
  words?: LrcWord[]
}

const LINE_TS = /\[(\d+):(\d+(?:\.\d+)?)\]/g
const WORD_TS = /<(\d+):(\d+(?:\.\d+)?)>/g

const toSeconds = (min: string, sec: string): number => parseInt(min, 10) * 60 + parseFloat(sec)

/**
 * Parses standard LRC (`[mm:ss.xx] line`) and enhanced LRC with per-word
 * timestamps (`[mm:ss.xx] <mm:ss.xx>word <mm:ss.xx>word`), which powers
 * word-accurate karaoke painting when available.
 */
export function parseLrc(raw: string): LrcLine[] {
  const lines: LrcLine[] = []
  for (const row of raw.split(/\r?\n/)) {
    const timestamps = [...row.matchAll(LINE_TS)]
    if (timestamps.length === 0) continue

    const content = row.replace(LINE_TS, '').trim()
    if (!content) continue

    // Enhanced word timestamps?
    const wordMatches = [...content.matchAll(WORD_TS)]
    let words: LrcWord[] | undefined
    let text = content
    if (wordMatches.length > 0) {
      words = []
      const parts = content.split(WORD_TS)
      // split with capture groups yields: [before, min, sec, chunk, min, sec, chunk, ...]
      for (let i = 1; i + 2 < parts.length + 1; i += 3) {
        const t = toSeconds(parts[i], parts[i + 1])
        const w = (parts[i + 2] ?? '').trim()
        if (w) words.push({ time: t, text: w })
      }
      text = content.replace(WORD_TS, '').replace(/\s+/g, ' ').trim()
      if (words.length === 0) words = undefined
    }

    for (const m of timestamps) {
      lines.push({ time: toSeconds(m[1], m[2]), text, words })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

/**
 * Finds the active line index for a given playback time. Uses the exact line
 * timestamp — no fixed lead/offset, which previously made lines feel early on
 * slow songs and late on fast ones (the timing drift bug).
 */
export function activeLineIndex(lines: LrcLine[], time: number): number {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time) idx = i
    else break
  }
  return idx
}

/**
 * Karaoke paint progress (0..1) for a line at playback `time`.
 * Word timestamps give word-accurate painting; otherwise the fill is
 * interpolated linearly between this line's start and the next line's.
 */
export function lineProgress(lines: LrcLine[], index: number, time: number): number {
  const line = lines[index]
  if (!line) return 0
  const end = lines[index + 1]?.time ?? line.time + 6

  if (line.words && line.words.length > 0) {
    const words = line.words
    if (time <= words[0].time) return 0
    for (let k = 0; k < words.length; k++) {
      const start = words[k].time
      const next = words[k + 1]?.time ?? end
      if (time < next) {
        const intra = next > start ? (time - start) / (next - start) : 1
        return Math.min(1, (k + intra) / words.length)
      }
    }
    return 1
  }

  if (end <= line.time) return 1
  return Math.min(1, Math.max(0, (time - line.time) / (end - line.time)))
}
