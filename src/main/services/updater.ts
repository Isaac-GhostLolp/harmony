import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import { ipcMain, app } from 'electron'

/**
 * Auto-update via electron-updater, wired to the GitHub Releases the project
 * already publishes (the `publish` field in package.json points there).
 *
 * Flow: on launch (and hourly) it checks GitHub. If a newer version exists it
 * downloads it in the background, then tells the renderer so the UI can show a
 * gentle "update ready — restart to apply" prompt. The user stays in control:
 * nothing restarts on its own.
 *
 * Updates only run in packaged builds — in dev there's no valid signature/
 * version feed, so we no-op to avoid noisy errors.
 */

type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

let lastStatus: UpdateStatus = { state: 'none' }

function send(win: BrowserWindow, status: UpdateStatus): void {
  lastStatus = status
  if (!win.isDestroyed()) win.webContents.send('updater:status', status)
}

export function initAutoUpdate(win: BrowserWindow): void {
  // Renderer can ask for the current status (e.g. when the UI mounts) …
  ipcMain.handle('updater:get', () => lastStatus)
  // … manually trigger a check …
  ipcMain.handle('updater:check', () => {
    if (app.isPackaged) void autoUpdater.checkForUpdates()
    return true
  })
  // … and request the install+restart once an update is ready.
  ipcMain.handle('updater:install', () => {
    if (app.isPackaged) autoUpdater.quitAndInstall()
    return true
  })

  if (!app.isPackaged) return // dev: no update feed, skip silently

  // We drive the download/notify flow ourselves so the user is never surprised.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send(win, { state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    send(win, { state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => send(win, { state: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    send(win, { state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    send(win, { state: 'ready', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    send(win, { state: 'error', message: err == null ? 'unknown' : String(err.message ?? err) })
  )

  // Check shortly after launch, then hourly.
  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => {
      /* offline or no release yet — ignore */
    })
  }
  setTimeout(check, 8000)
  setInterval(check, 60 * 60 * 1000)
}
