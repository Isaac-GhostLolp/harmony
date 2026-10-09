import { useBarStore, BAR_STYLES, PROGRESS_STYLES, type BarStyle, type ProgressStyle } from '@/store/barStore'

/**
 * Settings → Barra de música: the bar's style, each drawn as a little
 * window with its bar, and the look of the progress bar.
 */
export function BarStylePicker(): JSX.Element {
  const { style, progress, setStyle, setProgress } = useBarStore()
  return (
    <div>
      <h2 className="text-sm font-semibold">Barra de música</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">O jeito do player e da barra de progresso.</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
        {BAR_STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            title={s.hint}
            className={`rounded-xl p-1.5 text-left transition-colors ${
              style === s.id ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--bg-raised)]'
            }`}
          >
            <BarMini kind={s.id} />
            <p className="mt-1.5 px-1 text-[11px] font-medium">{s.name}</p>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        Progresso
        <div className="flex flex-wrap gap-1.5">
          {PROGRESS_STYLES.map((p) => (
            <button
              key={p.id}
              onClick={() => setProgress(p.id)}
              title={p.hint}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors ${
                progress === p.id
                  ? 'bg-[var(--accent)] font-semibold text-[var(--on-accent,#fff)]'
                  : 'bg-[var(--bg-raised)] hover:text-ink'
              }`}
            >
              <ProgressMini kind={p.id} />
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** a tiny window: sidebar, content, and the bar in that style */
function BarMini({ kind }: { kind: BarStyle }): JSX.Element {
  const accent = 'var(--accent)'
  const panel = 'var(--bg-raised)'
  const bar = (() => {
    switch (kind) {
      case 'floating':
        return (
          <g>
            <rect x="36" y="56" width="70" height="11" rx="5.5" fill="var(--text-muted)" opacity=".35" />
            <circle cx="42" cy="61.5" r="3.5" fill={accent} />
            <circle cx="71" cy="61.5" r="3" fill="var(--text-primary)" />
          </g>
        )
      case 'compact':
        return (
          <g>
            <rect x="4" y="62" width="112" height="9" rx="2.5" fill={panel} />
            <rect x="7" y="64" width="5" height="5" rx="1" fill={accent} />
            <circle cx="40" cy="66.5" r="2.4" fill="var(--text-primary)" />
            <rect x="48" y="66" width="44" height="1.4" rx=".7" fill="var(--text-muted)" opacity=".5" />
            <rect x="48" y="66" width="20" height="1.4" rx=".7" fill={accent} />
          </g>
        )
      case 'vinyl':
        return (
          <g>
            <rect x="4" y="58" width="112" height="13" rx="3" fill={panel} />
            <circle cx="14" cy="58" r="9" fill="#141418" />
            <circle cx="14" cy="58" r="3.4" fill={accent} />
            <circle cx="60" cy="62" r="3" fill="var(--text-primary)" />
            <rect x="42" y="67" width="36" height="1.4" rx=".7" fill={accent} />
          </g>
        )
      case 'cover':
        return (
          <g>
            <defs>
              <linearGradient id="bm-cover" x1="0" x2="1">
                <stop offset="0" stopColor={accent} stopOpacity=".85" />
                <stop offset=".6" stopColor="#ff5fa2" stopOpacity=".5" />
                <stop offset="1" stopColor={accent} stopOpacity=".25" />
              </linearGradient>
            </defs>
            <rect x="4" y="58" width="112" height="13" rx="3" fill="url(#bm-cover)" />
            <rect x="7" y="60.5" width="8" height="8" rx="1.5" fill="var(--text-primary)" opacity=".85" />
            <circle cx="60" cy="62" r="3" fill="var(--text-primary)" />
            <rect x="42" y="67" width="36" height="1.4" rx=".7" fill="var(--text-primary)" opacity=".8" />
          </g>
        )
      default:
        return (
          <g>
            <rect x="4" y="58" width="112" height="13" rx="3" fill={panel} />
            <rect x="7" y="60.5" width="8" height="8" rx="1.5" fill={accent} />
            <circle cx="60" cy="62" r="3" fill="var(--text-primary)" />
            <rect x="42" y="67" width="36" height="1.4" rx=".7" fill="var(--text-muted)" opacity=".5" />
            <rect x="42" y="67" width="16" height="1.4" rx=".7" fill={accent} />
          </g>
        )
    }
  })()
  const tall = kind === 'floating' ? 69 : kind === 'compact' ? 56 : 52
  return (
    <svg viewBox="0 0 120 75" className="block w-full rounded-lg" style={{ background: 'var(--bg-base)' }} aria-hidden>
      <rect x="4" y="4" width="24" height={tall} rx="3" fill={panel} />
      <rect x="32" y="4" width="84" height={tall} rx="3" fill={panel} opacity=".6" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="38" y={12 + i * 9} width={i % 2 ? 50 : 66} height="3" rx="1.5" fill="var(--text-muted)" opacity=".35" />
      ))}
      {bar}
    </svg>
  )
}

function ProgressMini({ kind }: { kind: ProgressStyle }): JSX.Element {
  if (kind === 'wave')
    return (
      <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden>
        <path d="M1 5 q2.5 -4 5 0 t5 0 t5 0" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M19 5 H33" stroke="currentColor" strokeWidth="1.8" opacity=".4" strokeLinecap="round" />
      </svg>
    )
  if (kind === 'peaks')
    return (
      <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden>
        {[3, 6, 4, 8, 5, 9, 6, 3, 7, 4, 2].map((h, i) => (
          <rect key={i} x={1 + i * 3} y={5 - h / 2} width="1.8" height={h} rx=".9" fill="currentColor" opacity={i < 6 ? 1 : 0.4} />
        ))}
      </svg>
    )
  return (
    <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden>
      <rect x="1" y="4" width="32" height="2" rx="1" fill="currentColor" opacity=".4" />
      <rect x="1" y="4" width="15" height="2" rx="1" fill="currentColor" />
    </svg>
  )
}
