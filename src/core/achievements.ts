/**
 * Everything the achievements (Meu Mundo → Conquistas) need from the
 * library, in one go — the same on the desktop and Android. The rules
 * themselves (goals, tiers, titles) live in the renderer
 * (utils/achievements.ts); this only counts.
 */
import type { Db } from './db'
import { JUNK_SQL } from './library'

export interface AchievementMetrics {
  plays: number
  seconds: number
  songsPlayed: number
  artistsPlayed: number
  albumsPlayed: number
  genresPlayed: number
  decadesPlayed: number
  totalSongs: number
  favorites: number
  /** best and current run of consecutive listening days */
  bestStreak: number
  currentStreak: number
  activeDays: number
  /** the most listening days inside one calendar year, and the most months of one year with music */
  bestYearDays: number
  bestYearMonths: number
  weekdaysCovered: number
  maxPlaysInDay: number
  maxSecondsInDay: number
  nightPlays: number
  dawnPlays: number
  weekendPlays: number
  topSongPlays: number
  topArtistPlays: number
  /** albums (3+ songs) with every song played */
  completeAlbums: number
  /** days since the first play */
  daysSinceFirst: number
  playlists: number
  smartPlaylists: number
  moodPlaylists: number
  playlistsWithSections: number
  notes: number
  folders: number
  capsulesCreated: number
  capsulesOpened: number
  bridgeSyncs: number
  newYearPlay: boolean
  christmasPlay: boolean
  halloweenPlay: boolean
  friday13Play: boolean
}

const LOCAL = "h.played_at, 'unixepoch', 'localtime'"

