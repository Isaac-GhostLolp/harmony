export interface Song {
  id: number
  path: string
  title: string
  artist: string | null
  artistId: number | null
  album: string | null
  albumId: number | null
  coverPath: string | null
  genre: string | null
  year: number | null
  duration: number
  trackNo: number | null
  addedAt: number
  favorite: 0 | 1
}

export interface Album {
  id: number
  title: string
  artist: string | null
  year: number | null
  coverPath: string | null
  songCount: number
}

export interface Artist {
  id: number
  name: string
  songCount: number
}

export interface Playlist {
  id: number
  name: string
  createdAt: number
  songCount: number
}

export interface SearchResults {
  songs: Song[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
}

export interface Stats {
  topArtist: { name: string; plays: number } | null
  topSong: { title: string; artist: string | null; plays: number } | null
  totalSongs: number
  totalArtists: number
  hoursPlayed: number
  avgDailyMinutes: number
}

export interface LyricsResult {
  source: string
  synced: string | null
  plain: string | null
}

export type RepeatMode = 'off' | 'all' | 'one'
export type ThemeName = 'dark' | 'light' | 'amoled' | 'cyberpunk' | 'ghostguard' | 'pixel'
