import { Check } from 'lucide-react'
import { FONTS, lookTokens, type Look } from '@/utils/appearance'

/**
 * A theme as a tiny Harmony window: the background, the sidebar and main
 * panels, a few rows of "songs", the accent and the corners — all drawn
 * from the Look itself, so what you see on the card is what you get.
 */
export function ThemeCard({
  name,
  look,
  active,
  badge,
  onClick,
  onContextMenu
}: {
  name: string
  look: Look
  active: boolean
  badge?: string
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}): JSX.Element {
  const t = lookTokens(look)
  const k = look.radius / 100
  const r = (px: number): number => px * k
  const font = FONTS.find((f) => f.id === look.font)?.family
  const panel: React.CSSProperties = {
    background: t['--bg-surface'],
    border: `1px solid ${t['--glass-border']}`,
    borderRadius: r(5),
    boxShadow: t['--shadow'] === 'none' ? undefined : t['--shadow'].replace(/\d+px/g, (m) => `${Math.max(1, Math.round(parseInt(m) / 5))}px`)
  }
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex flex-col gap-1.5 rounded-xl p-1.5 text-left transition-colors ${
        active ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--bg-raised)]'
      }`}
    >
      <div
        className="relative aspect-[16/10] w-full overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
        style={{
          backgroundColor: look.bg,
          backgroundImage: t['--bg-image'] === 'none' ? undefined : t['--bg-image'],
          borderRadius: r(8),
          fontFamily: font
        }}
      >
        {/* ambient glow */}
        {look.glow > 0 && (
          <div
            className="absolute inset-0"
            style={{
              opacity: look.glow / 100,
              background: `radial-gradient(60% 45% at 50% 110%, ${t['--accent-soft']}, transparent 70%)`
            }}
          />
        )}
        {/* sidebar */}
        <div className="absolute bottom-[22%] left-[4%] top-[6%] w-[22%]" style={panel}>
          <div className="mx-[14%] mt-[18%] h-[7%] rounded-sm" style={{ background: look.accent, borderRadius: r(2) }} />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="mx-[14%] mt-[14%] h-[5%]"
              style={{ background: look.text, opacity: i === 0 ? 0.7 : 0.25, borderRadius: r(2), width: `${60 - i * 8}%` }}
            />
          ))}
        </div>
        {/* main panel with a few rows */}
        <div className="absolute bottom-[22%] left-[29%] right-[4%] top-[6%] p-[4%]" style={panel}>
          <div className="mb-[5%] h-[10%] w-[40%]" style={{ background: look.text, opacity: 0.85, borderRadius: r(2) }} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="mb-[4%] flex items-center gap-[4%]">
              <div
                className="aspect-square w-[11%]"
                style={{ background: i === 1 ? look.accent : t['--bg-raised'], borderRadius: r(2) }}
              />
              <div className="h-[5px] flex-1" style={{ background: look.text, opacity: i === 1 ? 0.6 : 0.22, borderRadius: r(2) }} />
            </div>
          ))}
        </div>
        {/* player bar */}
        <div className="absolute bottom-[5%] left-[4%] right-[4%] flex h-[13%] items-center justify-center" style={panel}>
          <div className="aspect-square h-[60%]" style={{ background: look.accent, borderRadius: 999 * k }} />
          <div className="ml-[4%] h-[12%] w-[40%] overflow-hidden" style={{ background: t['--bg-raised'], borderRadius: r(2) }}>
            <div className="h-full w-[45%]" style={{ background: look.accent }} />
          </div>
        </div>
        {active && (
          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--accent)] text-white">
            <Check size={10} />
          </span>
        )}
      </div>
      <span className="flex items-center gap-1.5 px-0.5">
        <span className="truncate text-[11px] font-semibold">{name}</span>
        {badge && (
          <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-px text-[9px] font-semibold text-[var(--accent)]">
            {badge}
          </span>
        )}
      </span>
    </button>
  )
}
