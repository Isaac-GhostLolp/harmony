import type { HarmonyApi } from '../../../../preload'
import type { Db } from '../../../../core/db'
import { libraryHandlers, pruneOrphans, getSetting, setSetting, EFFECTIVE_COVER_SQL, type Handler } from '../../../../core/library'
import { insertSong } from '../../../../core/songs'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { openDatabase, toBase64 } from './database'
import { HarmonyMedia, type DeviceSong } from './media'
import { updateSession, onSessionCommand, type PlayerState } from './session'
import { askForFolders, isInside } from './folders'
import { onlineHandlers, type SaveImage } from '../../../../core/online'
import { getLang } from '../../i18n'

/**
 * The Android side of `window.harmony`: what Electron's main process does on
 * the desktop, done here in the WebView. The library queries are the shared
 * ones (src/core); the music comes from the phone's MediaStore. Features the
 * phone doesn't have yet answer like "nothing there" so the UI stays calm.
 */

type Progress = { processed: number; total: number; current: string }

/** MediaStore fills blanks with placeholders and folder names; keep only real tags */
function clean(s: DeviceSong): DeviceSong {
  const real = (v: string | null): string | null => (v && v.trim() && v !== '<unknown>' ? v.trim() : null)
  const folder = s.path.split('/').slice(-2, -1)[0] ?? ''
  const album = real(s.album)
  return {
    ...s,
    title: real(s.title),
    artist: real(s.artist),
    albumArtist: real(s.albumArtist),
    // with no album tag, Android names the album after the folder ("Download")
    album: album && album !== folder ? album : null,
    genre: real(s.genre),
    year: s.year && s.year > 0 ? s.year : null,
    trackNo: s.trackNo && s.trackNo > 0 ? s.trackNo % 1000 : null
  }
}

/** a short, stable file name for a downloaded image (FNV-1a) */
function hashKey(key: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0') + key.length.toString(16)
}

