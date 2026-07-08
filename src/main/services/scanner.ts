import { readdirSync, statSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'
import type * as MusicMetadata from 'music-metadata'
import { getDb, coversDir } from '../db/database'

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

function upsertArtist(name: string | undefined): number | null {
  if (!name) return null
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)').run(name)
  const row = db.prepare('SELECT id FROM artists WHERE name = ?').get(name) as { id: number }
  return row.id
}

function saveCover(albumKey: string, data: Uint8Array, format: string): string {
  const ext = format.includes('png') ? 'png' : 'jpg'
  const hash = createHash('md5').update(albumKey).digest('hex')
  const file = join(coversDir(), `${hash}.${ext}`)
  if (!existsSync(file)) writeFileSync(file, Buffer.from(data))
  return file
}

function upsertAlbum(
  title: string | undefined,
  artistId: number | null,
  year: number | undefined,
  cover: { data: Uint8Array; format: string } | null
): number | null {
  if (!title) return null
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO albums (title, artist_id, year) VALUES (?, ?, ?)').run(
    title,
    artistId,
    year ?? null
  )
  const row = db
    .prepare('SELECT id, cover_path FROM albums WHERE title = ? AND artist_id IS ?')
    .get(title, artistId) as { id: number; cover_path: string | null }

  if (cover && !row.cover_path) {
    const path = saveCover(`${title}::${artistId ?? 'unknown'}`, cover.data, cover.format)
    db.prepare('UPDATE albums SET cover_path = ? WHERE id = ?').run(path, row.id)
  }
  return row.id
}

async function processFile(path: string): Promise<'added' | 'skipped'> {
  const db = getDb()
  if (db.prepare('SELECT 1 FROM songs WHERE path = ?').get(path)) return 'skipped'
  try {
    const { parseFile } = await loadMM()
    const meta = await parseFile(path, { duration: true })
    const c = meta.common
    const picture = c.picture?.[0]
    const artistId = upsertArtist(c.artist ?? c.albumartist)
    const albumId = upsertAlbum(
      c.album,
      upsertArtist(c.albumartist ?? c.artist),
      c.year,
      picture ? { data: picture.data, format: picture.format } : null
    )
    db.prepare(`
      INSERT INTO songs (path, title, artist_id, album_id, genre, year, duration, track_no)
      VALUES (@path, @title, @artist_id, @album_id, @genre, @year, @duration, @track_no)
    `).run({
      path,
      title: c.title ?? path.split(/[\\/]/).pop()!.replace(extname(path), ''),
      artist_id: artistId,
      album_id: albumId,
      genre: c.genre?.[0] ?? null,
      year: c.year ?? null,
      duration: meta.format.duration ?? 0,
      track_no: c.track.no ?? null
    })
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
