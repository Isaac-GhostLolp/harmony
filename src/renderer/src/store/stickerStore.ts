import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'
import { findSticker, type StickerAnim } from '@/components/stickers/catalog'
import { api } from '@/services/api'
import { t, tk } from '@/i18n'

/**
 * Stickers the user stuck around the app. Each one lives in a zone (the
 * sidebar, the player bar, or a playlist's cover: 'playlist:<id>') at a
 * position given as fractions of the zone, so it stays put when the window
 * is resized. Persisted as one settings key ('stickers').
 *
 * The user's own stickers (any image: PNG, JPG, WebP, GIF, SVG…) are copied
 * into the app's data folder and listed in `library` ('stickerLibrary');
 * their ids start with 'u:'. Placed stickers of both kinds share one limit.
 */

export interface CustomSticker {
  /** 'u:<random>' */
  id: string
  name: string
  /** the copy in userData/stickers */
  path: string
  /** the white die-cut border (off: just a soft shadow) */
  outline: boolean
  anim: CustomAnim
}

export type CustomAnim = Extract<StickerAnim, 'none' | 'float' | 'wobble' | 'spin' | 'beat'>
export const CUSTOM_ANIMS: { id: CustomAnim; label: string }[] = [
  { id: 'none', label: tk('Parado') },
  { id: 'float', label: tk('Flutuar') },
  { id: 'wobble', label: tk('Balançar') },
  { id: 'spin', label: tk('Girar') },
  { id: 'beat', label: tk('Pulsar na batida') }
]
export const STICKER_FILE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'apng', 'bmp']
export const MAX_FILE_MB = 10
export const MAX_LIBRARY = 80

export interface PlacedSticker {
  key: string
  /** catalog id */
  id: string
  zone: string
  /** centre, as fractions (0..1) of the zone */
  x: number
  y: number
  /** rotation in degrees */
  r: number
  /** size multiplier */
  s: number
}

export const MAX_STICKERS = 80
export const MIN_SIZE = 0.5
export const MAX_SIZE = 2.4

interface StickerState {
  placed: PlacedSticker[]
  library: CustomSticker[]
  editing: boolean
  selected: string | null
  setEditing: (on: boolean) => void
  select: (key: string | null) => void
  add: (id: string, zone: string, x: number, y: number) => string | null
  move: (key: string, zone: string, x: number, y: number) => void
  tweak: (key: string, patch: Partial<Pick<PlacedSticker, 'r' | 's'>>) => void
  remove: (key: string) => void
  raise: (key: string) => void
  clearZone: (zone: string) => void
  /** copy image files in as stickers; resolves with an error message, if any */
  importFiles: (files: File[]) => Promise<string | null>
  editCustom: (id: string, patch: Partial<Pick<CustomSticker, 'outline' | 'anim' | 'name'>>) => void
  removeCustom: (id: string) => void
  hydrate: (raw: unknown, library?: unknown) => void
}

