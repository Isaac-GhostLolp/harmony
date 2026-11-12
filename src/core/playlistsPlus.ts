/**
 * Playlists, the rest of them (desktop 0.21.0 / Android 0.9.0) — shared by
 * the desktop and Android like the rest of src/core:
 *
 *  • smart playlists: rules ("K-Pop since 2020 that I favourited") that keep
 *    the songs up to date by themselves;
 *  • ready-made playlists: Em loop, Esquecidas, Descobertas, Mix do dia;
 *  • "Completar a playlist": library songs that fit it;
 *  • the playlist's X-ray (Raio-X): time, artists, genres, decades, plays;
 *  • sections and a note per song, covers for a mosaic, the place it was
 *    left (to resume), export and import.
 */
import type { Db } from './db'
import { SONG_SELECT } from './library'
import { matcher, songKey } from './bridge'

// ── types ─────────────────────────────────────────────────────────────

export type RuleField = 'genre' | 'artist' | 'album' | 'title' | 'year' | 'plays' | 'favorite' | 'added' | 'lastPlayed' | 'duration'
export type RuleOp = 'is' | 'isNot' | 'contains' | 'gte' | 'lte' | 'withinDays' | 'olderDays' | 'yes' | 'no'

export interface Rule {
  field: RuleField
  op: RuleOp
  value: string | number
}

export interface SmartRules {
  match: 'all' | 'any'
  rules: Rule[]
  order: 'random' | 'plays' | 'recent' | 'title' | 'year'
  /** at most this many songs (0 = all) */
  limit: number
}

export type AutoKind = 'loop' | 'forgotten' | 'discoveries' | 'daily'

/** how a playlist plays (Personalizar → Como ela toca) */
export interface PlayMode {
  shuffle: boolean
  /** seconds of crossfade while it plays (null: the app's own) */
  crossfade: number | null
  /** start where it was left */
  resume: boolean
  /** stop after this many minutes (null: no limit) */
  minutes: number | null
}

/** the playlist's mood: what the Harmony turns into while it plays */
export interface Vibe {
  world: string | null
  theme: string | null
  eq: string | null
  cursor: string | null
}

export interface PlaylistStats {
  songs: number
  /** seconds */
  duration: number
  artists: { name: string; count: number }[]
  genres: { name: string; count: number }[]
  decades: { name: string; count: number }[]
  favorites: number
  plays: number
  /** seconds spent listening to its songs (plays × length) */
  listened: number
  newest: number | null
  oldest: number | null
}

export interface ExportedPlaylist {
  format: 'harmony-playlist'
  version: 1
  name: string
  description: string | null
  emoji: string | null
  color: string | null
  image: string | null
  songs: { title: string; artist: string | null; album: string | null; duration: number; path?: string }[]
}

interface Row {
  id: number
  path: string
  title: string
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
  duration: number
  addedAt: number
  favorite: number
  playCount: number
  lastPlayed: number | null
}

const DAY = 86400
const now = (): number => Math.floor(Date.now() / 1000)
const lower = (s: unknown): string => String(s ?? '').toLowerCase().trim()

// ── smart playlists ───────────────────────────────────────────────────

function test(s: Row, r: Rule): boolean {
  const v = r.value
  const text = (x: string | null): boolean => {
    const a = lower(x)
    const b = lower(v)
    if (r.op === 'is') return a === b
    if (r.op === 'isNot') return a !== b
    if (r.op === 'contains') return a.includes(b)
    return false
  }
  const num = (x: number | null): boolean => {
    if (x == null) return false
    if (r.op === 'is') return x === Number(v)
    if (r.op === 'gte') return x >= Number(v)
    if (r.op === 'lte') return x <= Number(v)
    return false
  }
  const age = (at: number | null): boolean => {
    if (r.op === 'withinDays') return at != null && now() - at <= Number(v) * DAY
    // "not in the last N days" includes never
    if (r.op === 'olderDays') return at == null || now() - at > Number(v) * DAY
    return false
  }
  switch (r.field) {
    case 'genre':
      return text(s.genre)
    case 'artist':
      return text(s.artist)
    case 'album':
      return text(s.album)
    case 'title':
      return text(s.title)
    case 'year':
      return num(s.year)
    case 'plays':
      return num(s.playCount)
    case 'duration':
      // the rule speaks minutes
      return num(s.duration / 60)
    case 'favorite':
      return r.op === 'yes' ? Boolean(s.favorite) : !s.favorite
    case 'added':
      return age(s.addedAt)
    case 'lastPlayed':
      return age(s.lastPlayed)
    default:
      return false
  }
}

