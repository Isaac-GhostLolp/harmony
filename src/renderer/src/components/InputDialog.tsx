import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders modal content into document.body via a portal. Without this, an
 * ancestor with a CSS transform (our fade-in/fade-rise animations) becomes the
 * containing block for `position: fixed`, so the overlay anchored to the top of
 * that animated container instead of the viewport — which is why the delete
 * confirmation used to appear at the top of the page.
 */
function ModalPortal({ children }: { children: React.ReactNode }): JSX.Element {
  return createPortal(children, document.body)
}

/**
 * A small in-app modal to replace window.prompt()/confirm(), which Electron
 * disables in packaged builds (they silently return null/false — that was why
 * "New playlist" appeared to do nothing).
 */
export function InputDialog({
  open,
  title,
  label,
  initialValue = '',
  confirmLabel = 'OK',
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  label?: string
  initialValue?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}): JSX.Element | null {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      // focus + select on the next tick so the field is ready
      const t = window.setTimeout(() => inputRef.current?.select(), 30)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [open, initialValue])

  if (!open) return null

  const submit = (): void => {
    if (value.trim()) onConfirm(value.trim())
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <div
        className="glass w-[min(92vw,380px)] rounded-2xl p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {label && <p className="mt-1 text-xs text-muted">{label}</p>}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
          className="mt-3 w-full rounded-xl border border-white/10 bg-[var(--bg-raised)] px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)]"
          placeholder="Nome…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

/** Confirmation modal replacing window.confirm(). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element | null {
  if (!open) return null
  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <div
        className="glass w-[min(92vw,380px)] rounded-2xl p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {message && <p className="mt-1 text-xs text-muted">{message}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-xs font-semibold text-white ${
              danger ? 'bg-red-500/90 hover:bg-red-500' : 'bg-[var(--accent)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
