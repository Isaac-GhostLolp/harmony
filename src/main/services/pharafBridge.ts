/**
 * Pharaf bridge — lets the Pharaf desktop app (the friends' voice/chat app)
 * show this Harmony inside a voice call and control it, like an extension.
 *
 * - A tiny HTTP server on 127.0.0.1 only (never reachable from the network).
 * - Browsers can't use it: requests carrying an Origin header are refused
 *   (web pages always send one; the Pharaf desktop calls from its Node side).
 * - Pairing: the first time, Harmony asks "Allow Pharaf?". The approved
 *   token is remembered in settings; every other call needs it.
 *
 *   GET  /pharaf/hello                  → { app, version }
 *   POST /pharaf/pair   { token, name } → { ok }   (shows the permission dialog)
 *   POST /pharaf/call   { method, params } (Bearer token) → { result } | { error }
 *   GET  /pharaf/events  (Bearer token) → Server-Sent Events: player state, toasts
 *
 * Library queries run here (SQLite); player commands, audio and toasts go to
 * the renderer, which owns the player and the audio engine.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'
import { randomUUID } from 'crypto'
import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { getDb } from '../db/database'
import { SONG_SELECT } from '../ipc/handlers'
import { EFFECTIVE_COVER_SQL } from './online'

export const BRIDGE_PORTS = [47823, 47824, 47825, 47826, 47827]
const MAX_BODY = 256 * 1024

let server: Server | null = null
let port = 0
let win: () => BrowserWindow | null = () => null
const streams = new Set<ServerResponse>()
const pending = new Map<string, (v: { result?: unknown; error?: string }) => void>()
let lastState: unknown = null
let pairing: Promise<boolean> | null = null

// ---------- tokens (remembered in settings) ----------

function readTokens(): string[] {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'pharafTokens'").get() as
    | { value: string }
    | undefined
  try {
    return row ? (JSON.parse(row.value) as string[]) : []
  } catch {
    return []
  }
}
function writeTokens(tokens: string[]): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('pharafTokens', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(JSON.stringify(tokens.slice(-5)))
}
const isPaired = (token: string | undefined): boolean => !!token && readTokens().includes(token)

// ---------- helpers ----------

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('bad json'))
      }
    })
    req.on('error', reject)
  })
}

const bearer = (req: IncomingMessage): string | undefined =>
  /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1]

// Ask the renderer (player, audio, toasts) and wait for its answer.
function askRenderer(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
  const w = win()
  if (!w || w.isDestroyed()) return Promise.reject(new Error('Harmony window is closed'))
  const rid = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(rid)
      reject(new Error('timeout'))
    }, timeoutMs)
    pending.set(rid, (v) => {
      clearTimeout(timer)
      if (v.error) reject(new Error(v.error))
      else resolve(v.result)
    })
    w.webContents.send('pharaf:request', { rid, method, params })
  })
}

// While Pharaf is linked, the window must not be throttled in the background: friends keep sending
// commands with Harmony minimized or behind a game, and a throttled (hidden, paused) window used to
// sit on them until it was opened again.
function keepAwake(): void {
  const w = win()
  if (w && !w.isDestroyed()) w.webContents.setBackgroundThrottling(streams.size === 0)
}

export function broadcast(event: string, data: unknown): void {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of streams) res.write(chunk)
}

// ---------- covers (small JPEGs, only from paths stored in the library) ----------

const coverCache = new Map<string, string | null>()
function coverData(path: string | null | undefined, size: number): string | null {
  if (!path) return null
  const key = `${path}|${size}`
  if (coverCache.has(key)) return coverCache.get(key) ?? null
  let out: string | null = null
  try {
    const img = nativeImage.createFromPath(path)
    if (!img.isEmpty()) {
      // corta o meio num quadrado antes de reduzir (capas retangulares não ficam espremidas)
      const { width, height } = img.getSize()
      const side = Math.min(width, height)
      const square = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
      out = `data:image/jpeg;base64,${square.resize({ width: size, height: size, quality: 'good' }).toJPEG(78).toString('base64')}`
    }
  } catch {
    out = null
  }
  if (coverCache.size > 2000) coverCache.clear()
  coverCache.set(key, out)
  return out
}

// What friends see of a song (no file paths leave the computer).
interface SongRow {
  id: number
  title: string
  artist: string | null
  album: string | null
  albumId: number | null
  duration: number
}
const publicSong = (s: SongRow) => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  album: s.album,
  albumId: s.albumId,
  duration: s.duration
})

const num = (v: unknown, def: number, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def
}

// ---------- methods ----------

async function call(method: string, p: Record<string, unknown>): Promise<unknown> {
  const db = getDb()
  switch (method) {
    case 'library.songs': {
      const limit = num(p.limit, 100, 1, 500)
      const offset = num(p.offset, 0, 0, 1e7)
      const q = typeof p.q === 'string' ? p.q.trim().slice(0, 80) : ''
      const rows = q
        ? db
            .prepare(`${SONG_SELECT} WHERE s.title LIKE ? OR ar.name LIKE ? OR al.title LIKE ? ORDER BY s.title LIMIT ? OFFSET ?`)
            .all(`%${q}%`, `%${q}%`, `%${q}%`, limit, offset)
        : db.prepare(`${SONG_SELECT} ORDER BY s.title LIMIT ? OFFSET ?`).all(limit, offset)
      const total = (db.prepare('SELECT COUNT(*) as n FROM songs').get() as { n: number }).n
      return { songs: (rows as SongRow[]).map(publicSong), total }
    }
    case 'library.albums': {
      const q = typeof p.q === 'string' ? `%${p.q.trim().slice(0, 80)}%` : '%'
      return db
        .prepare(
          `SELECT al.id, al.title, al.year, ar.name as artist, COUNT(s.id) as songCount
           FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id
           LEFT JOIN songs s ON s.album_id = al.id
           WHERE al.title LIKE ? OR ar.name LIKE ?
           GROUP BY al.id HAVING songCount > 0 ORDER BY al.title LIMIT 500`
        )
        .all(q, q)
    }
    case 'library.artists': {
      const q = typeof p.q === 'string' ? `%${p.q.trim().slice(0, 80)}%` : '%'
      return db
        .prepare(
          `SELECT ar.id, ar.name, COUNT(DISTINCT sa.song_id) as songCount
           FROM artists ar LEFT JOIN song_artists sa ON sa.artist_id = ar.id
           WHERE ar.name LIKE ? GROUP BY ar.id HAVING songCount > 0 ORDER BY ar.name LIMIT 500`
        )
        .all(q)
    }
    case 'library.playlists':
      return db
        .prepare(
          `SELECT p.id, p.name, p.emoji, COUNT(ps.song_id) as songCount
           FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
           GROUP BY p.id ORDER BY p.created_at DESC`
        )
        .all()
    case 'library.collection': {
      const id = num(p.id, 0, 0, 1e9)
      let rows: unknown[] = []
      if (p.kind === 'album') rows = db.prepare(`${SONG_SELECT} WHERE s.album_id = ? ORDER BY s.track_no, s.title`).all(id)
      else if (p.kind === 'artist')
        rows = db
          .prepare(`${SONG_SELECT} JOIN song_artists sa ON sa.song_id = s.id WHERE sa.artist_id = ? ORDER BY s.title`)
          .all(id)
      else if (p.kind === 'playlist')
        rows = db
          .prepare(`${SONG_SELECT} JOIN playlist_songs ps ON ps.song_id = s.id WHERE ps.playlist_id = ? ORDER BY ps.position`)
          .all(id)
      return (rows as SongRow[]).map(publicSong)
    }
    case 'cover': {
      const size = num(p.size, 96, 32, 320)
      if (p.albumId != null) {
        const row = db
          .prepare(`SELECT ${EFFECTIVE_COVER_SQL} as cover FROM albums al WHERE al.id = ?`)
          .get(num(p.albumId, 0, 0, 1e9)) as { cover: string | null } | undefined
        return coverData(row?.cover, size)
      }
      const row = db.prepare(`${SONG_SELECT} WHERE s.id = ?`).get(num(p.songId, 0, 0, 1e9)) as
        | { coverPath: string | null }
        | undefined
      return coverData(row?.coverPath, size)
    }
    case 'player.state':
      return lastState
    case 'player.cmd': {
      // Songs are looked up here so the renderer gets full rows (with the file path) it can play.
      const ids = Array.isArray(p.ids) ? (p.ids as unknown[]).slice(0, 2000).map((x) => num(x, 0, 0, 1e9)) : []
      let songs: unknown[] = []
      if (ids.length) {
        const rows = db.prepare(`${SONG_SELECT} WHERE s.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number }[]
        const byId = new Map(rows.map((r) => [r.id, r]))
        songs = ids.map((i) => byId.get(i)).filter(Boolean)
      }
      return askRenderer('player.cmd', { ...p, songs })
    }
    case 'audio.offer':
      return askRenderer('audio.offer', { sdp: String(p.sdp ?? '') }, 15_000)
    case 'audio.stop':
      return askRenderer('audio.stop', {})
    case 'notify':
      return askRenderer('notify', { text: String(p.text ?? '').slice(0, 200) })
    case 'status':
      return askRenderer('status', p)
    default:
      throw new Error(`unknown method ${method}`)
  }
}

// ---------- pairing ----------

// The app's language (the renderer saves it as the 'language' setting; Portuguese by default).
function english(): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'language'").get() as { value: string } | undefined
  try {
    return row ? JSON.parse(row.value) === 'en' : false
  } catch {
    return false
  }
}

async function askPermission(name: string): Promise<boolean> {
  const w = win()
  const en = english()
  const opts = {
    type: 'question' as const,
    buttons: en ? ['Allow', 'Deny'] : ['Permitir', 'Recusar'],
    defaultId: 0,
    cancelId: 1,
    title: 'Harmony',
    message: en ? `${name} wants to connect to Harmony` : `O ${name} quer se conectar ao Harmony`,
    detail: en
      ? 'Your friends in the Pharaf voice call will hear what Harmony plays, browse your library and control the player. Only allow it if you started this from Pharaf.'
      : 'Os seus amigos da chamada no Pharaf vão ouvir o que o Harmony toca, navegar na sua biblioteca e controlar o player. Só permita se foi você que pediu pelo Pharaf.'
  }
  if (w && !w.isDestroyed()) {
    w.show()
    w.focus()
  }
  const r = w && !w.isDestroyed() ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts)
  return r.response === 0
}

// ---------- server ----------

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Only local, non-browser callers (web pages always send an Origin header).
  const host = (req.headers.host ?? '').split(':')[0]
  if (req.headers.origin || !['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, { error: 'forbidden' })
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')

  if (req.method === 'GET' && url.pathname === '/pharaf/hello') {
    return send(res, 200, { app: 'harmony', version: app.getVersion() })
  }

  if (req.method === 'POST' && url.pathname === '/pharaf/pair') {
    const body = await readBody(req)
    const token = typeof body.token === 'string' && /^[\w-]{20,80}$/.test(body.token) ? body.token : null
    if (!token) return send(res, 400, { error: 'bad token' })
    if (isPaired(token)) return send(res, 200, { ok: true })
    // one dialog at a time
    pairing ??= askPermission(String(body.name ?? 'Pharaf').slice(0, 40)).finally(() => (pairing = null))
    const ok = await pairing
    if (ok) writeTokens([...readTokens(), token])
    return send(res, ok ? 200 : 403, ok ? { ok: true } : { error: 'denied' })
  }

  if (!isPaired(bearer(req))) return send(res, 401, { error: 'not paired' })

  if (req.method === 'GET' && url.pathname === '/pharaf/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(`event: state\ndata: ${JSON.stringify(lastState)}\n\n`)
    streams.add(res)
    keepAwake()
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000)
    req.on('close', () => {
      clearInterval(ping)
      streams.delete(res)
      if (!streams.size) askRenderer('disconnected', {}).catch(() => {})
      keepAwake()
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/pharaf/call') {
    const body = await readBody(req)
    try {
      const result = await call(String(body.method), (body.params as Record<string, unknown>) ?? {})
      return send(res, 200, { result: result ?? null })
    } catch (err) {
      return send(res, 200, { error: (err as Error).message })
    }
  }
  send(res, 404, { error: 'not found' })
}

export function startPharafBridge(getWindow: () => BrowserWindow | null): void {
  win = getWindow
  ipcMain.on('pharaf:response', (_e, msg: { rid: string; result?: unknown; error?: string }) => {
    pending.get(msg.rid)?.(msg)
    pending.delete(msg.rid)
  })
  // The renderer pushes the player state; it goes to Pharaf as it changes.
  ipcMain.on('pharaf:state', (_e, state: unknown) => {
    lastState = state
    broadcast('state', state)
  })
  ipcMain.handle('pharaf:info', () => ({ port, connected: streams.size > 0 }))

  const tryListen = (i: number): void => {
    if (i >= BRIDGE_PORTS.length) return
    const s = createServer((req, res) => {
      handle(req, res).catch(() => {
        if (!res.headersSent) send(res, 500, { error: 'internal' })
      })
    })
    s.once('error', () => tryListen(i + 1)) // port taken (another app or a second Harmony)
    s.listen(BRIDGE_PORTS[i], '127.0.0.1', () => {
      server = s
      port = BRIDGE_PORTS[i]
    })
  }
  tryListen(0)
}

export function stopPharafBridge(): void {
  for (const res of streams) res.end()
  streams.clear()
  server?.close()
  server = null
}
