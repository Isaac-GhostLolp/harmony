import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

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

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album_id);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_history_song ON history(song_id);
CREATE INDEX IF NOT EXISTS idx_history_played ON history(played_at);
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
  return db
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