function shuffled<T>(list: T[], seed: number): T[] {
  // a small seeded shuffle (Mix do dia stays the same all day)
  let x = seed || 1
  const rnd = (): number => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) % 100000) / 100000
  }
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function evaluateRules<T extends Row>(songs: T[], rules: SmartRules): T[] {
  // a rule still being written (no value yet) doesn't filter anything
  const valid = (rules.rules ?? []).filter(
    (r) => r && r.field && r.op && (r.op === 'yes' || r.op === 'no' || String(r.value ?? '').trim() !== '')
  )
  let out = valid.length
    ? songs.filter((s) => (rules.match === 'any' ? valid.some((r) => test(s, r)) : valid.every((r) => test(s, r))))
    : [...songs]
  switch (rules.order) {
    case 'plays':
      out.sort((a, b) => b.playCount - a.playCount)
      break
    case 'recent':
      out.sort((a, b) => b.addedAt - a.addedAt)
      break
    case 'title':
      out.sort((a, b) => a.title.localeCompare(b.title))
      break
    case 'year':
      out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
      break
    default:
      out = shuffled(out, Math.floor(Date.now() / 3_600_000))
  }
  return rules.limit > 0 ? out.slice(0, rules.limit) : out
}

// ── ready-made playlists ──────────────────────────────────────────────

function autoSongs(db: Db, kind: AutoKind): Row[] {
  const all = db.prepare(SONG_SELECT).all() as Row[]
  const t = now()
  switch (kind) {
    case 'loop': {
      // the most played of the last 30 days
      const counts = new Map(
        (
          db
            .prepare('SELECT song_id as id, COUNT(*) as n FROM history WHERE played_at >= ? GROUP BY song_id')
            .all(t - 30 * DAY) as { id: number; n: number }[]
        ).map((r) => [r.id, r.n])
      )
      return all
        .filter((s) => (counts.get(s.id) ?? 0) >= 2)
        .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
        .slice(0, 50)
    }
    case 'forgotten':
      // loved once (favourited or played a lot), not heard for 60 days
      return all
        .filter((s) => (s.favorite || s.playCount >= 5) && s.lastPlayed != null && t - s.lastPlayed > 60 * DAY)
        .sort((a, b) => (a.lastPlayed ?? 0) - (b.lastPlayed ?? 0))
        .slice(0, 50)
    case 'discoveries':
      // arrived in the last 30 days
      return all
        .filter((s) => t - s.addedAt <= 30 * DAY)
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, 60)
    case 'daily': {
      // today's mix: the artists and genres of the last two weeks, plus favourites; the same all day
      const recent = db
        .prepare(
          `SELECT ar.name as artist, s.genre as genre FROM history h JOIN songs s ON s.id = h.song_id
           LEFT JOIN artists ar ON ar.id = s.artist_id WHERE h.played_at >= ?`
        )
        .all(t - 14 * DAY) as { artist: string | null; genre: string | null }[]
      const artists = new Map<string, number>()
      const genres = new Map<string, number>()
      for (const r of recent) {
        if (r.artist) artists.set(r.artist, (artists.get(r.artist) ?? 0) + 1)
        if (r.genre) genres.set(lower(r.genre), (genres.get(lower(r.genre)) ?? 0) + 1)
      }
      const topArtists = new Set([...artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]))
      const topGenres = new Set([...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]))
      const pool = all.filter(
        (s) => (s.artist && topArtists.has(s.artist)) || (s.genre && topGenres.has(lower(s.genre))) || s.favorite
      )
      const day = Math.floor(Date.now() / 86_400_000)
      return shuffled(pool.length >= 10 ? pool : all, day).slice(0, 40)
    }
  }
}

// ── suggestions and the X-ray ─────────────────────────────────────────

function playlistRows(db: Db, playlistId: number): Row[] {
  return db
    .prepare(`${SONG_SELECT} JOIN playlist_songs ps ON ps.song_id = s.id WHERE ps.playlist_id = ? ORDER BY ps.position`)
    .all(playlistId) as Row[]
}

