import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AchievementMetrics } from '../../../core/achievements'
import { api } from '@/services/api'
import { usePlayerStore } from '@/store/playerStore'
import { useFlairStore } from '@/store/flairStore'
import { useUiStore } from '@/store/uiStore'
import { useCursorStore } from '@/utils/cursor'
import { clientMetrics, evaluate, loadUnlocked, saveUnlocked, TIERS, TIER_XP, type Achievement } from '@/utils/achievements'
import { playUiSound } from '@/utils/uiSounds'
import { IS_ANDROID } from '@/platform'
import { t } from '@/i18n'

/**
 * Watches the achievements and celebrates each one the moment it's
 * unlocked: a card slides in with its tier, its XP and a little sound (if
 * the interface sounds are on). Checked a while after start, every minute
 * while music plays, and when the personalization changes. The very first
 * time, what was already earned is just remembered, quietly.
 */
export async function checkAchievements(): Promise<Achievement[]> {
  const metrics = (await api.stats.achievements()) as AchievementMetrics
  const stored = loadUnlocked()
  const list = evaluate({ ...metrics, ...clientMetrics() }, stored ?? {})
  const now = Date.now()
  if (stored === null) {
    saveUnlocked(Object.fromEntries(list.filter((a) => a.got).map((a) => [a.id, now])))
    return []
  }
  const fresh = list.filter((a) => a.got && stored[a.id] === undefined)
  if (fresh.length) {
    for (const a of fresh) stored[a.id] = now
    saveUnlocked(stored)
    window.dispatchEvent(new CustomEvent('harmony:achievements-changed'))
  }
  return fresh.map((a) => ({ ...a, unlockedAt: now }))
}

export function AchievementToast(): JSX.Element | null {
  const [queue, setQueue] = useState<Achievement[]>([])
  const busy = useRef(false)

  useEffect(() => {
    let timer = 0
    const check = (): void => {
      if (busy.current) return
      busy.current = true
      void checkAchievements()
        .then((fresh) => {
          if (fresh.length) setQueue((q) => [...q, ...fresh])
        })
        .catch(() => undefined)
        .finally(() => {
          busy.current = false
        })
    }
    const soon = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, 2500)
    }
    const first = window.setTimeout(check, 6000)
    // plays count 30 s into a song: a look every minute while music plays
    const tick = window.setInterval(() => {
      if (usePlayerStore.getState().isPlaying) check()
    }, 60_000)
    const offs = [
      usePlayerStore.subscribe((s, p) => {
        if (s.currentIndex !== p.currentIndex || s.epoch !== p.epoch) soon()
      }),
      useFlairStore.subscribe(soon),
      useCursorStore.subscribe((s, p) => {
        if (s.pack !== p.pack) soon()
      }),
      useUiStore.subscribe((s, p) => {
        if (s.world !== p.world) soon()
      })
    ]
    window.addEventListener('harmony:check-achievements', soon)
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(timer)
      window.clearInterval(tick)
      offs.forEach((off) => off())
      window.removeEventListener('harmony:check-achievements', soon)
    }
  }, [])

  const current = queue[0]
  useEffect(() => {
    if (!current) return
    const { uiSounds, uiVolume } = useFlairStore.getState()
    playUiSound(uiSounds, 'favorite', uiVolume)
    const id = window.setTimeout(() => setQueue((q) => q.slice(1)), 6500)
    return () => window.clearTimeout(id)
  }, [current])

  if (!current) return null
  const tier = TIERS.find((x) => x.id === current.tier)!
  return createPortal(
    <button
      key={current.id}
      onClick={() => {
        location.hash = '#/my-world'
        setQueue((q) => q.slice(1))
      }}
      className={`ach-toast fixed z-[180] flex w-[min(92vw,340px)] items-center gap-3 rounded-2xl p-3 pr-4 text-left shadow-2xl ${
        IS_ANDROID ? 'left-1/2 top-[max(12px,env(safe-area-inset-top))] -translate-x-1/2' : 'bottom-28 right-6'
      }`}
      style={{ ['--tier' as string]: tier.colour }}
    >
      <span className="ach-toast-badge grid h-14 w-14 shrink-0 place-items-center rounded-full text-3xl">{current.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tier.colour }}>
          {tier.emoji} {t('Conquista desbloqueada!')}
        </span>
        <span className="block truncate text-sm font-bold">{current.title}</span>
        <span className="block truncate text-[11px] text-muted">
          {t(tier.label)} · +{TIER_XP[current.tier]} XP
        </span>
      </span>
    </button>,
    document.body
  )
}
