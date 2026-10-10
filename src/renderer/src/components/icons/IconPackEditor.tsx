import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, Trash2, Check } from 'lucide-react'
import { useIconStore, BUILTIN_PACKS, ICON_EXT, MAX_ICON_MB } from '@/store/iconStore'
import { useEscape } from '@/components/views/useEscape'
import { AppIcon } from './AppIcon'
import { SLOTS, PACK_NAMES, type IconSlot } from './slots'
import { t } from '@/i18n'

/**
 * Making an icon pack from your own images. Every slot of the sidebar and
 * the player takes an image (click it, or drop a file on it); many at once
 * can be brought in by naming the files after the icons (play.png,
 * biblioteca.svg…). Slots left empty show the base pack. One-colour icons
 * can be painted with the theme's colours, so they light up like the rest.
 */

const ACCEPT = ICON_EXT.map((e) => `.${e}`).join(',')

export function IconPackEditor({ id, onClose }: { id: string; onClose: () => void }): JSX.Element | null {
  const pack = useIconStore((s) => s.mine.find((m) => m.id === id))
  const current = useIconStore((s) => s.pack)
  const { editPack, importImages, clearSlot, removePack, setPack } = useIconStore()
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [over, setOver] = useState<IconSlot | 'all' | null>(null)
  const bulkRef = useRef<HTMLInputElement>(null)
  const slotRef = useRef<HTMLInputElement>(null)
  const slotFor = useRef<IconSlot | null>(null)
  const close = useCallback(() => onClose(), [onClose])
  useEscape(close, true)

  if (!pack) return null
  const filled = Object.keys(pack.icons).length
  const using = current === `mine:${pack.id}`

  const bring = async (files: File[], slot?: IconSlot): Promise<void> => {
    if (!files.length) return
    setNotice(await importImages(pack.id, files, slot))
  }

  const group = (g: 'sidebar' | 'player', title: string): JSX.Element => (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
        {SLOTS.filter((s) => s.group === g).map((s) => {
          const has = !!pack.icons[s.id]
          return (
            <div key={s.id} className="group relative">
              <button
                onClick={() => {
                  slotFor.current = s.id
                  slotRef.current?.click()
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  e.stopPropagation()
                  setOver(s.id)
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOver(null)
                  void bring([...e.dataTransfer.files].slice(0, 1), s.id)
                }}
                title={has ? t('Trocar a imagem de {name}', { name: t(s.label) }) : t('Escolher uma imagem para {name}', { name: t(s.label) })}
                className={`flex w-full flex-col items-center gap-1.5 rounded-xl border px-1 pb-1.5 pt-2.5 transition-colors ${
                  over === s.id
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : has
                      ? 'border-[var(--glass-border)] bg-[var(--bg-raised)]'
                      : 'border-dashed border-[var(--glass-border)] hover:border-[var(--accent)]'
                }`}
              >
                <span className={`grid h-7 place-items-center ${has ? 'text-ink' : 'text-muted opacity-60'}`}>
                  <AppIcon slot={s.id} pack={`mine:${pack.id}`} size={22} />
                </span>
                <span className="w-full truncate text-center text-[10px] text-muted">{t(s.label)}</span>
              </button>
              {has && (
                <button
                  onClick={() => clearSlot(pack.id, s.id)}
                  title={t('Voltar ao ícone do pacote base')}
                  aria-label={t('Tirar a imagem de {name}', { name: t(s.label) })}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--bg-base)] text-muted opacity-0 shadow transition-opacity hover:text-red-400 group-hover:opacity-100"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className={`glass glass-panel fade-rise flex max-h-[min(720px,calc(100vh-32px))] w-full max-w-[720px] flex-col rounded-2xl ${
          over === 'all' ? 'ring-2 ring-[var(--accent)]' : ''
        }`}
        style={{ background: 'color-mix(in srgb, var(--bg-base) 96%, transparent)' }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setOver('all')
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(null)
          void bring([...e.dataTransfer.files])
        }}
      >
        <div className="flex items-start gap-3 border-b border-[var(--glass-border)] p-4">
          <div className="min-w-0 flex-1">
            <input
              value={pack.name}
              onChange={(e) => editPack(pack.id, { name: e.target.value })}
              maxLength={40}
              className="w-full bg-transparent text-lg font-semibold outline-none"
              aria-label={t('Nome do pacote')}
            />
            <p className="text-[11px] text-muted">
              {t('{done} de {total} ícones com imagem sua · os outros vêm do pacote base', { done: filled, total: SLOTS.length })}
            </p>
          </div>
          <button onClick={close} aria-label={t('Fechar')} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-[var(--bg-raised)] hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--glass-border)] px-4 py-3 text-xs">
          <label className="flex items-center gap-2 text-muted">
            {t('Pacote base')}
            <select
              value={pack.base}
              onChange={(e) => editPack(pack.id, { base: e.target.value })}
              className="h-7 rounded-lg border border-[var(--glass-border)] bg-[var(--bg-raised)] px-1.5 text-ink outline-none"
            >
              {BUILTIN_PACKS.map((b) => (
                <option key={b} value={b}>
                  {t(PACK_NAMES[b])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-muted" title={t('Para ícones de uma cor só: eles ganham a cor do texto e do destaque do tema, como os outros')}>
            <input type="checkbox" checked={pack.tint} onChange={(e) => editPack(pack.id, { tint: e.target.checked })} className="accent-[var(--accent)]" />
            {t('Pintar com as cores do tema')}
          </label>
          <span className="flex-1" />
          <button
            onClick={() => bulkRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full bg-[var(--bg-raised)] px-3 py-1.5 font-medium hover:text-ink"
            title={t('Dê aos arquivos o nome do ícone: play.png, biblioteca.svg, favoritos.gif…')}
          >
            <Upload size={13} /> {t('Importar vários')}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin' }}>
          <p className="text-[11px] leading-relaxed text-muted">
            {t('Clique num ícone para escolher a imagem, ou solte o arquivo em cima dele. PNG, SVG, WebP, GIF animado e outros, até {mb} MB.', { mb: MAX_ICON_MB })}{' '}
            {t('Para trazer vários de uma vez, dê aos arquivos o nome do ícone')} (<b>{t('play.png')}</b>, <b>{t('biblioteca.svg')}</b>,{' '}
            <b>{t('favoritos.gif')}</b>…) {t('e use')} <b>{t('Importar vários')}</b> {t('ou solte todos nesta janela.')}
          </p>
          {group('sidebar', t('Barra lateral'))}
          {group('player', t('Player'))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--glass-border)] p-3 text-xs">
          {confirmDelete ? (
            <>
              <span className="min-w-0 flex-1 text-muted">
                {t('Excluir “{name}” e as imagens dele?', { name: pack.name })}
              </span>
              <button onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-1.5 hover:bg-[var(--bg-raised)]">
                {t('Cancelar')}
              </button>
              <button
                onClick={() => {
                  removePack(pack.id)
                  close()
                }}
                className="rounded-full bg-red-500/90 px-3 py-1.5 font-semibold text-white"
              >
                {t('Excluir')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-[var(--bg-raised)] hover:text-red-400"
              >
                <Trash2 size={13} /> {t('Excluir pacote')}
              </button>
              <span className={`min-w-0 flex-1 truncate ${notice ? 'text-[var(--accent)]' : ''}`}>{notice}</span>
              <button
                onClick={() => {
                  setPack(`mine:${pack.id}`)
                  close()
                }}
                className="press flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-1.5 font-semibold text-[var(--on-accent,#fff)]"
              >
                <Check size={13} /> {using ? t('Pronto') : t('Usar este pacote')}
              </button>
            </>
          )}
        </div>

        <input
          ref={bulkRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void bring(files)
          }}
        />
        <input
          ref={slotRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (slotFor.current) void bring(files.slice(0, 1), slotFor.current)
          }}
        />
      </div>
    </div>,
    document.body
  )
}