/** the sticker's movement, for built-in and custom ones alike */
export function stickerAnim(id: string): StickerAnim | undefined {
  if (id.startsWith('u:')) return useStickerStore.getState().library.find((c) => c.id === id)?.anim
  return findSticker(id)?.anim
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
const newKey = (): string => Math.random().toString(36).slice(2, 10)

export const useStickerStore = create<StickerState>((set, get) => {
  const save = (placed: PlacedSticker[]): void => {
    set({ placed })
    persistSettingDebounced('stickers', placed, 400)
  }
  const saveLibrary = (library: CustomSticker[]): void => {
    set({ library })
    persistSettingDebounced('stickerLibrary', library, 400)
  }
  const known = (id: string): boolean =>
    id.startsWith('u:') ? get().library.some((c) => c.id === id) : !!findSticker(id)
  return {
    placed: [],
    library: [],
    editing: false,
    selected: null,
    setEditing: (editing) => set({ editing, selected: null }),
    select: (selected) => set({ selected }),
    add: (id, zone, x, y) => {
      const { placed } = get()
      if (placed.length >= MAX_STICKERS || !known(id)) return null
      const key = newKey()
      // a little tilt, like a sticker slapped on by hand
      const r = Math.round((Math.random() - 0.5) * 24)
      save([...placed, { key, id, zone, x: clamp(x, 0, 1), y: clamp(y, 0, 1), r, s: 1 }])
      set({ selected: key })
      return key
    },
    move: (key, zone, x, y) => {
      // moving also brings it to the front
      const p = get().placed
      const it = p.find((q) => q.key === key)
      if (!it) return
      save([...p.filter((q) => q.key !== key), { ...it, zone, x: clamp(x, 0, 1), y: clamp(y, 0, 1) }])
    },
    tweak: (key, patch) =>
      save(
        get().placed.map((q) =>
          q.key === key
            ? {
                ...q,
                r: patch.r !== undefined ? ((Math.round(patch.r) % 360) + 360) % 360 : q.r,
                s: patch.s !== undefined ? clamp(Math.round(patch.s * 100) / 100, MIN_SIZE, MAX_SIZE) : q.s
              }
            : q
        )
      ),
    remove: (key) => {
      save(get().placed.filter((q) => q.key !== key))
      if (get().selected === key) set({ selected: null })
    },
    raise: (key) => {
      const p = get().placed
      const it = p.find((q) => q.key === key)
      if (it && p[p.length - 1] !== it) save([...p.filter((q) => q !== it), it])
    },
    clearZone: (zone) => save(get().placed.filter((q) => q.zone !== zone)),
    importFiles: async (files) => {
      let error: string | null = null
      const added: CustomSticker[] = []
      for (const f of files) {
        if (get().library.length + added.length >= MAX_LIBRARY) {
          error = t('Você chegou ao limite de {n} adesivos próprios.', { n: MAX_LIBRARY })
          break
        }
        const ext = (f.name.split('.').pop() ?? '').toLowerCase()
        if (!STICKER_FILE_EXT.includes(ext)) {
          error = t('“{name}” não é uma imagem que o Harmony aceita.', { name: f.name })
          continue
        }
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
          error = t('“{name}” passa de {mb} MB.', { name: f.name, mb: MAX_FILE_MB })
          continue
        }
        const path = await api.stickers.save(await f.arrayBuffer(), ext)
        if (!path) {
          error = t('Não foi possível guardar “{name}”.', { name: f.name })
          continue
        }
        const name = f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Adesivo'
        // photos (no transparency) look better without the die-cut border
        added.push({ id: `u:${newKey()}`, name, path, outline: ext !== 'jpg' && ext !== 'jpeg', anim: 'none' })
      }
      if (added.length) saveLibrary([...added.reverse(), ...get().library])
      return error
    },
    editCustom: (id, patch) => saveLibrary(get().library.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    removeCustom: (id) => {
      const it = get().library.find((c) => c.id === id)
      if (!it) return
      saveLibrary(get().library.filter((c) => c.id !== id))
      const placed = get().placed
      if (placed.some((p) => p.id === id)) save(placed.filter((p) => p.id !== id))
      if (get().selected && !get().placed.some((p) => p.key === get().selected)) set({ selected: null })
      void api.stickers.remove(it.path)
    },
    hydrate: (raw, rawLibrary) => {
      if (Array.isArray(rawLibrary)) {
        const library: CustomSticker[] = []
        const anims = CUSTOM_ANIMS.map((a) => a.id) as string[]
        for (const v of rawLibrary.slice(0, MAX_LIBRARY)) {
          if (!v || typeof v !== 'object') continue
          const o = v as Record<string, unknown>
          if (typeof o.id !== 'string' || !o.id.startsWith('u:') || typeof o.path !== 'string') continue
          library.push({
            id: o.id,
            name: typeof o.name === 'string' ? o.name : 'Adesivo',
            path: o.path,
            outline: o.outline !== false,
            anim: typeof o.anim === 'string' && anims.includes(o.anim) ? (o.anim as CustomAnim) : 'none'
          })
        }
        set({ library })
      }
      if (!Array.isArray(raw)) return
      const placed: PlacedSticker[] = []
      for (const v of raw.slice(0, MAX_STICKERS)) {
        if (!v || typeof v !== 'object') continue
        const o = v as Record<string, unknown>
        if (typeof o.id !== 'string' || !known(o.id) || typeof o.zone !== 'string') continue
        const num = (n: unknown, d: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
        placed.push({
          key: typeof o.key === 'string' ? o.key : newKey(),
          id: o.id,
          zone: o.zone,
          x: clamp(num(o.x, 0.5), 0, 1),
          y: clamp(num(o.y, 0.5), 0, 1),
          r: num(o.r, 0),
          s: clamp(num(o.s, 1), MIN_SIZE, MAX_SIZE)
        })
      }
      set({ placed })
    }
  }
})
