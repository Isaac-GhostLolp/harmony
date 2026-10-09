import type { Song } from '@/types'

/** An album as the record and book views show it: built from the songs on screen. */
export interface AlbumGroup {
  key: string
  title: string
  artist: string | null
  year: number | null
  coverPath: string | null
  /** in track order */
  songs: Song[]
}

/**
 * Groups the (already filtered and sorted) songs into albums, in the order
 * their first song appears — so "recently added" puts the newest records
 * first. A song without an album is a single of its own.
 */
export function groupAlbums(songs: Song[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>()
  for (const s of songs) {
    const key = s.albumId != null ? `a${s.albumId}` : s.album ? `n${s.album}|${s.artist ?? ''}` : `s${s.id}`
    let g = map.get(key)
    if (!g) {
      g = { key, title: s.album ?? s.title, artist: s.artist, year: s.year, coverPath: s.coverPath, songs: [] }
      map.set(key, g)
    }
    if (!g.coverPath && s.coverPath) g.coverPath = s.coverPath
    g.songs.push(s)
  }
  const out = Array.from(map.values())
  for (const g of out) {
    if (g.songs.length > 1) g.songs.sort((a, b) => (a.trackNo ?? 1e9) - (b.trackNo ?? 1e9) || a.title.localeCompare(b.title))
  }
  return out
}

export function albumDuration(g: AlbumGroup): number {
  return g.songs.reduce((t, s) => t + (s.duration || 0), 0)
}

/** A stable hue for an album without a cover. */
export function hueOf(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) & 0xffffff
  return h % 360
}
