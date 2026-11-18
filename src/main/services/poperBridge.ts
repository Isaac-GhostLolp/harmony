/**
 * Ponte local com o Poper (caderno do Isaac).
 *
 * Servidor HTTP minúsculo, só em 127.0.0.1:47821:
 *   GET  /poper/now-playing → 200 { playing, title, artist, album, coverDataUrl?, position, duration } | 204
 *   POST /poper/control     body { action: 'toggle' | 'next' | 'prev' } → 200
 *
 * Proteção contra sites abertos no navegador tentando controlar o player:
 * exige o header `x-poper: 1` (força preflight CORS, que nunca é aceito),
 * recusa qualquer requisição com `Origin` e confere o `Host` (DNS rebinding).
 */
import { createServer, type IncomingMessage, type Server } from 'http'
import { promises as fsp } from 'fs'
import { extname } from 'path'

export const POPER_PORT = 47821

export interface BridgeState {
  title: string | null
  artist: string | null
  album?: string | null
  coverPath?: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
}

type Command = 'toggle' | 'next' | 'prev'

let server: Server | null = null
let state: BridgeState | null = null
let stateAt = 0
const coverCache = new Map<string, string>()

const IMG_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export function setBridgeState(s: BridgeState): void {
  state = s
  stateAt = Date.now()
}

async function coverDataUrl(path: string | null | undefined): Promise<string | undefined> {
  if (!path) return undefined
  const hit = coverCache.get(path)
  if (hit) return hit
  try {
    const buf = await fsp.readFile(path)
    if (buf.length > 2_000_000) return undefined
    const url = `data:${IMG_MIME[extname(path).toLowerCase()] ?? 'image/jpeg'};base64,${buf.toString('base64')}`
    if (coverCache.size > 20) coverCache.clear()
    coverCache.set(path, url)
    return url
  } catch {
    return undefined
  }
}

function allowed(req: IncomingMessage): boolean {
  if (req.headers.origin) return false
  if (req.headers['x-poper'] !== '1') return false
  const host = req.headers.host ?? ''
  return host === `127.0.0.1:${POPER_PORT}` || host === `localhost:${POPER_PORT}`
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 4096) req.destroy()
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

export function startPoperBridge(onCommand: (cmd: Command) => void): void {
  if (server) return
  server = createServer(async (req, res) => {
    if (!allowed(req)) {
      res.writeHead(403).end()
      return
    }

    if (req.method === 'GET' && req.url === '/poper/now-playing') {
      if (!state || !state.title) {
        res.writeHead(204).end()
        return
      }
      // estima a posição atual entre um envio e outro do renderer
      const drift = state.isPlaying ? (Date.now() - stateAt) / 1000 : 0
      const position = Math.min(state.duration || Infinity, state.currentTime + drift)
      const body = JSON.stringify({
        playing: state.isPlaying,
        title: state.title,
        artist: state.artist,
        album: state.album ?? null,
        coverDataUrl: await coverDataUrl(state.coverPath),
        position,
        duration: state.duration
      })
      res.writeHead(200, { 'content-type': 'application/json' }).end(body)
      return
    }

    if (req.method === 'POST' && req.url === '/poper/control') {
      try {
        const { action } = JSON.parse(await readBody(req)) as { action?: string }
        if (action === 'toggle' || action === 'next' || action === 'prev') {
          onCommand(action)
          res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
          return
        }
      } catch {
        /* cai no 400 */
      }
      res.writeHead(400).end()
      return
    }

    res.writeHead(404).end()
  })
  // porta ocupada (outra instância, etc.) não pode derrubar o player
  server.on('error', () => {
    server = null
  })
  server.listen(POPER_PORT, '127.0.0.1')
}

export function stopPoperBridge(): void {
  server?.close()
  server = null
}
