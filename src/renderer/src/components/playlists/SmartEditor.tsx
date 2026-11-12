import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Sparkles, Trash2, X } from 'lucide-react'
import type { Playlist, Song } from '@/types'
import type { Rule, RuleField, RuleOp, SmartRules } from '../../../../core/playlistsPlus'
import { api } from '@/services/api'
import { parseJson } from '@/utils/playlistSession'
import { t, tk, tn } from '@/i18n'

/**
 * The smart playlist editor: rules ("Gênero é K-Pop", "Tocada nos últimos
 * 30 dias"…) that pick the songs by themselves, with a live preview of how
 * many songs they find.
 */

const FIELDS: { id: RuleField; label: string; kind: 'text' | 'number' | 'bool' | 'age' }[] = [
  { id: 'genre', label: tk('Gênero'), kind: 'text' },
  { id: 'artist', label: tk('Artista'), kind: 'text' },
  { id: 'album', label: tk('Álbum'), kind: 'text' },
  { id: 'title', label: tk('Título'), kind: 'text' },
  { id: 'year', label: tk('Ano'), kind: 'number' },
  { id: 'plays', label: tk('Vezes tocada'), kind: 'number' },
  { id: 'duration', label: tk('Duração (min)'), kind: 'number' },
  { id: 'favorite', label: tk('Favorita'), kind: 'bool' },
  { id: 'added', label: tk('Adicionada'), kind: 'age' },
  { id: 'lastPlayed', label: tk('Última vez tocada'), kind: 'age' }
]

const OPS: Record<'text' | 'number' | 'bool' | 'age', { id: RuleOp; label: string }[]> = {
  text: [
    { id: 'is', label: tk('é') },
    { id: 'isNot', label: tk('não é') },
    { id: 'contains', label: tk('contém') }
  ],
  number: [
    { id: 'gte', label: tk('pelo menos') },
    { id: 'lte', label: tk('no máximo') },
    { id: 'is', label: tk('exatamente') }
  ],
  bool: [
    { id: 'yes', label: tk('sim') },
    { id: 'no', label: tk('não') }
  ],
  age: [
    { id: 'withinDays', label: tk('nos últimos (dias)') },
    { id: 'olderDays', label: tk('não nos últimos (dias)') }
  ]
}

const ORDERS: { id: SmartRules['order']; label: string }[] = [
  { id: 'random', label: tk('Aleatória') },
  { id: 'plays', label: tk('Mais tocadas') },
  { id: 'recent', label: tk('Mais recentes') },
  { id: 'year', label: tk('Ano') },
  { id: 'title', label: tk('Título') }
]

const kindOf = (f: RuleField): 'text' | 'number' | 'bool' | 'age' => FIELDS.find((x) => x.id === f)?.kind ?? 'text'

const blankRule = (): Rule => ({ field: 'genre', op: 'is', value: '' })

