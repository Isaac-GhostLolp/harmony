import type { Song } from '@/types'
import { api } from '@/services/api'
import { HarmonyPhone } from './phone'
import {
  matcher,
  type BridgeSong,
  type BridgeState,
  type BridgeRef,
  type MergeResult
} from '../../../../core/bridge'

/**
 * The PC ↔ phone bridge, the phone's side: finds the PC (from the QR code or
 * a typed address), compares both libraries, and runs a sync — songs from
 * the PC into Music/Harmony, the phone's own songs to the PC, then
 * playlists and favourites joined on both. The PC answers in
 * src/main/services/phoneBridge.ts; the matching lives in src/core/bridge.ts.
 */

export interface Connection {
  /** "http://192.168.0.12:47830" */
  base: string
  code: string
  /** the PC's name */
  pc: string
  /** this phone's name, shown on the PC */
  device: string
}

export interface PlaylistChoice {
  name: string
  emoji: string | null
  /** PC songs in it the phone doesn't have */
  missing: BridgeSong[]
}

export interface Plan {
  conn: Connection
  pcSongs: number
  pcPlaylists: number
  /** on the PC, not on the phone */
  missingOnPhone: BridgeSong[]
  /** on the phone, not on the PC (with the file to send) */
  missingOnPc: (BridgeSong & { path: string })[]
  playlists: PlaylistChoice[]
}

export interface Progress {
  stage: 'down' | 'up' | 'scan' | 'merge'
  done: number
  total: number
  label: string
}

export interface SyncResult {
  downloaded: number
  uploaded: number
  failed: number
  phone: MergeResult | null
  pc: MergeResult | null
}

export class BridgeError extends Error {
  constructor(public reason: 'unreachable' | 'code' | 'notHarmony' | 'failed') {
    super(reason)
  }
}

/** "harmony://bridge?h=192.168.0.12,10.0.0.5&p=47830&c=482913&n=PC" → its parts */
export function parseQr(text: string): { hosts: string[]; port: number; code: string } | null {
  try {
    const u = new URL(text.trim())
    if (u.protocol !== 'harmony:') return null
    const hosts = (u.searchParams.get('h') ?? '').split(',').filter(Boolean)
    const port = Number(u.searchParams.get('p'))
    const code = (u.searchParams.get('c') ?? '').replace(/\D/g, '')
    if (!hosts.length || !port || code.length !== 6) return null
    return { hosts, port, code }
  } catch {
    return null
  }
}

