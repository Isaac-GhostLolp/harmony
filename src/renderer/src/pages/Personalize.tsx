import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useUiStore, type BackgroundMode } from '@/store/uiStore'
import { api } from '@/services/api'
import { mediaUrl } from '@/utils/format'
import { PageHeader } from '@/components/PageHeader'
import { FilterChips } from '@/components/FilterChips'
import { ThemeGallery } from '@/components/appearance/ThemeGallery'
import { StickerArt } from '@/components/stickers/art'
import { IconGallery } from '@/components/icons/IconGallery'
import { BarStylePicker } from '@/components/BarStylePicker'
import { useStickerStore } from '@/store/stickerStore'
import { findWorld } from '@/worlds/registry'
import { WorldGrid } from '@/components/WorldGrid'
import { getAutoPick, onAutoPick, type AutoPick } from '@/worlds/auto'
import { INTRO_PREF_KEY, INTRO_REPLAY_EVENT } from '@/components/IntroSplash'

/**
 * Everything about how the Harmony looks, in one place: themes, living
 * worlds, the backdrop, stickers, icon packs, the music bar and the opening
 * show. The chips under the title stay pinned and jump to each part; the
 * one in view lights up as the page scrolls. (Settings keeps what makes
 * the app work: performance, audio, library, integrations.)
 */

const PARTS = [
  { id: 'temas', label: 'Temas' },
  { id: 'mundos', label: 'Mundos vivos' },
  { id: 'fundo', label: 'Fundo' },
  { id: 'adesivos', label: 'Adesivos' },
  { id: 'icones', label: 'Ícones' },
  { id: 'barra', label: 'Barra de música' },
  { id: 'abertura', label: 'Abertura' }
] as const
type Part = (typeof PARTS)[number]['id']

/** one part of the page; parts whose component brings its own header pass no title */
function Section({ id, title, hint, children }: { id: Part; title?: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <section
      id={`p-${id}`}
      data-part={id}
      className="glass mb-4 rounded-2xl p-5"
      style={{ scrollMarginTop: 'calc(var(--sticky-h, 38px) - 2px)' }}
    >
      {title && <h2 className="text-sm font-semibold">{title}</h2>}
      {title && hint && <p className="mb-4 mt-0.5 text-xs text-muted">{hint}</p>}
      {title && !hint && <div className="mb-3" />}
      {children}
    </section>
  )
}

