/**
 * Online metadata providers (lyrics, covers, album info).
 *
 * Providers (all public, no API keys):
 *   Lyrics: LRCLIB (synced .lrc) → lyrics.ovh (plain fallback)
 *   Covers/albums: Deezer → iTunes Search → MusicBrainz + Cover Art Archive
 *
 * Pipeline for messy YouTube-style files:
 *   1. Noise stripping — "(Official Video)", "[M/V]", "OFFICIAL LYRIC VIDEO",
 *      "áudio oficial" etc. are removed from queries.
 *   2. Query derivation — "Artist - Title" patterns in the TITLE are parsed
 *      (the metadata artist is often just the YouTube channel), producing
 *      multiple search attempts tried in order (including the reversed
 *      "Title - Artist" interpretation).
 *   3. Variant-aware scoring — a plain track never matches a "slowed",
 *      "remix", "live" (etc.) edition and vice-versa. For COVERS, the
 *      speed-only variants (slowed/reverb/sped up/nightcore/8D) are relaxed,
 *      since the artwork is identical to the original recording.
 */
import { createHash } from 'crypto'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getDb, coversDir } from '../db/database'

const UA = 'Harmony/0.5 (desktop offline music player)'
const TIMEOUT_MS = 8000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Variant detection
// ---------------------------------------------------------------------------

const VARIANT_RULES: [string, RegExp][] = [
  ['feat', /\b(feat\.?|ft\.?|featuring|part\.?|participa[çc][ãa]o)\b/i],
  ['remix', /\bremix\b/i],
  ['slowed', /\bslowed\b/i],
  ['reverb', /\breverb\b/i],
  ['spedup', /\bsped\s*up\b/i],
  ['nightcore', /\bnightcore\b/i],
  ['live', /\b(live|ao vivo)\b/i],
  ['acoustic', /\b(acoustic|ac[úu]stic[oa])\b/i],
  ['instrumental', /\binstrumental\b/i],
  ['karaoke', /\bkaraok[eê]\b/i],
  ['cover', /\bcover\b/i],
  ['radioedit', /\bradio\s*edit\b/i],
  ['extended', /\bextended\b/i],
  ['8d', /\b8d\b/i],
  ['remaster', /\bremaster(ed|izad[oa])?\b/i],
  ['demo', /\bdemo\b/i],
  ['mashup', /\bmash\s*up\b/i],
  ['version', /\b(version|vers[ãa]o)\b/i]
]

/** Never block a match on their own. */
const SOFT_VARIANTS = new Set(['feat', 'remaster'])

/** Speed/ambience edits: same artwork as the original → relaxed for covers. */
const SPEED_VARIANTS = new Set(['slowed', 'reverb', 'spedup', 'nightcore', '8d'])

export function extractVariants(text: string): Set<string> {
  const found = new Set<string>()
  for (const [tag, regex] of VARIANT_RULES) if (regex.test(text)) found.add(tag)
  return found
}

function variantsCompatible(
  local: Set<string>,
  candidate: Set<string>,
  extraSoft?: Set<string>
): boolean {
  const all = new Set([...local, ...candidate])
  for (const v of all) {
    if (SOFT_VARIANTS.has(v) || extraSoft?.has(v)) continue
    if (local.has(v) !== candidate.has(v)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Title cleaning & query derivation (YouTube-style noise)
// ---------------------------------------------------------------------------

const NOISE_RE =
  /\b(officia?l|oficial|m\s*[\/|]\s*v|mv|lyric(s)?|let(ra|tering)|video(clip|clipe)?|v[ií]deo|audio|[áa]udio|music\s*video|visuali[sz]er|clipe|hq|hd|4k|1080p?|color\s*coded|legendado|tradu[çc][ãa]o|sub(titles|titulado)?|premiere|performance|topic|vevo)\b/i

/** Removes bracketed groups whose content is noise: "(Official Video)", "[M/V]"… */
function stripNoise(text: string): string {
  let out = text.replace(/[([{][^)\]}]*[)\]}]/g, (seg) => (NOISE_RE.test(seg) ? ' ' : seg))
  out = out.replace(
    /\b(official\s+(music\s+)?(video|audio)|official\s+lyric\s+video|lyric\s+video|video\s+oficial|[áa]udio\s+oficial|clipe\s+oficial|m\s*\/\s*v)\b/gi,
    ' '
  )
  return out.replace(/\s+/g, ' ').trim()
}