/** library songs that fit the playlist: same artists (most), same genres, favourites a little more */
function suggest(db: Db, songs: Row[], limit = 12): Row[] {
  if (!songs.length) return []
  const inIt = new Set(songs.map((s) => s.id))
  const keys = new Set(songs.map((s) => songKey(s.title, s.artist)))
  const artists = new Map<string, number>()
  const genres = new Map<string, number>()
  for (const s of songs) {
    if (s.artist) artists.set(s.artist, (artists.get(s.artist) ?? 0) + 1)
    if (s.genre) genres.set(lower(s.genre), (genres.get(lower(s.genre)) ?? 0) + 1)
  }
  const all = db.prepare(SONG_SELECT).all() as Row[]
  return all
    .filter((s) => !inIt.has(s.id) && !keys.has(songKey(s.title, s.artist)))
    .map((s) => ({
      s,
      score:
        (s.artist ? (artists.get(s.artist) ?? 0) * 3 : 0) +
        (s.genre ? genres.get(lower(s.genre)) ?? 0 : 0) +
        (s.favorite ? 1.5 : 0) +
        Math.min(2, s.playCount / 10)
    }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s)
}

const top = (m: Map<string, number>, n: number): { name: string; count: number }[] =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }))

export function statsOf(songs: Row[]): PlaylistStats {
  const artists = new Map<string, number>()
  const genres = new Map<string, number>()
  const decades = new Map<string, number>()
  let duration = 0
  let favorites = 0
  let plays = 0
  let listened = 0
  let newest: number | null = null
  let oldest: number | null = null
  for (const s of songs) {
    duration += s.duration || 0
    if (s.favorite) favorites++
    plays += s.playCount
    listened += s.playCount * (s.duration || 0)
    if (s.artist) artists.set(s.artist, (artists.get(s.artist) ?? 0) + 1)
    const g = (s.genre ?? '').trim()
    if (g) genres.set(g, (genres.get(g) ?? 0) + 1)
    if (s.year) {
      const d = `${Math.floor(s.year / 10) * 10}s`
      decades.set(d, (decades.get(d) ?? 0) + 1)
      newest = Math.max(newest ?? s.year, s.year)
      oldest = Math.min(oldest ?? s.year, s.year)
    }
  }
  return {
    songs: songs.length,
    duration,
    artists: top(artists, 6),
    genres: top(genres, 8),
    decades: [...decades.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
    favorites,
    plays,
    listened,
    newest,
    oldest
  }
}

// ── the handlers ──────────────────────────────────────────────────────

const json = (v: unknown): string | null => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v))

/** a smart playlist's songs, or a regular one's (with notes and sections) */
export function playlistSongs(db: Db, id: number): unknown[] {
  const p = db.prepare('SELECT rules FROM playlists WHERE id = ?').get(id) as { rules: string | null } | undefined
  if (p?.rules) {
    try {
      return evaluateRules(db.prepare(SONG_SELECT).all() as Row[], JSON.parse(p.rules) as SmartRules)
    } catch {
      return []
    }
  }
  return db
    .prepare(
      `${SONG_SELECT.replace('FROM songs s', ', ps.note as note, ps.section as section FROM songs s')}
       JOIN playlist_songs ps ON ps.song_id = s.id WHERE ps.playlist_id = ? ORDER BY ps.position`
    )
    .all(id)
}

