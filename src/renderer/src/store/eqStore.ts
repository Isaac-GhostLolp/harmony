import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Rock: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
  Pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  'Bass Boost': [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  'Clássica': [4, 3, 2, 1, -1, -2, 0, 2, 3, 4],
  Podcast: [-3, -2, 0, 2, 4, 4, 3, 1, 0, -1]
}

interface EqState {
  enabled: boolean
  preset: string
  gains: number[]
  setEnabled: (on: boolean) => void
  setPreset: (name: string) => void
  setGain: (band: number, db: number) => void
  hydrate: (state: { enabled: boolean; preset: string; gains: number[] }) => void
}

function persist(state: Pick<EqState, 'enabled' | 'preset' | 'gains'>): void {
  // debounced: dragging an EQ band shouldn't hit SQLite on every pixel
  persistSettingDebounced('eq', state)
}

export const useEqStore = create<EqState>((set, get) => ({
  enabled: false,
  preset: 'Flat',
  gains: EQ_PRESETS.Flat,

  setEnabled: (enabled) => {
    set({ enabled })
    const { preset, gains } = get()
    persist({ enabled, preset, gains })
  },

  setPreset: (preset) => {
    const gains = EQ_PRESETS[preset] ?? get().gains
    set({ preset, gains: [...gains] })
    persist({ enabled: get().enabled, preset, gains })
  },

  setGain: (band, db) => {
    const gains = [...get().gains]
    gains[band] = db
    set({ gains, preset: 'Personalizado' })
    persist({ enabled: get().enabled, preset: 'Personalizado', gains })
  },

  hydrate: (state) => set(state)
}))
