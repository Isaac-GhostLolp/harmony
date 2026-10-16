import { fileUrl } from '@/platform'

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Local file -> URL the page can load (harmony:// on the desktop, Capacitor's server on Android). */
export function mediaUrl(path: string | null): string | undefined {
  if (!path) return undefined
  return fileUrl(path)
}
