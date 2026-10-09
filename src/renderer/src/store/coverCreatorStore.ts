import { create } from 'zustand'

/** The song (and so its album) the cover creator is open for. */
export interface CoverTarget {
  songId: number
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
