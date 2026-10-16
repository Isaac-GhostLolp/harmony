/**
 * Adding a song to the library from its tags — shared by the desktop scanner
 * (tags read with music-metadata) and Android (tags from the MediaStore).
 */
import type { Db } from './db'
import { splitArtists } from './artistNames'

export interface SongTags {
  path: string
  title: string
  /** the track's artist tag (may credit several: "A feat. B") */
  artist?: string | null
  albumArtist?: string | null
  album?: string | null
  genre?: string | null
  year?: number | null
  duration: number
  trackNo?: number | null
}

function upsertArtist(db: Db, name: string | undefined): number | null {
  if (!name) return null
  db.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)').run(name)
  const row = db.prepare('SELECT id FROM artists WHERE name = ?').get(name) as { id: number }
  return row.id
}

/** Resolves all artists from a raw tag, returns their ids (main first). */
function upsertArtists(db: Db, raw: string | null | undefined): number[] {
  return splitArtists(raw ?? undefined)
    .map((n) => upsertArtist(db, n))
    .filter((id): id is number => id !== null)
}

/**
 * `cover` is asked for the album's art only when the album has none yet; it
 * gets a key unique to the album and returns the saved image's path.
 */
function upsertAlbum(
  db: Db,
  title: string | null | undefined,
  artistId: number | null,
  year: number | null | undefined,
  cover?: (albumKey: string) => string | null
): number | null {
  if (!title) return null
  db.prepare('INSERT OR IGNORE INTO albums (title, artist_id, year) VALUES (?, ?, ?)').run(title, artistId, year ?? null)
  const row = db.prepare('SELECT id, cover_path FROM albums WHERE title = ? AND artist_id IS ?').get(title, artistId) as {
    id: number
    cover_path: string | null
  }
  if (cover && !row.cover_path) {
    const path = cover(`${title}::${artistId ?? 'unknown'}`)
    if (path) db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(path, row.id)
  }
  return row.id
}

/** Whether a file is in the library already. */
export const hasSong = (db: Db, path: string): boolean => Boolean(db.prepare('SELECT 1 FROM songs WHERE path = ?').get(path))

/** Adds one song (its artists and album too); returns its id. */
export function insertSong(db: Db, t: SongTags, cover?: (albumKey: string) => string | null): number {
  const artistIds = upsertArtists(db, t.artist ?? t.albumArtist)
  const artistId = artistIds[0] ?? null
  const albumId = upsertAlbum(db, t.album, upsertArtist(db, splitArtists((t.albumArtist ?? t.artist) ?? undefined)[0]), t.year, cover)
  const info = db
    .prepare(
      `INSERT INTO songs (path, title, artist_id, album_id, genre, year, duration, track_no)
      VALUES (@path, @title, @artist_id, @album_id, @genre, @year, @duration, @track_no)`
    )
    .run({
      path: t.path,
      title: t.title,
      artist_id: artistId,
      album_id: albumId,
      genre: t.genre ?? null,
      year: t.year ?? null,
      duration: t.duration ?? 0,
      track_no: t.trackNo ?? null
    })
  // link every credited artist to the song (feat. included)
  const songId = Number(info.lastInsertRowid)
  const link = db.prepare('INSERT OR IGNORE INTO song_artists (song_id, artist_id, position) VALUES (?, ?, ?)')
  artistIds.forEach((aid, i) => link.run(songId, aid, i))
  return songId
}
