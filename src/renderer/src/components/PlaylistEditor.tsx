import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Smile, X, Palette, Grid2x2 } from 'lucide-react'
import type { Playlist } from '@/types'
import type { PlayMode, Vibe } from '../../../core/playlistsPlus'
import { extractDominantColor } from '@/utils/extractColor'
import { DEFAULT_PLAY, EMPTY_VIBE, parseJson, refreshActive } from '@/utils/playlistSession'
import { WORLDS } from '@/worlds/registry'
import { PRESETS } from '@/utils/appearance'
import { EQ_PRESETS } from '@/store/eqStore'
import { CURSOR_PACKS } from '@/utils/cursor'
import { useCoverCreator } from '@/store/coverCreatorStore'
import { IS_ANDROID } from '@/platform'
import { t, tk } from '@/i18n'

const EMOJI_CHOICES = [
  '🎵', '🔥', '💜', '🌙', '☀️', '🌊', '🍃', '⚡', '🎸', '🎧',
  '✨', '🌈', '❤️', '💪', '😌', '🎉', '🚗', '📚', '☕', '🏃'
]

/** the coloured tags (a dot on the card; the list can be filtered by them) */
export const TAG_COLOURS = ['#ff5c7a', '#ff9f43', '#ffd93d', '#3ddc97', '#4cc9f0', '#7c6cf4', '#c77dff', '#a0a0b0']

const HEADERS: { id: 'banner' | 'compact' | 'disc'; label: string; hint: string }[] = [
  { id: 'banner', label: tk('Banner'), hint: tk('Grande, com a foto desfocada atrás') },
  { id: 'compact', label: tk('Compacto'), hint: tk('Uma faixa discreta') },
  { id: 'disc', label: tk('Disco'), hint: tk('A capa vira um vinil que gira') }
]

const MINUTES = [null, 15, 30, 45, 60, 90]

/** the largest GIF kept as a cover (it lives inside the library database) */
const MAX_GIF = 4 * 1024 * 1024

type Tab = 'visual' | 'clima' | 'tocar'

/**
 * Playlist personalization: the look (photo or animated GIF, emoji, name,
 * description, the page's header, a coloured tag, its folder, a cover from
 * the cover creator), its mood while it plays (World, theme, equalizer,
 * cursor) and how it plays (shuffle, crossfade, resume, a time limit).
 */
