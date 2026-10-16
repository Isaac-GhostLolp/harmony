import { readdirSync, statSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'
import type * as MusicMetadata from 'music-metadata'
import { getDb, coversDir } from '../db/database'
import { hasSong, insertSong } from '../../core/songs'
import type { Db } from '../../core/db'

const SUPPORTED = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'])

// music-metadata v10+ is ESM-only; the main bundle is CJS, so load it
// once via dynamic import (kept as import() by rollup's dynamicImportInCjs).
let mm: typeof MusicMetadata | null = null
async function loadMM(): Promise<typeof MusicMetadata> {
  if (!mm) mm = await import('music-metadata')
  return mm
}

export interface ScanProgress {
  processed: number
  total: number
  current: string
}

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) walk(full, acc)
      else if (SUPPORTED.has(extname(entry).toLowerCase())) acc.push(full)
    } catch {
      /* skip unreadable entries */
    }
  }
  return acc
}

function saveCover(albumKey: string, data: Uint8Array, format: string): string {
  const ext = format.includes('png') ? 'png' : 'jpg'
  const hash = createHash('md5').update(albumKey).digest('hex')
  const file = join(coversDir(), `${hash}.${ext}`)
  if (!existsSync(file)) writeFileSync(file, Buffer.from(data))
  return file
}

async function processFile(path: string): Promise<'added' | 'skipped'> {
  const db = getDb() as unknown as Db
  if (hasSong(db, path)) return 'skipped'
  try {
    const { parseFile } = await loadMM()
    const meta = await parseFile(path, { duration: true })
    const c = meta.common
    const picture = c.picture?.[0]
    insertSong(
      db,
      {
        path,
        title: c.title ?? path.split(/[\\/]/).pop()!.replace(extname(path), ''),
        artist: c.artist,
        albumArtist: c.albumartist,
        album: c.album,
        genre: c.genre?.[0],
        year: c.year,
        duration: meta.format.duration ?? 0,
        trackNo: c.track.no
      },
      picture ? (key) => saveCover(key, picture.data, picture.format) : undefined
    )
    return 'added'
  } catch {
    return 'skipped'
  }
}

export async function scanFolder(
  folder: string,
  onProgress: (p: ScanProgress) => void
): Promise<{ added: number; skipped: number }> {
  const files = walk(folder)
  let added = 0
  let skipped = 0
  for (let i = 0; i < files.length; i++) {
    onProgress({ processed: i + 1, total: files.length, current: files[i] })
    const result = await processFile(files[i])
    result === 'added' ? added++ : skipped++
  }
  return { added, skipped }
}

export async function importFiles(paths: string[]): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0
  for (const p of paths) {
    let isDir = false
    try {
      isDir = statSync(p).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      const r = await scanFolder(p, () => {})
      added += r.added
      skipped += r.skipped
    } else if (SUPPORTED.has(extname(p).toLowerCase())) {
      const result = await processFile(p)
      result === 'added' ? added++ : skipped++
    }
  }
  return { added, skipped }
}
