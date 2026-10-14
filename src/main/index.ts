import { app, BrowserWindow, Menu, protocol, shell, ipcMain, type WebContents } from 'electron'
import { createReadStream, promises as fsp } from 'fs'
import { Readable } from 'stream'
import { join, extname } from 'path'
import { initDatabase, getDb } from './db/database'
import { registerIpcHandlers } from './ipc/handlers'
import { initDiscord, updatePresence, type PresenceState } from './services/discord'
import { startPharafBridge, stopPharafBridge } from './services/pharafBridge'
import { initAutoUpdate } from './services/updater'

// Pin the app name so the userData folder is ALWAYS "harmony" — in dev it
// would otherwise default to "Electron", putting the database (library,
// stats, playlists, favorites) in a different folder than the packaged app.
// This keeps user data stable across dev, updates and reinstalls.
app.setName('Harmony')

// Linux: modern distros (Ubuntu 23.10+, Debian 12+, Arch…) restrict
// unprivileged user namespaces, so Chromium's SUID sandbox helper can't
// configure itself and the app aborts ("chrome-sandbox ... mode 4755").
// Requiring each user to chmod the helper as root is a terrible UX, so we
// disable the setuid sandbox on Linux — standard practice for Electron apps
// (VS Code, Discord, Slack do the same). Harmony is a local music player with
// no untrusted web content, so this doesn't meaningfully change its exposure.
// macOS/Windows keep their normal sandbox.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

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
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.apng': 'image/apng',
  '.bmp': 'image/bmp',
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

/**
 * Whether the main window wears the Harmony's own title bar (drawn by the
 * renderer) instead of the system's. Saved by Personalização as the
 * 'titleBar' setting; read once, when the window is made, so changing it
 * takes a restart. macOS keeps its native bar.
 */
function customFrame(): boolean {
  if (process.platform === 'darwin') return false
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'titleBar'").get() as
      | { value: string }
      | undefined
    const v = row ? (JSON.parse(row.value) as { mode?: unknown }) : undefined
    return v?.mode !== 'system'
  } catch {
    return true
  }
}

function createWindow(): void {
  const custom = customFrame()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: !custom,
    backgroundColor: '#0b0b10',
    ...(app.isPackaged ? {} : { icon: devIconPath }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--harmony-frame=${custom ? 'custom' : 'system'}`]
    }
  })
  windowStateEvents(mainWindow)

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    miniWindow?.close()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  windowShortcuts(mainWindow)
  loadRenderer(mainWindow)
  registerIpcHandlers(mainWindow)
  initAutoUpdate(mainWindow)
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

/** Tells the page when the window is maximized, full screen or focused, so
 * the Harmony's title bar can show the right buttons (and hide in full screen). */
function windowStateEvents(win: BrowserWindow): void {
  const send = (): void => {
    if (!win.isDestroyed())
      win.webContents.send('window:state', {
        maximized: win.isMaximized(),
        fullScreen: win.isFullScreen(),
        focused: win.isFocused()
      })
  }
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur'] as const)
    win.on(ev as 'maximize', send)
}

/**
 * The few keys the default Electron menu used to give, now that there is no
 * menu bar (Windows/Linux): F11 full screen, Ctrl +/−/0 zoom, Ctrl+Q quit.
 * Reload and DevTools only in development. Copy/paste/undo in text fields
 * are Chromium's own and never needed the menu.
 */
function windowShortcuts(win: BrowserWindow): void {
  const zoom = (wc: WebContents, step: number | null): void => {
    wc.setZoomLevel(step === null ? 0 : Math.max(-3, Math.min(3, wc.getZoomLevel() + step)))
  }
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const wc = win.webContents
    const mod = input.control || input.meta
    // F11 also reaches the page (DJ Mode leaves on it), as with the old menu
    if (input.key === 'F11' && !mod && !input.alt) {
      win.setFullScreen(!win.isFullScreen())
      return
    }
    if (!mod || input.alt) return
    const key = input.key.toLowerCase()
    if (key === '=' || key === '+') zoom(wc, 0.5)
    else if (key === '-' || key === '_') zoom(wc, -0.5)
    else if (key === '0') zoom(wc, null)
    else if (key === 'q' && !input.shift) app.quit()
    else if (!app.isPackaged && key === 'r' && !input.shift) wc.reload()
    else if (!app.isPackaged && key === 'i' && input.shift) wc.toggleDevTools()
    else return
    event.preventDefault()
  })
}

// The sound goes to Pharaf over a local WebRTC link. Without this, Chromium hides
// this computer's address behind an mDNS name, which often doesn't resolve locally.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')

app.whenReady().then(() => {
  // no File/Edit/View bar: the Harmony has its own UI for everything. macOS
  // keeps its menu (the app menu holds Quit and the Edit shortcuts there).
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  initDatabase()
  protocol.handle('harmony', handleMediaRequest)
  createWindow()
  // Pharaf (friends' voice app) can show and control this Harmony in a call — see pharafBridge.ts
  startPharafBridge(() => mainWindow)
  app.on('before-quit', stopPharafBridge)

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

  // ---- The Harmony's own title bar ----
  const sender = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender)
  ipcMain.on('window:minimize', (e) => sender(e)?.minimize())
  ipcMain.on('window:maximize', (e) => {
    const win = sender(e)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => sender(e)?.close())
  ipcMain.handle('window:state', (e) => {
    const win = sender(e)
    return {
      maximized: win?.isMaximized() ?? false,
      fullScreen: win?.isFullScreen() ?? false,
      focused: win?.isFocused() ?? true
    }
  })
  // switching between the system bar and the Harmony's needs a new window
  ipcMain.on('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
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
