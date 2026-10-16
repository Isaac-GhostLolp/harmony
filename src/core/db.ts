/**
 * The bit of SQLite the Harmony uses, as better-sqlite3 shapes it: prepared
 * statements with positional (`?`) or named (`@name`) parameters, run
 * synchronously. better-sqlite3 has it natively; on Android a thin wrapper
 * over sql.js provides the same calls (src/renderer/src/platform/android/sqljs.ts).
 */
export interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface Stmt {
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
  run(...params: unknown[]): RunResult
}

export interface Db {
  prepare(sql: string): Stmt
  exec(sql: string): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction<F extends (...args: any[]) => any>(fn: F): F
}