export function achievementMetrics(db: Db): AchievementMetrics {
  const one = <T>(sql: string): T => db.prepare(sql).get() as T
  const all = <T>(sql: string): T[] => db.prepare(sql).all() as T[]
  const n = (sql: string): number => Number((one<{ n: number | null } | undefined>(sql))?.n ?? 0)

  const base = one<{ plays: number; seconds: number; songs: number; albums: number; first: number | null }>(
    `SELECT COUNT(*) as plays, COALESCE(SUM(s.duration), 0) as seconds, COUNT(DISTINCT h.song_id) as songs,
            COUNT(DISTINCT s.album_id) as albums, MIN(h.played_at) as first
     FROM history h JOIN songs s ON s.id = h.song_id`
  )

  // days with music: streaks, the best year
  const days = all<{ d: string }>(`SELECT DISTINCT date(${LOCAL}) as d FROM history h ORDER BY d`).map((r) => r.d)
  const dayNum = (d: string): number => Math.round(Date.parse(d + 'T12:00:00Z') / 86400000)
  let best = 0
  let run = 0
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && dayNum(days[i]) - dayNum(days[i - 1]) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  const today = dayNum(new Date().toLocaleDateString('sv'))
  const current = days.length && today - dayNum(days[days.length - 1]) <= 1 ? run : 0
  const perYear = new Map<string, { days: number; months: Set<string> }>()
  for (const d of days) {
    const y = d.slice(0, 4)
    const e = perYear.get(y) ?? { days: 0, months: new Set<string>() }
    e.days++
    e.months.add(d.slice(5, 7))
    perYear.set(y, e)
  }
  let bestYearDays = 0
  let bestYearMonths = 0
  for (const e of perYear.values()) {
    bestYearDays = Math.max(bestYearDays, e.days)
    bestYearMonths = Math.max(bestYearMonths, e.months.size)
  }

  const day = one<{ plays: number | null; seconds: number | null } | undefined>(
    `SELECT MAX(p) as plays, MAX(sec) as seconds FROM (
       SELECT COUNT(*) as p, SUM(s.duration) as sec FROM history h JOIN songs s ON s.id = h.song_id GROUP BY date(${LOCAL}))`
  )
  const hourCount = (a: number, b: number): number =>
    n(`SELECT COUNT(*) as n FROM history h WHERE CAST(strftime('%H', ${LOCAL}) AS INTEGER) >= ${a} AND CAST(strftime('%H', ${LOCAL}) AS INTEGER) < ${b}`)
  const onDate = (md: string, extra = ''): boolean => n(`SELECT COUNT(*) as n FROM history h WHERE strftime('%m-%d', ${LOCAL}) = '${md}' ${extra}`) > 0

  const setting = (key: string): unknown => {
    const r = one<{ value: string } | undefined>(`SELECT value FROM settings WHERE key = '${key}'`)
    try {
      return r ? JSON.parse(r.value) : undefined
    } catch {
      return undefined
    }
  }

  return {
    plays: base.plays,
    seconds: base.seconds,
    songsPlayed: base.songs,
    albumsPlayed: base.albums,
    artistsPlayed: n(`SELECT COUNT(DISTINCT sa.artist_id) as n FROM history h JOIN song_artists sa ON sa.song_id = h.song_id`),
    genresPlayed: n(
      `SELECT COUNT(DISTINCT LOWER(TRIM(s.genre))) as n FROM history h JOIN songs s ON s.id = h.song_id
       WHERE s.genre IS NOT NULL AND TRIM(s.genre) != '' AND LOWER(TRIM(s.genre)) NOT IN (${JUNK_SQL})`
    ),
    decadesPlayed: n(`SELECT COUNT(DISTINCT s.year / 10) as n FROM history h JOIN songs s ON s.id = h.song_id WHERE s.year > 1900`),
    totalSongs: n('SELECT COUNT(*) as n FROM songs'),
    favorites: n('SELECT COUNT(*) as n FROM favorites'),
    bestStreak: best,
    currentStreak: current,
    activeDays: days.length,
    bestYearDays,
    bestYearMonths,
    weekdaysCovered: n(`SELECT COUNT(DISTINCT strftime('%w', ${LOCAL})) as n FROM history h`),
    maxPlaysInDay: Number(day?.plays ?? 0),
    maxSecondsInDay: Number(day?.seconds ?? 0),
    nightPlays: hourCount(0, 5),
    dawnPlays: hourCount(5, 8),
    weekendPlays: n(`SELECT COUNT(*) as n FROM history h WHERE strftime('%w', ${LOCAL}) IN ('0', '6')`),
    topSongPlays: n('SELECT MAX(c) as n FROM (SELECT COUNT(*) as c FROM history GROUP BY song_id)'),
    topArtistPlays: n('SELECT MAX(c) as n FROM (SELECT COUNT(*) as c FROM history h JOIN song_artists sa ON sa.song_id = h.song_id GROUP BY sa.artist_id)'),
    completeAlbums: n(
      `SELECT COUNT(*) as n FROM (
         SELECT al.id FROM albums al JOIN songs s ON s.album_id = al.id
         GROUP BY al.id HAVING COUNT(*) >= 3 AND COUNT(*) = SUM(CASE WHEN s.id IN (SELECT song_id FROM history) THEN 1 ELSE 0 END))`
    ),
    daysSinceFirst: base.first ? Math.floor((Date.now() / 1000 - base.first) / 86400) : 0,
    playlists: n('SELECT COUNT(*) as n FROM playlists'),
    smartPlaylists: n('SELECT COUNT(*) as n FROM playlists WHERE rules IS NOT NULL'),
    moodPlaylists: n("SELECT COUNT(*) as n FROM playlists WHERE vibe IS NOT NULL AND vibe != 'null'"),
    playlistsWithSections: n('SELECT COUNT(DISTINCT playlist_id) as n FROM playlist_songs WHERE section IS NOT NULL'),
    notes: n('SELECT COUNT(*) as n FROM playlist_songs WHERE note IS NOT NULL'),
    folders: n('SELECT COUNT(DISTINCT folder) as n FROM playlists WHERE folder IS NOT NULL'),
    capsulesCreated: n('SELECT COUNT(*) as n FROM capsules'),
    capsulesOpened: n('SELECT COUNT(*) as n FROM capsules WHERE opened_at IS NOT NULL'),
    bridgeSyncs: Number(setting('bridgeSyncs') ?? 0),
    newYearPlay: onDate('01-01', `AND CAST(strftime('%H', ${LOCAL}) AS INTEGER) = 0`),
    christmasPlay: onDate('12-25') || onDate('12-24', `AND CAST(strftime('%H', ${LOCAL}) AS INTEGER) >= 22`),
    halloweenPlay: onDate('10-31'),
    friday13Play: n(`SELECT COUNT(*) as n FROM history h WHERE strftime('%d', ${LOCAL}) = '13' AND strftime('%w', ${LOCAL}) = '5'`) > 0
  }
}
