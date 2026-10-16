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
 *
 * Shared by the desktop (main process) and Android (WebView, where fetch goes
 * through Capacitor's native HTTP, so there is no CORS). Each platform saves
 * downloaded images in its own folder (SaveImage).
 */
import type { Db } from './db'
import { EFFECTIVE_COVER_SQL, getSetting, setSetting } from './library'

const UA = 'Harmony/0.5 (offline music player)'
const TIMEOUT_MS = 8000

/**
 * Marks a lookup that couldn't ask a provider (offline, timed out, or the
 * site overloaded): its "nothing found" isn't trusted, so it isn't remembered.
 */
export interface LookupTrace {
  failed: boolean
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * A provider's JSON, or null. A real "no" (404 and the like) is final; a
 * busy or unreachable site (429, 5xx, network) is asked again twice before
 * the lookup is marked as failed — once failed, later requests try only once.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string, trace?: LookupTrace): Promise<any | null> {
  const tries = trace?.failed ? 1 : 3
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (res.ok) return await res.json()
      if (res.status !== 429 && res.status < 500) return null
    } catch {
      /* offline or timed out: try again */
    }
    if (i < tries - 1) await wait(700 * (i + 1) * (i + 1))
  }
  if (trace) trace.failed = true
  return null
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

const words = (text: string): string[] => normalize(text).split(' ').filter(Boolean)

/** How well a free-text name ("Espresso Sabrina Carpenter") covers a candidate's title + artist. */
function wordsScore(name: string, cand: Candidate): number {
  const mine = new Set(words(name))
  const theirs = [...new Set([...words(cand.title), ...words(cand.artist)])]
  if (mine.size === 0 || theirs.length === 0 || words(cand.artist).length === 0) return 0
  const found = theirs.filter((w) => mine.has(w)).length
  const covered = found / theirs.length // all of their words are in the name
  const used = found / mine.size // and the name is mostly them
  return covered * 0.55 + used * 0.3
}

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

  // No artist: the name may hold it too, in any order and with no dash —
  // "Espresso Sabrina Carpenter". Then every word of the candidate's title
  // and artist should be in the name, and most of the name in them.
  if (!attempt.artist) score = Math.max(score, wordsScore(attempt.title, cand))

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

