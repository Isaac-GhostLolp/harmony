/**
 * The Harmony's library database: its schema and migrations. Shared by the
 * desktop app (better-sqlite3 in the main process) and Android (sql.js in
 * the WebView); both speak the small synchronous API in ./db.
 */
import type { Db } from './db'
import { splitArtists } from './artistNames'

export const SCHEMA = `
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

-- v0.17 — time capsules: a note sealed on a song, opened when it plays again
-- after open_at. Title/artist are kept so a memory outlives its song.
CREATE TABLE IF NOT EXISTS capsules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  artist TEXT,
  note TEXT NOT NULL,
  emoji TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  open_at INTEGER NOT NULL,
  opened_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_capsules_song ON capsules(song_id);
`

/** Creates the tables and brings an older database up to date. */
export function migrate(db: Db): void {
  db.exec(SCHEMA)

  // v0.5 — dual cover sources: cover_path keeps the ORIGINAL (embedded
  // metadata) art; online art lives in its own column; the user picks.
  ensureColumn(db, 'albums', 'online_cover_path', 'TEXT')
  ensureColumn(db, 'albums', 'preferred_cover', "TEXT NOT NULL DEFAULT 'auto'")

  // v0.18 — covers made in the cover creator (they win over the others)
  ensureColumn(db, 'albums', 'custom_cover_path', 'TEXT')

  // v0.11 — playlist personalization: custom image (data URL), description,
  // emoji and a dominant color extracted from the image.
  ensureColumn(db, 'playlists', 'description', 'TEXT')
  ensureColumn(db, 'playlists', 'emoji', 'TEXT')
  ensureColumn(db, 'playlists', 'image', 'TEXT')
  ensureColumn(db, 'playlists', 'color', 'TEXT')

  // v0.11 phase 7 — artist photos (downloaded to the covers dir, cached).
  ensureColumn(db, 'artists', 'image_path', 'TEXT')

  // v0.19.2 — a public link to the song's cover, for Discord's "Listening to"
  // ('' = looked for and none found)
  ensureColumn(db, 'songs', 'art_url', 'TEXT')

  // v0.21 — playlists with a soul: the page's header style, folders, pinning,
  // a coloured tag, smart rules, the mood (World/theme/EQ/cursor), how it
  // plays, where it was left; and sections and notes on its songs
  ensureColumn(db, 'playlists', 'header', 'TEXT')
  ensureColumn(db, 'playlists', 'folder', 'TEXT')
  ensureColumn(db, 'playlists', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'playlists', 'tag', 'TEXT')
  ensureColumn(db, 'playlists', 'rules', 'TEXT')
  ensureColumn(db, 'playlists', 'vibe', 'TEXT')
  ensureColumn(db, 'playlists', 'play', 'TEXT')
  ensureColumn(db, 'playlists', 'resume', 'TEXT')
  ensureColumn(db, 'playlist_songs', 'note', 'TEXT')
  ensureColumn(db, 'playlist_songs', 'section', 'TEXT')

  migrateMultiArtists(db)
  pruneEmptyArtists(db)
  archiveSkippedPlays(db)

  // v0.21.1 — what "Atualizar metadados" already looked for online (and when)
  db.exec(`CREATE TABLE IF NOT EXISTS metadata_tried (
    kind TEXT NOT NULL,
    ref INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (kind, ref)
  )`)
  tidyArtists(db)
}

/**
 * Artists with no songs, which couldn't be removed: an album's "album artist"
 * tag kept whole ("ROSÉ, Bruno Mars"), while its songs were linked to each
 * artist apart. The album now points at its main artist (the first one); an
 * album that then has a twin (same title, same artist) is merged into it;
 * and artists nothing points to any more go away. Returns how many left.
 */
