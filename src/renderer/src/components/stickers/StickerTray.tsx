import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, RotateCcw, RotateCw, Minus, Plus, Trash2, ArrowUpToLine, ImagePlus, X } from 'lucide-react'
import {
  useStickerStore,
  MAX_STICKERS,
  MAX_FILE_MB,
  CUSTOM_ANIMS,
  STICKER_FILE_EXT,
  type CustomAnim
} from '@/store/stickerStore'
import { STICKERS, findSticker } from './catalog'
import { StickerArt } from './art'
import { beginDrag, DragGhost } from './drag'
import { t, tk } from '@/i18n'

/**
 * Sticking mode: a sheet of stickers floating over the app. Drag one onto
 * the sidebar, the player bar or a playlist cover (they light up); click
 * one to drop it on the sidebar. Placed stickers can be dragged anywhere,
 * resized with the wheel, turned with Shift + wheel, and peeled off by
 * dragging them back to the sheet (or Delete).
 *
 * "Meus adesivos" holds the user's own images (chosen with the button or
 * dropped on the sheet from the file manager); each can have the white
 * border and a movement of its own. Placed stickers of both kinds share one
 * limit.
 *
 * Also renders the shared SVG defs every sticker uses (the die-cut white
 * border and its shadow, the holographic and CD foils), so it is always
 * mounted.
 */

export function StickerDefs(): JSX.Element {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {/* die cut: the shape grown into a white border, with a soft shadow below.
            Grown by blurring the silhouette and cutting it sharp again (a round
            outline); feMorphology grows with a square and flattens every curve. */}
        <filter id="stk-cut" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3.2" />
          <feComponentTransfer result="grown">
            <feFuncA type="linear" slope="18" intercept="-0.7" />
          </feComponentTransfer>
          <feFlood floodColor="#fff" />
          <feComposite in2="grown" operator="in" result="border" />
          <feGaussianBlur in="grown" stdDeviation="2.4" />
          <feOffset dy="2.6" result="blurred" />
          <feFlood floodColor="#000" floodOpacity=".38" />
          <feComposite in2="blurred" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="border" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* the user's stickers without the border: only the shadow */}
        <filter id="stk-shadow" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" />
          <feOffset dy="2.6" result="blurred" />
          <feFlood floodColor="#000" floodOpacity=".38" />
          <feComposite in2="blurred" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="stk-cd" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c8f7ff" />
          <stop offset=".3" stopColor="#f5c6ff" />
          <stop offset=".55" stopColor="#fff7b8" />
          <stop offset=".8" stopColor="#b9ffd8" />
          <stop offset="1" stopColor="#c6cbff" />
        </linearGradient>
        <linearGradient id="stk-holo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9ff3">
            <animate attributeName="stop-color" values="#ff9ff3;#7efff5;#fff59d;#ff9ff3" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset=".5" stopColor="#7efff5">
            <animate attributeName="stop-color" values="#7efff5;#fff59d;#ff9ff3;#7efff5" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="1" stopColor="#a29bfe">
            <animate attributeName="stop-color" values="#a29bfe;#ff9ff3;#7efff5;#a29bfe" dur="3s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
    </svg>
  )
}

const ZONE_NAMES: Record<string, string> = { sidebar: tk('na barra lateral'), player: tk('no player') }
const zoneName = (z: string): string => t(ZONE_NAMES[z] ?? (z.startsWith('playlist:') ? tk('na capa da playlist') : z))
const ACCEPT = STICKER_FILE_EXT.map((e) => `.${e}`).join(',')

