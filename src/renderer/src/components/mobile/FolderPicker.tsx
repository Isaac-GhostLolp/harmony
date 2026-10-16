import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import {
  answerRequest,
  currentRequest,
  folderTree,
  guessMusicFolders,
  isInside,
  onRequest,
  type FolderNode
} from '@/platform/android/folders'
import { t, tn } from '@/i18n'
import { useBackCloses } from './back'

/**
 * "Onde estão suas músicas?": the folders of the phone that hold audio, as
 * a tree with how many songs each has. Ticking a folder takes everything
 * inside it; the library only keeps songs from the ticked folders.
 */
export function FolderPicker(): JSX.Element | null {
  const request = useSyncExternalStore(onRequest, currentRequest)
  if (!request) return null
  return <Picker key={request.files.length} files={request.files} chosen={request.chosen} />
}

function Picker({ files, chosen }: { files: { path: string }[]; chosen: string[] }): JSX.Element {
  const tree = useMemo(() => folderTree(files), [files])
  const [selected, setSelected] = useState<string[]>(() => (chosen.length ? chosen : guessMusicFolders(tree)))
  const [open, setOpen] = useState<Set<string>>(() => {
    // start with the storages and the chosen folders' parents unfolded
    const s = new Set(tree.map((r) => r.path))
    for (const c of selected) for (const r of tree) if (isInside(c, r.path)) markParents(r, c, s)
    return s
  })
  const cancel = useCallback(() => answerRequest(null), [])
  useBackCloses(true, cancel)

  const covered = (path: string): boolean => selected.some((s) => isInside(path, s))
  const toggle = (path: string): void =>
    setSelected((sel) =>
      sel.includes(path)
        ? sel.filter((s) => s !== path)
        : // ticking a folder replaces the ticks inside it
          [...sel.filter((s) => !isInside(s, path)), path]
    )
  const songs = files.filter((f) => covered(f.path)).length

  const row = (n: FolderNode, depth: number): JSX.Element => {
    const isOpen = open.has(n.path)
    const byParent = !selected.includes(n.path) && covered(n.path)
    const on = selected.includes(n.path) || byParent
    return (
      <div key={n.path}>
        <div className="flex items-center gap-1 rounded-xl py-1 pr-2" style={{ paddingLeft: depth * 16 }}>
          <button
            className={`grid h-9 w-8 shrink-0 place-items-center text-muted ${n.children.length ? '' : 'invisible'}`}
            onClick={() =>
              setOpen((o) => {
                const next = new Set(o)
                if (next.has(n.path)) next.delete(n.path)
                else next.add(n.path)
                return next
              })
            }
            aria-label={isOpen ? t('Fechar pasta') : t('Abrir pasta')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }}>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <button
            className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left ${byParent ? 'opacity-60' : ''}`}
            onClick={() => !byParent && toggle(n.path)}
            disabled={byParent}
          >
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                on ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--text-muted)]'
              }`}
            >
              {on && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent,#fff)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">📁 {n.label}</span>
              <span className="block text-[11px] text-muted">{tn(n.count, '{n} áudio', '{n} áudios')}</span>
            </span>
          </button>
        </div>
        {isOpen && n.children.map((c) => row(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className="m-folders fixed inset-0 z-[150] flex flex-col bg-[var(--bg-base)]">
      <div className="px-5 pb-3 pt-5">
        <h2 className="text-lg font-bold">{t('Onde estão suas músicas?')}</h2>
        <p className="mt-1 text-xs text-muted">
          {t('Marque as pastas com as suas músicas. O Harmony só mostra o que estiver dentro delas — áudios do WhatsApp, gravações e toques ficam de fora.')}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {tree.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted">{t('Nenhum áudio encontrado neste celular.')}</p>}
        {tree.map((root) => (
          <div key={root.path} className="mb-3">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {root.path.startsWith('/storage/emulated') ? t('Neste celular') : t('Cartão de memória')}
            </p>
            {root.children.map((c) => row(c, 0))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--glass-border)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <button onClick={cancel} className="rounded-full px-4 py-3 text-sm text-muted">
          {t('Cancelar')}
        </button>
        <button
          onClick={() => answerRequest(selected)}
          disabled={selected.length === 0}
          className="flex-1 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent,#fff)] disabled:opacity-40"
        >
          {selected.length === 0 ? t('Marque pelo menos uma pasta') : tn(songs, 'Usar estas pastas · {n} música', 'Usar estas pastas · {n} músicas')}
        </button>
      </div>
    </div>
  )
}

/** unfolds every folder on the way from `node` down to `target` */
function markParents(node: FolderNode, target: string, out: Set<string>): boolean {
  if (node.path === target) return true
  for (const c of node.children) {
    if (isInside(target, c.path) && markParents(c, target, out)) {
      out.add(node.path)
      return true
    }
  }
  return false
}
