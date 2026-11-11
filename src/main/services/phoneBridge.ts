/**
 * The PC ↔ phone bridge, the PC's side: while the "Ponte com o celular"
 * window is open, a small HTTP server answers the Harmony on the phone over
 * the home Wi-Fi. It shows a QR code with this computer's address and a
 * six-digit code; every request must carry the code, five wrong tries make a
 * new one, and closing the window turns the server off.
 *
 *   GET  /bridge/hello              → { app, name, version, songs }
 *   GET  /bridge/library            → BridgeSong[]   (what the PC has)
 *   GET  /bridge/state              → BridgeState    (its playlists and favourites)
 *   POST /bridge/state  BridgeState → MergeResult    (joins the phone's into the PC)
 *   GET  /bridge/song/:id           → the song's file
 *   POST /bridge/upload?name=…      → a song from the phone, saved in "Harmony do celular"
 *
 * The shared part (matching songs, joining playlists) is src/core/bridge.ts.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'
import { networkInterfaces, hostname } from 'os'
import { randomInt } from 'crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { basename, extname, join, resolve, sep } from 'path'
import { app, ipcMain, type BrowserWindow } from 'electron'
import { getDb } from '../db/database'
import { importFiles } from './scanner'
import { getSetting, setSetting } from '../../core/library'
import { bridgeLibrary, exportBridgeState, mergeBridgeState, type BridgeState } from '../../core/bridge'
import type { Db } from '../../core/db'

const PORTS = [47830, 47831, 47832, 47833, 47834]
/** playlists carry their photos as data URLs */
const MAX_STATE = 40 * 1024 * 1024
const MAX_SONG = 600 * 1024 * 1024
const AUDIO = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'])
const UPLOAD_FOLDER = 'Harmony do celular'

export interface BridgeInfo {
  addresses: string[]
  port: number
  code: string
  name: string
}

export type BridgeEvent =
  | { type: 'connected'; device: string }
  | { type: 'sending'; device: string; title: string }
  | { type: 'received'; device: string; title: string }
  | { type: 'merged'; device: string; playlistsCreated: number; playlistSongsAdded: number; favoritesAdded: number }
  | { type: 'code'; code: string }

let server: Server | null = null
let info: BridgeInfo | null = null
let wrong = 0
let win: () => BrowserWindow | null = () => null
const sizes = new Map<string, number>()

const db = (): Db => getDb() as unknown as Db

function emit(e: BridgeEvent): void {
  const w = win()
  if (w && !w.isDestroyed()) w.webContents.send('bridge:event', e)
}

const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** this computer's addresses on the local network (Wi-Fi / cable), most likely first */
function lanAddresses(): string[] {
  const out: { addr: string; rank: number }[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      // virtual adapters (Docker, VirtualBox, VPNs) last
      const virtual = /docker|veth|br-|vbox|virtual|vmnet|tun|tap|zt|tailscale|wsl/i.test(name)
      const privateNet = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)
      out.push({ addr: a.address, rank: (virtual ? 2 : 0) + (privateNet ? 0 : 1) })
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map((o) => o.addr)
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('bad json'))
      }
    })
    req.on('error', reject)
  })
}

function fileSize(path: string): number {
  const hit = sizes.get(path)
  if (hit !== undefined) return hit
  let s = 0
  try {
    s = statSync(path).size
  } catch {
    s = 0
  }
  sizes.set(path, s)
  return s
}

function libraryFolders(): string[] {
  const f = getSetting(db(), 'libraryFolders')
  return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : []
}

/** where songs from the phone go: "Harmony do celular" in the first music folder (or the system's Music) */
function uploadFolder(): string {
  const base = libraryFolders().find((f) => existsSync(f)) ?? app.getPath('music')
  const dir = join(base, UPLOAD_FOLDER)
  mkdirSync(dir, { recursive: true })
  const inside = libraryFolders().some((f) => dir === f || dir.startsWith(f.endsWith(sep) ? f : f + sep))
  if (!inside) setSetting(db(), 'libraryFolders', [...libraryFolders(), dir])
  return dir
}

