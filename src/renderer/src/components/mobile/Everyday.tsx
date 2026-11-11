import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Playlist } from '@/types'
import { api } from '@/services/api'
import { usePhoneStore } from '@/store/phoneStore'
import { usePlayerStore } from '@/store/playerStore'
import { HarmonyPhone, type AlarmState } from '@/platform/android/phone'
import { lowerVolume } from '@/platform/android/everyday'
import { keepListening, ring, snoozeAlarm, stopAlarm, SNOOZE_MIN } from '@/platform/android/alarm'
import { locale, t } from '@/i18n'
import { useBackCloses } from './back'

/**
 * The phone's everyday features on screen: the little notice pill, ear
 * care's notice, the alarm's wake-up screen, the alarm button and sheet in
 * Tocando agora, and the "No celular" options in Settings.
 */

// ── the notice pill ───────────────────────────────────────────────────

export function PhoneNotice(): JSX.Element | null {
  const notice = usePhoneStore((s) => s.notice)
  if (!notice) return null
  return createPortal(
    <div key={notice.id} className="m-notice fade-rise" role="status">
      {notice.text}
    </div>,
    document.body
  )
}

// ── ear care ──────────────────────────────────────────────────────────

export function EarCareNotice(): JSX.Element | null {
  const open = usePhoneStore((s) => s.earWarning)
  const close = useCallback(() => usePhoneStore.setState({ earWarning: false }), [])
  useBackCloses(open, close)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[142] flex items-end bg-black/50" onClick={close}>
      <div
        className="fade-rise w-full rounded-t-3xl bg-[var(--bg-base)] px-6 pb-[max(22px,env(safe-area-inset-bottom))] pt-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-4xl" aria-hidden>
          🎧
        </p>
        <h3 className="mt-2 text-[16px] font-semibold">{t('Seus ouvidos agradecem uma folga')}</h3>
        <p className="mt-1 text-sm text-muted">
          {t('Faz uns 45 minutos que você ouve com o volume bem alto no fone. Baixar um pouco protege a sua audição, e a música continua linda.')}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => {
              void lowerVolume(0.6)
              close()
            }}
            className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent,#fff)]"
          >
            {t('Baixar o volume para 60%')}
          </button>
          <button onClick={close} className="rounded-full px-4 py-2.5 text-sm text-muted">
            {t('Agora não')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── the alarm's wake-up screen ────────────────────────────────────────

function useClock(): Date {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
}

export function AlarmScreen(): JSX.Element | null {
  const ringing = usePhoneStore((s) => s.ringing)
  const song = usePlayerStore((s) => s.queue[s.currentIndex] ?? null)
  const listen = useCallback(() => keepListening(), [])
  useBackCloses(ringing, listen)
  if (!ringing) return null
  return createPortal(<WakeUp song={song} />, document.body)
}

function WakeUp({ song }: { song: { title: string; artist: string | null } | null }): JSX.Element {
  const now = useClock()
  const hour = now.getHours()
  const greeting = hour < 12 ? t('Bom dia!') : hour < 18 ? t('Boa tarde!') : t('Boa noite!')
  return (
    <div className="m-wake fixed inset-0 z-[160] flex flex-col items-center justify-between px-8 pb-[max(32px,env(safe-area-inset-bottom))] pt-20 text-center">
      <div>
        <div className="m-sun mx-auto" aria-hidden />
        <p className="mt-8 text-6xl font-bold tabular-nums">{hhmm(now)}</p>
        <p className="mt-2 text-xl font-semibold">{greeting} ☀️</p>
        {song && (
          <p className="mt-4 truncate text-sm text-muted">
            ♪ {song.title}
            {song.artist ? ` · ${song.artist}` : ''}
          </p>
        )}
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={() => void stopAlarm()}
          className="rounded-full bg-[var(--accent)] px-4 py-4 text-[16px] font-semibold text-[var(--on-accent,#fff)]"
        >
          {t('Parar alarme')}
        </button>
        <button
          onClick={() =>
            void snoozeAlarm().then((at) => usePhoneStore.getState().say(t('😴 Soneca até {time}', { time: hhmm(new Date(at)) })))
          }
          className="rounded-full bg-[var(--bg-raised)] px-4 py-3.5 text-sm font-semibold"
        >
          {t('Soneca de {n} min', { n: SNOOZE_MIN })}
        </button>
        <button onClick={() => keepListening()} className="rounded-full px-4 py-3 text-sm text-muted">
          {t('Continuar ouvindo')}
        </button>
      </div>
    </div>
  )
}

// ── the alarm button and its sheet ────────────────────────────────────

/** Sunday-first, like Calendar.DAY_OF_WEEK (bit 1 = Sunday) */
function weekdayNames(): string[] {
  const f = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' })
  // 2024-09-01 was a Sunday
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 8, 1 + i)))
}