export function SmartEditor({
  playlist,
  onClose,
  onSaved
}: {
  /** editing one; null: a new smart playlist */
  playlist: Playlist | null
  onClose: () => void
  onSaved: (id: number) => void
}): JSX.Element {
  const initial = parseJson<SmartRules>(playlist?.rules) ?? { match: 'all', rules: [blankRule()], order: 'random', limit: 0 }
  const [name, setName] = useState(playlist?.name ?? '')
  const [rules, setRules] = useState<SmartRules>(initial)
  const [preview, setPreview] = useState<Song[] | null>(null)
  const [genres, setGenres] = useState<string[]>([])

  useEffect(() => {
    void (api.library.getSongs() as Promise<Song[]>).then((all) =>
      setGenres([...new Set(all.map((s) => (s.genre ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)))
    )
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void (api.playlists.previewRules(rules) as Promise<Song[]>).then(setPreview)
    }, 250)
    return () => window.clearTimeout(id)
  }, [rules])

  const patchRule = (i: number, patch: Partial<Rule>): void =>
    setRules((r) => ({ ...r, rules: r.rules.map((x, k) => (k === i ? { ...x, ...patch } : x)) }))

  const save = async (): Promise<void> => {
    const clean: SmartRules = { ...rules, rules: rules.rules.filter((r) => kindOf(r.field) === 'bool' || String(r.value).trim() !== '') }
    const title = name.trim() || t('Playlist inteligente')
    if (playlist) {
      await api.playlists.updateMeta(playlist.id, { name: title, rules: clean })
      onSaved(playlist.id)
    } else {
      onSaved(Number(await api.playlists.createSmart(title, clean)))
    }
    onClose()
  }

  const field = 'rounded-lg border border-white/10 bg-[var(--bg-raised)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]'

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="glass fade-in flex max-h-[90vh] w-[min(96vw,620px)] flex-col overflow-hidden rounded-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-5" style={{ background: 'linear-gradient(135deg, var(--accent-soft), transparent)' }}>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <Sparkles size={12} /> {t('Playlist inteligente')}
            </p>
            <p className="mt-1 text-xs text-muted">{t('Ela se atualiza sozinha: toda música que bater com as regras entra nela.')}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label={t('Fechar')}>
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Nome (ex.: K-Pop que eu amo)')}
            className="w-full rounded-xl border border-white/10 bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>{t('Músicas que batem com')}</span>
            <select value={rules.match} onChange={(e) => setRules({ ...rules, match: e.target.value as 'all' | 'any' })} className={field}>
              <option value="all">{t('todas as regras')}</option>
              <option value="any">{t('qualquer regra')}</option>
            </select>
          </div>
          <div className="space-y-2">
            {rules.rules.map((r, i) => {
              const kind = kindOf(r.field)
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--bg-raised)] p-2">
                  <select
                    value={r.field}
                    onChange={(e) => {
                      const f = e.target.value as RuleField
                      patchRule(i, { field: f, op: OPS[kindOf(f)][0].id, value: kindOf(f) === 'age' ? 30 : '' })
                    }}
                    className={field}
                  >
                    {FIELDS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {t(f.label)}
                      </option>
                    ))}
                  </select>
                  <select value={r.op} onChange={(e) => patchRule(i, { op: e.target.value as RuleOp })} className={field}>
                    {OPS[kind].map((o) => (
                      <option key={o.id} value={o.id}>
                        {t(o.label)}
                      </option>
                    ))}
                  </select>
                  {kind !== 'bool' && (
                    <input
                      value={String(r.value)}
                      onChange={(e) => patchRule(i, { value: kind === 'text' ? e.target.value : Number(e.target.value) || 0 })}
                      type={kind === 'text' ? 'text' : 'number'}
                      list={r.field === 'genre' ? 'smart-genres' : undefined}
                      className={`${field} min-w-0 flex-1`}
                      placeholder={kind === 'text' ? t('valor') : '0'}
                    />
                  )}
                  <button
                    onClick={() => setRules({ ...rules, rules: rules.rules.filter((_, k) => k !== i) })}
                    className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-red-400"
                    aria-label={t('Remover regra')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
            <datalist id="smart-genres">
              {genres.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <button onClick={() => setRules({ ...rules, rules: [...rules.rules, blankRule()] })} className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
              <Plus size={13} /> {t('Adicionar regra')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>{t('Ordem')}</span>
            <select value={rules.order} onChange={(e) => setRules({ ...rules, order: e.target.value as SmartRules['order'] })} className={field}>
              {ORDERS.map((o) => (
                <option key={o.id} value={o.id}>
                  {t(o.label)}
                </option>
              ))}
            </select>
            <span className="ml-2">{t('Limite')}</span>
            <select value={rules.limit} onChange={(e) => setRules({ ...rules, limit: Number(e.target.value) })} className={field}>
              {[0, 25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t('sem limite') : t('{n} músicas', { n })}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl bg-[var(--accent-soft)] px-3 py-2.5 text-xs">
            {preview === null ? (
              '…'
            ) : (
              <>
                <b>{tn(preview.length, '{n} música entra', '{n} músicas entram')}</b>
                {preview.length > 0 && <span className="text-muted"> — {preview.slice(0, 4).map((s) => s.title).join(', ')}{preview.length > 4 ? '…' : ''}</span>}
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--glass-border)] px-5 py-3">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-semibold text-muted hover:text-ink">
            {t('Cancelar')}
          </button>
          <button onClick={() => void save()} className="press rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white">
            {playlist ? t('Salvar') : t('Criar')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
