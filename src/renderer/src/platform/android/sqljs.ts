import type { Database, SqlValue, BindParams } from 'sql.js'
import type { Db, Stmt } from '../../../../core/db'

/**
 * better-sqlite3's synchronous API (the part src/core uses) over sql.js, so
 * Android runs the very same queries as the desktop. `onWrite` is called
 * after anything that may have changed the database (to save it to disk).
 */
export function wrapSqlJs(sql: Database, onWrite: () => void): Db {
  const value = (v: unknown): SqlValue => {
    if (v === undefined || v === null) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'bigint') return Number(v)
    return v as SqlValue
  }
  // a single plain object binds by name (@name in the SQL); anything else by position
  const bind = (params: unknown[]): BindParams => {
    const [first] = params
    if (params.length === 1 && first && typeof first === 'object' && !Array.isArray(first) && !(first instanceof Uint8Array)) {
      const named: Record<string, SqlValue> = {}
      for (const [k, v] of Object.entries(first)) named[`@${k}`] = value(v)
      return named
    }
    return params.map(value)
  }
  const rows = (query: string, params: unknown[], limit = Infinity): Record<string, SqlValue>[] => {
    const stmt = sql.prepare(query)
    try {
      stmt.bind(bind(params))
      const out: Record<string, SqlValue>[] = []
      while (out.length < limit && stmt.step()) out.push(stmt.getAsObject())
      return out
    } finally {
      stmt.free()
    }
  }
  let depth = 0
  const wrote = (): void => {
    if (depth === 0) onWrite()
  }

  return {
    prepare(query: string): Stmt {
      return {
        all: (...params) => rows(query, params),
        get: (...params) => rows(query, params, 1)[0],
        run: (...params) => {
          sql.run(query, bind(params))
          const changes = sql.getRowsModified()
          const id = sql.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0]
          wrote()
          return { changes, lastInsertRowid: Number(id ?? 0) }
        }
      }
    },
    exec(query: string): void {
      sql.exec(query)
      wrote()
    },
    transaction(fn) {
      return ((...args: unknown[]) => {
        depth++
        sql.run(depth === 1 ? 'BEGIN' : `SAVEPOINT sp${depth}`)
        try {
          const result = fn(...args)
          sql.run(depth === 1 ? 'COMMIT' : `RELEASE sp${depth}`)
          return result
        } catch (e) {
          sql.run(depth === 1 ? 'ROLLBACK' : `ROLLBACK TO sp${depth}`)
          throw e
        } finally {
          depth--
          wrote()
        }
      }) as typeof fn
    }
  }
}
