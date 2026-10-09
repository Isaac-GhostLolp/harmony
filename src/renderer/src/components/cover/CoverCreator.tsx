import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Dices, ImagePlus, Loader2, X } from 'lucide-react'
import { api } from '@/services/api'
import { usePlayerStore } from '@/store/playerStore'
import { COVERS_CHANGED_EVENT, useCoverCreator, type CoverTarget } from '@/store/coverCreatorStore'
import { FONTS } from '@/utils/appearance'
import { useEscape } from '@/components/views/useEscape'
import {
  COVER_STYLES,
  PALETTES,
  coverBytes,
  drawCover,
  hashText,
  paletteFor,
  type CoverSpec,
  type CoverStyle,
  type Palette,
  type TextPos
} from '@/utils/coverArt'

/**
 * The cover creator: a cover for any album (or single) without one — or to
 * replace one you don't like. Pick a style, colours and lettering; the
 * preview is the real thing, drawn again at 1000 px when it's saved.
 */
export function CoverCreator(): JSX.Element {
  const target = useCoverCreator((s) => s.target)
  return createPortal(<AnimatePresence>{target && <Creator key={target.songId} target={target} />}</AnimatePresence>, document.body)
}

/** Point every copy of this album's songs in the player at the new cover. */
export function announceCover(songId: number, albumId: number | null, cover: string): void {
  const st = usePlayerStore.getState()
  for (const s of st.queue) if (s.id === songId || (albumId !== null && s.albumId === albumId)) st.updateSongCover(s.id, cover)
  window.dispatchEvent(new CustomEvent(COVERS_CHANGED_EVENT))
}

const POSITIONS: [TextPos, string][] = [
  ['bottom', 'Embaixo'],
  ['center', 'Centro'],
  ['top', 'Em cima'],
  ['none', 'Sem texto']
]

