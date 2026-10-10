import { create } from 'zustand'
import { persistSettingDebounced } from '@/utils/persistSetting'
import { tk } from '@/i18n'

/**
 * How the music bar looks: its layout (`style`) and its progress bar
 * (`progress`). The style is mirrored on <html data-bar-style> so the rest
 * of the app can make room for it (a floating bar overlaps the content).
 * Persisted as 'playerBar'; kept in localStorage too, so the first paint
 * already has the right layout.
 */

export const BAR_STYLES = [
  { id: 'classic', name: tk('Clássico'), hint: tk('A barra de sempre, de ponta a ponta.') },
  { id: 'floating', name: tk('Flutuante'), hint: tk('Uma pílula que flutua sobre o conteúdo.') },
  { id: 'compact', name: tk('Compacto'), hint: tk('Uma linha fina: controles e progresso lado a lado.') },
  { id: 'vinyl', name: tk('Vinil'), hint: tk('A capa vira um disco girando no toca-discos.') },
  { id: 'cover', name: tk('Capa'), hint: tk('A capa da música, desfocada, no fundo da barra.') }
] as const
export type BarStyle = (typeof BAR_STYLES)[number]['id']

export const PROGRESS_STYLES = [
  { id: 'line', name: tk('Linha'), hint: tk('Uma linha simples.') },
  { id: 'wave', name: tk('Onda'), hint: tk('O que já tocou vira uma onda que balança com a música.') },
  { id: 'peaks', name: tk('Forma de onda'), hint: tk('O desenho real do som da música.') }
] as const
export type ProgressStyle = (typeof PROGRESS_STYLES)[number]['id']

const KEY = 'harmony.playerBar'
const isStyle = (v: unknown): v is BarStyle => BAR_STYLES.some((s) => s.id === v)
const isProgress = (v: unknown): v is ProgressStyle => PROGRESS_STYLES.some((s) => s.id === v)

function apply(style: BarStyle, progress: ProgressStyle): void {
  document.documentElement.setAttribute('data-bar-style', style)
  try {
    localStorage.setItem(KEY, JSON.stringify({ style, progress }))
  } catch {
    /* the setting still applies for this session */
  }
}

const first = ((): { style: BarStyle; progress: ProgressStyle } => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null
    return { style: isStyle(v?.style) ? v.style : 'classic', progress: isProgress(v?.progress) ? v.progress : 'line' }
  } catch {
    return { style: 'classic', progress: 'line' }
  }
})()
document.documentElement.setAttribute('data-bar-style', first.style)

interface BarState {
  style: BarStyle
  progress: ProgressStyle
  setStyle: (s: BarStyle) => void
  setProgress: (p: ProgressStyle) => void
  hydrate: (raw: unknown) => void
}

export const useBarStore = create<BarState>((set, get) => {
  const save = (): void => {
    const { style, progress } = get()
    apply(style, progress)
    persistSettingDebounced('playerBar', { style, progress }, 300)
  }
  return {
    ...first,
    setStyle: (style) => {
      set({ style })
      save()
    },
    setProgress: (progress) => {
      set({ progress })
      save()
    },
    hydrate: (raw) => {
      if (!raw || typeof raw !== 'object') return
      const o = raw as Record<string, unknown>
      const style = isStyle(o.style) ? o.style : 'classic'
      const progress = isProgress(o.progress) ? o.progress : 'line'
      set({ style, progress })
      apply(style, progress)
    }
  }
})
