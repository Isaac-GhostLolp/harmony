import { useRef, useState } from 'react'
import {
  CURSOR_PACKS,
  fileToCursorImage,
  packPreview,
  useCursorStore,
  type ClickEffect,
  type CursorPack,
  type CursorSize,
  type Trail
} from '@/utils/cursor'
import { useUltraFast } from '@/utils/perf'
import { t, tk } from '@/i18n'

/** Personalização → Cursor: the packs, your own image, the live cursor, trails, clicks and the World */

const SIZES: { id: CursorSize; label: string }[] = [
  { id: 24, label: 'P' },
  { id: 32, label: 'M' },
  { id: 40, label: 'G' }
]

const TRAILS: { id: Trail; label: string }[] = [
  { id: 'none', label: tk('Sem rastro') },
  { id: 'notes', label: tk('♪ Notinhas') },
  { id: 'sparkles', label: tk('✦ Brilhos') },
  { id: 'comet', label: tk('☄️ Cometa') },
  { id: 'wave', label: tk('〰️ Onda sonora') },
  { id: 'confetti', label: tk('🎊 Confete') },
  { id: 'emoji', label: tk('😀 Emoji') }
]

const CLICKS: { id: ClickEffect; label: string }[] = [
  { id: 'none', label: tk('Nenhum') },
  { id: 'wave', label: tk('◎ Onda') },
  { id: 'notes', label: tk('♫ Explosão de notas') }
]

const EMOJIS = ['💜', '🔥', '⭐', '✨', '🎵', '🌸', '🍀', '👻']

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export const chip = (active: boolean): string =>
  `rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
    active ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
  }`

