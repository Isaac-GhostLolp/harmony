/**
 * Debounced settings writer.
 *
 * Sliders (volume, crossfade, EQ bands) fire many change events per second.
 * Persisting each one to SQLite over IPC freezes the UI. These helpers apply
 * the value to the store/audio immediately, but coalesce the disk write so it
 * only happens ~250ms after the user stops dragging.
 */

const timers = new Map<string, number>()

/** Persist a setting at most once per `delay` ms per key. */
export function persistSettingDebounced(key: string, value: unknown, delay = 250): void {
  const existing = timers.get(key)
  if (existing) window.clearTimeout(existing)
  const t = window.setTimeout(() => {
    timers.delete(key)
    window.harmony.settings.set(key, value)
  }, delay)
  timers.set(key, t)
}
