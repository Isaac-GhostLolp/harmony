import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'
import {
  applyLook,
  DEFAULT_PRESET,
  findPreset,
  sanitizeLook,
  type Look
} from '@/utils/appearance'
import { refreshCoverAccent } from '@/utils/color'
import { t } from '@/i18n'

/**
 * The look of the app: which theme is on, the user's edits to it, the themes
 * they saved, and the optional day/night switch. Persisted as one settings
 * key ('appearance'); the old 'theme' key is read once to migrate.
 *
 * A "source" names where the current Look came from: 'preset:<id>' or
 * 'mine:<id>'. Editing a Look keeps its source and marks it edited, so the
 * studio can offer "save as a new theme" or "update <name>".
 */

export interface SavedLook {
  id: string
  name: string
  look: Look
}

export interface Schedule {
  enabled: boolean
  /** sources for the day and for the night */
  day: string
  night: string
  /** hours (0..23) when day and night begin */
  dayAt: number
  nightAt: number
}

interface AppearanceState {
  look: Look
  source: string
  edited: boolean
  mine: SavedLook[]
  schedule: Schedule
  studioOpen: boolean
  choose: (source: string) => void
  edit: (patch: Partial<Look>) => void
  revert: () => void
  saveAs: (name: string) => string
  update: (id: string) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  importLook: (raw: unknown, name?: string) => string | null
  setSchedule: (patch: Partial<Schedule>) => void
  setStudioOpen: (open: boolean) => void
  hydrate: (settings: Record<string, unknown>) => void
}

const defaultLook = (): Look => findPreset(DEFAULT_PRESET)!.look

export function lookFor(source: string, mine: SavedLook[]): Look | null {
  if (source.startsWith('preset:')) return findPreset(source.slice(7))?.look ?? null
  if (source.startsWith('mine:')) return mine.find((m) => `mine:${m.id}` === source)?.look ?? null
  return null
}

export function sourceName(source: string, mine: SavedLook[]): string {
  // built-in themes in the app's language; the user's own keep their name
  if (source.startsWith('preset:')) return t(findPreset(source.slice(7))?.name ?? 'Tema')
  if (source.startsWith('mine:')) return mine.find((m) => `mine:${m.id}` === source)?.name ?? t('Meu tema')
  return t('Tema')
}

const newId = (): string => Math.random().toString(36).slice(2, 10)