export function PlaylistEditor({
  playlist,
  folders = [],
  onClose,
  onSaved
}: {
  playlist: Playlist
  folders?: string[]
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('visual')
  const [name, setName] = useState(playlist.name)
  const [description, setDescription] = useState(playlist.description ?? '')
  const [emoji, setEmoji] = useState(playlist.emoji ?? '')
  const [image, setImage] = useState<string | null>(playlist.image ?? null)
  const [color, setColor] = useState<string | null>(playlist.color ?? null)
  const [header, setHeader] = useState<'banner' | 'compact' | 'disc'>(playlist.header ?? 'banner')
  const [tag, setTag] = useState<string | null>(playlist.tag ?? null)
  const [folder, setFolder] = useState(playlist.folder ?? '')
  const [vibe, setVibe] = useState<Vibe>({ ...EMPTY_VIBE, ...parseJson<Vibe>(playlist.vibe) })
  const [play, setPlay] = useState<PlayMode>({ ...DEFAULT_PLAY, ...parseJson<PlayMode>(playlist.play) })
  const [showEmoji, setShowEmoji] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tooBig, setTooBig] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    setTooBig(false)
    if (file.type === 'image/gif' && file.size > MAX_GIF) {
      setTooBig(true)
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      let url = reader.result as string
      // a still photo is kept at a sensible size; a GIF as it is (it moves)
      if (file.type !== 'image/gif') url = (await shrink(url, 900)) ?? url
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
      color: color ?? undefined,
      header,
      tag,
      folder: folder.trim() || null,
      vibe: vibe.world || vibe.theme || vibe.eq || vibe.cursor ? vibe : null,
      play
    })
    const fresh = ((await window.harmony.playlists.getAll()) as Playlist[]).find((p) => p.id === playlist.id)
    if (fresh) refreshActive(fresh)
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

  const chip = (active: boolean): string =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
    }`
  const select = 'w-full rounded-xl border border-white/10 bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]'
  const label = 'mb-1 block text-xs font-medium text-muted'

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="glass fade-in flex max-h-[92vh] w-[min(94vw,520px)] flex-col overflow-hidden rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header with color-tinted cover */}
        <div
          className="relative flex shrink-0 items-end gap-4 p-5"
          style={{
            background: color ? `linear-gradient(135deg, ${color}, transparent)` : 'linear-gradient(135deg, var(--accent-soft), transparent)'
          }}
        >
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--bg-raised)] shadow-lg"
            title={t('Escolher imagem')}
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
            <p className="text-[11px] uppercase tracking-wide text-muted">{playlist.rules ? t('Playlist inteligente') : t('Playlist')}</p>
            <p className="truncate text-lg font-semibold">{name || t('Sem nome')}</p>
          </div>
          <button onClick={onClose} className="self-start text-muted hover:text-ink" aria-label={t('Fechar')}>
            <X size={18} />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 px-5 pt-3" role="tablist">
          {(
            [
              ['visual', t('🎨 Visual')],
              ['clima', t('🌦️ Clima')],
              ['tocar', t('▶️ Como toca')]
            ] as [Tab, string][]
          ).map(([id, text]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={chip(tab === id)}>
              {text}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {tab === 'visual' && (
            <>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => fileRef.current?.click()} className={chip(false)}>
                  <Camera size={12} className="mr-1 inline" />
                  {t('Foto ou GIF')}
                </button>
                <button
                  onClick={() => {
                    useCoverCreator.getState().open({ songId: 0, playlistId: playlist.id, title: name || playlist.name, artist: '', coverPath: null })
                    onClose()
                  }}
                  className={chip(false)}
                >
                  <Palette size={12} className="mr-1 inline" />
                  {t('Criar capa')}
                </button>
                {image && (
                  <button
                    onClick={() => {
                      setImage(null)
                      setColor(null)
                    }}
                    className={chip(false)}
                  >
                    <Grid2x2 size={12} className="mr-1 inline" />
                    {t('Usar mosaico das capas')}
                  </button>
                )}
              </div>
              {tooBig && <p className="text-xs text-red-300">{t('Esse GIF é grande demais (o limite é 4 MB).')}</p>}

              {/* name + emoji */}
              <div>
                <label className={label}>{t('Nome')}</label>
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded-xl border border-white/10 bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    placeholder={t('Nome da playlist')}
                  />
                  <div className="relative">
                    <button
                      onClick={() => setShowEmoji((v) => !v)}
                      className="grid h-full w-11 place-items-center rounded-xl border border-white/10 bg-[var(--bg-raised)] text-lg hover:border-[var(--accent)]"
                      title={t('Emoji')}
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
                          {t('Sem emoji')}
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
                <label className={label}>{t('Descrição')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={200}
                  className="w-full resize-none rounded-xl border border-white/10 bg-[var(--bg-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  placeholder={t('Do que é feita essa playlist? Uma vibe, um momento…')}
                />
              </div>

              <div>
                <label className={label}>{t('Cabeçalho da página')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {HEADERS.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setHeader(h.id)}
                      className={`rounded-xl p-2.5 text-left ${header === h.id ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'bg-[var(--bg-raised)]'}`}
                    >
                      <p className="text-xs font-semibold">{t(h.label)}</p>
                      <p className="text-[10px] text-muted">{t(h.hint)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={label}>{t('Cor da playlist')}</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={color ?? '#7c6cf4'}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent"
                    aria-label={t('Cor da playlist')}
                  />
                  <span className="text-[11px] text-muted">{image ? t('Tirada da imagem (dá para trocar)') : t('Pinta a página dela')}</span>
                </div>
              </div>

              <div>
                <label className={label}>{t('Etiqueta')}</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setTag(null)} className={chip(tag === null)}>
                    {t('Nenhuma')}
                  </button>
                  {TAG_COLOURS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setTag(c)}
                      className={`h-7 w-7 rounded-full ${tag === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--bg-base)]' : ''}`}
                      style={{ background: c }}
                      aria-label={t('Etiqueta {c}', { c })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className={label}>{t('Pasta')}</label>
                <input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  list="playlist-folders"
                  maxLength={40}
                  placeholder={t('Sem pasta (ex.: Treino, Estudos, Festas)')}
                  className={select}
                />
                <datalist id="playlist-folders">
                  {folders.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          {tab === 'clima' && (
            <>
              <p className="text-xs text-muted">
                {t('Enquanto esta playlist toca, o Harmony se transforma. Quando você tocar outra coisa, tudo volta como estava.')}
              </p>
              <div>
                <label className={label}>{t('🌍 Mundo vivo')}</label>
                <select value={vibe.world ?? ''} onChange={(e) => setVibe({ ...vibe, world: e.target.value || null })} className={select}>
                  <option value="">{t('Não mudar')}</option>
                  {WORLDS.filter((w) => w.id !== 'custom').map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.emoji} {t(w.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>{t('🎨 Tema')}</label>
                <select value={vibe.theme ?? ''} onChange={(e) => setVibe({ ...vibe, theme: e.target.value || null })} className={select}>
                  <option value="">{t('Não mudar')}</option>
                  {PRESETS.map((p) => (
                    <option key={p.id} value={`preset:${p.id}`}>
                      {t(p.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>{t('🎚️ Equalizador')}</label>
                <select value={vibe.eq ?? ''} onChange={(e) => setVibe({ ...vibe, eq: e.target.value || null })} className={select}>
                  <option value="">{t('Não mudar')}</option>
                  {Object.keys(EQ_PRESETS).map((name) => (
                    <option key={name} value={name}>
                      {t(name)}
                    </option>
                  ))}
                </select>
              </div>
              {!IS_ANDROID && (
                <div>
                  <label className={label}>{t('🖱️ Cursor')}</label>
                  <select value={vibe.cursor ?? ''} onChange={(e) => setVibe({ ...vibe, cursor: e.target.value || null })} className={select}>
                    <option value="">{t('Não mudar')}</option>
                    {CURSOR_PACKS.filter((c) => c.id !== 'custom').map((c) => (
                      <option key={c.id} value={c.id}>
                        {t(c.label)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {tab === 'tocar' && (
            <>
              <Toggle
                on={play.shuffle}
                onChange={(v) => setPlay({ ...play, shuffle: v })}
                title={t('🔀 Sempre aleatória')}
                hint={t('Ela sempre toca embaralhada, mesmo que o aleatório esteja desligado.')}
              />
              <Toggle
                on={play.resume}
                onChange={(v) => setPlay({ ...play, resume: v })}
                title={t('⏯️ Continuar de onde parou')}
                hint={t('O botão Tocar volta na música e no segundo em que você parou nela.')}
              />
              <div>
                <Toggle
                  on={play.crossfade != null}
                  onChange={(v) => setPlay({ ...play, crossfade: v ? 6 : null })}
                  title={t('🌫️ Crossfade só dela')}
                  hint={t('Uma transição entre músicas própria desta playlist.')}
                />
                {play.crossfade != null && (
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={1}
                      value={play.crossfade}
                      onChange={(e) => setPlay({ ...play, crossfade: Number(e.target.value) })}
                      className="flex-1 accent-[var(--accent)]"
                      aria-label={t('Crossfade em segundos')}
                    />
                    <span className="w-10 text-xs tabular-nums text-muted">{play.crossfade} s</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{t('⏱️ Tocar por um tempo')}</p>
                <p className="mt-0.5 text-xs text-muted">{t('A música para sozinha (com o timer de dormir) depois de:')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MINUTES.map((m) => (
                    <button key={String(m)} onClick={() => setPlay({ ...play, minutes: m })} className={chip(play.minutes === m)}>
                      {m == null ? t('Sem limite') : t('{n} min', { n: m })}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--glass-border)] px-5 py-3">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-semibold text-muted hover:text-ink">
            {t('Cancelar')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="press rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {t('Salvar')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (v: boolean) => void; title: string; hint: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      <button
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={title}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

/** a photo at most `max` px wide, as a JPEG data URL */
async function shrink(url: string, max: number): Promise<string | null> {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    if (k >= 1 && url.length < 1_500_000) return url
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k)
    c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.88)
  } catch {
    return null
  }
}