export function playlistPlusHandlers(db: () => Db): Record<string, (...args: never[]) => unknown> {
  return {
    'playlists:setNote': (playlistId: number, songId: number, note: string | null) =>
      db()
        .prepare('UPDATE playlist_songs SET note = ? WHERE playlist_id = ? AND song_id = ?')
        .run(note?.trim() ? note.trim().slice(0, 280) : null, playlistId, songId).changes > 0,

    'playlists:setSection': (playlistId: number, songId: number, title: string | null) =>
      db()
        .prepare('UPDATE playlist_songs SET section = ? WHERE playlist_id = ? AND song_id = ?')
        .run(title?.trim() ? title.trim().slice(0, 60) : null, playlistId, songId).changes > 0,

    'playlists:createSmart': (name: string, rules: SmartRules) =>
      Number(db().prepare('INSERT INTO playlists (name, rules, emoji) VALUES (?, ?, ?)').run(name, JSON.stringify(rules), '✨').lastInsertRowid),

    /** the songs some rules would pick (the editor's live preview) */
    'playlists:previewRules': (rules: SmartRules) => evaluateRules(db().prepare(SONG_SELECT).all() as Row[], rules),

    'playlists:auto': (kind: AutoKind) => autoSongs(db(), kind),

    'playlists:suggest': (playlistId: number) => suggest(db(), playlistSongs(db(), playlistId) as Row[]),

    'playlists:stats': (playlistId: number) => statsOf(playlistSongs(db(), playlistId) as Row[]),

    'playlists:setResume': (playlistId: number, songId: number, time: number) =>
      db().prepare('UPDATE playlists SET resume = ? WHERE id = ?').run(JSON.stringify({ songId, time: Math.floor(time) }), playlistId),

    /** up to four covers of different albums per playlist, for the mosaic */
    'playlists:mosaics': () => {
      const rows = db()
        .prepare(
          `SELECT ps.playlist_id as pid, ${'COALESCE(al.custom_cover_path, al.cover_path, al.online_cover_path)'} as cover
           FROM playlist_songs ps JOIN songs s ON s.id = ps.song_id JOIN albums al ON al.id = s.album_id
           WHERE COALESCE(al.custom_cover_path, al.cover_path, al.online_cover_path) IS NOT NULL
           ORDER BY ps.playlist_id, ps.position`
        )
        .all() as { pid: number; cover: string }[]
      const out: Record<number, string[]> = {}
      for (const r of rows) {
        const list = (out[r.pid] ??= [])
        if (list.length < 4 && !list.includes(r.cover)) list.push(r.cover)
      }
      // smart playlists: their first songs' covers
      const smart = db().prepare('SELECT id FROM playlists WHERE rules IS NOT NULL').all() as { id: number }[]
      for (const p of smart) {
        const covers: string[] = []
        for (const s of playlistSongs(db(), p.id) as { coverPath: string | null }[]) {
          if (s.coverPath && !covers.includes(s.coverPath)) covers.push(s.coverPath)
          if (covers.length === 4) break
        }
        out[p.id] = covers
      }
      return out
    },

    'playlists:export': (playlistId: number): ExportedPlaylist | null => {
      const p = db().prepare('SELECT name, description, emoji, color, image FROM playlists WHERE id = ?').get(playlistId) as
        | { name: string; description: string | null; emoji: string | null; color: string | null; image: string | null }
        | undefined
      if (!p) return null
      const songs = (playlistSongs(db(), playlistId) as Row[]).map((s) => ({
        title: s.title,
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        path: s.path
      }))
      return { format: 'harmony-playlist', version: 1, ...p, songs }
    },

    /**
     * A playlist from a file (Harmony's own, or an .m3u turned into the same
     * shape): songs are found by their path first, then by title, artist and
     * length — like the PC ↔ phone bridge.
     */
    'playlists:import': (data: ExportedPlaylist) => {
      const d = db()
      const all = d.prepare(SONG_SELECT).all() as Row[]
      const byPath = new Map(all.map((s) => [s.path, s]))
      const find = matcher(all.map((s) => ({ ...s, key: songKey(s.title, s.artist) })))
      const ids: number[] = []
      let missing = 0
      for (const s of data.songs ?? []) {
        const hit = (s.path && byPath.get(s.path)) || find({ key: songKey(s.title ?? '', s.artist ?? null), duration: s.duration || 0 })
        if (hit && !ids.includes(hit.id)) ids.push(hit.id)
        else if (!hit) missing++
      }
      let id = 0
      d.transaction(() => {
        id = Number(
          d
            .prepare('INSERT INTO playlists (name, description, emoji, color, image) VALUES (?, ?, ?, ?, ?)')
            .run((data.name || 'Playlist').slice(0, 100), data.description ?? null, data.emoji ?? null, data.color ?? null, data.image ?? null)
            .lastInsertRowid
        )
        const add = d.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)')
        ids.forEach((songId, i) => add.run(id, songId, i))
      })()
      return { id, matched: ids.length, missing }
    }
  }
}

/** the extra playlist columns (getAll / updateMeta) */
export const PLAYLIST_EXTRA_COLUMNS = ['header', 'folder', 'pinned', 'tag', 'rules', 'vibe', 'play', 'resume'] as const
export { json as toJsonColumn }
