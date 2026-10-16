import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { migrate } from '../../core/schema'
import type { Db } from '../../core/db'

let db: Database.Database

export function initDatabase(): Database.Database {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'harmony.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate(db as unknown as Db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export const stickersDir = (): string => {
  const dir = join(app.getPath('userData'), 'stickers')
  mkdirSync(dir, { recursive: true })
  return dir
}

export const iconsDir = (): string => {
  const dir = join(app.getPath('userData'), 'icons')
  mkdirSync(dir, { recursive: true })
  return dir
}

export const coversDir = (): string => {
  const dir = join(app.getPath('userData'), 'covers')
  mkdirSync(dir, { recursive: true })
  return dir
}
