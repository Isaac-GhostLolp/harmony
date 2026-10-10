import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { extname, join, resolve, dirname } from 'path'
import { app } from 'electron'
import { getDb, coversDir, stickersDir, iconsDir } from '../db/database'
import { scanFolder, importFiles } from '../services/scanner'
import {
  fetchLyricsOnline,
  fetchCoverOnline,
  applyCoverToSong,
  fetchArtistPhoto,
  fetchGenre,
  EFFECTIVE_COVER_SQL
} from '../services/online'

const SONG_SELECT = `
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

export function registerIpcHandlers(win: BrowserWindow): void {
  // Open an external URL in the system browser. Only http/https is allowed,
  // so a malicious string can't trigger file:// or other schemes.
  ipcMain.on('app:openExternal', (_e, url: string) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:') void shell.openExternal(url)
    } catch {
      /* ignore invalid URLs */
    }
  })

  // Persist a user-imported wallpaper (image/video) to disk so it survives
  // restarts. Object URLs from the renderer are session-only; here we copy the
  // bytes into userData/wallpaper and hand back a stable file path that the
  // harmony:// media protocol can serve. Only one custom wallpaper is kept, so
  // we clear any previous file first.
  const wallpaperDir = (): string => {
    const dir = join(app.getPath('userData'), 'wallpaper')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  ipcMain.handle(
    'wallpaper:save',
    (_e, data: ArrayBuffer, ext: string, type: 'image' | 'video') => {
      const dir = wallpaperDir()
      // remove old wallpaper files
      for (const f of readdirSync(dir)) {
        try {
          unlinkSync(join(dir, f))
        } catch {
          /* ignore */
        }
      }
      const safeExt = (ext || '').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'
      const filePath = join(dir, `wallpaper.${safeExt}`)
      writeFileSync(filePath, Buffer.from(data))
      return { path: filePath, type }
    }
  )

  // The few texts the main process shows, in the app's language (the
  // renderer saves its choice as the 'language' setting; Portuguese by default)
  const english = (): boolean => {
    const row = db().prepare("SELECT value FROM settings WHERE key = 'language'").get() as { value: string } | undefined
    try {
      return row ? JSON.parse(row.value) === 'en' : false
    } catch {
      return false
    }
  }
  const tr = (pt: string, en: string): string => (english() ? en : pt)

  // ---------- Edit export (Lyrics → Edit mode) ----------
  ipcMain.handle('edit:save', async (e, data: ArrayBuffer, baseName: string, ext: string) => {
    const safeExt = (ext || '').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4'
    const safeName =
      (baseName || 'Harmony edit').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) ||
      'Harmony edit'
    const win = BrowserWindow.fromWebContents(e.sender)
    const options = {
      title: tr('Salvar edit', 'Save edit'),
      defaultPath: join(app.getPath('videos'), `${safeName}.${safeExt}`),
      filters: [{ name: safeExt === 'mp4' ? tr('Vídeo MP4', 'MP4 video') : tr('Vídeo WebM', 'WebM video'), extensions: [safeExt] }]
    }
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, Buffer.from(data))
    return res.filePath
  })

  ipcMain.on('edit:reveal', (_e, path: string) => {
    if (typeof path === 'string' && existsSync(path)) shell.showItemInFolder(path)
  })

  ipcMain.on('edit:throttle', (e, enabled: boolean) => {
    e.sender.setBackgroundThrottling(Boolean(enabled))
  })

  ipcMain.handle('wallpaper:clear', () => {
    const dir = wallpaperDir()
    for (const f of readdirSync(dir)) {
      try {
        unlinkSync(join(dir, f))
      } catch {
        /* ignore */
      }
    }
    return true
  })

  const db = () => getDb()

  // ---------- Library ----------
  const getSetting = (key: string): unknown => {
    const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row ? JSON.parse(row.value) : undefined
  }
  const setSetting = (key: string, value: unknown): void => {
    db()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))
  }
  const getLibraryFolders = (): string[] => {
    const folders = getSetting('libraryFolders')
    if (Array.isArray(folders)) return folders.filter((f): f is string => typeof f === 'string')
    const legacy = getSetting('libraryFolder') // migrate pre-0.4 single folder
    return typeof legacy === 'string' ? [legacy] : []
  }

  const pruneOrphans = (): void => {
    db().exec(`
      DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM songs WHERE album_id IS NOT NULL);
      DELETE FROM artists
        WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)
          AND id NOT IN (SELECT DISTINCT artist_id FROM songs WHERE artist_id IS NOT NULL)
          AND id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL);
    `)
  }

  ipcMain.handle('library:selectAndScan', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const folder = result.filePaths[0]
    const folders = getLibraryFolders()
    if (!folders.includes(folder)) setSetting('libraryFolders', [...folders, folder])
    const summary = await scanFolder(folder, (p) => win.webContents.send('scan:progress', p))
    return { folder, ...summary }
  })

  // Re-scan all saved folders (new files only) and drop songs whose files
  // no longer exist on disk.
  ipcMain.handle('library:refresh', async () => {
    let added = 0
    for (const folder of getLibraryFolders()) {
      if (!existsSync(folder)) continue
      const r = await scanFolder(folder, (p) => win.webContents.send('scan:progress', p))
      added += r.added
    }
    const all = db().prepare('SELECT id, path FROM songs').all() as { id: number; path: string }[]
    const gone = all.filter((row) => !existsSync(row.path))
    const del = db().prepare('DELETE FROM songs WHERE id = ?')
    for (const row of gone) del.run(row.id)
    if (gone.length > 0) pruneOrphans()
    return { added, removed: gone.length }
  })

  // Removes a song from the library; optionally sends the file (and its
  // sidecar .lrc) to the system trash — never a hard delete.
  ipcMain.handle('library:deleteSong', async (_e, songId: number, fromDisk: boolean) => {
    const row = db().prepare('SELECT path FROM songs WHERE id = ?').get(songId) as
      | { path: string }
      | undefined
    if (!row) return false
    if (fromDisk && existsSync(row.path)) {
      try {
        await shell.trashItem(row.path)
        const lrc = row.path.slice(0, -extname(row.path).length) + '.lrc'
        if (existsSync(lrc)) await shell.trashItem(lrc)
      } catch {
        return false
      }
    }
    db().prepare('DELETE FROM songs WHERE id = ?').run(songId)
    pruneOrphans()
    return true
  })

  ipcMain.handle('library:importPaths', async (_e, paths: string[]) => {
    const summary = await importFiles(paths)
    return summary
  })

  ipcMain.handle('library:getSongs', () =>
    db().prepare(`${SONG_SELECT} ORDER BY s.added_at DESC`).all()
  )

  ipcMain.handle('library:search', (_e, q: string) => {
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
  })

  // ---------- Albums / Artists ----------
  ipcMain.handle('albums:getAll', () =>
    db()
      .prepare(
        `SELECT al.id, al.title, al.year, ${EFFECTIVE_COVER_SQL} as coverPath, ar.name as artist,
                COUNT(s.id) as songCount
         FROM albums al
         LEFT JOIN artists ar ON ar.id = al.artist_id
         LEFT JOIN songs s ON s.album_id = al.id
         GROUP BY al.id ORDER BY al.title`
      )
      .all()
  )

  ipcMain.handle('albums:setPreferredCover', (_e, albumId: number, preferred: string) => {
    if (!['auto', 'embedded', 'online', 'custom'].includes(preferred)) return null
    db().prepare('UPDATE albums SET preferred_cover = ? WHERE id = ?').run(preferred, albumId)
    const row = db()
      .prepare(`SELECT ${EFFECTIVE_COVER_SQL} as cover FROM albums al WHERE al.id = ?`)
      .get(albumId) as { cover: string | null } | undefined
    return row?.cover ?? null
  })

  // ---------- Cover creator ----------
  // Saves a cover drawn in the app for a song's album (a song without an
  // album becomes a single of its own) and makes it the album's cover.
  ipcMain.handle('covers:saveCustom', (_e, songId: number, data: ArrayBuffer) => {
    const d = db()
    const song = d.prepare('SELECT id, title, album_id, artist_id, year FROM songs WHERE id = ?').get(songId) as
      | { id: number; title: string; album_id: number | null; artist_id: number | null; year: number | null }
      | undefined
    if (!song || !data || data.byteLength === 0 || data.byteLength > 15 * 1024 * 1024) return null
    let albumId = song.album_id
    if (!albumId) {
      d.prepare('INSERT OR IGNORE INTO albums (title, artist_id, year) VALUES (?, ?, ?)').run(song.title, song.artist_id, song.year)
      albumId = (d.prepare('SELECT id FROM albums WHERE title = ? AND artist_id IS ?').get(song.title, song.artist_id) as { id: number }).id
      d.prepare('UPDATE songs SET album_id = ? WHERE id = ?').run(albumId, songId)
    }
    const old = d.prepare('SELECT custom_cover_path as p FROM albums WHERE id = ?').get(albumId) as { p: string | null }
    const file = join(coversDir(), `custom-${albumId}-${Date.now()}.jpg`)
    writeFileSync(file, Buffer.from(data))
    d.prepare("UPDATE albums SET custom_cover_path = ?, preferred_cover = 'custom' WHERE id = ?").run(file, albumId)
    if (old?.p && old.p !== file && existsSync(old.p)) {
      try {
        unlinkSync(old.p)
      } catch {
        /* an old file left behind is harmless */
      }
    }
    const row = d.prepare(`SELECT ${EFFECTIVE_COVER_SQL} as cover FROM albums al WHERE al.id = ?`).get(albumId) as { cover: string | null }
    return { albumId, cover: row.cover }
  })

  // the user's own images (stickers, icon packs), copied into userData/<kind>
  const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'apng', 'bmp'])
  const imageStore = (kind: string, dir: () => string): void => {
    ipcMain.handle(`${kind}:save`, (_e, data: ArrayBuffer, ext: string) => {
      const e = String(ext).toLowerCase().replace(/^\./, '')
      if (!IMAGE_EXT.has(e) || !data || data.byteLength === 0 || data.byteLength > 10 * 1024 * 1024) return null
      const file = join(dir(), `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${e}`)
      writeFileSync(file, Buffer.from(data))
      return file
    })
    ipcMain.handle(`${kind}:delete`, (_e, path: string) => {
      // only ever files inside that folder
      const file = resolve(String(path))
      if (dirname(file) !== resolve(dir()) || !existsSync(file)) return false
      try {
        unlinkSync(file)
        return true
      } catch {
        return false
      }
    })
  }
  imageStore('stickers', stickersDir)
  imageStore('icons', iconsDir)

  ipcMain.handle('albums:getSongs', (_e, albumId: number) =>
    db()
      .prepare(`${SONG_SELECT} WHERE s.album_id = ? ORDER BY s.track_no, s.title`)
      .all(albumId)
  )

  ipcMain.handle('artists:getAll', () =>
    db()
      .prepare(
        `SELECT ar.id, ar.name, ar.image_path as imagePath,
                COUNT(DISTINCT sa.song_id) as songCount
         FROM artists ar LEFT JOIN song_artists sa ON sa.artist_id = ar.id
         GROUP BY ar.id ORDER BY ar.name`
      )
      .all()
  )

  ipcMain.handle('artists:getSongs', (_e, artistId: number) =>
    db()
      .prepare(
        `${SONG_SELECT} JOIN song_artists sa ON sa.song_id = s.id
         WHERE sa.artist_id = ? ORDER BY s.title`
      )
      .all(artistId)
  )

  // ---------- Playlists ----------
  ipcMain.handle('playlists:getAll', () =>
    db()
      .prepare(
        `SELECT p.id, p.name, p.created_at as createdAt,
                p.description, p.emoji, p.image, p.color,
                COUNT(ps.song_id) as songCount
         FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
         GROUP BY p.id ORDER BY p.created_at DESC`
      )
      .all()
  )

  ipcMain.handle(
    'playlists:updateMeta',
    (
      _e,
      id: number,
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
    }
  )

  ipcMain.handle('playlists:create', (_e, name: string) => {
    const info = db().prepare('INSERT INTO playlists (name) VALUES (?)').run(name)
    return info.lastInsertRowid
  })

  ipcMain.handle('playlists:rename', (_e, id: number, name: string) =>
    db().prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id)
  )

  ipcMain.handle('playlists:delete', (_e, id: number) =>
    db().prepare('DELETE FROM playlists WHERE id = ?').run(id)
  )

  ipcMain.handle('playlists:duplicate', (_e, id: number) => {
    const src = db().prepare('SELECT name FROM playlists WHERE id = ?').get(id) as { name: string }
    const info = db().prepare('INSERT INTO playlists (name) VALUES (?)').run(`${src.name} (copy)`)
    db()
      .prepare(
        `INSERT INTO playlist_songs (playlist_id, song_id, position)
         SELECT ?, song_id, position FROM playlist_songs WHERE playlist_id = ?`
      )
      .run(info.lastInsertRowid, id)
    return info.lastInsertRowid
  })

  ipcMain.handle('playlists:getSongs', (_e, id: number) =>
    db()
      .prepare(`${SONG_SELECT} JOIN playlist_songs ps ON ps.song_id = s.id
                WHERE ps.playlist_id = ? ORDER BY ps.position`)
      .all(id)
  )

  ipcMain.handle('playlists:addSong', (_e, playlistId: number, songId: number) => {
    const max = db()
      .prepare('SELECT COALESCE(MAX(position), -1) as m FROM playlist_songs WHERE playlist_id = ?')
      .get(playlistId) as { m: number }
    db()
      .prepare(
        'INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)'
      )
      .run(playlistId, songId, max.m + 1)
  })

  ipcMain.handle('playlists:removeSong', (_e, playlistId: number, songId: number) =>
    db()
      .prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?')
      .run(playlistId, songId)
  )

  ipcMain.handle('playlists:reorder', (_e, playlistId: number, songIds: number[]) => {
    const update = db().prepare(
      'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND song_id = ?'
    )
    const tx = db().transaction((ids: number[]) => {
      ids.forEach((songId, i) => update.run(i, playlistId, songId))
    })
    tx(songIds)
  })

  // ---------- Favorites ----------
  ipcMain.handle('favorites:toggle', (_e, songId: number) => {
    const exists = db().prepare('SELECT 1 FROM favorites WHERE song_id = ?').get(songId)
    if (exists) {
      db().prepare('DELETE FROM favorites WHERE song_id = ?').run(songId)
      return false
    }
    db().prepare('INSERT INTO favorites (song_id) VALUES (?)').run(songId)
    return true
  })

  ipcMain.handle('favorites:getAll', () =>
    db()
      .prepare(`${SONG_SELECT} WHERE f.song_id IS NOT NULL ORDER BY f.added_at DESC`)
      .all()
  )

  // ---------- History & Stats ----------
  ipcMain.handle('history:add', (_e, songId: number) =>
    db().prepare('INSERT INTO history (song_id) VALUES (?)').run(songId)
  )

  ipcMain.handle('history:getRecent', () =>
    db()
      .prepare(
        `${SONG_SELECT} JOIN (
           SELECT song_id, MAX(played_at) as lastPlayed FROM history GROUP BY song_id
         ) h ON h.song_id = s.id ORDER BY h.lastPlayed DESC LIMIT 100`
      )
      .all()
  )

  ipcMain.handle('stats:profile', () => {
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
  })

  // "Meu Mundo": the personal page. Everything in local time, since it is
  // about the listener's own day (when they listen, their streaks).
  ipcMain.handle('stats:world', () => {
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
  })

  // Cápsulas do tempo
  const CAPSULE_SELECT = `
    SELECT c.id, c.song_id as songId, COALESCE(s.title, c.title) as title, COALESCE(ar.name, c.artist) as artist,
           ${EFFECTIVE_COVER_SQL} as coverPath, c.note, c.emoji, c.created_at as createdAt,
           c.open_at as openAt, c.opened_at as openedAt
    FROM capsules c LEFT JOIN songs s ON s.id = c.song_id
    LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id`

  ipcMain.handle('capsules:list', () => db().prepare(`${CAPSULE_SELECT} ORDER BY c.open_at ASC`).all())

  ipcMain.handle('capsules:create', (_e, songId: number, note: string, emoji: string | null, openAt: number) => {
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
  })

  ipcMain.handle('capsules:delete', (_e, id: number) => {
    db().prepare('DELETE FROM capsules WHERE id = ?').run(id)
    return true
  })

  /** Sealed capsules on this song whose day has come. */
  ipcMain.handle('capsules:due', (_e, songId: number) =>
    db()
      .prepare(
        `${CAPSULE_SELECT} WHERE c.song_id = ? AND c.opened_at IS NULL AND c.open_at <= unixepoch()
         ORDER BY c.created_at ASC`
      )
      .all(songId)
  )

  ipcMain.handle('capsules:markOpened', (_e, id: number) => {
    db().prepare('UPDATE capsules SET opened_at = unixepoch() WHERE id = ? AND opened_at IS NULL').run(id)
    return true
  })

  // Retrospectiva: one year of listening (or all of it), in local time.
  ipcMain.handle('stats:recap', (_e, period: number | 'all') => {
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
  })

  ipcMain.handle('stats:get', () => {
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
  })

  // ---------- Lyrics ----------
  // Resolution order: sidecar .lrc file → cache → online providers.
  const onlineEnabled = (): boolean => {
    const row = db().prepare("SELECT value FROM settings WHERE key = 'onlineEnabled'").get() as
      | { value: string }
      | undefined
    return row ? JSON.parse(row.value) !== false : true
  }

  const NOT_FOUND_RETRY_S = 3 * 24 * 3600 // re-query providers after 3 days

  // Reads a sidecar .lrc trying multiple naming conventions:
  //   song.lrc, song.LRC, song.mp3.lrc — with BOM stripped.
  const readSidecarLrc = (songPath: string): string | null => {
    const base = songPath.slice(0, -extname(songPath).length)
    for (const candidate of [`${base}.lrc`, `${base}.LRC`, `${songPath}.lrc`]) {
      if (!existsSync(candidate)) continue
      try {
        return readFileSync(candidate, 'utf-8').replace(/^\uFEFF/, '')
      } catch {
        /* try next */
      }
    }
    return null
  }

  // Resolution order (per Isaac): ONLINE first — providers usually have
  // better-synced lyrics — falling back to the local sidecar .lrc.
  // A synced result always beats a plain-text one, whatever the source.
  ipcMain.handle('lyrics:resolve', async (_e, songId: number, force = false) => {
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
      online = await fetchLyricsOnline({
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration
      })
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
    const sidecar = readSidecarLrc(song.path)
    if (sidecar) return { source: 'Arquivo local (.lrc)', synced: sidecar, plain: null }

    // 3) Plain-text online lyrics, better than nothing
    return online
  })

  // ---------- Online covers / album enrichment ----------
  ipcMain.handle('online:fetchCover', async (_e, songId: number, force = false) => {
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

    const result = await fetchCoverOnline({
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration
    })
    if (!result) return song.coverPath ?? null
    return applyCoverToSong(songId, result)
  })

  // Bulk metadata refresh: artist photos + missing covers + genres, with
  // progress events. Never overwrites data the user already has.
  ipcMain.handle('metadata:refresh', async () => {
    const send = (done: number, total: number, label: string): void =>
      win.webContents.send('metadata:progress', { done, total, label })

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
      send(done, total, `${tr('Artista', 'Artist')}: ${ar.name}`)
      try {
        const photo = await fetchArtistPhoto(ar.name)
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
      send(done, total, `${tr('Capa', 'Cover')}: ${s.title}`)
      try {
        const result = await fetchCoverOnline({
          title: s.title,
          artist: s.artist,
          album: s.album,
          duration: s.duration
        })
        if (result) {
          applyCoverToSong(s.id, result)
          coversUpdated++
        }
      } catch {
        /* skip */
      }
      done++
    }

    for (const s of missingGenre) {
      send(done, total, `${tr('Gênero', 'Genre')}: ${s.title}`)
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

    send(total, total, tr('Concluído', 'Done'))
    return { artistsUpdated, coversUpdated, genresUpdated, total }
  })

  // ---------- Settings ----------
  ipcMain.handle('settings:get', () => {
    const rows = db().prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
  })

  ipcMain.handle('settings:set', (_e, key: string, value: unknown) =>
    db()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))
  )
}