/** Cleans a string down to what providers should receive as track title. */
function queryTitle(text: string): string {
  let t = stripNoise(text)
  t = t.replace(/[([{][^)\]}]*[)\]}]/g, ' ') // leftover brackets = variants → not part of the name
  t = t.replace(/\b(feat\.?|ft\.?|featuring)\b.*$/i, ' ') // cut collaborators from the query
  for (const [, regex] of VARIANT_RULES) t = t.replace(new RegExp(regex.source, 'gi'), ' ')
  t = t.replace(/[+\/|~•·]+/g, ' ') // slash/tilde decorations: "the box / slowed + reverb /"
  t = t.replace(/\s*[-–—]\s*$/, '')
  return t.replace(/\s+/g, ' ').trim()
}

/** "Artist - Title" / "Artist ~ Title" patterns inside the title tag. */
function splitArtistTitle(title: string): { artist: string; title: string } | null {
  const m = /^(.{2,}?)\s+[-–—~]\s+(.{2,})$/.exec(title)
  if (!m) return null
  return { artist: stripNoise(m[1]).trim(), title: m[2].trim() }
}

export interface LocalTrack {
  title: string
  artist: string | null
  album: string | null
  duration: number
}

interface Attempt {
  title: string
  artist: string | null
}

/** Ordered search attempts, most specific first. */
function deriveAttempts(local: LocalTrack): Attempt[] {
  const attempts: Attempt[] = []
  const push = (title: string, artist: string | null): void => {
    const t = title.trim()
    if (!t) return
    const key = `${t.toLowerCase()}|${(artist ?? '').toLowerCase()}`
    if (!attempts.some((a) => `${a.title.toLowerCase()}|${(a.artist ?? '').toLowerCase()}` === key)) {
      attempts.push({ title: t, artist: artist?.trim() || null })
    }
  }

  const split = splitArtistTitle(local.title)
  if (split) push(queryTitle(split.title), split.artist) // "Artist - Title"
  if (local.artist) push(queryTitle(local.title), stripNoise(local.artist)) // tagged metadata
  if (split) push(queryTitle(split.artist), queryTitle(split.title)) // reversed: "Title - Artist"
  if (split) push(queryTitle(split.title), null) // title-only fallback
  push(queryTitle(local.title), null)
  return attempts
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\b(feat\.?|ft\.?|featuring)\b.*$/i, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = curr
  }
  return prev[n]
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const max = Math.max(a.length, b.length)
  return 1 - levenshtein(a, b) / max
}

interface Candidate {
  title: string
  artist: string
  duration?: number
}

const MATCH_THRESHOLD = 0.62

export function scoreCandidate(
  attempt: Attempt,
  localVariants: Set<string>,
  duration: number,
  cand: Candidate,
  extraSoftVariants?: Set<string>
): number {
  if (!variantsCompatible(localVariants, extractVariants(cand.title), extraSoftVariants)) return 0

  // When the attempt has no artist, the title (and duration) carry the weight.
  const wTitle = attempt.artist ? 0.55 : 0.85
  const wArtist = attempt.artist ? 0.35 : 0

  let score =
    similarity(normalize(attempt.title), normalize(cand.title)) * wTitle +
    (attempt.artist ? similarity(normalize(attempt.artist), normalize(cand.artist)) * wArtist : 0)

  if (cand.duration && duration > 0) {
    const diff = Math.abs(cand.duration - duration)
    if (diff <= 4) score += 0.12
    else if (diff > 20) score *= 0.5
  }
  return score
}

