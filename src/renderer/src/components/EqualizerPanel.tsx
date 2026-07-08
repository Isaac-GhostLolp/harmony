import { useEqStore, EQ_PRESETS } from '@/store/eqStore'
import { EQ_BANDS } from '@/services/audioEngine'

const LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

export function EqualizerPanel(): JSX.Element {
  const { enabled, preset, gains, setEnabled, setPreset, setGain } = useEqStore()

  return (
    <section className="glass mb-4 rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Equalizador</h2>
          <p className="mt-0.5 text-xs text-muted">10 bandas · {EQ_BANDS[0]}Hz–16kHz</p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          role="switch"
          aria-checked={enabled}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[...Object.keys(EQ_PRESETS), 'Personalizado'].map((name) => (
          <button
            key={name}
            disabled={!enabled || name === 'Personalizado'}
            onClick={() => setPreset(name)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
              preset === name
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className={`flex justify-between gap-2 ${enabled ? '' : 'opacity-40'}`}>
        {gains.map((g, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted">
              {g > 0 ? `+${g}` : g}
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={g}
              disabled={!enabled}
              onChange={(e) => setGain(i, Number(e.target.value))}
              className="h-24 w-4"
              style={
                {
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  '--fill': `${((g + 12) / 24) * 100}%`
                } as React.CSSProperties
              }
              aria-label={`${LABELS[i]} Hz`}
            />
            <span className="text-[10px] text-muted">{LABELS[i]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
