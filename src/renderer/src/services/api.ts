import type { HarmonyApi } from '../../../preload'

declare global {
  interface Window {
    harmony: HarmonyApi
  }
}

export const api = window.harmony
