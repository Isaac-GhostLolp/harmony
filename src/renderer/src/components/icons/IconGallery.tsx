import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useIconStore, MAX_PACKS, type Stroke } from '@/store/iconStore'
import { AppIcon } from './AppIcon'
import { IconPackEditor } from './IconPackEditor'
import { PACK_NAMES, type IconSlot } from './slots'

/**
 * Settings → Ícones: the line weight of every icon in the app, and the
 * packs for the sidebar and the player bar, each shown as a little sidebar
 * and player. The user's own packs sit first, with the door to make one.
 */


const STROKES: { id: Stroke; label: string }[] = [
  { id: 'thin', label: 'Fino' },
  { id: 'normal', label: 'Normal' },
  { id: 'bold', label: 'Grosso' }
]

const SIDE: IconSlot[] = ['library', 'search', 'playlists', 'favorites', 'settings']

export function PackPreview({ pack }: { pack: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-[var(--bg-base)] p-2.5">
      <div className="flex items-center justify-between text-muted">
        {SIDE.map((s) => (
          <AppIcon key={s} slot={s} pack={pack} size={15} strokeWidth={1.8} />
        ))}
      </div>
      <div className="flex items-center justify-between text-muted">
        <AppIcon slot="shuffle" pack={pack} size={13} active={false} />
        <AppIcon slot="prev" pack={pack} size={14} />
        <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: 'var(--text-primary)', color: 'var(--bg-base)' }}>
          <AppIcon slot="play" pack={pack} size={12} />
        </span>
        <AppIcon slot="next" pack={pack} size={14} />
        <AppIcon slot="liked" pack={pack} size={13} />
      </div>
    </div>
  )
}

export function IconGallery(): JSX.Element {
  const { pack, stroke, mine, setPack, setStroke, createPack } = useIconStore()
  const [editing, setEditing] = useState<string | null>(null)

  const card = (id: string, name: string, extra?: JSX.Element): JSX.Element => (
    <div key={id} className="group relative">
      <button
        onClick={() => setPack(id)}
        className={`w-full rounded-xl p-1.5 text-left transition-colors ${
          pack === id ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--bg-raised)]'
        }`}
      >
        <PackPreview pack={id} />
        <p className="mt-1.5 truncate px-1 text-[11px] font-medium">{name}</p>
      </button>
      {extra}
    </div>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Ícones</h2>
          <p className="mt-0.5 text-xs text-muted">O estilo dos ícones da barra lateral e do player.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          Traço
          <div className="flex rounded-full bg-[var(--bg-raised)] p-0.5">
            {STROKES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStroke(s.id)}
                title={s.id === 'normal' ? 'O traço padrão' : `Traço ${s.label.toLowerCase()} em todos os ícones do app`}
                className={`rounded-full px-3 py-1 transition-colors ${
                  stroke === s.id ? 'bg-[var(--accent)] font-semibold text-[var(--on-accent,#fff)]' : 'hover:text-ink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {mine.map((m) =>
          card(
            `mine:${m.id}`,
            m.name,
            <button
              onClick={() => setEditing(m.id)}
              title="Editar pacote"
              aria-label={`Editar ${m.name}`}
              className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[var(--bg-raised)] text-muted opacity-0 shadow transition-opacity hover:text-ink group-hover:opacity-100"
            >
              <Pencil size={11} />
            </button>
          )
        )}
        {Object.entries(PACK_NAMES).map(([id, name]) => card(id, name))}
        {mine.length < MAX_PACKS && (
          <button
            onClick={() => {
              const base = pack.startsWith('mine:') ? 'classic' : pack
              const id = createPack('Meu pacote', base)
              setEditing(id)
            }}
            className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--glass-border)] text-[11px] text-muted transition-colors hover:border-[var(--accent)] hover:text-ink"
          >
            <Plus size={16} />
            Criar com suas imagens
          </button>
        )}
      </div>

      {editing && <IconPackEditor id={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