export function StickerTray(): JSX.Element {
  const editing = useStickerStore((s) => s.editing)
  const count = useStickerStore((s) => s.placed.length)
  const library = useStickerStore((s) => s.library)
  const selected = useStickerStore((s) => s.placed.find((p) => p.key === s.selected) ?? null)
  const { setEditing, tweak, remove, raise, select, importFiles, editCustom, removeCustom } = useStickerStore()
  const [folded, setFolded] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const custom = selected?.id.startsWith('u:') ? library.find((c) => c.id === selected.id) : undefined
  const toDelete = deleting ? library.find((c) => c.id === deleting) : undefined
  const full = count >= MAX_STICKERS

  useEffect(() => {
    document.documentElement.classList.toggle('stk-editing', editing)
    if (!editing) {
      setNotice(null)
      setDeleting(null)
    }
  }, [editing])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const st = useStickerStore.getState()
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        if (st.selected) st.select(null)
        else st.setEditing(false)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selected) {
        e.preventDefault()
        st.remove(st.selected)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing])

  const addFiles = async (files: File[]): Promise<void> => {
    if (!files.length) return
    const err = await importFiles(files)
    setNotice(err)
  }

  const pick = (id: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (full) {
      setNotice(t('Você já colou {n} adesivos. Descole algum para colar outro.', { n: MAX_STICKERS }))
      return
    }
    beginDrag(e, { id, r: 0, s: 1 })
  }

  return (
    <>
      <StickerDefs />
      <DragGhost />
      {editing && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[112px] z-[120] flex justify-center px-4">
          <div
            data-stk-tray
            className={`glass glass-panel fade-rise pointer-events-auto relative w-full max-w-[660px] rounded-2xl p-3 shadow-2xl ${
              dropping ? 'ring-2 ring-[var(--accent)]' : ''
            }`}
            style={{ background: 'color-mix(in srgb, var(--bg-base) 95%, transparent)' }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return
              e.preventDefault()
              setDropping(true)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDropping(false)
              setFolded(false)
              void addFiles([...e.dataTransfer.files])
            }}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t('Adesivos')}</p>
                <p className="text-[11px] leading-snug text-muted">
                  {t('Arraste para a barra lateral, o player ou a capa de uma playlist. Para descolar, arraste de volta para cá.')}
                </p>
              </div>
              <span className={`shrink-0 text-[11px] ${full ? 'font-semibold text-[var(--accent)]' : 'text-muted'}`}>
                {count}/{MAX_STICKERS}
              </span>
              <button
                onClick={() => setFolded((f) => !f)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-[var(--bg-raised)] hover:text-ink"
                aria-label={folded ? t('Mostrar adesivos') : t('Recolher')}
                title={folded ? t('Mostrar adesivos') : t('Recolher')}
              >
                {folded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="press shrink-0 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-[var(--on-accent,#fff)]"
              >
                {t('Concluir')}
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                void addFiles(files)
              }}
            />

            {!folded && (
              <div className="mt-2 max-h-[208px] overflow-y-auto p-1 pr-2" style={{ scrollbarWidth: 'thin' }}>
                <SheetTitle>{t('Meus adesivos')}</SheetTitle>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1">
                  <button
                    onClick={() => fileRef.current?.click()}
                    title={t('PNG, JPG, WebP, GIF, SVG… até {mb} MB', { mb: MAX_FILE_MB })}
                    className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-[var(--glass-border)] text-[10px] text-muted transition-colors hover:border-[var(--accent)] hover:text-ink"
                  >
                    <ImagePlus size={17} />
                    {t('Adicionar')}
                  </button>
                  {library.map((c) => (
                    <div key={c.id} className="group relative">
                      <button
                        title={c.name}
                        aria-label={t('Colar {name}', { name: c.name })}
                        className="stk-pick grid aspect-square w-full place-items-center rounded-xl p-1.5 transition-colors hover:bg-[var(--bg-raised)]"
                        onPointerDown={pick(c.id)}
                      >
                        <StickerArt id={c.id} />
                      </button>
                      <button
                        onClick={() => setDeleting(c.id)}
                        aria-label={t('Excluir {name}', { name: c.name })}
                        title={t('Excluir este adesivo')}
                        className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--bg-base)] text-muted opacity-0 shadow transition-opacity hover:text-red-400 group-hover:opacity-100"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                {library.length === 0 && (
                  <p className="mt-1 text-[10px] text-muted">
                    {t('Use suas próprias imagens: PNG, JPG, WebP, GIF animado ou SVG. Também dá para soltar os arquivos aqui.')}
                  </p>
                )}

                <SheetTitle>{t('Do Harmony')}</SheetTitle>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1">
                  {STICKERS.map((s) => (
                    <button
                      key={s.id}
                      title={t(s.name)}
                      aria-label={t('Colar {name}', { name: t(s.name) })}
                      className="stk-pick grid aspect-square place-items-center rounded-xl p-1.5 transition-colors hover:bg-[var(--bg-raised)]"
                      onPointerDown={pick(s.id)}
                    >
                      <StickerArt id={s.id} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 flex min-h-[32px] flex-wrap items-center gap-1.5 border-t border-[var(--glass-border)] pt-2 text-[11px] text-muted">
              {toDelete ? (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    {t('Excluir “{name}”? Ele também sai de todos os lugares onde está colado.', { name: toDelete.name })}
                  </span>
                  <button onClick={() => setDeleting(null)} className="rounded-full px-3 py-1 hover:bg-[var(--bg-raised)] hover:text-ink">
                    {t('Cancelar')}
                  </button>
                  <button
                    onClick={() => {
                      removeCustom(toDelete.id)
                      setDeleting(null)
                    }}
                    className="rounded-full bg-red-500/90 px-3 py-1 font-semibold text-white"
                  >
                    {t('Excluir')}
                  </button>
                </>
              ) : notice ? (
                <span className="text-[var(--accent)]">{notice}</span>
              ) : selected ? (
                <>
                  <span className="mr-1 min-w-0 truncate">
                    <b className="text-ink">{custom ? custom.name : t(findSticker(selected.id)?.name ?? '')}</b> {zoneName(selected.zone)}
                  </span>
                  <span className="flex-1" />
                  {custom && (
                    <>
                      <select
                        value={custom.anim}
                        onChange={(e) => editCustom(custom.id, { anim: e.target.value as CustomAnim })}
                        title={t('Movimento (vale para todas as cópias)')}
                        className="h-7 rounded-lg border border-[var(--glass-border)] bg-[var(--bg-raised)] px-1.5 text-[11px] text-ink outline-none"
                      >
                        {CUSTOM_ANIMS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {t(a.label)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => editCustom(custom.id, { outline: !custom.outline })}
                        title={t('Contorno branco (vale para todas as cópias)')}
                        className={`h-7 rounded-lg px-2 transition-colors ${
                          custom.outline ? 'bg-[var(--accent-soft)] text-ink' : 'hover:bg-[var(--bg-raised)] hover:text-ink'
                        }`}
                      >
                        {t('Contorno')}
                      </button>
                    </>
                  )}
                  <TrayBtn label={t('Girar para a esquerda')} onClick={() => tweak(selected.key, { r: selected.r - 15 })}>
                    <RotateCcw size={14} />
                  </TrayBtn>
                  <TrayBtn label={t('Girar para a direita')} onClick={() => tweak(selected.key, { r: selected.r + 15 })}>
                    <RotateCw size={14} />
                  </TrayBtn>
                  <TrayBtn label={t('Diminuir')} onClick={() => tweak(selected.key, { s: selected.s / 1.15 })}>
                    <Minus size={14} />
                  </TrayBtn>
                  <TrayBtn label={t('Aumentar')} onClick={() => tweak(selected.key, { s: selected.s * 1.15 })}>
                    <Plus size={14} />
                  </TrayBtn>
                  <TrayBtn label={t('Trazer para a frente')} onClick={() => raise(selected.key)}>
                    <ArrowUpToLine size={14} />
                  </TrayBtn>
                  <TrayBtn
                    label={t('Descolar')}
                    danger
                    onClick={() => {
                      remove(selected.key)
                      select(null)
                    }}
                  >
                    <Trash2 size={14} />
                  </TrayBtn>
                </>
              ) : (
                <span>
                  {count > 0
                    ? t('Clique num adesivo colado para ajustar. Roda do mouse: tamanho · Shift + roda: girar · Delete: descolar.')
                    : t('Dica: os adesivos animados se mexem sozinhos, e os que pulsam seguem a batida da música.')}
                </span>
              )}
            </div>

            {dropping && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--bg-base)_70%,transparent)] text-sm font-semibold">
                {t('Solte para adicionar aos seus adesivos')}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function SheetTitle({ children }: { children: ReactNode }): JSX.Element {
  return <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted first:mt-0">{children}</p>
}

function TrayBtn({
  label,
  onClick,
  danger,
  children
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-[var(--bg-raised)] ${
        danger ? 'hover:text-red-400' : 'hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