const pad = (n: number): string => String(n).padStart(2, '0')

function untilText(next: number | null): string {
  if (!next) return ''
  const min = Math.max(1, Math.round((next - Date.now()) / 60_000))
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return t('Toca daqui a {m} min', { m })
  return t('Toca daqui a {h} h {m} min', { h, m })
}

export function AlarmButton(): JSX.Element {
  const [alarm, setAlarm] = useState<AlarmState | null>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useBackCloses(open, close)
  useEffect(() => {
    void HarmonyPhone.getAlarm()
      .then(setAlarm)
      .catch(() => undefined)
  }, [open])
  const on = Boolean(alarm?.enabled && alarm.next)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs ${
          on ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-raised)] text-muted'
        }`}
        aria-label={t('Despertador musical')}
      >
        <span aria-hidden>⏰</span>
        <span className="tabular-nums">{on && alarm ? `${pad(alarm.hour)}:${pad(alarm.minute)}` : t('Despertar')}</span>
      </button>
      {open && createPortal(<AlarmSheet initial={alarm} onClose={close} onSaved={setAlarm} />, document.body)}
    </>
  )
}

function AlarmSheet({
  initial,
  onClose,
  onSaved
}: {
  initial: AlarmState | null
  onClose: () => void
  onSaved: (a: AlarmState) => void
}): JSX.Element {
  const music = usePhoneStore((s) => s.alarmMusic)
  const setOptions = usePhoneStore((s) => s.set)
  const [time, setTime] = useState(initial ? `${pad(initial.hour)}:${pad(initial.minute)}` : '07:00')
  const [days, setDays] = useState(initial?.days ?? 0)
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [saved, setSaved] = useState<AlarmState | null>(initial)
  const names = weekdayNames()

  useEffect(() => {
    void (api.playlists.getAll() as Promise<Playlist[]>).then((p) => setPlaylists(p ?? [])).catch(() => undefined)
  }, [])

  const save = async (on: boolean): Promise<void> => {
    const [h, m] = time.split(':').map(Number)
    const r = await HarmonyPhone.setAlarm({ enabled: on, hour: h || 0, minute: m || 0, days })
    setEnabled(r.enabled)
    setSaved(r)
    onSaved(r)
  }

  const chip = (active: boolean): string =>
    `rounded-full px-3 py-2 text-xs font-medium ${active ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-muted'}`

  return (
    <div className="fixed inset-0 z-[136] flex items-end bg-black/50" onClick={onClose}>
      <div
        className="fade-rise max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--bg-base)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--bg-raised)]" />
        <h3 className="text-sm font-semibold">⏰ {t('Despertador musical')}</h3>
        <p className="mt-1 text-xs text-muted">
          {t('Acorde com as suas músicas: elas começam baixinho e sobem devagar. Funciona com o app fechado.')}
        </p>

        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="m-alarm-time mt-4 w-full rounded-2xl bg-[var(--bg-raised)] py-3 text-center text-5xl font-bold tabular-nums"
          aria-label={t('Horário')}
        />

        <p className="mb-2 mt-4 text-xs font-semibold text-muted">{t('Repetir')}</p>
        <div className="flex justify-between gap-1">
          {names.map((n, i) => {
            const bit = 1 << (i + 1)
            const active = (days & bit) !== 0
            return (
              <button
                key={i}
                onClick={() => setDays((d) => d ^ bit)}
                aria-pressed={active}
                className={`grid h-10 w-10 place-items-center rounded-full text-sm font-semibold ${
                  active ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-muted'
                }`}
              >
                {n}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{days === 0 ? t('Sem dias marcados: toca só uma vez.') : ''}</p>

        <p className="mb-2 mt-4 text-xs font-semibold text-muted">{t('Música')}</p>
        <select
          value={music.playlistId ?? ''}
          onChange={(e) => setOptions({ alarmMusic: { ...music, playlistId: e.target.value ? Number(e.target.value) : null } })}
          className="w-full rounded-xl bg-[var(--bg-raised)] px-3 py-2.5 text-sm"
        >
          <option value="">{t('❤️ Favoritas')}</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji ? `${p.emoji} ` : ''}
              {p.name}
            </option>
          ))}
        </select>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={music.shuffle}
            onChange={(e) => setOptions({ alarmMusic: { ...music, shuffle: e.target.checked } })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          {t('Ordem aleatória')}
        </label>

        <p className="mb-2 mt-4 text-xs font-semibold text-muted">
          {t('Volume final: {n}%', { n: Math.round(music.volume * 100) })}
        </p>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={music.volume}
          onChange={(e) => setOptions({ alarmMusic: { ...music, volume: Number(e.target.value) } })}
          className="w-full accent-[var(--accent)]"
        />

        <p className="mb-2 mt-3 text-xs font-semibold text-muted">{t('Subida do volume')}</p>
        <div className="flex gap-2">
          {[30, 60, 180].map((s) => (
            <button key={s} onClick={() => setOptions({ alarmMusic: { ...music, riseSec: s } })} className={chip(music.riseSec === s)}>
              {s < 60 ? t('{n} s', { n: s }) : t('{n} min', { n: s / 60 })}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => void save(true)}
            className="rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent,#fff)]"
          >
            {enabled ? t('Salvar alarme') : t('Ligar alarme')}
          </button>
          {saved?.enabled && saved.next && <p className="text-center text-xs text-[var(--accent)]">{untilText(saved.next)}</p>}
          <div className="flex gap-2">
            {enabled && (
              <button onClick={() => void save(false)} className="flex-1 rounded-full bg-[var(--bg-raised)] px-3 py-2.5 text-xs font-medium">
                {t('Desligar alarme')}
              </button>
            )}
            <button
              onClick={() => {
                onClose()
                void ring()
              }}
              className="flex-1 rounded-full bg-[var(--bg-raised)] px-3 py-2.5 text-xs font-medium text-muted"
            >
              {t('Testar agora')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Settings: "No celular" ────────────────────────────────────────────

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }): JSX.Element {
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

function Row({ title, text, children }: { title: string; text: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{text}</p>
      </div>
      {children}
    </div>
  )
}

export function PhoneOptions(): JSX.Element {
  const s = usePhoneStore()
  const caps: (number | null)[] = [null, 0.6, 0.7, 0.8]
  return (
    <section className="glass mb-4 rounded-2xl p-5">
      <h2 className="text-sm font-semibold">{t('📱 No celular')}</h2>
      <div className="divide-y divide-[var(--border,rgba(255,255,255,0.06))]">
        <Row
          title={t('🎧 Cuidado com os ouvidos')}
          text={t('Um aviso gentil depois de muito tempo com o volume alto no fone.')}
        >
          <Toggle on={s.earCare} onChange={(v) => s.set({ earCare: v })} label={t('Cuidado com os ouvidos')} />
        </Row>
        <div className="py-3">
          <p className="text-sm font-medium">{t('🔒 Volume máximo no fone')}</p>
          <p className="mt-0.5 text-xs text-muted">{t('O volume não passa deste limite com fone conectado.')}</p>
          <div className="mt-2 flex gap-2">
            {caps.map((c) => (
              <button
                key={String(c)}
                onClick={() => s.set({ safeMax: c })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  s.safeMax === c ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-muted'
                }`}
              >
                {c == null ? t('Sem limite') : `${Math.round(c * 100)}%`}
              </button>
            ))}
          </div>
        </div>
        <Row
          title={t('🔋 Economia de bateria automática')}
          text={t('Com 20% de bateria, liga o Modo Ultra Rápido sozinho, e desliga quando você carregar.')}
        >
          <Toggle on={s.batterySaver} onChange={(v) => s.set({ batterySaver: v })} label={t('Economia de bateria automática')} />
        </Row>
        <Row title={t('📳 Agitar para pular')} text={t('Agite o celular duas vezes para ir à próxima música.')}>
          <Toggle on={s.shakeToSkip} onChange={(v) => s.set({ shakeToSkip: v })} label={t('Agitar para pular')} />
        </Row>
        <Row title={t('💓 Vibrar na batida')} text={t('O celular pulsa com o grave da música enquanto o app está aberto.')}>
          <Toggle on={s.beatVibe} onChange={(v) => s.set({ beatVibe: v })} label={t('Vibrar na batida')} />
        </Row>
      </div>
    </section>
  )
}
