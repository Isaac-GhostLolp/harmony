import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Smile, X } from 'lucide-react'
import type { Playlist } from '@/types'
import { extractDominantColor } from '@/utils/extractColor'

const EMOJI_CHOICES = [
  '🎵', '🔥', '💜', '🌙', '☀️', '🌊', '🍃', '⚡', '🎸', '🎧',
  '✨', '🌈', '❤️', '💪', '😌', '🎉', '🚗', '📚', '☕', '🏃'
]

/**
 * Playlist personalization modal: cover image (with dominant-color extraction),
 * emoji picker, name and description. Everything is saved via playlists.updateMeta.
 */
export function PlaylistEditor({
  playlist,
  onClose,
  onSaved
}: {
  playlist: Playlist
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [name, setName] = useState(playlist.name)
  const [description, setDescription] = useState(playlist.description ?? '')
  const [emoji, setEmoji] = useState(playlist.emoji ?? '')
  const [image, setImage] = useState<string | null>(playlist.image ?? null)
  const [color, setColor] = useState<string | null>(playlist.color ?? null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const url = reader.result as string
      setImage(url)
      const c = await extractDominantColor(url)
      if (c) setColor(c)
    }
    reader.readAsDataURL(file)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    await window.harmony.playlists.updateMeta(playlist.id, {
      name: name.trim() || playlist.name,
      description: description.trim(),
      emoji,
      image,
      color: color ?? undefined
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="glass fade-in w-[min(94vw,460px)] overflow-hidden rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header with color-tinted cover */}
        <div
          className="relative flex items-end gap-4 p-5"
          style={{
            background: color
              ? `linear-gradient(135deg, ${color}, transparent)`
              : 'linear-gradient(135deg, var(--accent-soft), transparent)'
          }}
        >
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--bg-raised)] shadow-lg"
            title="Escolher imagem"
          >
            {image ? (
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : emoji ? (
              <span className="text-4xl">{emoji}</span>
            ) : (
              <Camera size={22} className="text-muted" />
            )}
            <div className="absolute inset-0 hidden place-items-center bg-black/50 group-hover:grid">
              <Camera size={20} className="text-white" />
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[11px] uppercase tracking-wide text-muted">Playlist</p>
            <p className="truncate text-lg font-semibold">{name || 'Sem nome'}</p>
          </div>
          <button onClick={onClose} className="self-start text-muted hover:text-ink" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* name + emoji */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nome</label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="Nome da playlist"
              />
              <div className="relative">
                <button
                  onClick={() => setShowEmoji((v) => !v)}
                  className="grid h-full w-11 place-items-center rounded-xl border border-white/10 bg-[var(--bg-raised)] text-lg hover:border-[var(--accent)]"
                  title="Emoji"
                >
                  {emoji || <Smile size={16} className="text-muted" />}
                </button>
                {showEmoji && (
                  <div className="glass absolute right-0 top-12 z-10 grid w-56 grid-cols-6 gap-1 rounded-xl p-2">
                    <button
                      onClick={() => {
                        setEmoji('')
                        setShowEmoji(false)
                      }}
                      className="col-span-6 mb-1 rounded-md py-1 text-[11px] text-muted hover:bg-[var(--bg-raised)]"
                    >
                      Sem emoji
                    </button>
                    {EMOJI_CHOICES.map((em) => (
                      <button
                        key={em}
                        onClick={() => {
                          setEmoji(em)
                          setShowEmoji(false)
                        }}
                        className="grid h-8 place-items-center rounded-md text-lg hover:bg-[var(--bg-raised)]"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={200}
              className="w-full resize-none rounded-xl border border-white/10 bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Do que é feita essa playlist? Uma vibe, um momento…"
            />
            <p className="mt-1 text-right text-[10px] text-muted">{description.length}/200</p>
          </div>

          {image && color && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span
                className="h-4 w-4 rounded-full ring-1 ring-white/20"
                style={{ background: color }}
              />
              Cor extraída da imagem
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-xs font-semibold text-muted hover:text-ink"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="press rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
