import {
  useFlairStore,
  type CoverShape,
  type MiniSkin,
  type PageTransition,
  type ScrollbarStyle,
  type SpinnerStyle,
  type UiSoundPack
} from '@/store/flairStore'
import { playUiSound } from '@/utils/uiSounds'
import { IS_ANDROID } from '@/platform'
import { CoverArt } from '@/components/CoverArt'
import { Spinner } from '@/components/Spinner'
import { Switch, chip } from '@/components/CursorPicker'
import { t, tk } from '@/i18n'

/**
 * Personalização's 0.21.0 sections (store/flairStore.ts): interface sounds,
 * covers, the small details (transitions, scrollbar, selection, loading) and
 * the mini player's skin.
 */

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-xs font-semibold">{title}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function Options<T extends string>({
  list,
  value,
  onPick
}: {
  list: { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
}): JSX.Element {
  return (
    <>
      {list.map((o) => (
        <button key={o.id} onClick={() => onPick(o.id)} className={chip(value === o.id)}>
          {t(o.label)}
        </button>
      ))}
    </>
  )
}

// ── sounds ────────────────────────────────────────────────────────────

const SOUND_PACKS: { id: UiSoundPack; label: string }[] = [
  { id: 'off', label: tk('Desligados') },
  { id: 'soft', label: tk('☁️ Macio') },
  { id: '8bit', label: tk('👾 8-bit') },
  { id: 'vinyl', label: tk('💿 Vinil') },
  { id: 'mech', label: tk('⌨️ Mecânico') }
]

export function SoundsPicker(): JSX.Element {
  const pack = useFlairStore((s) => s.uiSounds)
  const volume = useFlairStore((s) => s.uiVolume)
  const set = useFlairStore((s) => s.set)
  return (
    <div>
      <h2 className="text-sm font-semibold">{t('🔊 Sons da interface')}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">
        {t('Pequenos sons ao clicar, ligar e desligar opções, favoritar e trocar de página. Têm volume próprio e não passam pelo equalizador.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Options
          list={SOUND_PACKS}
          value={pack}
          onPick={(id) => {
            set({ uiSounds: id })
            // a taste of the pack (the click itself is heard with the old one)
            window.setTimeout(() => playUiSound(id, 'favorite', volume), 120)
          }}
        />
      </div>
      {pack !== 'off' && (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs text-muted">{t('Volume')}</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => set({ uiVolume: Number(e.target.value) })}
            onPointerUp={() => playUiSound(pack, 'click', useFlairStore.getState().uiVolume)}
            className="w-48 accent-[var(--accent)]"
            aria-label={t('Volume dos sons da interface')}
          />
          <span className="w-9 text-xs tabular-nums text-muted">{Math.round(volume * 100)}%</span>
        </div>
      )}
    </div>
  )
}

// ── covers ────────────────────────────────────────────────────────────

const SHAPES: { id: CoverShape; label: string }[] = [
  { id: 'default', label: tk('Padrão') },
  { id: 'square', label: tk('Quadrada') },
  { id: 'circle', label: tk('Redonda') },
  { id: 'vinyl', label: tk('💿 Vinil') }
]

export function CoversPicker(): JSX.Element {
  const shape = useFlairStore((s) => s.coverShape)
  const tilt = useFlairStore((s) => s.coverTilt)
  const set = useFlairStore((s) => s.set)
  return (
    <div>
      <h2 className="text-sm font-semibold">{t('🖼️ Capas')}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">{t('O formato de todas as capas do app. No vinil, a capa da música tocando gira.')}</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Options list={SHAPES} value={shape} onPick={(id) => set({ coverShape: id })} />
        </div>
        <div className="flex gap-3" aria-hidden>
          <CoverArt src={null} title="Harmony" size="md" spin />
          <CoverArt src={null} title="Vinil" size="md" />
        </div>
      </div>
      {!IS_ANDROID && (
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('Capas em 3D')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('As capas grandes se inclinam na direção do mouse.')}</p>
          </div>
          <Switch on={tilt} onChange={(v) => set({ coverTilt: v })} label={t('Capas em 3D')} />
        </div>
      )}
    </div>
  )
}

// ── details ───────────────────────────────────────────────────────────

const TRANSITIONS: { id: PageTransition; label: string }[] = [
  { id: 'none', label: tk('Nenhuma') },
  { id: 'fade', label: tk('Desvanecer') },
  { id: 'slide', label: tk('Deslizar') },
  { id: 'zoom', label: tk('Zoom') }
]

const SCROLLBARS: { id: ScrollbarStyle; label: string }[] = [
  { id: 'classic', label: tk('Clássica') },
  { id: 'theme', label: tk('Na cor do tema') },
  { id: 'thin', label: tk('Fininha') },
  { id: 'pill', label: tk('Pílula') },
  { id: 'hover', label: tk('Só ao passar o mouse') }
]

const SPINNERS: { id: SpinnerStyle; label: string }[] = [
  { id: 'classic', label: tk('Clássico') },
  { id: 'vinyl', label: tk('Vinil') },
  { id: 'wave', label: tk('Equalizador') },
  { id: 'logo', label: tk('Nota') }
]

export function DetailsPicker(): JSX.Element {
  const f = useFlairStore()
  return (
    <div>
      <h2 className="text-sm font-semibold">{t('✨ Detalhes')}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">{t('Os pequenos acabamentos do app.')}</p>
      <Row title={t('Transição entre páginas')}>
        <Options list={TRANSITIONS} value={f.transition} onPick={(id) => f.set({ transition: id })} />
      </Row>
      {!IS_ANDROID && (
        <Row title={t('Barra de rolagem')}>
          <Options list={SCROLLBARS} value={f.scrollbar} onPick={(id) => f.set({ scrollbar: id })} />
        </Row>
      )}
      <Row title={t('Carregando')} hint={t('O que aparece enquanto algo carrega.')}>
        {SPINNERS.map((o) => (
          <button key={o.id} onClick={() => f.set({ spinner: o.id })} className={`${chip(f.spinner === o.id)} flex items-center gap-2`}>
            <SpinnerPreview style={o.id} />
            {t(o.label)}
          </button>
        ))}
      </Row>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t('Seleção na cor do tema')}</p>
          <p className="mt-0.5 text-xs text-muted">{t('O texto selecionado e o cursor de digitação usam a cor do seu tema.')}</p>
        </div>
        <Switch on={f.themedSelection} onChange={(v) => f.set({ themedSelection: v })} label={t('Seleção na cor do tema')} />
      </div>
    </div>
  )
}