export const useAppearanceStore = create<AppearanceState>((set, get) => {
  const persist = (): void => {
    const { look, source, edited, mine, schedule } = get()
    persistSettingDebounced('appearance', { look, source, edited, mine, schedule }, 400)
  }
  const paint = (look: Look): void => {
    const followed = get().look.followCover
    applyLook(look)
    if (look.followCover !== followed || look.followCover) refreshCoverAccent()
  }

  return {
    look: defaultLook(),
    source: `preset:${DEFAULT_PRESET}`,
    edited: false,
    mine: [],
    schedule: { enabled: false, day: 'preset:light', night: `preset:${DEFAULT_PRESET}`, dayAt: 7, nightAt: 19 },
    studioOpen: false,

    choose: (source) => {
      const look = lookFor(source, get().mine)
      if (!look) return
      paint(look)
      set({ look, source, edited: false })
      persist()
    },

    edit: (patch) => {
      const look = { ...get().look, ...patch }
      paint(look)
      set({ look, edited: true })
      persist()
    },

    revert: () => get().choose(get().source),

    saveAs: (name) => {
      const id = newId()
      const mine = [...get().mine, { id, name: name.trim() || 'Meu tema', look: get().look }]
      set({ mine, source: `mine:${id}`, edited: false })
      persist()
      return id
    },

    update: (id) => {
      const mine = get().mine.map((m) => (m.id === id ? { ...m, look: get().look } : m))
      set({ mine, source: `mine:${id}`, edited: false })
      persist()
    },

    rename: (id, name) => {
      set({ mine: get().mine.map((m) => (m.id === id ? { ...m, name: name.trim() || m.name } : m)) })
      persist()
    },

    remove: (id) => {
      const mine = get().mine.filter((m) => m.id !== id)
      const wasOn = get().source === `mine:${id}`
      // the Look stays on screen; it just isn't a saved theme any more
      set({ mine, ...(wasOn ? { source: `preset:${get().look.flavor}`, edited: true } : {}) })
      persist()
    },

    importLook: (raw, name) => {
      const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null
      if (!r) return null
      const lookRaw = r.harmonyTheme === 1 && r.look ? r.look : r
      if (!lookRaw || typeof lookRaw !== 'object' || !('bg' in (lookRaw as object))) return null
      const look = sanitizeLook(lookRaw)
      const id = newId()
      const title = (typeof r.name === 'string' && r.name) || name || 'Tema importado'
      set({ mine: [...get().mine, { id, name: title.slice(0, 40), look }] })
      get().choose(`mine:${id}`)
      return id
    },

    setSchedule: (patch) => {
      const prev = get().schedule
      const next = { ...prev, ...patch }
      // switching it on: the theme in use becomes the one for this time of
      // day, so nothing jumps; the other slot keeps its pick
      if (patch.enabled && !prev.enabled && !get().edited) next[currentSlot(next)] = get().source
      set({ schedule: next })
      persist()
      applySchedule(true)
    },

    setStudioOpen: (studioOpen) => set({ studioOpen }),

    hydrate: (s) => {
      const saved = s.appearance as Record<string, unknown> | undefined
      if (saved && typeof saved === 'object') {
        const mine = Array.isArray(saved.mine)
          ? (saved.mine as unknown[])
              .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
              .map((m) => ({
                id: typeof m.id === 'string' ? m.id : newId(),
                name: typeof m.name === 'string' ? m.name : 'Meu tema',
                look: sanitizeLook(m.look)
              }))
          : []
        const source = typeof saved.source === 'string' ? saved.source : `preset:${DEFAULT_PRESET}`
        const look = sanitizeLook(saved.look, lookFor(source, mine) ?? defaultLook())
        const sch = (saved.schedule ?? {}) as Partial<Schedule>
        const schedule = { ...get().schedule, ...sch }
        paint(look)
        set({ look, source, edited: saved.edited === true, mine, schedule })
        applySchedule(false)
        return
      }
      // 0.17 and before: just a classic theme name
      const legacy = typeof s.theme === 'string' && findPreset(s.theme) ? s.theme : DEFAULT_PRESET
      get().choose(`preset:${legacy}`)
    }
  }
})

// ---------------------------------------------------------------------------
// Day / night
// ---------------------------------------------------------------------------

let slot: 'day' | 'night' | null = null
let timer = 0

function currentSlot(s: Schedule, now = new Date()): 'day' | 'night' {
  const h = now.getHours() + now.getMinutes() / 60
  const { dayAt, nightAt } = s
  // the day may wrap past midnight if someone sets night before day
  const isDay = dayAt <= nightAt ? h >= dayAt && h < nightAt : h >= dayAt || h < nightAt
  return isDay ? 'day' : 'night'
}

/**
 * Switch to the day or night theme when the schedule is on. It only acts when
 * the slot changes (or when asked to), so picking another theme by hand in
 * the middle of the afternoon sticks until night comes.
 */
function applySchedule(force: boolean): void {
  const st = useAppearanceStore.getState()
  window.clearInterval(timer)
  if (!st.schedule.enabled) {
    slot = null
    return
  }
  const tick = (first: boolean): void => {
    const s = useAppearanceStore.getState()
    const now = currentSlot(s.schedule)
    if (now !== slot || first) {
      slot = now
      const want = now === 'day' ? s.schedule.day : s.schedule.night
      if (want !== s.source) s.choose(want)
    }
  }
  tick(force || slot === null)
  timer = window.setInterval(() => tick(false), 60_000)
}
