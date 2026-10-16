import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { extname, join, resolve, dirname } from 'path'
import { app } from 'electron'
import { getDb, coversDir, stickersDir, iconsDir } from '../db/database'
import { scanFolder, importFiles } from '../services/scanner'
import { libraryHandlers, pruneOrphans as prune, getSetting as readSetting, setSetting as writeSetting } from '../../core/library'
import type { Db } from '../../core/db'
import {
  fetchLyricsOnline,
  fetchCoverOnline,
  applyCoverToSong,
  fetchArtistPhoto,
  fetchGenre,
  EFFECTIVE_COVER_SQL
} from '../services/online'

// the song query lives in src/core (shared with Android); the Pharaf bridge imports it from here
export { SONG_SELECT } from '../../core/library'

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
  const core = (): Db => db() as unknown as Db
  const getSetting = (key: string): unknown => readSetting(core(), key)
  const setSetting = (key: string, value: unknown): void => writeSetting(core(), key, value)
  const getLibraryFolders = (): string[] => {
    const folders = getSetting('libraryFolders')
    if (Array.isArray(folders)) return folders.filter((f): f is string => typeof f === 'string')
    const legacy = getSetting('libraryFolder') // migrate pre-0.4 single folder
    return typeof legacy === 'string' ? [legacy] : []
  }

  const pruneOrphans = (): void => prune(core())

  // the plain-SQL channels, shared with Android (src/core/library.ts)
  for (const [channel, handler] of Object.entries(libraryHandlers(core)))
    ipcMain.handle(channel, (_e, ...args) => handler(...args))

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

}
