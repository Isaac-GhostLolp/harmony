import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'
import { api } from '@/services/api'
import { SLOTS, slotForName, type IconSlot } from '@/components/icons/slots'
import { t } from '@/i18n'

/**
 * Icon packs for the sidebar and the player bar. `pack` is a built-in pack
 * id or 'mine:<id>' for one the user put together from their own images;
 * slots their pack leaves empty fall back to its base pack. `stroke` is the
 * line weight of every line icon in the app. Persisted as 'iconPack'.
 */

export type Stroke = 'thin' | 'normal' | 'bold'

export interface CustomPack {
  id: string
  name: string
  /** built-in pack used for the slots without an image */
  base: string
  /** paint the images with the theme's colours (for one-colour icons) */
  tint: boolean
  icons: Partial<Record<IconSlot, string>>
}

export const BUILTIN_PACKS = [
  'classic',
  'duotone',
  'neon',
  'gradient',
  'color',
  'sticker',
  'emoji',
  'pixel',
  'sketch',
  'terminal'
] as const
export type BuiltinPack = (typeof BUILTIN_PACKS)[number]

export const ICON_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'apng', 'bmp']
export const MAX_ICON_MB = 10
export const MAX_PACKS = 20

interface IconState {
  pack: string
  stroke: Stroke
  mine: CustomPack[]
  setPack: (pack: string) => void
  setStroke: (stroke: Stroke) => void
  createPack: (name: string, base: string) => string
  editPack: (id: string, patch: Partial<Pick<CustomPack, 'name' | 'base' | 'tint'>>) => void
  /** put an image in one slot (or, with no slot, in the slot its file name says) */
  importImages: (id: string, files: File[], slot?: IconSlot) => Promise<string | null>
  clearSlot: (id: string, slot: IconSlot) => void
  removePack: (id: string) => void
  hydrate: (raw: unknown) => void
}

const isBuiltin = (p: string): p is BuiltinPack => (BUILTIN_PACKS as readonly string[]).includes(p)
const newId = (): string => Math.random().toString(36).slice(2, 10)

function applyStroke(stroke: Stroke): void {
  if (stroke === 'normal') document.documentElement.removeAttribute('data-icon-stroke')
  else document.documentElement.setAttribute('data-icon-stroke', stroke)
}

export const useIconStore = create<IconState>((set, get) => {
  const persist = (): void => {
    const { pack, stroke, mine } = get()
    persistSettingDebounced('iconPack', { pack, stroke, mine }, 400)
  }
  const setMine = (mine: CustomPack[]): void => {
    set({ mine })
    persist()
  }
  const drop = (path: string | undefined): void => {
    if (path) void api.icons.remove(path)
  }
  return {
    pack: 'classic',
    stroke: 'normal',
    mine: [],
    setPack: (pack) => {
      set({ pack })
      persist()
    },
    setStroke: (stroke) => {
      applyStroke(stroke)
      set({ stroke })
      persist()
    },
    createPack: (name, base) => {
      const id = newId()
      setMine([...get().mine, { id, name: name.trim().slice(0, 40) || 'Meu pacote', base: isBuiltin(base) ? base : 'classic', tint: false, icons: {} }])
      return id
    },
    editPack: (id, patch) =>
      setMine(
        get().mine.map((p) =>
          p.id === id
            ? {
                ...p,
                ...patch,
                name: patch.name !== undefined ? patch.name.trim().slice(0, 40) || p.name : p.name,
                base: patch.base !== undefined && isBuiltin(patch.base) ? patch.base : p.base
              }
            : p
        )
      ),
    importImages: async (id, files, slot) => {
      let error: string | null = null
      for (const f of files) {
        const target = slot ?? slotForName(f.name)
        if (!target) {
          error = t('Não sei qual ícone é “{name}”. Dê ao arquivo o nome do ícone, como play.png ou biblioteca.svg.', { name: f.name })
          continue
        }
        const ext = (f.name.split('.').pop() ?? '').toLowerCase()
        if (!ICON_EXT.includes(ext)) {
          error = t('“{name}” não é uma imagem que o Harmony aceita.', { name: f.name })
          continue
        }
        if (f.size > MAX_ICON_MB * 1024 * 1024) {
          error = t('“{name}” passa de {mb} MB.', { name: f.name, mb: MAX_ICON_MB })
          continue
        }
        const path = await api.icons.save(await f.arrayBuffer(), ext)
        if (!path) {
          error = t('Não foi possível guardar “{name}”.', { name: f.name })
          continue
        }
        const pack = get().mine.find((p) => p.id === id)
        if (!pack) {
          drop(path)
          return null
        }
        drop(pack.icons[target])
        setMine(get().mine.map((p) => (p.id === id ? { ...p, icons: { ...p.icons, [target]: path } } : p)))
        if (slot) break
      }
      return error
    },
    clearSlot: (id, slot) => {
      const pack = get().mine.find((p) => p.id === id)
      if (!pack?.icons[slot]) return
      drop(pack.icons[slot])
      const icons = { ...pack.icons }
      delete icons[slot]
      setMine(get().mine.map((p) => (p.id === id ? { ...p, icons } : p)))
    },
    removePack: (id) => {
      const pack = get().mine.find((p) => p.id === id)
      if (!pack) return
      for (const path of Object.values(pack.icons)) drop(path)
      if (get().pack === `mine:${id}`) set({ pack: pack.base })
      setMine(get().mine.filter((p) => p.id !== id))
    },
    hydrate: (raw) => {
      if (!raw || typeof raw !== 'object') return
      const o = raw as Record<string, unknown>
      const slots = new Set<string>(SLOTS.map((s) => s.id))
      const mine: CustomPack[] = []
      if (Array.isArray(o.mine)) {
        for (const v of o.mine.slice(0, MAX_PACKS)) {
          if (!v || typeof v !== 'object') continue
          const p = v as Record<string, unknown>
          if (typeof p.id !== 'string') continue
          const icons: Partial<Record<IconSlot, string>> = {}
          if (p.icons && typeof p.icons === 'object')
            for (const [k, path] of Object.entries(p.icons as Record<string, unknown>))
              if (slots.has(k) && typeof path === 'string') icons[k as IconSlot] = path
          mine.push({
            id: p.id,
            name: typeof p.name === 'string' ? p.name : 'Meu pacote',
            base: typeof p.base === 'string' && isBuiltin(p.base) ? p.base : 'classic',
            tint: p.tint === true,
            icons
          })
        }
      }
      const stroke: Stroke = o.stroke === 'thin' || o.stroke === 'bold' ? o.stroke : 'normal'
      let pack = typeof o.pack === 'string' ? o.pack : 'classic'
      if (!isBuiltin(pack) && !(pack.startsWith('mine:') && mine.some((m) => `mine:${m.id}` === pack))) pack = 'classic'
      applyStroke(stroke)
      set({ pack, stroke, mine })
    }
  }
})
