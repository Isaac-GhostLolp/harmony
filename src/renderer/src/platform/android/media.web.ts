import { WebPlugin } from '@capacitor/core'
import type { DeviceSong, HarmonyMediaPlugin } from './media'

/**
 * Development only: the Android app running in a desktop browser
 * (`?android` in the URL) gets its "phone music" from a JSON list of songs
 * (localStorage 'harmony.androidFixture' holds its URL) and has no covers.
 */
export class HarmonyMediaWeb extends WebPlugin implements HarmonyMediaPlugin {
  async requestAccess(): Promise<{ granted: boolean }> {
    return { granted: true }
  }

  async scan(): Promise<{ songs: DeviceSong[] }> {
    const url = localStorage.getItem('harmony.androidFixture')
    if (!url) return { songs: [] }
    return { songs: (await (await fetch(url)).json()) as DeviceSong[] }
  }

  async covers(options: { items: { key: string; path: string }[] }): Promise<{ paths: Record<string, string | null> }> {
    return { paths: Object.fromEntries(options.items.map((i) => [i.key, null])) }
  }
}
