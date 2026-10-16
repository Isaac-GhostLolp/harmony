/**
 * Everything the Harmony asks its library database that is plain SQL — the
 * same on the desktop (the main process answers these over IPC) and on
 * Android (answered right in the WebView). Keyed by the IPC channel name.
 */
import type { Db } from './db'

/** Effective cover honoring the user's per-album preference. */
export const EFFECTIVE_COVER_SQL = `CASE
  WHEN al.preferred_cover = 'custom' THEN COALESCE(al.custom_cover_path, al.cover_path, al.online_cover_path)
  WHEN al.preferred_cover = 'embedded' THEN al.cover_path
  WHEN al.preferred_cover = 'online' THEN COALESCE(al.online_cover_path, al.cover_path)
  ELSE COALESCE(al.cover_path, al.online_cover_path, al.custom_cover_path)
END`

export const SONG_SELECT = `
  SELECT s.id, s.path, s.title, s.genre, s.year, s.duration, s.track_no as trackNo,
         s.added_at as addedAt,
         ar.name as artist, ar.id as artistId,
         al.title as album, al.id as albumId, ${EFFECTIVE_COVER_SQL} as coverPath,
         (f.song_id IS NOT NULL) as favorite,
         COALESCE(hc.plays, 0) as playCount,
         hc.lastPlayed as lastPlayed
  FROM songs s
  LEFT JOIN artists ar ON ar.id = s.artist_id
  LEFT JOIN albums al ON al.id = s.album_id
  LEFT JOIN favorites f ON f.song_id = s.id
  LEFT JOIN (
    SELECT song_id, COUNT(*) as plays, MAX(played_at) as lastPlayed
    FROM history GROUP BY song_id
  ) hc ON hc.song_id = s.id
`

// Cápsulas do tempo
const CAPSULE_SELECT = `
  SELECT c.id, c.song_id as songId, COALESCE(s.title, c.title) as title, COALESCE(ar.name, c.artist) as artist,
         ${EFFECTIVE_COVER_SQL} as coverPath, c.note, c.emoji, c.created_at as createdAt,
         c.open_at as openAt, c.opened_at as openedAt
  FROM capsules c LEFT JOIN songs s ON s.id = c.song_id
  LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id`

/** Drops albums and artists no song points to any more. */
export function pruneOrphans(db: Db): void {
  db.exec(`
    DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM songs WHERE album_id IS NOT NULL);
    DELETE FROM artists
      WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)
        AND id NOT IN (SELECT DISTINCT artist_id FROM songs WHERE artist_id IS NOT NULL)
        AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL);
  `)
}

export function getSetting(db: Db, key: string): unknown {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row ? JSON.parse(row.value) : undefined
}

export function setSetting(db: Db, key: string, value: unknown): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value)
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler = (...args: any[]) => unknown

