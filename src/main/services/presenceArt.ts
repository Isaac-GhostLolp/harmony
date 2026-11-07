/**
 * The cover Discord shows next to "Listening to": a public link to the song's
 * official cover (Discord can't read files on this computer). Found with the
 * same search as the online covers, then kept on the song (songs.art_url), so
 * each song is looked up once. Nothing from the computer is sent anywhere:
 * Discord only gets the link to the official image.
 */
import { getDb } from '../db/database'
import { findCoverLink } from '../../core/online'

const pending = new Map<number, Promise<string | null>>()
/** songs with no cover found this session (not kept: a network hiccup isn't "none") */
const missed = new Set<number>()

function onlineEnabled(): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'onlineEnabled'").get() as
    | { value: string }
    | undefined
  return row ? JSON.parse(row.value) !== false : true
}

export function artLinkFor(songId: number): Promise<string | null> {
  const running = pending.get(songId)
  if (running) return running
  const job = (async (): Promise<string | null> => {
    const db = getDb()
    const song = db
      .prepare(
        `SELECT s.art_url as url, s.title, s.duration, ar.name as artist, al.title as album,
                al.preferred_cover as preferred
         FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id
         WHERE s.id = ?`
      )
      .get(songId) as
      | { url: string | null; title: string; duration: number; artist: string | null; album: string | null; preferred: string | null }
      | undefined
    // a cover made in the cover creator isn't on the web: the Harmony logo stays
    if (!song || song.preferred === 'custom') return null
    if (song.url !== null) return song.url || null
    if (missed.has(songId) || !onlineEnabled()) return null
    const url = await findCoverLink({ title: song.title, artist: song.artist, album: song.album, duration: song.duration })
    if (url) db.prepare('UPDATE songs SET art_url = ? WHERE id = ?').run(url, songId)
    else missed.add(songId)
    return url
  })().finally(() => pending.delete(songId))
  pending.set(songId, job)
  return job
}