export function Personalize(): JSX.Element {
  const {
    background,
    setBackground,
    world,
    setWorld,
    worldOpacity,
    setWorldOpacity,
    worldBlur,
    setWorldBlur,
    worldSurge,
    setWorldSurge,
    customMedia,
    setCustomMedia
  } = useUiStore()
  const [introOn, setIntroOn] = useState(() => {
    try {
      return localStorage.getItem(INTRO_PREF_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const [part, setPart] = useState<Part>('temas')
  const rootRef = useRef<HTMLDivElement>(null)
  // while a chip's jump is gliding, the chip stays lit (not each part passed)
  const jumping = useRef(0)

  // light up the part being read: the last one whose top passed the header
  useEffect(() => {
    const root = rootRef.current
    let sc: HTMLElement | null = root?.parentElement ?? null
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement
    if (!root || !sc) return
    const scroller = sc
    let raf = 0
    const update = (): void => {
      raf = 0
      if (Date.now() < jumping.current) return
      const line = scroller.getBoundingClientRect().top + (parseFloat(getComputedStyle(scroller).getPropertyValue('--sticky-h')) || 38) + 24
      let current: Part = PARTS[0].id
      for (const el of root.querySelectorAll<HTMLElement>('[data-part]')) if (el.getBoundingClientRect().top <= line) current = el.dataset.part as Part
      // at the very bottom, the last part counts even if it's short
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) current = PARTS[PARTS.length - 1].id
      setPart(current)
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  const jump = (id: Part): void => {
    setPart(id)
    jumping.current = Date.now() + 700
    document.getElementById(`p-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={rootRef}>
      <PageHeader title="Personalização" subtitle="Deixe o Harmony com a sua cara">
        <FilterChips chips={PARTS.map((p) => ({ id: p.id, label: p.label }))} active={part} onChange={jump} />
      </PageHeader>

      <Section id="temas">
        <ThemeGallery />
      </Section>

      <Section
        id="mundos"
        title="Mundos vivos"
        hint="Os Worlds transformam o Harmony em um universo vivo que reage à sua música."
      >
        <WorldGrid world={world} setWorld={setWorld} />

        {world && (
          <div className="mt-5 rounded-2xl bg-[var(--bg-raised)] p-4">
            <h3 className="mb-3 text-xs font-semibold">Personalizar este mundo</h3>
            {world === 'auto' && <AutoWorldStatus />}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs">Explosão no refrão</p>
                  <p className="text-[11px] text-muted">
                    O mundo ganha brilho e um leve zoom nos refrões e drops da música.
                  </p>
                </div>
                <button
                  onClick={() => setWorldSurge(!worldSurge)}
                  role="switch"
                  aria-checked={worldSurge}
                  aria-label="Explosão no refrão"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    worldSurge ? 'bg-[var(--accent)]' : 'bg-[var(--bg-base)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      worldSurge ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>Transparência dos painéis</span>
                  <span>{worldOpacity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={worldOpacity}
                  onChange={(e) => setWorldOpacity(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>Desfoque (blur)</span>
                  <span>{worldBlur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={worldBlur}
                  onChange={(e) => setWorldBlur(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Custom media importer — visible when the "Meu fundo" world is active */}
        {world === 'custom' && (
          <div className="mt-3 rounded-2xl bg-[var(--bg-raised)] p-4">
            <h3 className="mb-1 text-xs font-semibold">Meu fundo personalizado 🖼️</h3>
            <p className="mb-3 text-[11px] text-muted">
              Importe uma imagem (PNG/JPG) ou um vídeo (MP4/WebM) para usar como fundo. Vídeos
              muito pesados podem deixar o app mais lento.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="press cursor-pointer rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white">
                Escolher arquivo
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const type = file.type.startsWith('video') ? 'video' : 'image'
                    const ext = (file.name.split('.').pop() || '').toLowerCase()
                    // Copy the file into userData so it survives restarts, then
                    // use a stable harmony:// media URL instead of a session-only
                    // object URL.
                    const buf = await file.arrayBuffer()
                    const saved = (await api.wallpaper.save(buf, ext, type)) as {
                      path: string
                      type: 'image' | 'video'
                    }
                    setCustomMedia({ type: saved.type, url: mediaUrl(saved.path)! })
                    e.target.value = '' // allow re-picking the same file
                  }}
                />
              </label>
              {customMedia && (
                <button
                  onClick={() => {
                    api.wallpaper.clear()
                    setCustomMedia(null)
                  }}
                  className="rounded-full bg-[var(--bg-surface)] px-4 py-2 text-xs text-muted hover:text-ink"
                >
                  Remover
                </button>
              )}
              {customMedia && (
                <span className="text-[11px] text-muted">
                  {customMedia.type === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'} carregado
                </span>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section id="fundo" title="Fundo dinâmico" hint="A capa da música, desfocada, atrás do app (quando nenhum mundo está ligado).">
      <div className="mt-2 flex gap-2">
        {(
          [
            { id: 'cover', label: 'Blur da capa' },
            { id: 'none', label: 'Nenhum' }
          ] as { id: BackgroundMode; label: string }[]
        ).map((b) => (
          <button
            key={b.id}
            onClick={() => setBackground(b.id)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
              background === b.id
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      </Section>

      <Section id="adesivos">
      <div className="flex items-center gap-4">
        <div className="flex shrink-0 -space-x-3">
          {['heart', 'vinyl', 'star'].map((id, i) => (
            <div key={id} className="h-11 w-11" style={{ transform: `rotate(${(i - 1) * 12}deg)` }}>
              <StickerArt id={id} />
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Adesivos</h2>
          <p className="mt-0.5 text-xs text-muted">
            Cole figurinhas na barra lateral, no player e nas capas das playlists, ou use as suas próprias
            imagens (PNG, GIF animado, SVG…). Algumas são animadas e outras pulsam com a batida.
          </p>
        </div>
        <button
          onClick={() => useStickerStore.getState().setEditing(true)}
          className="press shrink-0 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--on-accent,#fff)]"
        >
          Colar adesivos
        </button>
      </div>
      </Section>

      <Section id="icones">
        <IconGallery />
      </Section>

      <Section id="barra">
        <BarStylePicker />
      </Section>

      <Section id="abertura">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Animação de abertura</h2>
          <p className="mt-0.5 text-xs text-muted">
            Um pequeno show ao abrir o Harmony. Clique ou aperte qualquer tecla para pular.
          </p>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event(INTRO_REPLAY_EVENT))}
            className="rounded-full bg-[var(--bg-raised)] px-4 py-2 text-xs font-medium text-muted hover:text-ink"
          >
            Ver agora
          </button>
          <button
            onClick={() => {
              const next = !introOn
              setIntroOn(next)
              try {
                localStorage.setItem(INTRO_PREF_KEY, next ? 'on' : 'off')
              } catch {
                /* ignore */
              }
            }}
            role="switch"
            aria-checked={introOn}
            aria-label="Animação de abertura"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              introOn ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                introOn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>
      </Section>
    </div>
  )
}

const PICK_REASON: Record<AutoPick['reason'], string> = {
  genre: 'pelo gênero',
  energy: 'pela energia da música',
  time: 'pela hora do dia',
  listening: ''
}

/** Which world the automatic mode chose for the current song, and why. */
function AutoWorldStatus(): JSX.Element {
  const [pick, setPick] = useState<AutoPick | null>(getAutoPick)
  useEffect(() => onAutoPick(setPick), [])
  const meta = pick ? findWorld(pick.worldId) : undefined
  return (
    <p className="mb-4 rounded-xl bg-black/20 px-3 py-2 text-[11px] text-muted">
      {meta && pick && pick.reason === 'listening' ? (
        <>
          Agora: <span className="font-semibold text-ink">{meta.emoji} {meta.name}</span>. Ouvindo esta música para
          escolher o mundo dela…
        </>
      ) : meta && pick ? (
        <>
          Agora: <span className="font-semibold text-ink">{meta.emoji} {meta.name}</span>, escolhido{' '}
          {PICK_REASON[pick.reason]}
          {pick.reason === 'genre' && pick.genre ? ` (${pick.genre})` : ''}.
        </>
      ) : (
        'Dê play numa música e o mundo certo aparece.'
      )}
    </p>
  )
}
