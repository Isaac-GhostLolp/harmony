/**
 * The PC ↔ phone bridge, the part both apps share: what a library looks
 * like to the other device, how a song on one is found on the other (the
 * files differ, so by title, artist and duration), and how playlists and
 * favourites are joined — each device ends up with everything from both,
 * and nothing is ever deleted.
 *
 * The phone drives a sync; the PC answers over the home Wi-Fi
 * (src/main/services/phoneBridge.ts).
 */
import type { Db } from './db'

/** a song as the other device sees it */
export interface BridgeSong {
  id: number
  key: string
  title: string
  artist: string | null
  album: string | null
  duration: number
  /** bytes (0 when unknown) */
  size: number
  /** the file's extension, without the dot ("mp3") */
  ext: string
}

/** a song inside a playlist or the favourites */
export interface BridgeRef {
  key: string
  duration: number
}

export interface BridgePlaylist {
  name: string
  description: string | null
  emoji: string | null
  /** a data URL, so it travels with the playlist */
  image: string | null
  color: string | null
  /** a smart playlist's rules (JSON): its songs are picked on each device by them */
  rules?: string | null
  songs: BridgeRef[]
}

export interface BridgeState {
  favorites: BridgeRef[]
  playlists: BridgePlaylist[]
}

export interface MergeResult {
  playlistsCreated: number
  playlistSongsAdded: number
  favoritesAdded: number
  /** songs the other device has in a playlist but this one doesn't have at all */
  missing: number
}

