import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'
import { tk } from '@/i18n'

/**
 * The Harmony's own title bar (in place of the system's): whether to use it
 * at all (`mode`, read by the main process when the window is made, so it
 * takes a restart), the look of its window buttons and what sits in the
 * middle. Persisted as 'titleBar'; kept in localStorage too, so the first
 * paint already has the right buttons.
 */

export const TITLE_BUTTONS = [
  { id: 'harmony', name: tk('Harmony'), hint: tk('Botões de vidro, com o fechar ficando vermelho.') },
  { id: 'dots', name: tk('Bolinhas'), hint: tk('Três bolinhas coloridas à esquerda, como no macOS.') },
  { id: 'minimal', name: tk('Mínimo'), hint: tk('Só os traços, sem fundo nenhum.') },
  { id: 'pill', name: tk('Cápsula'), hint: tk('Os três botões juntos numa pílula com a cor do tema.') }
] as const
export type TitleButtons = (typeof TITLE_BUTTONS)[number]['id']

export const TITLE_CENTERS = [
  { id: 'song', name: tk('Música tocando') },
  { id: 'name', name: tk('Nome do app') },
  { id: 'none', name: tk('Nada') }
] as const
export type TitleCenter = (typeof TITLE_CENTERS)[number]['id']

export type TitleMode = 'harmony' | 'system'

interface Look {
  mode: TitleMode
  buttons: TitleButtons
  center: TitleCenter
}

const KEY = 'harmony.titleBar'
const isButtons = (v: unknown): v is TitleButtons => TITLE_BUTTONS.some((b) => b.id === v)
const isCenter = (v: unknown): v is TitleCenter => TITLE_CENTERS.some((c) => c.id === v)

function clean(raw: unknown): Look {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    mode: o.mode === 'system' ? 'system' : 'harmony',
    buttons: isButtons(o.buttons) ? o.buttons : 'harmony',
    center: isCenter(o.center) ? o.center : 'song'
  }
}

const first = ((): Look => {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return clean(null)
  }
})()

interface TitleBarState extends Look {
  setMode: (m: TitleMode) => void
  setButtons: (b: TitleButtons) => void
  setCenter: (c: TitleCenter) => void
  hydrate: (raw: unknown) => void
}

export const useTitleBarStore = create<TitleBarState>((set, get) => {
  const save = (): void => {
    const { mode, buttons, center } = get()
    const look = { mode, buttons, center }
    try {
      localStorage.setItem(KEY, JSON.stringify(look))
    } catch {
      /* still applies for this session */
    }
    persistSettingDebounced('titleBar', look, 300)
  }
  return {
    ...first,
    setMode: (mode) => {
      set({ mode })
      save()
    },
    setButtons: (buttons) => {
      set({ buttons })
      save()
    },
    setCenter: (center) => {
      set({ center })
      save()
    },
    hydrate: (raw) => {
      if (!raw || typeof raw !== 'object') return
      set(clean(raw))
    }
  }
})