const fileTitle = (path: string): string => (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '')
const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function installAndroidApi(): Promise<void> {
  const db: Db = await openDatabase()
  const core = libraryHandlers(() => db)
  const q =
    (channel: string): Handler =>
    async (...args: unknown[]) =>
      core[channel](...args)

  const scanListeners = new Set<(p: Progress) => void>()
  const progress = (p: Progress): void => scanListeners.forEach((cb) => cb(p))

  /**
   * Brings the library in line with the phone: new songs from the chosen
   * folders in, songs gone (or outside them) out, covers. `choose` shows the
   * folder picker first (it also shows when no folder was ever chosen).
   */
  async function sync(choose: boolean): Promise<{ added: number; removed: number } | null> {
    const { granted } = await HarmonyMedia.requestAccess()
    if (!granted) return null
    const { songs: all } = await HarmonyMedia.scan()
    let folders = (getSetting(db, 'androidFolders') as string[] | undefined) ?? []
    if (choose || folders.length === 0) {
      const picked = await askForFolders(all, folders)
      if (!picked) return null
      folders = picked
      setSetting(db, 'androidFolders', folders)
    }
    const songs = all.filter((s) => folders.some((f) => isInside(s.path, f)))
    const onPhone = new Set(songs.map((s) => s.path))
    const known = new Set((db.prepare('SELECT path FROM songs').all() as { path: string }[]).map((r) => r.path))
    const hidden = new Set((getSetting(db, 'androidHidden') as string[] | undefined) ?? [])
    const fresh = songs.filter((s) => !known.has(s.path) && !hidden.has(s.path)).map(clean)

    const CHUNK = 40
    for (let i = 0; i < fresh.length; i += CHUNK) {
      const part = fresh.slice(i, i + CHUNK)
      progress({ processed: i, total: fresh.length, current: part[0].path })
      db.transaction(() => {
        for (const s of part)
          insertSong(db, {
            path: s.path,
            title: s.title ?? fileTitle(s.path),
            artist: s.artist,
            albumArtist: s.albumArtist,
            album: s.album,
            genre: s.genre,
            year: s.year,
            duration: s.duration,
            trackNo: s.trackNo
          })
      })()
      await pause() // let the progress bar draw
    }

    const gone = [...known].filter((p) => !onPhone.has(p))
    if (gone.length) {
      db.transaction(() => {
        const del = db.prepare('DELETE FROM songs WHERE path = ?')
        for (const p of gone) del.run(p)
      })()
      pruneOrphans(db)
    }

    await fetchCovers()
    progress({ processed: fresh.length, total: fresh.length, current: '' })
    return { added: fresh.length, removed: gone.length }
  }

  /** covers for albums without one, read from one of their files (once per album) */
  async function fetchCovers(): Promise<void> {
    const tried = new Set((getSetting(db, 'androidCoverTried') as number[] | undefined) ?? [])
    const albums = (
      db
        .prepare(
          `SELECT al.id, MIN(s.path) as path FROM albums al JOIN songs s ON s.album_id = al.id
           WHERE al.cover_path IS NULL GROUP BY al.id`
        )
        .all() as { id: number; path: string }[]
    ).filter((a) => !tried.has(a.id))
    const BATCH = 25
    for (let i = 0; i < albums.length; i += BATCH) {
      const part = albums.slice(i, i + BATCH)
      progress({ processed: i, total: albums.length, current: part[0].path })
      const { paths } = await HarmonyMedia.covers({ items: part.map((a) => ({ key: `album-${a.id}`, path: a.path })) })
      db.transaction(() => {
        const set = db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?')
        for (const a of part) {
          const file = paths[`album-${a.id}`]
          if (file) set.run(file, a.id)
          else tried.add(a.id)
        }
      })()
    }
    if (albums.length) setSetting(db, 'androidCoverTried', [...tried])
  }

  /** a cover drawn in the cover creator, saved for the song's album (as on the desktop) */
  async function saveCustomCover(songId: number, data: ArrayBuffer): Promise<{ albumId: number; cover: string | null } | null> {
    const song = db.prepare('SELECT id, title, album_id, artist_id, year FROM songs WHERE id = ?').get(songId) as
      | { id: number; title: string; album_id: number | null; artist_id: number | null; year: number | null }
      | undefined
    if (!song || !data || data.byteLength === 0 || data.byteLength > 15 * 1024 * 1024) return null
    let albumId = song.album_id
    if (!albumId) {
      db.prepare('INSERT OR IGNORE INTO albums (title, artist_id, year) VALUES (?, ?, ?)').run(song.title, song.artist_id, song.year)
      albumId = (db.prepare('SELECT id FROM albums WHERE title = ? AND artist_id IS ?').get(song.title, song.artist_id) as { id: number }).id
      db.prepare('UPDATE songs SET album_id = ? WHERE id = ?').run(albumId, songId)
    }
    const old = db.prepare('SELECT custom_cover_path as p FROM albums WHERE id = ?').get(albumId) as { p: string | null }
    const { uri } = await Filesystem.writeFile({
      path: `covers/custom-${albumId}-${Date.now()}.jpg`,
      data: toBase64(new Uint8Array(data)),
      directory: Directory.Data,
      recursive: true
    })
    const file = uri.replace(/^file:\/\//, '')
    db.prepare("UPDATE albums SET custom_cover_path = ?, preferred_cover = 'custom' WHERE id = ?").run(file, albumId)
    if (old?.p && old.p !== file) void Filesystem.deleteFile({ path: `file://${old.p}` }).catch(() => undefined)
    const row = db.prepare(`SELECT ${EFFECTIVE_COVER_SQL} as cover FROM albums al WHERE al.id = ?`).get(albumId) as { cover: string | null }
    return { albumId, cover: row.cover }
  }

  // ---- online lookups: the same providers and matching as the desktop (src/core/online.ts) ----
  const metadataListeners = new Set<(p: { done: number; total: number; label: string }) => void>()
  /** images downloaded from the web go to the app's covers folder, named after what they show */
  const saveImage: SaveImage = async (data, ext, key) => {
    const path = `covers/online-${hashKey(key)}.${ext}`
    try {
      const { uri } = await Filesystem.stat({ path, directory: Directory.Data })
      return uri.replace(/^file:\/\//, '')
    } catch {
      // not saved yet
    }
    const { uri } = await Filesystem.writeFile({ path, data: toBase64(data), directory: Directory.Data, recursive: true })
    return uri.replace(/^file:\/\//, '')
  }
  const online = onlineHandlers(() => db, {
    saveImage,
    progress: (p) => metadataListeners.forEach((cb) => cb(p)),
    tr: (pt, en) => (getLang() === 'en' ? en : pt)
  })

  /**
   * An exported video (Retrospectiva) into Movies/Harmony, where the gallery
   * finds it. Written in pieces: one big string over the bridge could run
   * the phone out of memory.
   */
  async function saveVideo(data: ArrayBuffer, baseName: string, ext: string): Promise<string | null> {
    const safeExt = (ext || '').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4'
    const name =
      (baseName || 'Harmony').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Harmony'
    const path = `Movies/Harmony/${name}.${safeExt}`
    const bytes = new Uint8Array(data)
    const CHUNK = 3 * 1024 * 1024
    try {
      let uri = ''
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const part = toBase64(bytes.subarray(i, i + CHUNK))
        if (i === 0) uri = (await Filesystem.writeFile({ path, data: part, directory: Directory.ExternalStorage, recursive: true })).uri
        else await Filesystem.appendFile({ path, data: part, directory: Directory.ExternalStorage })
      }
      return uri.replace(/^file:\/\//, '') || path
    } catch (e) {
      console.error('Harmony: could not save the video', e)
      return null
    }
  }

  const none = async (): Promise<null> => null
  const nothing = (): void => undefined
  const unsubscribe = (): (() => void) => () => undefined

  const api = {
    library: {
      selectAndScan: async () => {
        const r = await sync(true)
        return r ? { folder: 'android', added: r.added, skipped: 0 } : null
      },
      importPaths: async () => ({ added: 0, skipped: 0 }),
      getSongs: q('library:getSongs'),
      refresh: async () => (await sync(false)) ?? { added: 0, removed: 0 },
      // only from the library (and kept out of later scans): the phone's files are never touched
      deleteSong: async (songId: number) => {
        const row = db.prepare('SELECT path FROM songs WHERE id = ?').get(songId) as { path: string } | undefined
        if (!row) return false
        const hidden = (getSetting(db, 'androidHidden') as string[] | undefined) ?? []
        setSetting(db, 'androidHidden', [...hidden, row.path])
        db.prepare('DELETE FROM songs WHERE id = ?').run(songId)
        pruneOrphans(db)
        return true
      },
      search: q('library:search'),
      onScanProgress: (cb: (p: Progress) => void) => {
        scanListeners.add(cb)
        return () => {
          scanListeners.delete(cb)
        }
      }
    },
    albums: {
      getAll: q('albums:getAll'),
      getSongs: q('albums:getSongs'),
      setPreferredCover: q('albums:setPreferredCover')
    },
    artists: { getAll: q('artists:getAll'), getSongs: q('artists:getSongs') },
    playlists: {
      getAll: q('playlists:getAll'),
      create: q('playlists:create'),
      rename: q('playlists:rename'),
      remove: q('playlists:delete'),
      duplicate: q('playlists:duplicate'),
      updateMeta: q('playlists:updateMeta'),
      getSongs: q('playlists:getSongs'),
      addSong: q('playlists:addSong'),
      removeSong: q('playlists:removeSong'),
      reorder: q('playlists:reorder')
    },
    favorites: { toggle: q('favorites:toggle'), getAll: q('favorites:getAll') },
    history: { add: q('history:add'), getRecent: q('history:getRecent') },
    stats: { get: q('stats:get'), profile: q('stats:profile'), world: q('stats:world'), recap: q('stats:recap') },
    capsules: {
      list: q('capsules:list'),
      create: q('capsules:create'),
      remove: q('capsules:delete'),
      due: q('capsules:due'),
      markOpened: q('capsules:markOpened')
    },
    metadata: {
      refresh: online['metadata:refresh'],
      onProgress: (cb: (p: { done: number; total: number; label: string }) => void) => {
        metadataListeners.add(cb)
        return () => {
          metadataListeners.delete(cb)
        }
      }
    },
    lyrics: { resolve: online['lyrics:resolve'] },
    covers: { saveCustom: saveCustomCover },
    stickers: { save: none, remove: async () => false },
    icons: { save: none, remove: async () => false },
    online: { fetchCover: online['online:fetchCover'] },
    player: {
      toggleMini: nothing,
      sendState: (state: unknown) => updateSession(state as PlayerState),
      onState: unsubscribe,
      sendCommand: nothing,
      onCommand: (cb: (cmd: string) => void) => onSessionCommand(cb),
      configureDiscord: nothing
    },
    settings: { get: q('settings:get'), set: q('settings:set') },
    app: { openExternal: (url: string) => void window.open(url, '_blank'), relaunch: () => location.reload() },
    window: {
      frame: 'system' as const,
      platform: 'android',
      minimize: nothing,
      toggleMaximize: nothing,
      close: nothing,
      getState: async () => ({ maximized: true, fullScreen: false, focused: true }),
      onState: unsubscribe
    },
    wallpaper: { save: none, clear: async () => true },
    edit: { save: saveVideo, reveal: nothing, setBackgroundThrottling: nothing },
    updater: { get: async () => ({ state: 'none' }), check: none, install: none, onStatus: unsubscribe }
  }
  window.harmony = api as unknown as HarmonyApi
}
