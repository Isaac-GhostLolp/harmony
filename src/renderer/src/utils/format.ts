export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Local file -> URL served by the harmony:// protocol registered in the main process. */
export function mediaUrl(path: string | null): string | undefined {
  if (!path) return undefined
  return `harmony://media/?path=${encodeURIComponent(path)}`
}
