import { useState } from 'react'
import { Palette, Plus, Sun, Moon } from 'lucide-react'
import { useAppearanceStore, sourceName } from '@/store/appearanceStore'
import { useUiStore } from '@/store/uiStore'
import { PRESETS } from '@/utils/appearance'
import { ThemeCard } from './ThemeCard'
import { ConfirmDialog, InputDialog } from '@/components/InputDialog'

/**
 * Settings → the theme picker: your own themes, the new looks and the
 * classics, each shown as a miniature of the app; plus the door to the
 * appearance studio and the day/night switch.
 */
export function ThemeGallery(): JSX.Element {
  const { look, source, edited, mine, schedule, choose, remove, rename, setSchedule, setStudioOpen } = useAppearanceStore()
  const world = useUiStore((s) => s.world)
  const setWorld = useUiStore((s) => s.setWorld)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const pick = (src: string): void => {
    setWorld(null)
    choose(src)
  }
  const isOn = (src: string): boolean => !world && source === src && !edited

  const allSources = [
    ...mine.map((m) => ({ id: `mine:${m.id}`, name: m.name })),
    ...PRESETS.map((p) => ({ id: `preset:${p.id}`, name: p.name }))
  ]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Temas</h2>
          <p className="mt-0.5 text-xs text-muted">Escolha um tema ou crie o seu, com as suas cores, transparência e cantos.</p>
        </div>
        <button
          onClick={() => setStudioOpen(true)}
          className="press flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white"
        >
          <Palette size={13} /> Personalizar
        </button>
      </div>

      {edited && !world && (
        <button
          onClick={() => setStudioOpen(true)}
          className="mb-3 flex w-full items-center gap-3 rounded-xl bg-[var(--accent-soft)] p-2 text-left"
        >
          <div className="w-28 shrink-0">
            <ThemeCard name="" look={look} active onClick={() => setStudioOpen(true)} />
          </div>
          <div className="min-w-0 text-xs">
            <p className="font-semibold">Em uso: {sourceName(source, mine)} (editado)</p>
            <p className="mt-0.5 text-[11px] text-muted">Abra o estúdio para salvar como um tema seu.</p>
          </div>
        </button>
      )}

      <Shelf title="Meus temas">
        {mine.map((m) => (
          <ThemeCard
            key={m.id}
            name={m.name}
            look={m.look}
            active={isOn(`mine:${m.id}`)}
            onClick={() => pick(`mine:${m.id}`)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ id: m.id, x: e.clientX, y: e.clientY })
            }}
          />
        ))}
        <button
          onClick={() => setStudioOpen(true)}
          className="flex aspect-[16/10] flex-col items-center justify-center gap-1 self-start rounded-xl border border-dashed border-[var(--glass-border)] text-[11px] text-muted transition-colors hover:border-[var(--accent)] hover:text-ink"
        >
          <Plus size={16} />
          Criar tema
        </button>
      </Shelf>
      {mine.length > 0 && <p className="-mt-1 mb-3 text-[10px] text-muted">Clique com o botão direito num tema seu para renomear ou excluir.</p>}

      <Shelf title="Novos">
        {PRESETS.filter((p) => p.group === 'new').map((p) => (
          <ThemeCard key={p.id} name={p.name} look={p.look} badge="novo" active={isOn(`preset:${p.id}`)} onClick={() => pick(`preset:${p.id}`)} />
        ))}
      </Shelf>
      <Shelf title="Clássicos">
        {PRESETS.filter((p) => p.group === 'classic').map((p) => (
          <ThemeCard key={p.id} name={p.name} look={p.look} active={isOn(`preset:${p.id}`)} onClick={() => pick(`preset:${p.id}`)} />
        ))}
      </Shelf>

      {/* day / night */}
      <div className="mt-2 rounded-2xl bg-[var(--bg-raised)] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold">🌗 Tema por horário</p>
            <p className="text-[11px] text-muted">Troca sozinho entre um tema de dia e um de noite.</p>
          </div>
          <button
            onClick={() => setSchedule({ enabled: !schedule.enabled })}
            role="switch"
            aria-checked={schedule.enabled}
            aria-label="Tema por horário"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              schedule.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-base)]'
            }`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${schedule.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        {schedule.enabled && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(['day', 'night'] as const).map((slot) => (
              <div key={slot} className="flex items-center gap-2 rounded-xl bg-[var(--bg-base)] p-2">
                {slot === 'day' ? <Sun size={14} className="shrink-0 text-amber-400" /> : <Moon size={14} className="shrink-0 text-indigo-300" />}
                <select
                  value={schedule[slot]}
                  onChange={(e) => setSchedule({ [slot]: e.target.value })}
                  aria-label={slot === 'day' ? 'Tema de dia' : 'Tema de noite'}
                  className="min-w-0 flex-1 rounded-md bg-transparent text-xs outline-none"
                >
                  {allSources.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[var(--bg-base)]">
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-muted">a partir das</span>
                <select
                  value={slot === 'day' ? schedule.dayAt : schedule.nightAt}
                  onChange={(e) => setSchedule(slot === 'day' ? { dayAt: Number(e.target.value) } : { nightAt: Number(e.target.value) })}
                  aria-label={slot === 'day' ? 'Hora do dia' : 'Hora da noite'}
                  className="rounded-md bg-transparent text-xs tabular-nums outline-none"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h} className="bg-[var(--bg-base)]">
                      {String(h).padStart(2, '0')}h
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {menu && (
        <div className="fixed inset-0 z-[95]" onMouseDown={() => setMenu(null)}>
          <div
            className="glass absolute flex w-40 flex-col rounded-xl p-1 text-xs"
            style={{ left: menu.x, top: menu.y, background: 'var(--bg-base)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className="rounded-lg px-3 py-2 text-left hover:bg-[var(--bg-raised)]" onClick={() => { setRenaming(menu.id); setMenu(null) }}>
              Renomear
            </button>
            <button className="rounded-lg px-3 py-2 text-left text-red-400 hover:bg-[var(--bg-raised)]" onClick={() => { setDeleting(menu.id); setMenu(null) }}>
              Excluir
            </button>
          </div>
        </div>
      )}
      <InputDialog
        open={renaming !== null}
        title="Renomear tema"
        initialValue={mine.find((m) => m.id === renaming)?.name ?? ''}
        confirmLabel="Salvar"
        onConfirm={(v) => {
          if (renaming) rename(renaming, v)
          setRenaming(null)
        }}
        onCancel={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Excluir tema"
        message={`Excluir “${mine.find((m) => m.id === deleting)?.name ?? ''}”? Se ele estiver em uso, a aparência continua igual até você trocar.`}
        confirmLabel="Excluir"
        danger
        onConfirm={() => {
          if (deleting) remove(deleting)
          setDeleting(null)
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function Shelf({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1.5">{children}</div>
    </div>
  )
}

