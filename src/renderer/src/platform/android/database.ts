import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { App } from '@capacitor/app'
import type { Db } from '../../../../core/db'
import { migrate } from '../../../../core/schema'
import { wrapSqlJs } from './sqljs'

/**
 * The library database on Android: SQLite (sql.js) in memory, saved to the
 * app's private folder shortly after each change and whenever the app goes
 * to the background. Written to a temporary file first and then renamed, so
 * a save cut short never leaves a broken database behind.
 */
const FILE = 'harmony.db'
const SAVE_DELAY_MS = 1500

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function load(): Promise<Uint8Array | undefined> {
  try {
    const r = await Filesystem.readFile({ path: FILE, directory: Directory.Data })
    return typeof r.data === 'string' ? fromBase64(r.data) : new Uint8Array(await r.data.arrayBuffer())
  } catch {
    return undefined // first run
  }
}

let saveNowFn: () => Promise<void> = async () => undefined

/** writes the library to disk right away (before the app closes itself) */
export function saveDatabaseNow(): Promise<void> {
  return saveNowFn()
}

export async function openDatabase(): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const sql = new SQL.Database(await load())
  const pragmas = (): void => {
    sql.run('PRAGMA foreign_keys = ON')
  }
  pragmas()

  let timer: ReturnType<typeof setTimeout> | null = null
  let saving: Promise<void> = Promise.resolve()
  const save = (): Promise<void> => {
    if (timer) clearTimeout(timer)
    timer = null
    saving = saving.then(async () => {
      const bytes = sql.export()
      pragmas() // export() reopens the database, which resets the pragmas
      try {
        await Filesystem.writeFile({ path: `${FILE}.tmp`, data: toBase64(bytes), directory: Directory.Data })
        const move = (): Promise<void> =>
          Filesystem.rename({ from: `${FILE}.tmp`, to: FILE, directory: Directory.Data, toDirectory: Directory.Data })
        await move().catch(async () => {
          // some versions won't rename over an existing file
          await Filesystem.deleteFile({ path: FILE, directory: Directory.Data }).catch(() => undefined)
          await move()
        })
      } catch (e) {
        console.error('Harmony: could not save the library', e)
      }
    })
    return saving
  }
  const db = wrapSqlJs(sql, () => {
    if (!timer) timer = setTimeout(() => void save(), SAVE_DELAY_MS)
  })
  migrate(db)
  saveNowFn = save
  await save()
  // leaving the app (or the screen going off) saves right away
  void App.addListener('pause', () => void save())
  return db
}