export function tidyArtists(db: Db): number {
  const lone = db
    .prepare(
      `SELECT al.id as albumId, al.title, ar.name FROM albums al JOIN artists ar ON ar.id = al.artist_id
       WHERE ar.id NOT IN (SELECT artist_id FROM song_artists)`
    )
    .all() as { albumId: number; title: string; name: string }[]
  const before = (db.prepare('SELECT COUNT(*) as n FROM artists').get() as { n: number }).n
  const hasSongs = db.prepare('SELECT 1 FROM song_artists WHERE artist_id = ? LIMIT 1')
  const idOf = db.prepare('SELECT id FROM artists WHERE name = ?')
  const firstSongArtist = db.prepare('SELECT artist_id as id FROM songs WHERE album_id = ? AND artist_id IS NOT NULL ORDER BY track_no, id LIMIT 1')

  db.transaction(() => {
    for (const a of lone) {
      // the album's main artist ("ROSÉ" in "ROSÉ, Bruno Mars") if they have songs; else whoever sings its first song
      const main = splitArtists(a.name)[0]
      const mainRow = main ? (idOf.get(main) as { id: number } | undefined) : undefined
      const target = mainRow && hasSongs.get(mainRow.id) ? mainRow.id : (firstSongArtist.get(a.albumId) as { id: number } | undefined)?.id
      if (!target) continue
      const twin = db.prepare('SELECT id FROM albums WHERE title = ? AND artist_id = ? AND id != ?').get(a.title, target, a.albumId) as
        | { id: number }
        | undefined
      if (twin) {
        // the twin keeps any cover it lacks, then takes this album's songs
        db.prepare(
          `UPDATE albums SET
             cover_path = COALESCE(cover_path, (SELECT cover_path FROM albums WHERE id = @from)),
             online_cover_path = COALESCE(online_cover_path, (SELECT online_cover_path FROM albums WHERE id = @from)),
             custom_cover_path = COALESCE(custom_cover_path, (SELECT custom_cover_path FROM albums WHERE id = @from))
           WHERE id = @to`
        ).run({ from: a.albumId, to: twin.id })
        db.prepare('UPDATE songs SET album_id = ? WHERE album_id = ?').run(twin.id, a.albumId)
        db.prepare('DELETE FROM albums WHERE id = ?').run(a.albumId)
      } else {
        db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(target, a.albumId)
      }
    }
  })()
  pruneEmptyArtists(db)
  const after = (db.prepare('SELECT COUNT(*) as n FROM artists').get() as { n: number }).n
  return before - after
}

/**
 * v0.21.1 — until now a song counted as played the moment it started, so
 * songs skipped on shuffle (and double clicks) filled the history and bent
 * Meu Mundo (a genre barely heard could be the favourite). Plays now count
 * after 30 seconds of listening; this pass, run once, applies the same rule
 * to the old history: a play followed by another one sooner than that was a
 * skip. Those rows move to history_skipped (kept, never deleted), so
 * nothing is lost if this ever needs undoing.
 */
function archiveSkippedPlays(db: Db): void {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'historySkipsArchived'").get()
  if (done) return
  db.exec(`CREATE TABLE IF NOT EXISTS history_skipped (
    id INTEGER PRIMARY KEY,
    song_id INTEGER NOT NULL,
    played_at INTEGER NOT NULL,
    moved_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`)
  const rows = db
    .prepare(
      `SELECT h.id, h.song_id as songId, h.played_at as at, COALESCE(s.duration, 0) as duration
       FROM history h LEFT JOIN songs s ON s.id = h.song_id ORDER BY h.played_at, h.id`
    )
    .all() as { id: number; songId: number; at: number; duration: number }[]
  const skipped = rows.filter((r, i) => {
    const next = rows[i + 1]
    if (!next) return false
    const need = r.duration > 0 ? Math.min(30, Math.max(5, r.duration / 2)) : 30
    return next.at - r.at < need
  })
  db.transaction(() => {
    const keep = db.prepare('INSERT OR IGNORE INTO history_skipped (id, song_id, played_at) VALUES (?, ?, ?)')
    const drop = db.prepare('DELETE FROM history WHERE id = ?')
    for (const r of skipped) {
      keep.run(r.id, r.songId, r.at)
      drop.run(r.id)
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('historySkipsArchived', ?)").run(
      JSON.stringify({ at: Math.floor(Date.now() / 1000), moved: skipped.length })
    )
  })()
}

/** Adds a column if missing — SQLite has no ADD COLUMN IF NOT EXISTS. */
function ensureColumn(db: Db, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }
}

/**
 * Removes artists that have no songs linked to them. After the multi-artist
 * migration, old composite entries ("Skillet feat. Lacey") end up with zero
 * songs; this clears them out. Runs on every startup — it's cheap and keeps
 * the artist list clean as songs are added/removed. Only touches artists with
 * genuinely no track in song_artists and that aren't the album artist of a
 * still-present album.
 */
function pruneEmptyArtists(database: Db): void {
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
function migrateMultiArtists(database: Db): void {
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

