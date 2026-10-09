import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { WORLDS, inSeason, type WorldMeta } from '@/worlds/registry'

/**
 * Settings → the living worlds. The everyday ones are always listed; the
 * holiday and just-for-fun ones wait behind "Carregar mais Worlds vivos" —
 * except the one whose date is near, which comes up front, "em alta".
 */
export function WorldGrid({ world, setWorld }: { world: string | null; setWorld: (id: string | null) => void }): JSX.Element {
  const main = WORLDS.filter((w) => !w.more)
  const more = WORLDS.filter((w) => w.more)
  const hot = more.filter((w) => inSeason(w))
  const rest = more.filter((w) => !inSeason(w))
  // already using one of the extra worlds: show them from the start
  const [open, setOpen] = useState(() => rest.some((w) => w.id === world))

  const card = (w: WorldMeta): JSX.Element => {
    const hotNow = inSeason(w)
    return (
      <button
        key={w.id}
        onClick={() => setWorld(world === w.id ? null : w.id)}
        className={`lift flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
          world === w.id
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : hotNow
              ? 'border-[var(--accent)]/40 bg-[var(--bg-raised)] hover:border-[var(--accent)]'
              : 'border-white/5 bg-[var(--bg-raised)] hover:border-white/15'
        }`}
      >
        <span className="text-2xl">{w.emoji}</span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {w.name}
            {w.category === 'signature' && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase text-[var(--accent)]">
                Signature
              </span>
            )}
            {hotNow && (
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-semibold uppercase text-white">
                🔥 Em alta
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">{w.blurb}</p>
        </div>
      </button>
    )
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {hot.map(card)}
        {main.map(card)}
      </div>

      {rest.length > 0 && (
        <>
          {open && (
            <>
              <h4 className="mb-2 mt-5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <Sparkles size={12} /> Datas especiais e diversão
              </h4>
              <div className="fade-rise grid gap-2 sm:grid-cols-2">{rest.map(card)}</div>
            </>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="press mx-auto mt-4 flex items-center gap-2 rounded-full bg-[var(--bg-raised)] px-5 py-2 text-xs font-semibold hover:bg-[var(--accent-soft)]"
          >
            {open ? 'Mostrar menos' : `✨ Carregar mais Worlds vivos (${rest.length})`}
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </>
      )}
    </div>
  )
}