/** a file name that is safe and doesn't overwrite anything: "Song.mp3", "Song (2).mp3"… */
function freeName(dir: string, wanted: string): string {
  const clean = basename(wanted).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 150) || 'song.mp3'
  const ext = extname(clean)
  const stem = clean.slice(0, clean.length - ext.length)
  let name = clean
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem} (${i})${ext}`
  return join(dir, name)
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://bridge')
  const device = String(req.headers['x-harmony-device'] ?? 'Celular').slice(0, 60)

  if (url.pathname === '/bridge/hello' && req.method === 'GET') {
    // the only call without the code: the phone checks it found a Harmony
    const songs = (db().prepare('SELECT COUNT(*) as n FROM songs').get() as { n: number }).n
    return send(res, 200, { app: 'harmony', name: info?.name, version: app.getVersion(), songs, needsCode: true })
  }

  if (!info || req.headers['x-harmony-code'] !== info.code) {
    wrong++
    if (wrong >= 5 && info) {
      // someone guessing: a new code, shown on the PC
      wrong = 0
      info.code = newCode()
      emit({ type: 'code', code: info.code })
    }
    return send(res, 401, { error: 'code' })
  }
  wrong = 0

  if (url.pathname === '/bridge/library' && req.method === 'GET') {
    emit({ type: 'connected', device })
    return send(res, 200, bridgeLibrary(db(), fileSize))
  }

  if (url.pathname === '/bridge/state' && req.method === 'GET') return send(res, 200, exportBridgeState(db()))

  if (url.pathname === '/bridge/state' && req.method === 'POST') {
    const state = (await readJson(req, MAX_STATE)) as BridgeState
    const r = mergeBridgeState(db(), { favorites: state.favorites ?? [], playlists: state.playlists ?? [] })
    emit({ type: 'merged', device, ...r })
    return send(res, 200, r)
  }

  const song = /^\/bridge\/song\/(\d+)$/.exec(url.pathname)
  if (song && req.method === 'GET') {
    const row = db().prepare('SELECT path, title FROM songs WHERE id = ?').get(Number(song[1])) as
      | { path: string; title: string }
      | undefined
    if (!row || !existsSync(row.path)) return send(res, 404, { error: 'not found' })
    emit({ type: 'sending', device, title: row.title })
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(statSync(row.path).size),
      'Cache-Control': 'no-store'
    })
    createReadStream(row.path).pipe(res)
    return
  }

  if (url.pathname === '/bridge/upload' && req.method === 'POST') {
    const name = url.searchParams.get('name') ?? ''
    if (!AUDIO.has(extname(name).toLowerCase())) return send(res, 400, { error: 'not audio' })
    const declared = Number(req.headers['content-length'] ?? 0)
    if (declared > MAX_SONG) return send(res, 413, { error: 'too large' })
    const dir = uploadFolder()
    const target = freeName(dir, name)
    if (!resolve(target).startsWith(resolve(dir) + sep)) return send(res, 400, { error: 'bad name' })
    await new Promise<void>((done, fail) => {
      let size = 0
      const out = createWriteStream(target)
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_SONG) {
          req.destroy()
          out.destroy()
          fail(new Error('too large'))
        }
      })
      req.pipe(out)
      out.on('finish', done)
      out.on('error', fail)
      req.on('error', fail)
    }).catch((e: Error) => {
      try {
        unlinkSync(target)
      } catch {
        /* nothing written */
      }
      throw e
    })
    const r = await importFiles([target])
    if (r.added === 0) {
      // not a song the library can read: nothing stays behind
      try {
        unlinkSync(target)
      } catch {
        /* already gone */
      }
      return send(res, 422, { error: 'unreadable' })
    }
    const row = db().prepare('SELECT title FROM songs WHERE path = ?').get(target) as { title: string } | undefined
    emit({ type: 'received', device, title: row?.title ?? basename(target, extname(target)) })
    return send(res, 200, { ok: true, added: r.added })
  }

  send(res, 404, { error: 'not found' })
}

function listen(ports: number[]): Promise<{ s: Server; port: number }> {
  return new Promise((ok, fail) => {
    const tryAt = (i: number): void => {
      if (i >= ports.length) return fail(new Error('no free port'))
      const s = createServer((req, res) => {
        handle(req, res).catch(() => {
          if (!res.headersSent) send(res, 500, { error: 'failed' })
          else res.destroy()
        })
      })
      s.once('error', () => tryAt(i + 1))
      s.listen(ports[i], '0.0.0.0', () => ok({ s, port: ports[i] }))
    }
    tryAt(0)
  })
}

export async function startBridge(): Promise<BridgeInfo> {
  if (server && info) return info
  const { s, port } = await listen(PORTS)
  server = s
  wrong = 0
  sizes.clear()
  info = { addresses: lanAddresses(), port, code: newCode(), name: hostname() }
  return info
}

export function stopBridge(): void {
  server?.close()
  server?.closeAllConnections?.()
  server = null
  info = null
}

export function registerPhoneBridge(getWin: () => BrowserWindow | null): void {
  win = getWin
  ipcMain.handle('bridge:start', () => startBridge())
  ipcMain.handle('bridge:stop', () => stopBridge())
  app.on('before-quit', stopBridge)
}
