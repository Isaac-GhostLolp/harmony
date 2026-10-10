import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'
import { t } from '@/i18n'

/** the name before the user picks one; shown in the app's language */
export const DEFAULT_NAME = 'Você'
export const displayName = (name: string): string => (!name.trim() || name === DEFAULT_NAME ? t('Você') : name)

interface ProfileState {
  name: string
  photo: string | null // data URL, stored locally
  setName: (name: string) => void
  setPhoto: (photo: string | null) => void
  hydrate: (state: { name?: string; photo?: string | null }) => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  name: DEFAULT_NAME,
  photo: null,

  setName: (name) => {
    set({ name })
    persistSettingDebounced('profileName', name, 400)
  },
  setPhoto: (photo) => {
    set({ photo })
    // photos can be large; persist immediately but only on explicit change
    window.harmony.settings.set('profilePhoto', photo)
  },
  hydrate: (state) =>
    set({
      name: state.name ?? get().name,
      photo: state.photo ?? null
    })
}))