export function CursorPicker(): JSX.Element {
  const s = useCursorStore()
  const ultra = useUltraFast()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [tryArea, setTryArea] = useState(false)
  const worldLeads = s.followWorld && (s.effective.pack !== s.pack || s.effective.trail !== s.trail)

  const pick = (pack: CursorPack): void => {
    if (pack === 'custom' && !s.custom) {
      file.current?.click()
      return
    }
    s.set({ pack })
  }

  const upload = async (f: File | undefined): Promise<void> => {
    if (!f) return
    setBusy(true)
    try {
      const { still, anim } = await fileToCursorImage(f)
      s.set({ custom: still, customAnim: anim, pack: 'custom' })
    } catch {
      /* not an image the page can read */
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  const preview = (pack: CursorPack): string | null => (pack === 'custom' ? s.custom : packPreview(pack))
  const shown = s.effective.pack

  return (
    <div>
      <h2 className="text-sm font-semibold">{t('🖱️ Cursor')}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">
        {t('A seta do mouse dentro do Harmony, na cor do seu tema, ou uma imagem sua. Fora do Harmony o cursor do sistema continua igual.')}
      </p>

      <div className="flex flex-wrap gap-2">
        {CURSOR_PACKS.map((p) => {
          const img = preview(p.id)
          return (
            <button key={p.id} onClick={() => pick(p.id)} className={`${chip(s.pack === p.id)} flex items-center gap-2`}>
              {img && <img src={img} alt="" className="h-4 w-4 object-contain" />}
              {t(p.label)}
              {p.animated && <span className="text-[10px] opacity-70">{t('· anima')}</span>}
            </button>
          )
        })}
      </div>
      {CURSOR_PACKS.find((p) => p.id === s.pack)?.animated && !s.live && (
        <p className="mt-2 text-[11px] text-muted">{t('Este cursor se mexe com o Cursor vivo ligado (abaixo). Sem ele, fica parado.')}</p>
      )}

      <input
        ref={file}
        type="file"
        accept="image/png,image/svg+xml,image/webp,image/gif,image/jpeg"
        className="hidden"
        onChange={(e) => void upload(e.target.files?.[0])}
      />

      {s.pack === 'custom' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button onClick={() => file.current?.click()} disabled={busy} className={chip(false)}>
            {busy ? '…' : t('Trocar imagem')}
          </button>
          <span className="text-muted">{t('A ponta do cursor fica:')}</span>
          <button onClick={() => s.set({ customHotspot: 'corner' })} className={chip(s.customHotspot === 'corner')}>
            {t('No canto')}
          </button>
          <button onClick={() => s.set({ customHotspot: 'center' })} className={chip(s.customHotspot === 'center')}>
            {t('No centro')}
          </button>
          {s.customAnim && <span className="text-muted">{t('GIF animado: ele se mexe com o Cursor vivo.')}</span>}
        </div>
      )}

      {shown !== 'system' && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted">{t('Tamanho')}</span>
          {SIZES.map((z) => (
            <button key={z.id} onClick={() => s.set({ size: z.id })} className={chip(s.size === z.id)}>
              {z.label}
            </button>
          ))}
        </div>
      )}

      {shown !== 'system' && (
        <div className="mt-5 rounded-2xl bg-[var(--bg-raised)] p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('✨ Cursor vivo')}</p>
              <p className="mt-0.5 text-xs text-muted">
                {ultra
                  ? t('Desligado enquanto o Modo Ultra Rápido estiver ligado.')
                  : t('O Harmony desenha o cursor: ele pulsa com a batida, cresce sobre os botões e os cursores animados se mexem. Usa um pouco mais do computador.')}
              </p>
            </div>
            <Switch on={s.live} onChange={(v) => s.set({ live: v })} label={t('Cursor vivo')} />
          </div>
          {s.live && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs">{t('Pulsar com a batida')}</span>
                <Switch on={s.beat} onChange={(v) => s.set({ beat: v })} label={t('Pulsar com a batida')} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs">{t('Crescer sobre os botões')}</span>
                <Switch on={s.grow} onChange={(v) => s.set({ grow: v })} label={t('Crescer sobre os botões')} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-[var(--bg-raised)] p-4">
        <p className="text-sm font-medium">{t('🌠 Efeitos')}</p>
        <p className="mt-0.5 text-xs text-muted">{t('Funcionam com qualquer cursor, até o do sistema.')}</p>
        <p className="mb-2 mt-3 text-xs">{t('Rastro')}</p>
        <div className="flex flex-wrap gap-2">
          {TRAILS.map((tr) => (
            <button key={tr.id} onClick={() => s.set({ trail: tr.id })} className={chip(s.trail === tr.id)}>
              {t(tr.label)}
            </button>
          ))}
        </div>
        {s.trail === 'emoji' && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => s.set({ trailEmoji: e })}
                className={`grid h-8 w-8 place-items-center rounded-full text-base ${s.trailEmoji === e ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]' : 'bg-[var(--bg-base)]'}`}
              >
                {e}
              </button>
            ))}
            <input
              value={EMOJIS.includes(s.trailEmoji) ? '' : s.trailEmoji}
              onChange={(e) => {
                // the first character the listener typed or pasted (an emoji may be several code units)
                const first = [...e.target.value.trim()][0]
                if (first) s.set({ trailEmoji: first })
              }}
              placeholder={t('outro')}
              className="h-8 w-16 rounded-full bg-[var(--bg-base)] px-3 text-center text-sm"
              aria-label={t('Outro emoji')}
            />
          </div>
        )}
        <p className="mb-2 mt-4 text-xs">{t('Ao clicar')}</p>
        <div className="flex flex-wrap gap-2">
          {CLICKS.map((c) => (
            <button key={c.id} onClick={() => s.set({ click: c.id })} className={chip(s.click === c.id)}>
              {t(c.label)}
            </button>
          ))}
        </div>
        {ultra && <p className="mt-2 text-[11px] text-muted">{t('Os efeitos ficam desligados no Modo Ultra Rápido.')}</p>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-[var(--bg-raised)] p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t('🌍 Seguir o Mundo vivo')}</p>
          <p className="mt-0.5 text-xs text-muted">
            {worldLeads
              ? t('Agora o Mundo está escolhendo o cursor e o rastro.')
              : t('Cada Mundo vivo traz o seu cursor e o seu rastro: bolhas no oceano, neve no inverno, confete no Ano Novo…')}
          </p>
        </div>
        <Switch on={s.followWorld} onChange={(v) => s.set({ followWorld: v })} label={t('Seguir o Mundo vivo')} />
      </div>

      <div
        onMouseEnter={() => setTryArea(true)}
        onMouseLeave={() => setTryArea(false)}
        className="mt-4 grid h-28 place-items-center rounded-2xl border border-dashed border-[var(--bg-raised)] text-xs text-muted"
      >
        <span>
          {tryArea ? t('Isso! Mexa, clique e passe sobre o botão:') : t('Passe o mouse aqui para testar')}{' '}
          <button className="ml-1 rounded-full bg-[var(--accent)] px-3 py-1 text-[var(--on-accent,#fff)]">{t('Botão')}</button>
        </span>
      </div>
    </div>
  )
}