interface LrclibRow {
  trackName?: string
  artistName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

export async function fetchLyricsOnline(local: LocalTrack, trace?: LookupTrace): Promise<OnlineLyrics | null> {
  const enc = encodeURIComponent
  const localVariants = extractVariants(local.title)
  const attempts = deriveAttempts(local)
  // plain text found on the way, used only if no synced lyrics turn up
  let plain: OnlineLyrics | null = null
  const found = (r: { syncedLyrics?: string | null; plainLyrics?: string | null }): OnlineLyrics => ({
    source: 'LRCLIB',
    synced: r.syncedLyrics ?? null,
    plain: r.plainLyrics ?? null
  })

  for (const attempt of attempts) {
    // 1) LRCLIB exact lookup (needs an artist)
    if (attempt.artist) {
      const exact = await getJson(
        `https://lrclib.net/api/get?artist_name=${enc(attempt.artist)}&track_name=${enc(attempt.title)}` +
          (local.duration > 0 ? `&duration=${Math.round(local.duration)}` : ''),
        trace
      )
      if (exact?.syncedLyrics) return found(exact)
      if (exact?.plainLyrics) plain ??= found(exact)
    }

    // 2) LRCLIB search + variant-aware scoring; a synced match wins over a better-scored plain one
    const results = await getJson(
      attempt.artist
        ? `https://lrclib.net/api/search?track_name=${enc(attempt.title)}&artist_name=${enc(attempt.artist)}`
        : // no artist: search every field, so a name like "Espresso Sabrina Carpenter" finds the song
          `https://lrclib.net/api/search?q=${enc(attempt.title)}`,
      trace
    )
    if (Array.isArray(results)) {
      const rows = results as LrclibRow[]
      const asCandidate = (r: LrclibRow): Candidate => ({
        title: String(r.trackName ?? ''),
        artist: String(r.artistName ?? ''),
        duration: typeof r.duration === 'number' ? r.duration : undefined
      })
      const synced = pickBest(attempt, localVariants, local.duration, rows.filter((r) => r.syncedLyrics), asCandidate)
      if (synced) return found(synced)
      const text = pickBest(attempt, localVariants, local.duration, rows.filter((r) => r.plainLyrics), asCandidate)
      if (text) plain ??= found(text)
    }
  }
  if (plain) return plain

  // 3) lyrics.ovh plain-text fallback (first attempt with an artist)
  const withArtist = attempts.find((a) => a.artist)
  if (withArtist) {
    const ovh = await getJson(`https://api.lyrics.ovh/v1/${enc(withArtist.artist!)}/${enc(withArtist.title)}`, trace)
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

/** Saves downloaded image bytes; returns the file's path (each platform has its own folder). */
export type SaveImage = (data: Uint8Array, ext: 'jpg' | 'png', key: string) => Promise<string | null>

async function downloadImage(url: string, cacheKey: string, save: SaveImage): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow'
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    const data = new Uint8Array(await res.arrayBuffer())
    if (data.length < 1024) return null
    return await save(data, type.includes('png') ? 'png' : 'jpg', cacheKey)
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

export async function fetchCoverOnline(local: LocalTrack, save: SaveImage): Promise<CoverResult | null> {
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

    const coverPath = await downloadImage(best.coverUrl, `${best.album ?? best.title}::${best.artist}`, save)
    if (coverPath) {
      return { coverPath, albumTitle: best.album, year: best.year, source: best.source }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

export function applyCoverToSong(db: Db, songId: number, result: CoverResult): string | null {
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
export async function fetchArtistPhoto(artistName: string, save: SaveImage): Promise<string | null> {
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
  return downloadImage(pic, `artist-${lower}`, save)
}

/**
 * Looks up a song's genre via the iTunes Search API (primaryGenreName), which
 * has good coverage for mainstream music. Returns null if nothing solid is
 * found. Used to fill in genres for files whose tags only say "Music" or are
 * empty, so stats like "top genre" become meaningful.
 */
export async function fetchGenre(
  title: string,
  artist: string | null
): Promise<string | null> {
  const term = [artist, title].filter(Boolean).join(' ').trim()
  if (!term) return null
  const data = await getJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5`
  )
  if (!data?.results?.length) return null
  // prefer a result whose track/artist roughly matches
  const lowerTitle = title.toLowerCase()
  const best =
    data.results.find((r: any) => (r.trackName ?? '').toLowerCase().includes(lowerTitle)) ??
    data.results[0]
  const genre: string | undefined = best.primaryGenreName
  if (!genre || genre.toLowerCase() === 'music') return null // "Music" is the useless catch-all
  return genre
}

// ---------------------------------------------------------------------------
// The online channels (lyrics, covers, the bulk metadata refresh)
// ---------------------------------------------------------------------------

export interface OnlineDeps {
  saveImage: SaveImage
  /** a synced .lrc next to the song file (the desktop reads it from disk) */
  readSidecarLrc?: (songPath: string) => string | null
  progress: (p: { done: number; total: number; label: string }) => void
  /** the few texts shown in the app's language: (Portuguese, English) */
  tr: (pt: string, en: string) => string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onlineHandlers(db: () => Db, deps: OnlineDeps): Record<string, (...args: any[]) => unknown> {
  const onlineEnabled = (): boolean => {
    const row = db().prepare("SELECT value FROM settings WHERE key = 'onlineEnabled'").get() as
      | { value: string }
      | undefined
    return row ? JSON.parse(row.value) !== false : true
  }

  const NOT_FOUND_RETRY_S = 3 * 24 * 3600 // re-query providers after 3 days

  // When the search gets better, songs it missed (or matched without timing)
  // are looked up again instead of waiting for their 3 days.
  const MATCHER_VERSION = 2
  try {
    if (getSetting(db(), 'lyricsMatcher') !== MATCHER_VERSION) {
      db().prepare('DELETE FROM lyrics_cache WHERE found = 0 OR synced IS NULL').run()
      setSetting(db(), 'lyricsMatcher', MATCHER_VERSION)
    }
  } catch {
    /* the cache just stays as it is */
  }

  return {
    // Resolution order (per Isaac): ONLINE first — providers usually have
    // better-synced lyrics — falling back to the local sidecar .lrc.
    // A synced result always beats a plain-text one, whatever the source.
    'lyrics:resolve': async (songId: number, force = false) => {
      if (force) db().prepare('DELETE FROM lyrics_cache WHERE song_id = ?').run(songId)
      const song = db()
        .prepare(
          `SELECT s.path, s.title, s.duration, ar.name as artist, al.title as album
           FROM songs s
           LEFT JOIN artists ar ON ar.id = s.artist_id
           LEFT JOIN albums al ON al.id = s.album_id
           WHERE s.id = ?`
        )
        .get(songId) as
        | { path: string; title: string; duration: number; artist: string | null; album: string | null }
        | undefined
      if (!song) return null

      // 1) Online (through cache)
      let online: { source: string; synced: string | null; plain: string | null } | null = null
      const cached = db()
        .prepare('SELECT found, source, synced, plain, fetched_at FROM lyrics_cache WHERE song_id = ?')
        .get(songId) as
        | { found: number; source: string | null; synced: string | null; plain: string | null; fetched_at: number }
        | undefined

      if (cached?.found) {
        online = { source: cached.source ?? 'cache', synced: cached.synced, plain: cached.plain }
      } else if (
        onlineEnabled() &&
        (!cached || Date.now() / 1000 - cached.fetched_at >= NOT_FOUND_RETRY_S)
      ) {
        const trace: LookupTrace = { failed: false }
        online = await fetchLyricsOnline(
          { title: song.title, artist: song.artist, album: song.album, duration: song.duration },
          trace
        )
        // "nothing found" is remembered only when the providers really answered
        if (online || !trace.failed)
          db()
            .prepare(
              `INSERT INTO lyrics_cache (song_id, found, source, synced, plain, fetched_at)
               VALUES (?, ?, ?, ?, ?, unixepoch())
               ON CONFLICT(song_id) DO UPDATE SET
                 found = excluded.found, source = excluded.source, synced = excluded.synced,
                 plain = excluded.plain, fetched_at = excluded.fetched_at`
            )
            .run(songId, online ? 1 : 0, online?.source ?? null, online?.synced ?? null, online?.plain ?? null)
      }

      if (online?.synced) return online

      // 2) Sidecar .lrc fallback (synced by nature)
      const sidecar = deps.readSidecarLrc?.(song.path) ?? null
      if (sidecar) return { source: 'Arquivo local (.lrc)', synced: sidecar, plain: null }

      // 3) Plain-text online lyrics, better than nothing
      return online
    },

    // ---------- Online covers / album enrichment ----------
    'online:fetchCover': async (songId: number, force = false) => {
      if (!onlineEnabled()) return null
      const song = db()
        .prepare(
          `SELECT s.id, s.title, s.duration, ${EFFECTIVE_COVER_SQL} as coverPath,
                  ar.name as artist, al.title as album
           FROM songs s
           LEFT JOIN artists ar ON ar.id = s.artist_id
           LEFT JOIN albums al ON al.id = s.album_id
           WHERE s.id = ?`
        )
        .get(songId) as
        | { id: number; title: string; duration: number; coverPath: string | null; artist: string | null; album: string | null }
        | undefined
      if (!song) return null
      if (song.coverPath && !force) return song.coverPath

      const result = await fetchCoverOnline(
        { title: song.title, artist: song.artist, album: song.album, duration: song.duration },
        deps.saveImage
      )
      if (!result) return song.coverPath ?? null
      return applyCoverToSong(db(), songId, result)
    },

    // Bulk metadata refresh: artist photos + missing covers + genres, with
    // progress events. Never overwrites data the user already has.
    'metadata:refresh': async () => {
      const send = (done: number, total: number, label: string): void => deps.progress({ done, total, label })

      // 1) artist photos for artists without one
      const artists = db()
        .prepare(`SELECT id, name FROM artists WHERE image_path IS NULL OR image_path = ''`)
        .all() as { id: number; name: string }[]
      // 2) songs whose effective cover is missing
      const songs = db()
        .prepare(
          `SELECT s.id, s.title, s.duration, ar.name as artist, al.title as album,
                  ${EFFECTIVE_COVER_SQL} as coverPath
           FROM songs s
           LEFT JOIN artists ar ON ar.id = s.artist_id
           LEFT JOIN albums al ON al.id = s.album_id`
        )
        .all() as {
        id: number
        title: string
        duration: number
        artist: string | null
        album: string | null
        coverPath: string | null
      }[]
      const missingCovers = songs.filter((s) => !s.coverPath)

      // 3) songs missing a usable genre (empty or the useless "Music" catch-all)
      const missingGenre = db()
        .prepare(
          `SELECT s.id, s.title, ar.name as artist
           FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id
           WHERE s.genre IS NULL OR TRIM(s.genre) = '' OR LOWER(s.genre) = 'music'`
        )
        .all() as { id: number; title: string; artist: string | null }[]

      const total = artists.length + missingCovers.length + missingGenre.length
      let done = 0
      let artistsUpdated = 0
      let coversUpdated = 0
      let genresUpdated = 0

      for (const ar of artists) {
        send(done, total, `${deps.tr('Artista', 'Artist')}: ${ar.name}`)
        try {
          const photo = await fetchArtistPhoto(ar.name, deps.saveImage)
          if (photo) {
            db().prepare('UPDATE artists SET image_path = ? WHERE id = ?').run(photo, ar.id)
            artistsUpdated++
          }
        } catch {
          /* network hiccup — skip this artist */
        }
        done++
      }

      for (const s of missingCovers) {
        send(done, total, `${deps.tr('Capa', 'Cover')}: ${s.title}`)
        try {
          const result = await fetchCoverOnline(
            { title: s.title, artist: s.artist, album: s.album, duration: s.duration },
            deps.saveImage
          )
          if (result) {
            applyCoverToSong(db(), s.id, result)
            coversUpdated++
          }
        } catch {
          /* skip */
        }
        done++
      }

      for (const s of missingGenre) {
        send(done, total, `${deps.tr('Gênero', 'Genre')}: ${s.title}`)
        try {
          const genre = await fetchGenre(s.title, s.artist)
          if (genre) {
            db().prepare('UPDATE songs SET genre = ? WHERE id = ?').run(genre, s.id)
            genresUpdated++
          }
        } catch {
          /* skip */
        }
        done++
      }

      send(total, total, deps.tr('Concluído', 'Done'))
      return { artistsUpdated, coversUpdated, genresUpdated, total }
    },
  }
}
