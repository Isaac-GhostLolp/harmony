import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dices, Download, RotateCcw, Save, Upload, X } from 'lucide-react'
import { useAppearanceStore, sourceName } from '@/store/appearanceStore'
import { useUiStore } from '@/store/uiStore'
import { FONTS, type ShadowStyle, randomLook } from '@/utils/appearance'
import { InputDialog } from '@/components/InputDialog'
import { t } from '@/i18n'

/**
 * The appearance studio: a drawer on the right edge where every part of the
 * theme can be changed — and the whole app behind it is the live preview
 * (you can keep it open and walk around the tabs). Edits apply instantly;
 * they can be saved as a theme of your own, exported to a file to share,
 * or thrown away.
 */
export function AppearanceStudio(): JSX.Element | null {
  const open = useAppearanceStore((s) => s.studioOpen)
  if (!open) return null
  return createPortal(<Studio />, document.body)
}

function Studio(): JSX.Element {
  const { look, source, edited, mine, edit, revert, saveAs, update, importLook, setStudioOpen } =
    useAppearanceStore()
  const world = useUiStore((s) => s.world)
  const setWorld = useUiStore((s) => s.setWorld)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const name = sourceName(source, mine)
  const mineId = source.startsWith('mine:') ? source.slice(5) : null

  const flash = (msg: string): void => {
    setNote(msg)
    window.setTimeout(() => setNote((n) => (n === msg ? null : n)), 2600)
  }

  const exportTheme = (): void => {
    const data = { harmonyTheme: 1, name: edited ? `${name} (editado)` : name, look }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${data.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'tema'}.harmony-theme.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const importFile = async (file: File): Promise<void> => {
    try {
      const id = importLook(JSON.parse(await file.text()), file.name.replace(/\..*$/, ''))
      flash(id ? t('Tema importado e aplicado ✨') : t('Esse arquivo não parece um tema do Harmony.'))
    } catch {
      flash(t('Não consegui ler esse arquivo.'))
    }
  }

  return (
    <aside
      className="studio fade-rise fixed bottom-3 right-3 top-3 z-[90] flex w-[340px] flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] shadow-2xl"
      style={{ background: 'var(--bg-base)', backgroundImage: 'var(--bg-image)' }}
      aria-label={t('Estúdio de aparência')}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--glass-border)] p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('🎨 Estúdio de aparência')}</h2>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {name}
            {edited && <span className="text-[var(--accent)]"> {t('· editado')}</span>}
          </p>
        </div>
        <button
          onClick={() => setStudioOpen(false)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--bg-raised)] text-muted hover:text-ink"
          aria-label={t('Fechar estúdio')}
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <p className="text-[11px] leading-relaxed text-muted">
          {t('Tudo muda na hora — o app inteiro é a prévia. Pode deixar o estúdio aberto e passear pelas abas.')}
        </p>
        {world && (
          <div className="rounded-xl bg-[var(--accent-soft)] p-3 text-[11px] leading-relaxed">
            {t('Um Mundo vivo está ligado: os painéis seguem o Mundo enquanto ele estiver ativo.')}{' '}
            <button onClick={() => setWorld(null)} className="font-semibold text-[var(--accent)] underline">
              {t('Desligar o Mundo')}
            </button>
          </div>
        )}

        <button
          onClick={() => edit(randomLook())}
          className="press flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--bg-raised)] py-2.5 text-xs font-semibold hover:bg-[var(--accent-soft)]"
        >
          <Dices size={14} /> {t('Surpreenda-me')}
        </button>

        <Group title={t('Cores')}>
          <ColorRow label={t('Fundo')} value={look.bg} onChange={(bg) => edit({ bg })} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs">{t('Degradê no fundo')}</span>
            <div className="flex items-center gap-2">
              {look.bg2 && <ColorSwatch value={look.bg2} onChange={(bg2) => edit({ bg2 })} label={t('Segunda cor do fundo')} />}
              <Switch
                on={look.bg2 !== null}
                label={t('Degradê no fundo')}
                onChange={(on) => edit({ bg2: on ? shade(look.bg, 0.12) : null })}
              />
            </div>
          </div>
          <ColorRow label={t('Texto')} value={look.text} onChange={(text) => edit({ text })} />
          <ColorRow label={t('Destaque')} value={look.accent} onChange={(accent) => edit({ accent })} />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs">{t('Destaque segue a capa')}</p>
              <p className="text-[10px] text-muted">{t('A cor muda com a música que está tocando')}</p>
            </div>
            <Switch on={look.followCover} label={t('Destaque segue a capa')} onChange={(followCover) => edit({ followCover })} />
          </div>
        </Group>

        <Group title={t('Painéis')}>
          <ColorRow label={t('Cor dos painéis')} value={look.tint} onChange={(tint) => edit({ tint })} />
          <Slider label={t('Intensidade da cor')} value={look.tintAlpha} max={80} unit="%" onChange={(tintAlpha) => edit({ tintAlpha })} />
          <Slider
            label={t('Transparência')}
            hint={['vidro', t('sólido')]}
            value={100 - look.opacity}
            max={100}
            unit="%"
            onChange={(v) => edit({ opacity: 100 - v })}
          />
          <Slider label={t('Desfoque do vidro')} value={look.blur} max={40} unit="px" onChange={(blur) => edit({ blur })} />
          <ColorRow label={t('Cor da borda')} value={look.border} onChange={(border) => edit({ border })} />
          <Slider label={t('Borda')} value={look.borderAlpha} max={40} unit="%" onChange={(borderAlpha) => edit({ borderAlpha })} />
        </Group>

        <Group title={t('Formas')}>
          <Slider
            label={t('Arredondamento')}
            hint={['quadrado', 'redondo']}
            value={look.radius}
            max={200}
            unit="%"
            onChange={(radius) => edit({ radius })}
          />
          <div>
            <p className="mb-1.5 text-xs">{t('Sombra')}</p>
            <Segmented<ShadowStyle>
              value={look.shadow}
              options={[
                ['soft', t('Suave')],
                ['glow', t('Neon')],
                ['hard', t('Recortada')],
                ['none', t('Nenhuma')]
              ]}
              onChange={(shadow) => edit({ shadow })}
            />
          </div>
          {look.shadow !== 'none' && (
            <Slider label={t('Força da sombra')} value={look.shadowStrength} max={100} unit="%" onChange={(shadowStrength) => edit({ shadowStrength })} />
          )}
          <Slider label={t('Brilho ambiente')} value={look.glow} max={100} unit="%" onChange={(glow) => edit({ glow })} />
        </Group>

        <Group title={t('Fonte')}>
          <div className="grid grid-cols-2 gap-1.5">
            {FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() => edit({ font: f.id })}
                style={{ fontFamily: f.family }}
                className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  look.font === f.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] hover:bg-[var(--accent-soft)]'
                }`}
              >
                {t(f.label)}
                <span className="block text-[10px] opacity-70">{t('Aa Bb 123')}</span>
              </button>
            ))}
          </div>
        </Group>
      </div>

      <footer className="space-y-2 border-t border-[var(--glass-border)] p-4">
        {note && <p className="text-center text-[11px] text-[var(--accent)]">{note}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => setSaving(true)}
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] py-2 text-xs font-semibold text-white"
          >
            <Save size={13} /> {t('Salvar como novo tema')}
          </button>
          {edited && (
            <button
              onClick={revert}
              title={t('Desfazer as alterações')}
              className="press grid h-8 w-8 place-items-center rounded-full bg-[var(--bg-raised)] text-muted hover:text-ink"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
        {mineId && edited && (
          <button
            onClick={() => {
              update(mineId)
              flash(`“${name}” atualizado`)
            }}
            className="press w-full rounded-full bg-[var(--bg-raised)] py-2 text-xs font-semibold hover:bg-[var(--accent-soft)]"
          >
            {t('Atualizar “{name}”', { name })}
          </button>
        )}
        <div className="flex gap-2">
          <button
            onClick={exportTheme}
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--bg-raised)] py-2 text-[11px] font-semibold text-muted hover:text-ink"
          >
            <Download size={12} /> {t('Exportar')}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--bg-raised)] py-2 text-[11px] font-semibold text-muted hover:text-ink"
          >
            <Upload size={12} /> {t('Importar')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </footer>

      <InputDialog
        open={saving}
        title={t('Salvar tema')}
        label={t('Dê um nome ao seu tema')}
        initialValue={mineId ? `${name} 2` : edited ? t('Meu {name}', { name }) : name}
        confirmLabel={t('Salvar')}
        onConfirm={(v) => {
          saveAs(v)
          setSaving(false)
          flash(t('Tema salvo em “Meus temas” 💾'))
        }}
        onCancel={() => setSaving(false)}
      />
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function Group({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Slider({
  label,
  value,
  max,
  unit,
  hint,
  onChange
}: {
  label: string
  value: number
  max: number
  unit: string
  hint?: [string, string]
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {Math.round(value)}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-range w-full"
        style={{ '--fill': `${(value / max) * 100}%` } as React.CSSProperties}
      />
      {hint && (
        <span className="mt-0.5 flex justify-between text-[10px] text-muted">
          <span>{hint[0]}</span>
          <span>{hint[1]}</span>
        </span>
      )}
    </label>
  )
}

const SWATCHES = ['#7c6cf4', '#ff2d95', '#ff8a3d', '#ffcd75', '#3ddc97', '#2dd4bf', '#38bdf8', '#e11d48', '#ffffff', '#0b0b10']

function ColorSwatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }): JSX.Element {
  return (
    <span
      className="relative block h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-[var(--glass-border)]"
      style={{ background: value }}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  const [text, setText] = useState<string | null>(null)
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs">{label}</span>
        <div className="flex items-center gap-2">
          <input
            value={text ?? value}
            onChange={(e) => {
              const v = e.target.value.trim()
              setText(v)
              if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase())
            }}
            onBlur={() => setText(null)}
            spellCheck={false}
            aria-label={`${label} (hex)`}
            className="w-[76px] rounded-md bg-[var(--bg-raised)] px-2 py-1 font-mono text-[11px] uppercase outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <ColorSwatch value={value} onChange={onChange} label={label} />
        </div>
      </div>
      <div className="mt-1.5 flex justify-end gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={t('Usar {color}', { color: c })}
            className={`h-3.5 w-3.5 rounded-full border border-[var(--glass-border)] transition-transform hover:scale-125 ${
              c === value.toLowerCase() ? 'ring-1 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-base)]' : ''
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  )
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-raised)] p-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
            value === id ? 'bg-[var(--accent)] text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** A slightly lighter (dark looks) or darker (light looks) version of a colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lum = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 255000
  const out = c.map((v) => Math.round(lum > 0.5 ? v * (1 - amount) : v + (255 - v) * amount))
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('')
}