/** a spinner in a given style, whatever the chosen one is */
function SpinnerPreview({ style }: { style: SpinnerStyle }): JSX.Element {
  const current = useFlairStore((s) => s.spinner)
  // the live spinner reads the store; for the other options a still drawing is enough
  if (style === current) return <Spinner size={14} />
  const icons: Record<SpinnerStyle, string> = { classic: '◌', vinyl: '💿', wave: '▂▅▃', logo: '♪' }
  return <span className="text-[11px] leading-none">{icons[style]}</span>
}

// ── mini player ───────────────────────────────────────────────────────

const SKINS: { id: MiniSkin; label: string; hint: string }[] = [
  { id: 'compact', label: tk('Compacto'), hint: tk('Uma barrinha discreta.') },
  { id: 'card', label: tk('Cartão'), hint: tk('A capa grande, como um pôster.') },
  { id: 'turntable', label: tk('Toca-discos'), hint: tk('O disco gira e o braço desce quando a música toca.') }
]

export function MiniSkinPicker(): JSX.Element {
  const skin = useFlairStore((s) => s.miniSkin)
  const set = useFlairStore((s) => s.set)
  return (
    <div>
      <h2 className="text-sm font-semibold">{t('🪟 Mini player')}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">
        {t('O visual da janelinha que fica por cima das outras (o botão de mini player na barra de música). Muda na hora, mesmo aberta.')}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {SKINS.map((s) => (
          <button
            key={s.id}
            onClick={() => set({ miniSkin: s.id })}
            className={`rounded-2xl p-3 text-left transition-colors ${skin === s.id ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'bg-[var(--bg-raised)] hover:bg-[var(--accent-soft)]'}`}
          >
            <MiniThumb skin={s.id} />
            <p className="mt-2 text-sm font-medium">{t(s.label)}</p>
            <p className="text-[11px] text-muted">{t(s.hint)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

/** a tiny drawing of each skin */
function MiniThumb({ skin }: { skin: MiniSkin }): JSX.Element {
  const bar = 'rounded-full bg-[var(--text-primary)] opacity-60'
  if (skin === 'card')
    return (
      <div className="mx-auto flex h-20 w-14 flex-col gap-1 rounded-lg bg-[var(--bg-base)] p-1.5">
        <div className="aspect-square w-full rounded bg-[var(--accent)]" />
        <div className={`h-1 w-3/4 ${bar}`} />
        <div className="h-0.5 w-full rounded-full bg-[var(--accent)]" />
      </div>
    )
  if (skin === 'turntable')
    return (
      <div className="flex h-20 items-center gap-2 rounded-lg bg-[var(--bg-base)] p-2">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#15151b] ring-4 ring-[#22222a]">
          <div className="h-5 w-5 rounded-full bg-[var(--accent)]" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className={`h-1 w-3/4 ${bar}`} />
          <div className="h-0.5 w-full rounded-full bg-[var(--accent)]" />
        </div>
      </div>
    )
  return (
    <div className="flex h-20 items-center">
      <div className="flex h-9 w-full items-center gap-2 rounded-lg bg-[var(--bg-base)] p-1.5">
        <div className="h-6 w-6 rounded bg-[var(--accent)]" />
        <div className="flex flex-1 flex-col gap-1">
          <div className={`h-1 w-3/4 ${bar}`} />
          <div className="h-0.5 w-full rounded-full bg-[var(--accent)]" />
        </div>
      </div>
    </div>
  )
}
