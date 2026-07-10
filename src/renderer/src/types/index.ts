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
  playCount: number
  lastPlayed: number | null
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
  imagePath: string | null
}

export interface Playlist {
  id: number
  name: string
  createdAt: number
  songCount: number
  description: string | null
  emoji: string | null
  image: string | null
  color: string | null
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

export interface MusicProfile {
  topArtist: { name: string; plays: number } | null
  topAlbum: { title: string; plays: number } | null
  topGenre: { genre: string; plays: number } | null
  topSong: { title: string; artist: string | null; plays: number; seconds: number } | null
  topPlaylist: { name: string; count: number } | null
  firstSong: { title: string; artist: string | null; addedAt: number } | null
  lastSong: { title: string; artist: string | null; playedAt: number } | null
  totalSongs: number
  totalArtists: number
  totalAlbums: number
  hoursPlayed: number
  totalPlays: number
  activeDays: number
  firstPlay: number | null
  lastPlay: number | null
  firstAdded: number | null
  newThisMonth: number
  nightPlay: number | null
  mostPlayedCount: number
  topArtistShare: number
}

export interface LyricsResult {
  source: string
  synced: string | null
  plain: string | null
}

export type RepeatMode = 'off' | 'all' | 'one'
export type ThemeName =
  | 'dark'
  | 'light'
  | 'amoled'
  | 'cyberpunk'
  | 'ghostguard'
  | 'pixel'
  | 'synthwave'
  | 'nature'
  | 'glass'
  | 'darkpro'
