import { create } from 'zustand'
import { locale, tk } from '@/i18n'

/** A time capsule as `capsules:list` returns it (see main/ipc/handlers.ts). */
export interface Capsule {
  id: number
  /** null when the song has left the library — the memory stays */
  songId: number | null
  title: string
  artist: string | null
  coverPath: string | null
  note: string
  emoji: string | null
  /** unix seconds */
  createdAt: number
  openAt: number
  openedAt: number | null
}

export interface CapsuleSong {
  id: number
  title: string
  artist: string | null
  coverPath: string | null
}

interface CapsuleState {
  /** the song the "seal a memory" dialog is open for */
  sealing: CapsuleSong | null
  /** capsules waiting to be revealed, shown one after another */
  revealing: Capsule[]
  /** bumped whenever capsules change, so lists can reload */
  version: number
  openSeal: (song: CapsuleSong) => void
  closeSeal: () => void
  reveal: (capsules: Capsule[]) => void
  nextReveal: () => void
  changed: () => void
}

export const useCapsuleStore = create<CapsuleState>((set) => ({
  sealing: null,
  revealing: [],
  version: 0,
  openSeal: (sealing) => set({ sealing }),
  closeSeal: () => set({ sealing: null }),
  reveal: (capsules) =>
    set((s) => ({
      revealing: [...s.revealing, ...capsules.filter((c) => !s.revealing.some((r) => r.id === c.id))]
    })),
  nextReveal: () => set((s) => ({ revealing: s.revealing.slice(1) })),
  changed: () => set((s) => ({ version: s.version + 1 }))
}))

// ---- time words -------------------------------------------------------------

const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' })

/** "há 1 ano", "em 3 meses", "amanhã"… for a unix time relative to now. */
export function relativeTime(unix: number): string {
  const diff = unix - Date.now() / 1000
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['week', 7 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ]
  for (const [unit, secs] of units) {
    if (abs >= secs || unit === 'minute') return rtf.format(Math.round(diff / secs), unit)
  }
  return rtf.format(0, 'minute')
}

export function longDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Open dates offered when sealing, as months from today. */
export const SEAL_OPTIONS: { months: number; label: string }[] = [
  { months: 1, label: tk('1 mês') },
  { months: 3, label: tk('3 meses') },
  { months: 6, label: tk('6 meses') },
  { months: 12, label: tk('1 ano') },
  { months: 24, label: tk('2 anos') }
]

/** Unix time `months` from now (same day of the month, at the start of the day). */
export function monthsFromNow(months: number): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() + months)
  return Math.floor(d.getTime() / 1000)
}
