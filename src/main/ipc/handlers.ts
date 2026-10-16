import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { extname, join, resolve, dirname } from 'path'
import { app } from 'electron'
import { getDb, coversDir, stickersDir, iconsDir } from '../db/database'
import { scanFolder, importFiles } from '../services/scanner'
import {
  libraryHandlers,
  pruneOrphans as prune,
  getSetting as readSetting,
  setSetting as writeSetting,
  EFFECTIVE_COVER_SQL
} from '../../core/library'
import type { Db } from '../../core/db'
import { saveImage } from '../services/online'
import { onlineHandlers } from '../../core/online'

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

  // ---------- Lyrics, online covers, metadata refresh (src/core/online.ts) ----------
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
  const online = onlineHandlers(core, {
    saveImage,
    readSidecarLrc,
    progress: (p) => win.webContents.send('metadata:progress', p),
    tr
  })
  for (const [channel, handler] of Object.entries(online)) ipcMain.handle(channel, (_e, ...args) => handler(...args))

}
