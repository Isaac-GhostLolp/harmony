import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { splitArtists } from '../services/artistNames'

let db: Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  year INTEGER,
  cover_path TEXT,
  UNIQUE(title, artist_id)
);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  genre TEXT,
  year INTEGER,
  duration REAL NOT NULL DEFAULT 0,
  track_no INTEGER,
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  played_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS lyrics_cache (
  song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  found INTEGER NOT NULL,
  source TEXT,
  synced TEXT,
  plain TEXT,
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS song_artists (
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (song_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album_id);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_history_song ON history(song_id);
CREATE INDEX IF NOT EXISTS idx_history_played ON history(played_at);
CREATE INDEX IF NOT EXISTS idx_song_artists_artist ON song_artists(artist_id);
CREATE INDEX IF NOT EXISTS idx_song_artists_song ON song_artists(song_id);
`

/** Adds a column if missing — SQLite has no ADD COLUMN IF NOT EXISTS. */
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }
}

export function initDatabase(): Database.Database {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'harmony.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  // v0.5 — dual cover sources: cover_path keeps the ORIGINAL (embedded
  // metadata) art; online art lives in its own column; the user picks.
  ensureColumn('albums', 'online_cover_path', 'TEXT')
  ensureColumn('albums', 'preferred_cover', "TEXT NOT NULL DEFAULT 'auto'")

  // v0.11 — playlist personalization: custom image (data URL), description,
  // emoji and a dominant color extracted from the image.
  ensureColumn('playlists', 'description', 'TEXT')
  ensureColumn('playlists', 'emoji', 'TEXT')
  ensureColumn('playlists', 'image', 'TEXT')
  ensureColumn('playlists', 'color', 'TEXT')

  // v0.11 phase 7 — artist photos (downloaded to the covers dir, cached).
  ensureColumn('artists', 'image_path', 'TEXT')

  migrateMultiArtists(db)
  pruneEmptyArtists(db)
  return db
}

/**
 * Removes artists that have no songs linked to them. After the multi-artist
 * migration, old composite entries ("Skillet feat. Lacey") end up with zero
 * songs; this clears them out. Runs on every startup — it's cheap and keeps
 * the artist list clean as songs are added/removed. Only touches artists with
 * genuinely no track in song_artists and that aren't the album artist of a
 * still-present album.
 */
function pruneEmptyArtists(database: Database.Database): void {
  database
    .prepare(
      `DELETE FROM artists
       WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)
         AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL)`
    )
    .run()
}

/**
 * One-time (idempotent) migration to the many-to-many artist model. It:
 *  1) backfills song_artists for songs that predate the table, splitting the
 *     artist name into individual artists (feat./&/x/…), and
 *  2) cleans up "composite" artist rows (e.g. "Skillet feat. Lacey") whose
 *     songs have been re-linked to the individual artists, so they stop
 *     showing up as duplicates.
 * User data (songs, history, playlists) is never touched.
 */
function migrateMultiArtists(database: Database.Database): void {
  const alreadyLinked = (
    database.prepare('SELECT COUNT(*) as n FROM song_artists').get() as { n: number }
  ).n
  // Only backfill when the table is empty (fresh upgrade). Re-running is safe
  // because of INSERT OR IGNORE, but we skip the heavy pass once it's done.
  if (alreadyLinked > 0) return

  const songs = database
    .prepare(
      `SELECT s.id, ar.name as artistName
       FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id
       WHERE ar.name IS NOT NULL`
    )
    .all() as { id: number; artistName: string }[]

  const getOrCreate = database.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)')
  const findId = database.prepare('SELECT id FROM artists WHERE name = ?')
  const link = database.prepare(
    'INSERT OR IGNORE INTO song_artists (song_id, artist_id, position) VALUES (?, ?, ?)'
  )
  const setMain = database.prepare('UPDATE songs SET artist_id = ? WHERE id = ?')

  const tx = database.transaction(() => {
    for (const song of songs) {
      const names = splitArtists(song.artistName)
      if (names.length === 0) continue
      names.forEach((name, i) => {
        getOrCreate.run(name)
        const row = findId.get(name) as { id: number } | undefined
        if (row) {
          link.run(song.id, row.id, i)
          if (i === 0) setMain.run(row.id, song.id) // main artist = first
        }
      })
    }
    // Remove artists that are no longer the main artist of any song AND are not
    // referenced in song_artists — i.e. leftover composite names.
    database
      .prepare(
        `DELETE FROM artists
         WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)
           AND id NOT IN (SELECT DISTINCT artist_id FROM songs WHERE artist_id IS NOT NULL)
           AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL)`
      )
      .run()
  })
  tx()
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export const coversDir = (): string => {
  const dir = join(app.getPath('userData'), 'covers')
  mkdirSync(dir, { recursive: true })
  return dir
}
