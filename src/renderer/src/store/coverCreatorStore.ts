import { create } from 'zustand'

/** The song (and so its album) the cover creator is open for. */
export interface CoverTarget {
  songId: number
  /** making a playlist's cover instead (songId is then 0) */
  playlistId?: number
  /** what the cover says: the album name, or the song's for a single */
  title: string
  artist: string
  coverPath: string | null
}

interface CoverCreatorState {
  target: CoverTarget | null
  open: (t: CoverTarget) => void
  close: () => void
}

export const useCoverCreator = create<CoverCreatorState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null })
}))

/** Pages listen for this to reload their songs after a cover was made. */
export const COVERS_CHANGED_EVENT = 'harmony:covers-changed'

/** The playlists page listens for this after a playlist's cover was made. */
export const PLAYLISTS_CHANGED_EVENT = 'harmony:playlists-changed'
