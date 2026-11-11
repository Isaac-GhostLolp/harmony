import { WebPlugin } from '@capacitor/core'
import type { AlarmState, HarmonyPhonePlugin, WidgetCommand } from './phone'

/**
 * Development only (`?android` in a desktop browser): a pretend phone. Its
 * state can be changed from the console through `window.__phone` (volume,
 * headphones, battery) and `window.__phone.ring()` rings the alarm.
 */
export class HarmonyPhoneWeb extends WebPlugin implements HarmonyPhonePlugin {
  state = { volume: 8, max: 15, headphones: true, level: 80, charging: false }
  alarm: AlarmState = { enabled: false, hour: 7, minute: 0, days: 0, next: null }
  pending = false

  constructor() {
    super()
    ;(window as unknown as { __phone: unknown }).__phone = this
  }

  ring(): void {
    this.pending = true
    this.notifyListeners('alarm', {})
  }

  async audioInfo(): Promise<{ volume: number; max: number; headphones: boolean }> {
    return { volume: this.state.volume, max: this.state.max, headphones: this.state.headphones }
  }

  async setVolume(options: { volume: number }): Promise<void> {
    this.state.volume = options.volume
  }

  async battery(): Promise<{ level: number; charging: boolean }> {
    return { level: this.state.level, charging: this.state.charging }
  }

  async getAlarm(): Promise<AlarmState> {
    return this.alarm
  }

  async setAlarm(o: { enabled: boolean; hour: number; minute: number; days: number }): Promise<AlarmState> {
    const d = new Date()
    d.setHours(o.hour, o.minute, 0, 0)
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    this.alarm = { ...o, next: o.enabled ? d.getTime() : null }
    return this.alarm
  }

  async snooze(o: { minutes: number }): Promise<{ at: number }> {
    return { at: Date.now() + o.minutes * 60_000 }
  }

  async consumeAlarm(): Promise<{ fired: boolean }> {
    const fired = this.pending
    this.pending = false
    return { fired }
  }

  async alarmDone(): Promise<void> {}

  /** what the pretend widget would show (`window.__phone.widget`); `__phone.press('next')` presses a button */
  widget: Record<string, unknown> = {}
  /** a button "pressed with the app closed": set localStorage 'harmony.testWidgetCmd' before reloading */
  pendingWidget = (localStorage.getItem('harmony.testWidgetCmd') as WidgetCommand | null) ?? null

  press(cmd: WidgetCommand): void {
    this.notifyListeners('widget', { cmd })
  }

  async updateWidget(o: Record<string, unknown>): Promise<void> {
    const art = o.art === undefined ? this.widget.art : o.art
    this.widget = { ...o, art, updates: Number(this.widget.updates ?? 0) + 1 }
  }

  async consumeWidgetCommand(): Promise<{ cmd: WidgetCommand | null }> {
    const cmd = this.pendingWidget
    this.pendingWidget = null
    localStorage.removeItem('harmony.testWidgetCmd')
    return { cmd }
  }
}