function pickBest<T>(
  attempt: Attempt,
  localVariants: Set<string>,
  duration: number,
  items: T[],
  toCandidate: (t: T) => Candidate,
  extraSoftVariants?: Set<string>
): T | null {
  let best: T | null = null
  let bestScore = MATCH_THRESHOLD
  for (const item of items) {
    const s = scoreCandidate(attempt, localVariants, duration, toCandidate(item), extraSoftVariants)
    if (s > bestScore) {
      bestScore = s
      best = item
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Lyrics providers
// ---------------------------------------------------------------------------

export interface OnlineLyrics {
  source: string
  synced: string | null
  plain: string | null
}

export async function fetchLyricsOnline(local: LocalTrack): Promise<OnlineLyrics | null> {
  const enc = encodeURIComponent
  const localVariants = extractVariants(local.title)
  const attempts = deriveAttempts(local)

  for (const attempt of attempts) {
    // 1) LRCLIB exact lookup (needs an artist)
    if (attempt.artist) {
      const exact = await getJson(
        `https://lrclib.net/api/get?artist_name=${enc(attempt.artist)}&track_name=${enc(attempt.title)}` +
          (local.duration > 0 ? `&duration=${Math.round(local.duration)}` : '')
      )
      if (exact && (exact.syncedLyrics || exact.plainLyrics)) {
        return {
          source: 'LRCLIB',
          synced: exact.syncedLyrics ?? null,
          plain: exact.plainLyrics ?? null
        }
      }
    }

    // 2) LRCLIB search + variant-aware scoring
    const results = await getJson(
      `https://lrclib.net/api/search?track_name=${enc(attempt.title)}` +
        (attempt.artist ? `&artist_name=${enc(attempt.artist)}` : '')
    )
    if (Array.isArray(results)) {
      const usable = results.filter((r) => r.syncedLyrics || r.plainLyrics)
      const best = pickBest(attempt, localVariants, local.duration, usable, (r) => ({
        title: String(r.trackName ?? ''),
        artist: String(r.artistName ?? ''),
        duration: typeof r.duration === 'number' ? r.duration : undefined
      }))
      if (best) {
        return {
          source: 'LRCLIB',
          synced: best.syncedLyrics ?? null,
          plain: best.plainLyrics ?? null
        }
      }
    }
  }

  // 3) lyrics.ovh plain-text fallback (first attempt with an artist)
  const withArtist = attempts.find((a) => a.artist)
  if (withArtist) {
    const ovh = await getJson(
      `https://api.lyrics.ovh/v1/${enc(withArtist.artist!)}/${enc(withArtist.title)}`
    )
    if (ovh?.lyrics && typeof ovh.lyrics === 'string' && ovh.lyrics.trim()) {
      return { source: 'lyrics.ovh', synced: null, plain: ovh.lyrics.trim() }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Cover / album providers
// ---------------------------------------------------------------------------

interface CoverHit {
  title: string
  artist: string
  album: string | null
  year: number | null
  coverUrl: string
  duration?: number
  source: string
}

async function searchDeezer(attempt: Attempt): Promise<CoverHit[]> {
  const q = attempt.artist ? `artist:"${attempt.artist}" track:"${attempt.title}"` : attempt.title
  const data = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`)
  if (!Array.isArray(data?.data)) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.data.flatMap((t: any): CoverHit[] => {
    const coverUrl = t?.album?.cover_xl ?? t?.album?.cover_big
    if (!coverUrl) return []
    return [
      {
        title: String(t.title ?? ''),
        artist: String(t.artist?.name ?? ''),
        album: t.album?.title ? String(t.album.title) : null,
        year: null,
        coverUrl: String(coverUrl),
        duration: typeof t.duration === 'number' ? t.duration : undefined,
        source: 'Deezer'
      }
    ]
  })
}

async function searchItunes(attempt: Attempt): Promise<CoverHit[]> {
  const term = `${attempt.artist ?? ''} ${attempt.title}`.trim()
  const data = await getJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=10`
  )
  if (!Array.isArray(data?.results)) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.results.flatMap((t: any): CoverHit[] => {
    if (!t?.artworkUrl100) return []
    return [
      {
        title: String(t.trackName ?? ''),
        artist: String(t.artistName ?? ''),
        album: t.collectionName ? String(t.collectionName) : null,
        year: t.releaseDate ? new Date(t.releaseDate).getFullYear() : null,
        coverUrl: String(t.artworkUrl100).replace('100x100', '600x600'),
        duration: typeof t.trackTimeMillis === 'number' ? t.trackTimeMillis / 1000 : undefined,
        source: 'iTunes'
      }
    ]
  })
}

async function searchMusicBrainz(attempt: Attempt): Promise<CoverHit[]> {
  const query = `recording:"${attempt.title}"${attempt.artist ? ` AND artist:"${attempt.artist}"` : ''}`
  const data = await getJson(
    `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`
  )
  if (!Array.isArray(data?.recordings)) return []
  const hits: CoverHit[] = []
  for (const rec of data.recordings.slice(0, 5)) {
    const release = rec?.releases?.[0]
    if (!release?.id) continue
    hits.push({
      title: String(rec.title ?? ''),
      artist: String(rec['artist-credit']?.[0]?.name ?? ''),
      album: release.title ? String(release.title) : null,
      year: release.date ? parseInt(String(release.date).slice(0, 4), 10) || null : null,
      coverUrl: `https://coverartarchive.org/release/${release.id}/front-500`,
      duration: typeof rec.length === 'number' ? rec.length / 1000 : undefined,
      source: 'MusicBrainz'
    })
  }
  return hits
}

async function downloadImage(url: string, cacheKey: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow'
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    const ext = type.includes('png') ? 'png' : 'jpg'
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 1024) return null
    const hash = createHash('md5').update(cacheKey).digest('hex')
    const file = join(coversDir(), `online-${hash}.${ext}`)
    if (!existsSync(file)) writeFileSync(file, buffer)
    return file
  } catch {
    return null
  }
}

export interface CoverResult {
  coverPath: string
  albumTitle: string | null
  year: number | null
  source: string
}

export async function fetchCoverOnline(local: LocalTrack): Promise<CoverResult | null> {
  const localVariants = extractVariants(local.title)
  const attempts = deriveAttempts(local)

  for (const attempt of attempts) {
    let hits = [...(await searchDeezer(attempt)), ...(await searchItunes(attempt))]
    if (hits.length === 0) hits = await searchMusicBrainz(attempt)
    if (hits.length === 0) continue

    // Speed variants relaxed: a "slowed + reverb" file still deserves the
    // original recording's artwork.
    const best = pickBest(
      attempt,
      localVariants,
      local.duration,
      hits,
      (h) => ({ title: h.title, artist: h.artist, duration: h.duration }),
      SPEED_VARIANTS
    )
    if (!best) continue

    const coverPath = await downloadImage(
      best.coverUrl,
      `${best.album ?? best.title}::${best.artist}`
    )
    if (coverPath) {
      return { coverPath, albumTitle: best.album, year: best.year, source: best.source }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// DB helpers used by the IPC layer
// ---------------------------------------------------------------------------

/** Effective cover honoring the user's per-album preference. */
export const EFFECTIVE_COVER_SQL = `CASE
  WHEN al.preferred_cover = 'embedded' THEN al.cover_path
  WHEN al.preferred_cover = 'online' THEN COALESCE(al.online_cover_path, al.cover_path)
  ELSE COALESCE(al.cover_path, al.online_cover_path)
END`

export function applyCoverToSong(songId: number, result: CoverResult): string | null {
  const db = getDb()
  const song = db
    .prepare('SELECT id, album_id, artist_id FROM songs WHERE id = ?')
    .get(songId) as { id: number; album_id: number | null; artist_id: number | null }

  let albumId = song.album_id
  if (!albumId) {
    // Song had no album metadata: create/link one from the provider data.
    const title = result.albumTitle ?? 'Unknown Album'
    db.prepare('INSERT OR IGNORE INTO albums (title, artist_id, year) VALUES (?, ?, ?)').run(
      title,
      song.artist_id,
      result.year
    )
    const album = db
      .prepare('SELECT id FROM albums WHERE title = ? AND artist_id IS ?')
      .get(title, song.artist_id) as { id: number }
    albumId = album.id
    db.prepare('UPDATE songs SET album_id = ? WHERE id = ?').run(albumId, songId)
  }

  // Online art always goes to its own column — the original embedded cover
  // in cover_path is never overwritten.
  db.prepare('UPDATE albums SET online_cover_path = ? WHERE id = ?').run(result.coverPath, albumId)
  if (result.year) {
    db.prepare('UPDATE albums SET year = COALESCE(year, ?) WHERE id = ?').run(result.year, albumId)
  }

  const row = db
    .prepare(`SELECT ${EFFECTIVE_COVER_SQL} as cover FROM albums al WHERE al.id = ?`)
    .get(albumId) as { cover: string | null }
  return row.cover
}

/**
 * Fetches an artist photo via Deezer's artist search (which exposes picture_*
 * URLs), downloads it into the covers cache and returns the local path.
 * Returns null when the artist can't be matched or has no usable picture.
 */
export async function fetchArtistPhoto(artistName: string): Promise<string | null> {
  const name = artistName.trim()
  if (!name) return null
  const data = await getJson(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`
  )
  if (!data?.data?.length) return null
  // prefer an exact (case-insensitive) name match, else the top result
  const lower = name.toLowerCase()
  const match =
    data.data.find((a: any) => (a.name ?? '').toLowerCase() === lower) ?? data.data[0]
  const pic: string | undefined =
    match.picture_xl || match.picture_big || match.picture_medium || match.picture
  // Deezer returns a placeholder silhouette when it has no real photo; those
  // URLs contain no artist id path segment we can rely on, so guard on size.
  if (!pic || pic.includes('/artist//')) return null
  return downloadImage(pic, `artist-${lower}`)
}
