import type { HarmonyApi } from '../../../preload'

declare global {
  interface Window {
    harmony: HarmonyApi
  }
}

/**
 * The app's bridge to its platform: the Electron preload on the desktop, or
 * the Android implementation (platform/android), which is installed only
 * after its database opens — hence read on each use, not once at import.
 */
export const api: HarmonyApi = new Proxy({} as HarmonyApi, {
  get: (_t, key) => (window.harmony as unknown as Record<PropertyKey, unknown> | undefined)?.[key]
})
