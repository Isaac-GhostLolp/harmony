import { app, BrowserWindow, protocol, shell, ipcMain } from 'electron'
import { createReadStream, promises as fsp } from 'fs'
import { Readable } from 'stream'
import { join, extname } from 'path'
import { initDatabase } from './db/database'
import { registerIpcHandlers } from './ipc/handlers'
import { initDiscord, updatePresence, type PresenceState } from './services/discord'

// Pin the app name so the userData folder is ALWAYS "harmony" — in dev it
// would otherwise default to "Electron", putting the database (library,
// stats, playlists, favorites) in a different folder than the packaged app.
// This keeps user data stable across dev, updates and reinstalls.
app.setName('Harmony')

// NOTE (Linux dev): Ubuntu 23.10+ restricts unprivileged user namespaces,
// so Electron needs the SUID chrome-sandbox helper — which can't be
// root-owned inside a user's node_modules. The Chromium zygote spawns
// BEFORE this script runs, so the fix cannot live here: the dev script
// passes --no-sandbox on the CLI instead (see package.json). Packaged
// builds keep full sandboxing.

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'harmony',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
}

/**
 * Streams local files with full HTTP Range support.
 * Range requests are what let the <audio> element seek precisely and fire
 * `ended` at the real end of the file — without them, seeking drifts past
 * the track duration and repeat/autoplay silently break.
 * CORS headers let Web Audio (equalizer) and canvas (accent color) read
 * the media without tainting.
 */
function handleMediaRequest(request: Request): Promise<Response> | Response {
  const url = new URL(request.url)
  const filePath = decodeURIComponent(url.searchParams.get('path') ?? '')
  if (!filePath) return new Response('Missing path', { status: 400 })

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range'
  }

  return (async () => {
    let size: number
    try {
      size = (await fsp.stat(filePath)).size
    } catch {
      return new Response('Not found', { status: 404, headers: cors })
    }

    const mime = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.get('Range')

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      let start = match?.[1] ? parseInt(match[1], 10) : 0
      let end = match?.[2] ? parseInt(match[2], 10) : size - 1
      end = Math.min(end, size - 1)
      if (start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { ...cors, 'Content-Range': `bytes */${size}` }
        })
      }
      const stream = Readable.toWeb(
        createReadStream(filePath, { start, end })
      ) as unknown as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: {
          ...cors,
          'Content-Type': mime,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
    return new Response(stream, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': mime,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes'
      }
    })
  })()
}

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null

function loadRenderer(win: BrowserWindow, hash = ''): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash ? `#${hash}` : ''}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

// Official Harmony logo: drop a 512x512 icon.png in resources/ —
// electron-builder picks it up for all platforms (buildResources), and in
// dev the window uses it directly on Linux/Windows.
const devIconPath = join(__dirname, '../../resources/icon.png')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0b10',
    ...(app.isPackaged ? {} : { icon: devIconPath }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    miniWindow?.close()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
  registerIpcHandlers(mainWindow)
}

function toggleMiniPlayer(): void {
  if (miniWindow) {
    miniWindow.close()
    return
  }
  miniWindow = new BrowserWindow({
    width: 360,
    height: 110,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#0b0b10',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  miniWindow.on('closed', () => {
    miniWindow = null
  })
  loadRenderer(miniWindow, '/mini')
}

app.whenReady().then(() => {
  initDatabase()
  protocol.handle('harmony', handleMediaRequest)
  createWindow()

  // ---- Mini player + Discord relay ----
  ipcMain.on('mini:toggle', () => toggleMiniPlayer())

  // Main window broadcasts playback state; mini window mirrors it and
  // Discord Rich Presence follows along.
  ipcMain.on('player:state', (_e, state: PresenceState) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('player:state', state)
    }
    updatePresence(state)
  })

  // Mini window sends transport commands back to the main window.
  ipcMain.on('player:command', (_e, cmd: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player:command', cmd)
    }
  })

  ipcMain.on('discord:configure', (_e, enabled: boolean, clientId: string) => {
    initDiscord(enabled, clientId)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
