import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/** The musical alarm as Android keeps it (android/.../AlarmScheduler.java). */
export interface AlarmState {
  enabled: boolean
  hour: number
  minute: number
  /** bitmask of the week days, bit 1 = Sunday … bit 7 = Saturday; 0 = only once */
  days: number
  /** the next ring (ms since epoch), null when off */
  next: number | null
}

/** The phone itself (android/.../HarmonyPhonePlugin.java). */
export interface HarmonyPhonePlugin {
  /** the media volume (in the phone's own steps) and whether it goes to headphones */
  audioInfo(): Promise<{ volume: number; max: number; headphones: boolean }>
  setVolume(options: { volume: number; show?: boolean }): Promise<void>
  /** level 0–100 (-1: unknown) */
  battery(): Promise<{ level: number; charging: boolean }>
  getAlarm(): Promise<AlarmState>
  setAlarm(options: { enabled: boolean; hour: number; minute: number; days: number }): Promise<AlarmState>
  /** rings again in `minutes` */
  snooze(options: { minutes: number }): Promise<{ at: number }>
  /** true once when the Harmony was opened by the alarm */
  consumeAlarm(): Promise<{ fired: boolean }>
  /** the alarm screen closed: the app stops showing over the lock screen */
  alarmDone(): Promise<void>
  /** the alarm rang while the Harmony was already open */
  addListener(event: 'alarm', cb: () => void): Promise<PluginListenerHandle>
}

// (development) one pretend phone: Capacitor may ask for the web version twice at start-up
let web: Promise<HarmonyPhonePlugin> | null = null

export const HarmonyPhone = registerPlugin<HarmonyPhonePlugin>('HarmonyPhone', {
  web: () => (web ??= import('./phone.web').then((m) => new m.HarmonyPhoneWeb()))
})
