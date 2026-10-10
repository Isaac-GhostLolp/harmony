import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { Song } from '@/types'

/**
 * One song's heart changed (from the player bar, a list, anywhere). Every
 * screen keeps its own copy of the songs it shows, so the change is
 * announced once (playerStore.setFavoriteFlag) and each screen patches that
 * one song in place: no reload, no lost scroll position.
 */

export const FAVORITE_EVENT = 'harmony:favorite'

export interface FavoriteChange {
  songId: number
  fav: boolean
}

export function announceFavorite(songId: number, fav: boolean): void {
  window.dispatchEvent(new CustomEvent<FavoriteChange>(FAVORITE_EVENT, { detail: { songId, fav } }))
}

export function onFavoriteChange(fn: (c: FavoriteChange) => void): () => void {
  const listener = (e: Event): void => fn((e as CustomEvent<FavoriteChange>).detail)
  window.addEventListener(FAVORITE_EVENT, listener)
  return () => window.removeEventListener(FAVORITE_EVENT, listener)
}

/** the list with that song's heart set (the same list if it isn't there) */
export function withFavorite(songs: Song[], { songId, fav }: FavoriteChange): Song[] {
  const flag: 0 | 1 = fav ? 1 : 0
  if (!songs.some((s) => s.id === songId && s.favorite !== flag)) return songs
  return songs.map((s) => (s.id === songId ? { ...s, favorite: flag } : s))
}

/** keep a screen's song list in step with hearts changed anywhere */
export function useFavoriteSync(setSongs: Dispatch<SetStateAction<Song[]>>): void {
  useEffect(() => onFavoriteChange((c) => setSongs((songs) => withFavorite(songs, c))), [setSongs])
}