/** "192.168.0.12:47830" (or just the address: the first port is the usual) */
export function parseAddress(text: string): { hosts: string[]; port: number } | null {
  const m = /^\s*(?:https?:\/\/)?([\w.-]+)(?::(\d{2,5}))?\s*$/.exec(text)
  if (!m) return null
  return { hosts: [m[1]], port: m[2] ? Number(m[2]) : 47830 }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

async function call<T>(conn: Connection, path: string, init?: { method?: string; body?: unknown }, ms = 30_000): Promise<T> {
  const r = await withTimeout(
    fetch(conn.base + path, {
      method: init?.method ?? 'GET',
      headers: {
        'x-harmony-code': conn.code,
        'x-harmony-device': conn.device,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
    }),
    ms
  )
  if (r.status === 401) throw new BridgeError('code')
  if (!r.ok) throw new BridgeError('failed')
  return (await r.json()) as T
}

/** finds the PC at one of its addresses and checks the code */
export async function connect(hosts: string[], port: number, code: string): Promise<Connection> {
  const { name: device } = await HarmonyPhone.deviceName().catch(() => ({ name: 'Android' }))
  let found: { base: string; pc: string } | null = null
  // every address at once: the first Harmony to answer wins
  await Promise.any(
    hosts.map(async (h) => {
      const base = `http://${h}:${port}`
      const r = await withTimeout(fetch(`${base}/bridge/hello`), 3500)
      const hello = (await r.json()) as { app?: string; name?: string }
      if (hello.app !== 'harmony') throw new BridgeError('notHarmony')
      found ??= { base, pc: hello.name ?? 'PC' }
    })
  ).catch(() => undefined)
  if (!found) throw new BridgeError('unreachable')
  const conn: Connection = { ...(found as { base: string; pc: string }), code, device }
  // the code is checked on the first real call
  await call(conn, '/bridge/state', undefined, 15_000)
  return conn
}

/** what each side has that the other doesn't, and the PC's playlists */
export async function makePlan(conn: Connection): Promise<Plan> {
  const [pcSongs, pcState, phoneSongs, phoneRows] = await Promise.all([
    call<BridgeSong[]>(conn, '/bridge/library', undefined, 60_000),
    call<BridgeState>(conn, '/bridge/state', undefined, 60_000),
    api.bridge.library() as Promise<BridgeSong[]>,
    api.library.getSongs() as Promise<Song[]>
  ])
  const onPhone = matcher(phoneSongs)
  const onPc = matcher(pcSongs)
  const pathOf = new Map(phoneRows.map((s) => [s.id, s.path]))

  const missingOnPhone = pcSongs.filter((s) => !onPhone(s))
  const missingSet = new Set(missingOnPhone.map((s) => s.id))
  const missingOnPc = phoneSongs
    .filter((s) => !onPc(s))
    .map((s) => ({ ...s, path: pathOf.get(s.id) ?? '' }))
    .filter((s) => s.path)

  const playlists = pcState.playlists
    .map((p) => {
      const seen = new Set<number>()
      const missing: BridgeSong[] = []
      for (const ref of p.songs as BridgeRef[]) {
        const s = onPc(ref)
        if (s && missingSet.has(s.id) && !seen.has(s.id)) {
          seen.add(s.id)
          missing.push(s)
        }
      }
      return { name: p.name, emoji: p.emoji, missing }
    })
    .filter((p) => p.missing.length > 0)

  return { conn, pcSongs: pcSongs.length, pcPlaylists: pcState.playlists.length, missingOnPhone, missingOnPc, playlists }
}

const fileName = (s: BridgeSong): string => `${s.artist ? `${s.artist} - ` : ''}${s.title}.${s.ext}`.replace(/[\\/]/g, '_')

/**
 * The sync: brings `download` from the PC, sends `upload` to it, then joins
 * playlists and favourites both ways (`merge`). Stops between songs when
 * `cancelled()` turns true; what was done stays.
 */
export async function runSync(
  conn: Connection,
  job: { download: BridgeSong[]; upload: (BridgeSong & { path: string })[]; merge: boolean },
  onProgress: (p: Progress) => void,
  cancelled: () => boolean
): Promise<SyncResult> {
  const result: SyncResult = { downloaded: 0, uploaded: 0, failed: 0, phone: null, pc: null }
  let folder: string | null = null

  for (let i = 0; i < job.download.length && !cancelled(); i++) {
    const s = job.download[i]
    onProgress({ stage: 'down', done: i, total: job.download.length, label: s.title })
    try {
      const { path } = await HarmonyPhone.downloadSong({
        url: `${conn.base}/bridge/song/${s.id}`,
        code: conn.code,
        device: conn.device,
        name: fileName(s)
      })
      folder ??= path.slice(0, path.lastIndexOf('/'))
      result.downloaded++
    } catch {
      result.failed++
    }
  }

  for (let i = 0; i < job.upload.length && !cancelled(); i++) {
    const s = job.upload[i]
    onProgress({ stage: 'up', done: i, total: job.upload.length, label: s.title })
    try {
      await HarmonyPhone.uploadSong({ base: conn.base, code: conn.code, device: conn.device, path: s.path })
      result.uploaded++
    } catch {
      result.failed++
    }
  }

  // the new songs into the library (Music/Harmony joins the folders it reads)
  if (result.downloaded > 0) {
    onProgress({ stage: 'scan', done: 0, total: 1, label: '' })
    if (folder) await api.bridge.includeFolder(folder)
    await api.library.refresh()
  }

  if (job.merge && !cancelled()) {
    onProgress({ stage: 'merge', done: 0, total: 1, label: '' })
    // the phone's state before taking the PC's, so each side gets only the other's
    const mine = (await api.bridge.exportState()) as BridgeState
    const theirs = await call<BridgeState>(conn, '/bridge/state', undefined, 60_000)
    result.phone = (await api.bridge.mergeState(theirs)) as MergeResult
    result.pc = await call<MergeResult>(conn, '/bridge/state', { method: 'POST', body: mine }, 120_000)
  }

  const { saveDatabaseNow } = await import('./database')
  await saveDatabaseNow().catch(() => undefined)
  return result
}
