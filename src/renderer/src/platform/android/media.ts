import { registerPlugin } from '@capacitor/core'

/** One audio file from Android's MediaStore (android/.../HarmonyMediaPlugin.java). */
export interface DeviceSong {
  path: string
  title: string | null
  artist: string | null
  albumArtist: string | null
  album: string | null
  genre: string | null
  year: number | null
  /** seconds */
  duration: number
  trackNo: number | null
}

export interface HarmonyMediaPlugin {
  /** asks for the permission to read music (and to show the player notification) */
  requestAccess(): Promise<{ granted: boolean }>
  /** every song on the phone (only music: voice notes, ringtones and alarms are left out) */
  scan(): Promise<{ songs: DeviceSong[] }>
  /** the cover inside each file, saved as an image in the app's folder (null: none) */
  covers(options: { items: { key: string; path: string }[] }): Promise<{ paths: Record<string, string | null> }>
}

export const HarmonyMedia = registerPlugin<HarmonyMediaPlugin>('HarmonyMedia', {
  web: () => import('./media.web').then((m) => new m.HarmonyMediaWeb())
})