/** lower case, no accents, no "(feat. …)" / "[Remastered]", only letters and digits */
export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** the artist's first name only: "BLACKPINK, Selena Gomez" and "BLACKPINK" are the same song */
function mainArtist(artist: string | null | undefined): string {
  return normalize((artist ?? '').split(/,|;|&| x | e | and |\//i)[0])
}

export const songKey = (title: string, artist: string | null): string => `${normalize(title)}|${mainArtist(artist)}`

/** seconds two copies of one song may differ by (different encodings, a second of silence) */
const SAME_LENGTH = 4

/** every song of `list` that is this reference (a library may hold two copies), closest length first */
export function matchAll<T extends { key: string; duration: number }>(list: T[]): (ref: BridgeRef) => T[] {
  const byKey = new Map<string, T[]>()
  for (const s of list) {
    const same = byKey.get(s.key)
    if (same) same.push(s)
    else byKey.set(s.key, [s])
  }
  // an unknown duration (0) on either side trusts the name
  const gap = (s: T, ref: BridgeRef): number => (!s.duration || !ref.duration ? 0 : Math.abs(s.duration - ref.duration))
  return (ref) =>
    (byKey.get(ref.key) ?? [])
      .filter((s) => gap(s, ref) <= SAME_LENGTH)
      .sort((a, b) => gap(a, ref) - gap(b, ref))
}

/** finds a song of `list` by a reference from the other device */
export function matcher<T extends { key: string; duration: number }>(list: T[]): (ref: BridgeRef) => T | null {
  const all = matchAll(list)
  return (ref) => all(ref)[0] ?? null
}

interface SongRow {
  id: number
  path: string
  title: string
  artist: string | null
  album: string | null
  duration: number
}

/** every song in the library, as the other device sees it; `size` reads a file's bytes where it can */
export function bridgeLibrary(db: Db, size: (path: string) => number = () => 0): BridgeSong[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.path, s.title, ar.name as artist, al.title as album, s.duration
       FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id`
    )
    .all() as SongRow[]
  return rows.map((r) => ({
    id: r.id,
    key: songKey(r.title, r.artist),
    title: r.title,
    artist: r.artist,
    album: r.album,
    duration: r.duration,
    size: size(r.path),
    ext: (/\.([a-z0-9]{2,5})$/i.exec(r.path)?.[1] ?? 'mp3').toLowerCase()
  }))
}

/** this device's playlists and favourites, to hand to the other one */
export function exportBridgeState(db: Db): BridgeState {
  const ref = (r: { title: string; artist: string | null; duration: number }): BridgeRef => ({
    key: songKey(r.title, r.artist),
    duration: r.duration
  })
  const songsOf = db.prepare(
    `SELECT s.title, ar.name as artist, s.duration FROM playlist_songs ps
     JOIN songs s ON s.id = ps.song_id LEFT JOIN artists ar ON ar.id = s.artist_id
     WHERE ps.playlist_id = ? ORDER BY ps.position`
  )
  const playlists = (
    db.prepare('SELECT id, name, description, emoji, image, color, rules FROM playlists ORDER BY created_at').all() as {
      id: number
      name: string
      description: string | null
      emoji: string | null
      image: string | null
      color: string | null
      rules: string | null
    }[]
  ).map((p) => ({
    name: p.name,
    description: p.description,
    emoji: p.emoji,
    image: p.image,
    color: p.color,
    rules: p.rules,
    // a smart playlist has no songs of its own: the rules travel instead
    songs: p.rules ? [] : (songsOf.all(p.id) as { title: string; artist: string | null; duration: number }[]).map(ref)
  }))
  const favorites = (
    db
      .prepare(
        `SELECT s.title, ar.name as artist, s.duration FROM favorites f
         JOIN songs s ON s.id = f.song_id LEFT JOIN artists ar ON ar.id = s.artist_id ORDER BY f.added_at`
      )
      .all() as { title: string; artist: string | null; duration: number }[]
  ).map(ref)
  return { favorites, playlists }
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Joins the other device's playlists and favourites into this library: a
 * playlist with the same name gets the songs it was missing (at the end),
 * a new one is created with its look (photo, emoji, colour, description);
 * favourites are added. Songs this device doesn't have are skipped (they
 * come along once their files are sent).
 */
export function mergeBridgeState(db: Db, remote: BridgeState): MergeResult {
  const find = matchAll(bridgeLibrary(db))
  const result: MergeResult = { playlistsCreated: 0, playlistSongsAdded: 0, favoritesAdded: 0, missing: 0 }
  const missing = new Set<string>()
  /** the song to add — or null when it isn't here, or one of its copies is already in `has` */
  const resolve = (ref: BridgeRef, has: Set<number>): number | null => {
    const found = find(ref)
    if (!found.length) {
      missing.add(`${ref.key}|${Math.round(ref.duration)}`)
      return null
    }
    if (found.some((s) => has.has(s.id))) return null
    return found[0].id
  }

  db.transaction(() => {
    const addFav = db.prepare('INSERT OR IGNORE INTO favorites (song_id) VALUES (?)')
    const favs = new Set((db.prepare('SELECT song_id FROM favorites').all() as { song_id: number }[]).map((r) => r.song_id))
    for (const ref of remote.favorites ?? []) {
      const id = resolve(ref, favs)
      if (id != null && addFav.run(id).changes > 0) {
        favs.add(id)
        result.favoritesAdded++
      }
    }

    const local = db.prepare('SELECT id, name, description, emoji, image, color FROM playlists').all() as {
      id: number
      name: string
      description: string | null
      emoji: string | null
      image: string | null
      color: string | null
    }[]
    const inList = db.prepare('SELECT song_id FROM playlist_songs WHERE playlist_id = ?')
    const lastPos = db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM playlist_songs WHERE playlist_id = ?')
    const addSong = db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)')

    for (const p of remote.playlists ?? []) {
      if (!p?.name?.trim()) continue
      let mine = local.find((l) => sameName(l.name, p.name))
      if (!mine) {
        const info = db
          .prepare('INSERT INTO playlists (name, description, emoji, image, color, rules) VALUES (?, ?, ?, ?, ?, ?)')
          .run(p.name.trim(), p.description, p.emoji, p.image, p.color, p.rules ?? null)
        mine = { id: Number(info.lastInsertRowid), name: p.name, description: p.description, emoji: p.emoji, image: p.image, color: p.color }
        local.push(mine)
        result.playlistsCreated++
      } else {
        // its look fills in what this side never set; what was set here stays
        const fill: [string, string | null, string | null][] = [
          ['description', mine.description, p.description],
          ['emoji', mine.emoji, p.emoji],
          ['image', mine.image, p.image],
          ['color', mine.color, p.color]
        ]
        for (const [col, have, theirs] of fill) {
          if (!have && theirs) db.prepare(`UPDATE playlists SET ${col} = ? WHERE id = ?`).run(theirs, mine.id)
        }
      }
      const has = new Set((inList.all(mine.id) as { song_id: number }[]).map((r) => r.song_id))
      let pos = (lastPos.get(mine.id) as { m: number }).m
      for (const ref of p.songs ?? []) {
        const id = resolve(ref, has)
        if (id == null) continue
        addSong.run(mine.id, id, ++pos)
        has.add(id)
        result.playlistSongsAdded++
      }
    }
  })()

  result.missing = missing.size
  // for the "Ponte construída" achievement
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('bridgeSyncs', '1')
     ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`
  ).run()
  return result
}