/** The SQL-only channels, answered against `db()`. */
export function libraryHandlers(db: () => Db): Record<string, Handler> {
  return {
    'library:getSongs': () =>
      db().prepare(`${SONG_SELECT} ORDER BY s.added_at DESC`).all(),
    'library:search': (q: string) => {
      const like = `%${q}%`
      return {
        songs: db()
          .prepare(`${SONG_SELECT} WHERE s.title LIKE ? OR ar.name LIKE ? OR s.genre LIKE ? LIMIT 50`)
          .all(like, like, like),
        albums: db()
          .prepare(
            `SELECT al.id, al.title, al.year, ${EFFECTIVE_COVER_SQL} as coverPath, ar.name as artist
             FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id
             WHERE al.title LIKE ? LIMIT 20`
          )
          .all(like),
        artists: db()
          .prepare(`SELECT id, name FROM artists WHERE name LIKE ? LIMIT 20`)
          .all(like),
        playlists: db()
          .prepare(`SELECT id, name FROM playlists WHERE name LIKE ? LIMIT 20`)
          .all(like)
      }
    },
    // ---------- Albums / Artists ----------
    
    'albums:getAll': () =>
      db()
        .prepare(
          `SELECT al.id, al.title, al.year, ${EFFECTIVE_COVER_SQL} as coverPath, ar.name as artist,
                  COUNT(s.id) as songCount
           FROM albums al
           LEFT JOIN artists ar ON ar.id = al.artist_id
           LEFT JOIN songs s ON s.album_id = al.id
           GROUP BY al.id ORDER BY al.title`
        )
        .all(),
    'albums:setPreferredCover': (albumId: number, preferred: string) => {
      if (!['auto', 'embedded', 'online', 'custom'].includes(preferred)) return null
      db().prepare('UPDATE albums SET preferred_cover = ? WHERE id = ?').run(preferred, albumId)
      const row = db()
        .prepare(`SELECT ${EFFECTIVE_COVER_SQL} as cover FROM albums al WHERE al.id = ?`)
        .get(albumId) as { cover: string | null } | undefined
      return row?.cover ?? null
    },
    'albums:getSongs': (albumId: number) =>
      db()
        .prepare(`${SONG_SELECT} WHERE s.album_id = ? ORDER BY s.track_no, s.title`)
        .all(albumId),
    'artists:getAll': () =>
      db()
        .prepare(
          `SELECT ar.id, ar.name, ar.image_path as imagePath,
                  COUNT(DISTINCT sa.song_id) as songCount
           FROM artists ar LEFT JOIN song_artists sa ON sa.artist_id = ar.id
           GROUP BY ar.id ORDER BY ar.name`
        )
        .all(),
    'artists:getSongs': (artistId: number) =>
      db()
        .prepare(
          `${SONG_SELECT} JOIN song_artists sa ON sa.song_id = s.id
           WHERE sa.artist_id = ? ORDER BY s.title`
        )
        .all(artistId),
    // ---------- Playlists ----------
    
    'playlists:getAll': () =>
      db()
        .prepare(
          `SELECT p.id, p.name, p.created_at as createdAt,
                  p.description, p.emoji, p.image, p.color,
                  COUNT(ps.song_id) as songCount
           FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
           GROUP BY p.id ORDER BY p.created_at DESC`
        )
        .all(),
    'playlists:updateMeta': (id: number,
        meta: { name?: string; description?: string; emoji?: string; image?: string | null; color?: string }
      ) => {
        const fields: string[] = []
        const values: unknown[] = []
        for (const key of ['name', 'description', 'emoji', 'image', 'color'] as const) {
          if (meta[key] !== undefined) {
            fields.push(`${key} = ?`)
            values.push(meta[key])
          }
        }
        if (fields.length === 0) return false
        values.push(id)
        db()
          .prepare(`UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`)
          .run(...values)
        return true
      },
    'playlists:create': (name: string) => {
      const info = db().prepare('INSERT INTO playlists (name) VALUES (?)').run(name)
      return info.lastInsertRowid
    },
    'playlists:rename': (id: number, name: string) =>
      db().prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id),
    'playlists:delete': (id: number) =>
      db().prepare('DELETE FROM playlists WHERE id = ?').run(id),
    'playlists:duplicate': (id: number) => {
      const src = db().prepare('SELECT name FROM playlists WHERE id = ?').get(id) as { name: string }
      const info = db().prepare('INSERT INTO playlists (name) VALUES (?)').run(`${src.name} (copy)`)
      db()
        .prepare(
          `INSERT INTO playlist_songs (playlist_id, song_id, position)
           SELECT ?, song_id, position FROM playlist_songs WHERE playlist_id = ?`
        )
        .run(info.lastInsertRowid, id)
      return info.lastInsertRowid
    },
    'playlists:getSongs': (id: number) =>
      db()
        .prepare(`${SONG_SELECT} JOIN playlist_songs ps ON ps.song_id = s.id
                  WHERE ps.playlist_id = ? ORDER BY ps.position`)
        .all(id),
    'playlists:addSong': (playlistId: number, songId: number) => {
      const max = db()
        .prepare('SELECT COALESCE(MAX(position), -1) as m FROM playlist_songs WHERE playlist_id = ?')
        .get(playlistId) as { m: number }
      db()
        .prepare(
          'INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)'
        )
        .run(playlistId, songId, max.m + 1)
    },
    'playlists:removeSong': (playlistId: number, songId: number) =>
      db()
        .prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?')
        .run(playlistId, songId),
    'playlists:reorder': (playlistId: number, songIds: number[]) => {
      const update = db().prepare(
        'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?'
      )
      const tx = db().transaction((ids: number[]) => {
        ids.forEach((songId, i) => update.run(i, playlistId, songId))
      })
      tx(songIds)
    },
    // ---------- Favorites ----------
    
    'favorites:toggle': (songId: number) => {
      const exists = db().prepare('SELECT 1 FROM favorites WHERE song_id = ?').get(songId)
      if (exists) {
        db().prepare('DELETE FROM favorites WHERE song_id = ?').run(songId)
        return false
      }
      db().prepare('INSERT INTO favorites (song_id) VALUES (?)').run(songId)
      return true
    },
    'favorites:getAll': () =>
      db()
        .prepare(`${SONG_SELECT} WHERE f.song_id IS NOT NULL ORDER BY f.added_at DESC`)
        .all(),
    // ---------- History & Stats ----------
    
    'history:add': (songId: number) =>
      db().prepare('INSERT INTO history (song_id) VALUES (?)').run(songId),
    'history:getRecent': () =>
      db()
        .prepare(
          `${SONG_SELECT} JOIN (
             SELECT song_id, MAX(played_at) as lastPlayed FROM history GROUP BY song_id
           ) h ON h.song_id = s.id ORDER BY h.lastPlayed DESC LIMIT 100`
        )
        .all(),
    'stats:profile': () => {
      const q = <T>(sql: string): T => db().prepare(sql).get() as T
      const qAll = <T>(sql: string): T[] => db().prepare(sql).all() as T[]

      const topArtist = q<{ name: string; plays: number } | undefined>(
        `SELECT ar.name, COUNT(*) as plays FROM history h
         JOIN songs s ON s.id = h.song_id JOIN artists ar ON ar.id = s.artist_id
         GROUP BY ar.id ORDER BY plays DESC LIMIT 1`
      )
      const topAlbum = q<{ title: string; plays: number } | undefined>(
        `SELECT al.title, COUNT(*) as plays FROM history h
         JOIN songs s ON s.id = h.song_id JOIN albums al ON al.id = s.album_id
         GROUP BY al.id ORDER BY plays DESC LIMIT 1`
      )
      const topGenre = q<{ genre: string; plays: number } | undefined>(
        `SELECT s.genre as genre, COUNT(*) as plays FROM history h
         JOIN songs s ON s.id = h.song_id
         WHERE s.genre IS NOT NULL AND TRIM(s.genre) != '' AND LOWER(s.genre) != 'music'
         GROUP BY s.genre ORDER BY plays DESC LIMIT 1`
      )
      const topSong = q<{ title: string; artist: string | null; plays: number; seconds: number } | undefined>(
        `SELECT s.title, ar.name as artist, COUNT(*) as plays, SUM(s.duration) as seconds
         FROM history h JOIN songs s ON s.id = h.song_id
         LEFT JOIN artists ar ON ar.id = s.artist_id
         GROUP BY s.id ORDER BY plays DESC LIMIT 1`
      )
      const topPlaylist = q<{ name: string; count: number } | undefined>(
        `SELECT p.name, COUNT(ps.song_id) as count FROM playlists p
         LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
         GROUP BY p.id ORDER BY count DESC LIMIT 1`
      )
      const totals = q<{
        songs: number
        artists: number
        albums: number
        secondsPlayed: number
        totalPlays: number
        activeDays: number
        firstPlay: number | null
        lastPlay: number | null
        firstAdded: number | null
      }>(
        `SELECT
          (SELECT COUNT(*) FROM songs) as songs,
          (SELECT COUNT(*) FROM artists) as artists,
          (SELECT COUNT(*) FROM albums) as albums,
          (SELECT COALESCE(SUM(s.duration),0) FROM history h JOIN songs s ON s.id=h.song_id) as secondsPlayed,
          (SELECT COUNT(*) FROM history) as totalPlays,
          (SELECT COUNT(DISTINCT date(played_at,'unixepoch')) FROM history) as activeDays,
          (SELECT MIN(played_at) FROM history) as firstPlay,
          (SELECT MAX(played_at) FROM history) as lastPlay,
          (SELECT MIN(added_at) FROM songs) as firstAdded`
      )
      // first song ever added (for the journey)
      const firstSong = q<{ title: string; artist: string | null; addedAt: number } | undefined>(
        `SELECT s.title, ar.name as artist, s.added_at as addedAt FROM songs s
         LEFT JOIN artists ar ON ar.id = s.artist_id ORDER BY s.added_at ASC LIMIT 1`
      )
      // most recently played
      const lastSong = q<{ title: string; artist: string | null; playedAt: number } | undefined>(
        `SELECT s.title, ar.name as artist, h.played_at as playedAt FROM history h
         JOIN songs s ON s.id = h.song_id LEFT JOIN artists ar ON ar.id = s.artist_id
         ORDER BY h.played_at DESC LIMIT 1`
      )
      // songs discovered this month (first play within current month)
      const now = Math.floor(Date.now() / 1000)
      const monthAgo = now - 30 * 86400
      const newThisMonth = q<{ n: number }>(
        `SELECT COUNT(*) as n FROM (
           SELECT song_id, MIN(played_at) as first FROM history GROUP BY song_id
         ) WHERE first >= ${monthAgo}`
      ).n
      // late-night play (00:00–05:00 local-ish, using UTC hour as approximation)
      const nightPlay = q<{ playedAt: number } | undefined>(
        `SELECT played_at as playedAt FROM history
         WHERE CAST(strftime('%H', played_at, 'unixepoch') AS INTEGER) BETWEEN 0 AND 4
         ORDER BY played_at ASC LIMIT 1`
      )
      const mostPlayedCount = topSong?.plays ?? 0

      return {
        topArtist: topArtist ?? null,
        topAlbum: topAlbum ?? null,
        topGenre: topGenre ?? null,
        topSong: topSong ?? null,
        topPlaylist: topPlaylist ?? null,
        firstSong: firstSong ?? null,
        lastSong: lastSong ?? null,
        totalSongs: totals.songs,
        totalArtists: totals.artists,
        totalAlbums: totals.albums,
        hoursPlayed: totals.secondsPlayed / 3600,
        totalPlays: totals.totalPlays,
        activeDays: totals.activeDays,
        firstPlay: totals.firstPlay,
        lastPlay: totals.lastPlay,
        firstAdded: totals.firstAdded,
        newThisMonth,
        nightPlay: nightPlay?.playedAt ?? null,
        mostPlayedCount,
        // library share of the top artist (for humanized stat)
        topArtistShare: (() => {
          if (!topArtist) return 0
          const row = q<{ n: number }>(
            `SELECT COUNT(*) as n FROM songs s JOIN artists ar ON ar.id = s.artist_id
             WHERE ar.name = '${topArtist.name.replace(/'/g, "''")}'`
          )
          return totals.songs ? row.n / totals.songs : 0
        })()
      }
    },
    // "Meu Mundo": the personal page. Everything in local time, since it is
    // about the listener's own day (when they listen, their streaks).
    
    'stats:world': () => {
      const all = <T>(sql: string): T[] => db().prepare(sql).all() as T[]
      const one = <T>(sql: string): T => db().prepare(sql).get() as T
      const LOCAL = "played_at, 'unixepoch', 'localtime'"

      const topSongs = all(
        `SELECT s.id, s.title, ar.name as artist, ${EFFECTIVE_COVER_SQL} as coverPath, COUNT(*) as plays
         FROM history h JOIN songs s ON s.id = h.song_id
         LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id
         GROUP BY s.id ORDER BY plays DESC LIMIT 5`
      )
      const topArtists = all<{ id: number; name: string; plays: number }>(
        `SELECT ar.id, ar.name, COUNT(*) as plays FROM history h
         JOIN songs s ON s.id = h.song_id JOIN artists ar ON ar.id = s.artist_id
         GROUP BY ar.id ORDER BY plays DESC LIMIT 5`
      ).map((a) => ({
        ...a,
        // a cover from the artist's most played album stands in for a photo
        cover:
          (
            one<{ c: string | null } | undefined>(
              `SELECT ${EFFECTIVE_COVER_SQL} as c FROM history h JOIN songs s ON s.id = h.song_id
               JOIN albums al ON al.id = s.album_id WHERE s.artist_id = ${Number(a.id)}
               GROUP BY al.id ORDER BY COUNT(*) DESC LIMIT 1`
            ) ?? { c: null }
          ).c ?? null
      }))
      const topGenres = all(
        `SELECT s.genre as genre, COUNT(*) as plays FROM history h JOIN songs s ON s.id = h.song_id
         WHERE s.genre IS NOT NULL AND TRIM(s.genre) != '' AND LOWER(s.genre) != 'music'
         GROUP BY s.genre ORDER BY plays DESC LIMIT 6`
      )
      const hours = new Array(24).fill(0)
      for (const r of all<{ h: number; n: number }>(
        `SELECT CAST(strftime('%H', ${LOCAL}) AS INTEGER) as h, COUNT(*) as n FROM history GROUP BY h`
      ))
        hours[r.h] = r.n
      const weekdays = new Array(7).fill(0)
      for (const r of all<{ d: number; n: number }>(
        `SELECT CAST(strftime('%w', ${LOCAL}) AS INTEGER) as d, COUNT(*) as n FROM history GROUP BY d`
      ))
        weekdays[r.d] = r.n
      // listening days → current and best streak of consecutive days
      const days = all<{ d: string }>(`SELECT DISTINCT date(${LOCAL}) as d FROM history ORDER BY d`).map(
        (r) => Date.parse(r.d + 'T12:00:00Z') / 86400000
      )
      let best = 0
      let run = 0
      for (let i = 0; i < days.length; i++) {
        run = i > 0 && Math.round(days[i] - days[i - 1]) === 1 ? run + 1 : 1
        best = Math.max(best, run)
      }
      const today = Math.round(Date.parse(new Date().toLocaleDateString('sv') + 'T12:00:00Z') / 86400000)
      const last = days.length ? Math.round(days[days.length - 1]) : -10
      const current = today - last <= 1 ? run : 0
      const bestDay = one<{ d: string; plays: number; seconds: number } | undefined>(
        `SELECT date(${LOCAL}) as d, COUNT(*) as plays, SUM(s.duration) as seconds
         FROM history h JOIN songs s ON s.id = h.song_id GROUP BY d ORDER BY seconds DESC LIMIT 1`
      )
      const counts = one<{ artists: number; playlists: number; favorites: number; songsPlayed: number }>(
        `SELECT
          (SELECT COUNT(DISTINCT s.artist_id) FROM history h JOIN songs s ON s.id = h.song_id) as artists,
          (SELECT COUNT(*) FROM playlists) as playlists,
          (SELECT COUNT(*) FROM favorites) as favorites,
          (SELECT COUNT(DISTINCT song_id) FROM history) as songsPlayed`
      )
      return {
        topSongs,
        topArtists,
        topGenres,
        hours,
        weekdays,
        streak: { current, best },
        bestDay: bestDay ?? null,
        ...counts
      }
    },
    'capsules:list': () => db().prepare(`${CAPSULE_SELECT} ORDER BY c.open_at ASC`).all(),
    'capsules:create': (songId: number, note: string, emoji: string | null, openAt: number) => {
      const text = String(note ?? '').trim().slice(0, 500)
      const when = Math.floor(Number(openAt))
      if (!text || !Number.isFinite(when)) return null
      const song = db()
        .prepare('SELECT s.title, ar.name as artist FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id WHERE s.id = ?')
        .get(songId) as { title: string; artist: string | null } | undefined
      if (!song) return null
      const r = db()
        .prepare('INSERT INTO capsules (song_id, title, artist, note, emoji, open_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(songId, song.title, song.artist, text, emoji ? String(emoji).slice(0, 16) : null, when)
      return db().prepare(`${CAPSULE_SELECT} WHERE c.id = ?`).get(r.lastInsertRowid)
    },
    'capsules:delete': (id: number) => {
      db().prepare('DELETE FROM capsules WHERE id = ?').run(id)
      return true
    },
    /** Sealed capsules on this song whose day has come. */
    'capsules:due': (songId: number) =>
      db()
        .prepare(
          `${CAPSULE_SELECT} WHERE c.song_id = ? AND c.opened_at IS NULL AND c.open_at <= unixepoch()
           ORDER BY c.created_at ASC`
        )
        .all(songId),
    'capsules:markOpened': (id: number) => {
      db().prepare('UPDATE capsules SET opened_at = unixepoch() WHERE id = ? AND opened_at IS NULL').run(id)
      return true
    },
    // Retrospectiva: one year of listening (or all of it), in local time.
    
    'stats:recap': (period: number | 'all') => {
      const year = typeof period === 'number' && Number.isInteger(period) ? period : null
      const range = {
        from: year ? Math.floor(new Date(year, 0, 1).getTime() / 1000) : 0,
        to: year ? Math.floor(new Date(year + 1, 0, 1).getTime() / 1000) : 2 ** 31
      }
      const all = <T>(sql: string): T[] => db().prepare(sql).all(range) as T[]
      const one = <T>(sql: string): T => db().prepare(sql).get(range) as T
      const LOCAL = "h.played_at, 'unixepoch', 'localtime'"
      const IN = 'h.played_at >= @from AND h.played_at < @to'

      const years = (
        db()
          .prepare(
            `SELECT DISTINCT CAST(strftime('%Y', played_at, 'unixepoch', 'localtime') AS INTEGER) as y
             FROM history ORDER BY y DESC`
          )
          .all() as { y: number }[]
      ).map((r) => r.y)

      const totals = one<{ plays: number; seconds: number; days: number; songs: number; artists: number }>(
        `SELECT COUNT(*) as plays, COALESCE(SUM(s.duration), 0) as seconds,
                COUNT(DISTINCT date(${LOCAL})) as days, COUNT(DISTINCT h.song_id) as songs,
                COUNT(DISTINCT s.artist_id) as artists
         FROM history h JOIN songs s ON s.id = h.song_id WHERE ${IN}`
      )
      // songs whose very first play falls in the period
      const newSongs = one<{ n: number }>(
        `SELECT COUNT(*) as n FROM (SELECT song_id, MIN(played_at) as first FROM history GROUP BY song_id)
         WHERE first >= @from AND first < @to`
      ).n
      const topSongs = all(
        `SELECT s.id, s.title, s.path, s.duration, ar.name as artist, ${EFFECTIVE_COVER_SQL} as coverPath,
                COUNT(*) as plays
         FROM history h JOIN songs s ON s.id = h.song_id
         LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id
         WHERE ${IN} GROUP BY s.id ORDER BY plays DESC, MAX(h.played_at) DESC LIMIT 5`
      )
      const topArtists = all<{ id: number; name: string; plays: number }>(
        `SELECT ar.id, ar.name, COUNT(*) as plays FROM history h
         JOIN songs s ON s.id = h.song_id JOIN artists ar ON ar.id = s.artist_id
         WHERE ${IN} GROUP BY ar.id ORDER BY plays DESC LIMIT 5`
      ).map((a) => ({
        ...a,
        cover:
          (
            db()
              .prepare(
                `SELECT ${EFFECTIVE_COVER_SQL} as c FROM history h JOIN songs s ON s.id = h.song_id
                 JOIN albums al ON al.id = s.album_id WHERE s.artist_id = @artist AND ${IN}
                 GROUP BY al.id ORDER BY COUNT(*) DESC LIMIT 1`
              )
              .get({ ...range, artist: a.id }) as { c: string | null } | undefined
          )?.c ?? null
      }))
      const topGenres = all(
        `SELECT s.genre as genre, COUNT(*) as plays FROM history h JOIN songs s ON s.id = h.song_id
         WHERE ${IN} AND s.genre IS NOT NULL AND TRIM(s.genre) != '' AND LOWER(s.genre) != 'music'
         GROUP BY s.genre ORDER BY plays DESC LIMIT 5`
      )
      const hours = new Array(24).fill(0)
      for (const r of all<{ h: number; n: number }>(
        `SELECT CAST(strftime('%H', ${LOCAL}) AS INTEGER) as h, COUNT(*) as n FROM history h WHERE ${IN} GROUP BY h`
      ))
        hours[r.h] = r.n
      const months = new Array(12).fill(0)
      for (const r of all<{ m: number; n: number }>(
        `SELECT CAST(strftime('%m', ${LOCAL}) AS INTEGER) as m, COUNT(*) as n FROM history h WHERE ${IN} GROUP BY m`
      ))
        months[r.m - 1] = r.n
      const bestDay = one<{ d: string; plays: number; seconds: number } | undefined>(
        `SELECT date(${LOCAL}) as d, COUNT(*) as plays, SUM(s.duration) as seconds
         FROM history h JOIN songs s ON s.id = h.song_id WHERE ${IN} GROUP BY d ORDER BY seconds DESC LIMIT 1`
      )
      const days = all<{ d: string }>(`SELECT DISTINCT date(${LOCAL}) as d FROM history h WHERE ${IN} ORDER BY d`).map(
        (r) => Date.parse(r.d + 'T12:00:00Z') / 86400000
      )
      let bestStreak = 0
      let run = 0
      for (let i = 0; i < days.length; i++) {
        run = i > 0 && Math.round(days[i] - days[i - 1]) === 1 ? run + 1 : 1
        bestStreak = Math.max(bestStreak, run)
      }

      return {
        period: year ?? 'all',
        years,
        totalPlays: totals.plays,
        seconds: totals.seconds,
        activeDays: totals.days,
        songsPlayed: totals.songs,
        artistsPlayed: totals.artists,
        newSongs,
        topSongs,
        topArtists,
        topGenres,
        hours,
        months,
        bestDay: bestDay ?? null,
        bestStreak
      }
    },
    'stats:get': () => {
      const topArtist = db()
        .prepare(
          `SELECT ar.name, COUNT(*) as plays FROM history h
           JOIN songs s ON s.id = h.song_id JOIN artists ar ON ar.id = s.artist_id
           GROUP BY ar.id ORDER BY plays DESC LIMIT 1`
        )
        .get()
      const topSong = db()
        .prepare(
          `SELECT s.title, ar.name as artist, COUNT(*) as plays FROM history h
           JOIN songs s ON s.id = h.song_id LEFT JOIN artists ar ON ar.id = s.artist_id
           GROUP BY s.id ORDER BY plays DESC LIMIT 1`
        )
        .get()
      const totals = db()
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM songs) as songs,
             (SELECT COUNT(*) FROM artists) as artists,
             (SELECT COALESCE(SUM(s.duration), 0) FROM history h JOIN songs s ON s.id = h.song_id) as secondsPlayed,
             (SELECT COUNT(DISTINCT date(played_at, 'unixepoch')) FROM history) as activeDays`
        )
        .get() as { songs: number; artists: number; secondsPlayed: number; activeDays: number }
      return {
        topArtist,
        topSong,
        totalSongs: totals.songs,
        totalArtists: totals.artists,
        hoursPlayed: totals.secondsPlayed / 3600,
        avgDailyMinutes: totals.activeDays ? totals.secondsPlayed / 60 / totals.activeDays : 0
      }
    },
    // ---------- Settings ----------
    
    'settings:get': () => {
      const rows = db().prepare('SELECT key, value FROM settings').all() as {
        key: string
        value: string
      }[]
      return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
    },
    'settings:set': (key: string, value: unknown) =>
      db()
        .prepare(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )
        .run(key, JSON.stringify(value)),
  }
}