function Creator({ target }: { target: CoverTarget }): JSX.Element {
  const close = useCoverCreator((s) => s.close)
  useEscape(close, true)
  const seed0 = hashText(`${target.title}|${target.artist}`)
  const [spec, setSpec] = useState<CoverSpec>(() => ({
    style: 'gradient',
    palette: paletteFor(target.title),
    seed: seed0,
    title: target.title,
    artist: target.artist,
    textPos: 'bottom',
    upper: false,
    font: FONTS[2].family,
    grain: true,
    image: null
  }))
  const [paletteId, setPaletteId] = useState<string>('auto-0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fontsReady, setFontsReady] = useState(0)
  const preview = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<CoverSpec>): void => setSpec((s) => ({ ...s, ...patch }))

  // the bundled fonts load lazily: draw again once the chosen one is in
  useEffect(() => {
    let alive = true
    document.fonts.load(`800 40px ${spec.font}`).then(() => alive && setFontsReady((n) => n + 1))
    return () => {
      alive = false
    }
  }, [spec.font])

  useEffect(() => {
    if (preview.current) drawCover(preview.current, spec)
  }, [spec, fontsReady])

  const pickImage = (file: File): void => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => set({ image: img, style: 'photo' })
    img.src = url
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const bytes = await coverBytes(spec)
      const res = (await api.covers.saveCustom(target.songId, bytes)) as { albumId: number; cover: string | null } | null
      if (!res?.cover) throw new Error('not saved')
      announceCover(target.songId, res.albumId, res.cover)
      close()
    } catch {
      setError('Não consegui salvar a capa. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/65 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={close}
    >
      <motion.div
        className="relative flex max-h-[92vh] w-[min(980px,96vw)] flex-col overflow-hidden rounded-3xl border border-[var(--glass-border)] shadow-2xl md:flex-row"
        style={{ background: 'var(--bg-base)' }}
        initial={{ y: 24, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* preview */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-4 bg-[var(--bg-raised)] p-6 md:w-[460px]">
          <canvas
            ref={preview}
            width={720}
            height={720}
            className="aspect-square w-full max-w-[400px] rounded-lg shadow-[0_20px_50px_rgb(0_0_0/0.45)]"
          />
          <button
            onClick={() => set({ seed: (spec.seed + 0x9e3779b1) >>> 0 })}
            className="press flex items-center gap-2 rounded-full bg-[var(--bg-base)] px-4 py-2 text-xs font-semibold hover:text-[var(--accent)]"
          >
            <Dices size={14} /> Outra variação
          </button>
        </div>

        {/* controls */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-3 p-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">🎨 Criador de capas</h2>
              <p className="truncate text-xs text-muted">
                {target.title} · {target.artist}
              </p>
            </div>
            <button onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--bg-raised)] text-muted hover:text-ink" aria-label="Fechar">
              <X size={15} />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
            <Section title="Estilo">
              <div className="grid grid-cols-5 gap-2">
                {COVER_STYLES.map((s) => (
                  <StyleThumb
                    key={s.id}
                    style={s.id}
                    label={s.label}
                    spec={spec}
                    active={spec.style === s.id}
                    onClick={() => (s.id === 'photo' && !spec.image ? fileRef.current?.click() : set({ style: s.id }))}
                  />
                ))}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-2 flex items-center gap-1.5 text-[11px] text-muted hover:text-ink"
              >
                <ImagePlus size={13} /> {spec.image ? 'Trocar a foto' : 'Usar uma foto minha'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) pickImage(f)
                  e.target.value = ''
                }}
              />
            </Section>

            <Section title="Cores">
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map((v) => (
                  <PaletteChip
                    key={`auto-${v}`}
                    colors={paletteFor(target.title, v)}
                    label={v === 0 ? 'Desta música' : `Variação ${v}`}
                    active={paletteId === `auto-${v}`}
                    onClick={() => {
                      setPaletteId(`auto-${v}`)
                      set({ palette: paletteFor(target.title, v) })
                    }}
                  />
                ))}
                {PALETTES.map((p) => (
                  <PaletteChip
                    key={p.name}
                    colors={p.colors}
                    label={p.name}
                    active={paletteId === p.name}
                    onClick={() => {
                      setPaletteId(p.name)
                      set({ palette: p.colors })
                    }}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[11px] text-muted">Ajustar:</span>
                {spec.palette.map((c, i) => (
                  <label
                    key={i}
                    className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-[var(--glass-border)]"
                    style={{ background: c }}
                    title={i === 0 ? 'Fundo' : `Cor ${i}`}
                  >
                    <input
                      type="color"
                      value={c}
                      onChange={(e) => {
                        const next = [...spec.palette] as Palette
                        next[i] = e.target.value
                        setPaletteId('custom')
                        set({ palette: next })
                      }}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Texto">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={spec.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Título"
                  aria-label="Título da capa"
                  className="rounded-lg bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <input
                  value={spec.artist}
                  onChange={(e) => set({ artist: e.target.value })}
                  placeholder="Artista"
                  aria-label="Artista da capa"
                  className="rounded-lg bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {POSITIONS.map(([id, label]) => (
                  <Chip key={id} active={spec.textPos === id} onClick={() => set({ textPos: id })}>
                    {label}
                  </Chip>
                ))}
                <Chip active={spec.upper} onClick={() => set({ upper: !spec.upper })}>
                  MAIÚSCULAS
                </Chip>
                <Chip active={spec.grain} onClick={() => set({ grain: !spec.grain })}>
                  Textura
                </Chip>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FONTS.map((f) => (
                  <Chip key={f.id} active={spec.font === f.family} onClick={() => set({ font: f.family })} style={{ fontFamily: f.family }}>
                    {f.label}
                  </Chip>
                ))}
              </div>
            </Section>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-[var(--glass-border)] p-4">
            {error && <p className="mr-auto text-xs text-red-400">{error}</p>}
            <p className="mr-auto hidden text-[11px] text-muted sm:block">{!error && 'A capa vale para o álbum inteiro.'}</p>
            <button onClick={close} className="rounded-full px-4 py-2 text-xs text-muted hover:text-ink">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="press flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {saving && <Loader2 size={13} className="animate-spin" />} Usar esta capa
            </button>
          </footer>
        </div>
      </motion.div>
    </motion.div>
  )
}

function StyleThumb({
  style,
  label,
  spec,
  active,
  onClick
}: {
  style: CoverStyle
  label: string
  spec: CoverSpec
  active: boolean
  onClick: () => void
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawCover(ref.current, { ...spec, style, textPos: 'none', grain: false })
    // the text doesn't show on the thumbnails, so typing doesn't redraw them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, spec.palette, spec.seed, spec.image, style === 'type' ? spec.title : '', style === 'type' ? spec.font : ''])
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-1" title={label}>
      <canvas
        ref={ref}
        width={120}
        height={120}
        className={`aspect-square w-full rounded-md transition-transform group-hover:scale-105 ${
          active ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-base)]' : ''
        }`}
      />
      <span className={`text-[10px] ${active ? 'font-semibold text-[var(--accent)]' : 'text-muted'}`}>{label}</span>
    </button>
  )
}

function PaletteChip({ colors, label, active, onClick }: { colors: Palette; label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex overflow-hidden rounded-full border-2 transition-transform hover:scale-110 ${active ? 'border-[var(--accent)]' : 'border-transparent'}`}
    >
      {colors.map((c, i) => (
        <span key={i} className="block h-6 w-3.5" style={{ background: c }} />
      ))}
    </button>
  )
}

function Chip({
  active,
  onClick,
  children,
  style
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={style}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
        active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </section>
  )
}
