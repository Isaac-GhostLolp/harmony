import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import jsQR from 'jsqr'
import type { BridgeSong } from '../../../../core/bridge'
import {
  BridgeError,
  connect,
  makePlan,
  parseAddress,
  parseQr,
  runSync,
  type Plan,
  type Progress,
  type SyncResult
} from '@/platform/android/bridgeClient'
import { HarmonyPhone } from '@/platform/android/phone'
import { t, tn } from '@/i18n'
import { useBackCloses } from './back'

/**
 * "Ponte com o PC" on the phone: connect to the Harmony on the PC (QR code
 * or typed address), see what each side is missing, choose what to bring,
 * and sync — songs both ways, playlists and favourites joined.
 */

export function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

const total = (list: { size: number }[]): number => list.reduce((n, s) => n + (s.size || 0), 0)

/** the card in Settings */
export function PhoneBridgeCard(): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <section className="glass mb-4 rounded-2xl p-5">
      <h2 className="text-sm font-semibold">{t('💻 Ponte com o PC')}</h2>
      <p className="mt-0.5 text-xs text-muted">
        {t('Junte playlists e favoritos com o Harmony do computador e traga músicas de lá pelo Wi-Fi de casa. Sem nuvem e sem conta.')}
      </p>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--on-accent,#fff)]"
      >
        {t('Conectar ao PC')}
      </button>
      {open && <BridgeScreen onClose={() => setOpen(false)} />}
    </section>
  )
}

type Step =
  | { kind: 'connect'; error?: string }
  | { kind: 'scan' }
  | { kind: 'loading'; label: string }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'running'; progress: Progress | null }
  | { kind: 'done'; result: SyncResult }

function errorText(e: unknown): string {
  const reason = e instanceof BridgeError ? e.reason : 'failed'
  if (reason === 'code') return t('O código não confere. Confira os 6 números na tela do PC.')
  if (reason === 'unreachable' || reason === 'notHarmony')
    return t('Não achei o Harmony do PC. Os dois precisam estar no mesmo Wi-Fi, com a tela "Ponte com o celular" aberta no PC.')
  return t('A conexão com o PC caiu. Tente de novo.')
}

function BridgeScreen({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'connect' })
  const cancel = useRef(false)
  const running = step.kind === 'running'
  const close = useCallback(() => {
    if (running) return // a sync is stopped with its own button
    onClose()
  }, [running, onClose])
  useBackCloses(true, close)

  const start = async (hosts: string[], port: number, code: string): Promise<void> => {
    setStep({ kind: 'loading', label: t('Procurando o PC…') })
    try {
      const conn = await connect(hosts, port, code)
      setStep({ kind: 'loading', label: t('Comparando as bibliotecas…') })
      setStep({ kind: 'plan', plan: await makePlan(conn) })
    } catch (e) {
      setStep({ kind: 'connect', error: errorText(e) })
    }
  }

  const sync = async (plan: Plan, job: { download: BridgeSong[]; upload: Plan['missingOnPc']; merge: boolean }): Promise<void> => {
    cancel.current = false
    setStep({ kind: 'running', progress: null })
    void HarmonyPhone.keepAwake({ on: true }).catch(() => undefined)
    try {
      const result = await runSync(plan.conn, job, (p) => setStep({ kind: 'running', progress: p }), () => cancel.current)
      setStep({ kind: 'done', result })
    } catch (e) {
      setStep({ kind: 'connect', error: errorText(e) })
    } finally {
      void HarmonyPhone.keepAwake({ on: false }).catch(() => undefined)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[150] flex flex-col bg-[var(--bg-base)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('💻 Ponte com o PC')}</h2>
        {!running && (
          <button onClick={close} className="rounded-full px-3 py-1.5 text-sm text-muted" aria-label={t('Fechar')}>
            ✕
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {step.kind === 'connect' && <ConnectStep error={step.error} onScan={() => setStep({ kind: 'scan' })} onConnect={start} />}
        {step.kind === 'scan' && (
          <ScanStep
            onCode={(hosts, port, code) => void start(hosts, port, code)}
            onBack={(error) => setStep({ kind: 'connect', error })}
          />
        )}
        {step.kind === 'loading' && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="m-bridge-spin mx-auto" aria-hidden />
              <p className="mt-4 text-sm text-muted">{step.label}</p>
            </div>
          </div>
        )}
        {step.kind === 'plan' && <PlanStep plan={step.plan} onSync={(job) => void sync(step.plan, job)} />}
        {step.kind === 'running' && <RunningStep progress={step.progress} onCancel={() => (cancel.current = true)} />}
        {step.kind === 'done' && <DoneStep result={step.result} onClose={onClose} />}
      </div>
    </div>,
    document.body
  )
}

function ConnectStep({
  error,
  onScan,
  onConnect
}: {
  error?: string
  onScan: () => void
  onConnect: (hosts: string[], port: number, code: string) => void
}): JSX.Element {
  const [address, setAddress] = useState(() => localStorage.getItem('harmony.bridgeAddress') ?? '')
  // after a typed attempt (or a failed one) the form stays open, with the address remembered
  const [typing, setTyping] = useState(() => Boolean(address))
  const [code, setCode] = useState('')
  const where = parseAddress(address)
  const ok = Boolean(where) && code.replace(/\D/g, '').length === 6

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {t('No computador, abra o Harmony em Configurações → Ponte com o celular. O PC e o celular precisam estar no mesmo Wi-Fi.')}
      </p>
      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2.5 text-xs text-red-300">{error}</p>}
      <button onClick={onScan} className="rounded-2xl bg-[var(--accent)] px-4 py-4 text-sm font-semibold text-[var(--on-accent,#fff)]">
        📷 {t('Ler o QR code do PC')}
      </button>
      {!typing ? (
        <button onClick={() => setTyping(true)} className="text-xs text-muted underline">
          {t('Prefiro digitar o endereço e o código')}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl bg-[var(--bg-raised)] p-4">
          <label className="text-xs text-muted">
            {t('Endereço (aparece no PC)')}
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              inputMode="url"
              placeholder="192.168.0.12:47830"
              className="mt-1 w-full rounded-xl bg-[var(--bg-base)] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="text-xs text-muted">
            {t('Código de 6 números')}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="mt-1 w-full rounded-xl bg-[var(--bg-base)] px-3 py-2.5 text-center text-lg tracking-[0.4em]"
            />
          </label>
          <button
            disabled={!ok}
            onClick={() => {
              if (!where) return
              try {
                localStorage.setItem('harmony.bridgeAddress', address.trim())
              } catch {
                /* only a convenience */
              }
              onConnect(where.hosts, where.port, code)
            }}
            className="mt-1 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent,#fff)] disabled:opacity-40"
          >
            {t('Conectar')}
          </button>
        </div>
      )}
    </div>
  )
}

function ScanStep({
  onCode,
  onBack
}: {
  onCode: (hosts: string[], port: number, code: string) => void
  onBack: (error?: string) => void
}): JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const [hint, setHint] = useState(t('Aponte para o QR code na tela do PC'))
  // the camera starts once; the latest callbacks are read when they're needed
  const found = useRef({ onCode, onBack })
  found.current = { onCode, onBack }

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let live = true
    const canvas = document.createElement('canvas')
    const g = canvas.getContext('2d', { willReadFrequently: true })
    const look = (): void => {
      if (!live) return
      const v = video.current
      if (v && g && v.readyState >= 2 && v.videoWidth) {
        const w = 640
        const h = Math.round((v.videoHeight / v.videoWidth) * w)
        canvas.width = w
        canvas.height = h
        g.drawImage(v, 0, 0, w, h)
        const hit = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
        if (hit?.data) {
          const qr = parseQr(hit.data)
          if (qr) {
            live = false
            found.current.onCode(qr.hosts, qr.port, qr.code)
            return
          }
          setHint(t('Esse QR code não é da Ponte do Harmony.'))
        }
      }
      timer = window.setTimeout(look, 150)
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (!live) {
          s.getTracks().forEach((tr) => tr.stop())
          return
        }
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => undefined)
        }
        look()
      })
      .catch(() => found.current.onBack(t('Sem acesso à câmera. Permita a câmera para o Harmony, ou digite o endereço e o código.')))
    return () => {
      live = false
      clearTimeout(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-black">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        <div className="m-bridge-frame" aria-hidden />
      </div>
      <p className="text-center text-sm text-muted">{hint}</p>
      <button onClick={() => onBack()} className="rounded-full bg-[var(--bg-raised)] px-4 py-2.5 text-sm">
        {t('Voltar')}
      </button>
    </div>
  )
}

function PlanStep({
  plan,
  onSync
}: {
  plan: Plan
  onSync: (job: { download: BridgeSong[]; upload: Plan['missingOnPc']; merge: boolean }) => void
}): JSX.Element {
  const [merge, setMerge] = useState(true)
  const [bring, setBring] = useState<'none' | 'playlists' | 'all'>(plan.playlists.length ? 'playlists' : 'none')
  const [chosen, setChosen] = useState<Set<string>>(() => new Set())
  const [send, setSend] = useState(plan.missingOnPc.length > 0)

  const download = useMemo(() => {
    if (bring === 'all') return plan.missingOnPhone
    if (bring === 'none') return []
    const byId = new Map<number, BridgeSong>()
    for (const p of plan.playlists) if (chosen.has(p.name)) for (const s of p.missing) byId.set(s.id, s)
    return [...byId.values()]
  }, [bring, chosen, plan])
  const upload = send ? plan.missingOnPc : []
  const nothing = !merge && !download.length && !upload.length

  const option = (active: boolean): string =>
    `rounded-full px-3 py-2 text-xs font-medium ${active ? 'bg-[var(--accent)] text-[var(--on-accent,#fff)]' : 'bg-[var(--bg-raised)] text-muted'}`

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-[var(--accent-soft)] p-4">
        <p className="text-sm font-semibold">✅ {t('Conectado a {pc}', { pc: plan.conn.pc })}</p>
        <p className="mt-1 text-xs text-muted">
          {t('No PC: {songs} músicas e {playlists} playlists.', { songs: plan.pcSongs, playlists: plan.pcPlaylists })}
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-[var(--bg-raised)] p-4">
        <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="block text-sm font-medium">{t('Juntar playlists e favoritos')}</span>
          <span className="text-xs text-muted">{t('Os dois aparelhos ficam com tudo. Nada é apagado.')}</span>
        </span>
      </label>

      <div className="rounded-2xl bg-[var(--bg-raised)] p-4">
        <p className="text-sm font-medium">{t('Trazer músicas do PC')}</p>
        <p className="mt-0.5 text-xs text-muted">
          {plan.missingOnPhone.length
            ? t('{n} músicas do PC não estão no celular ({size}).', { n: plan.missingOnPhone.length, size: bytes(total(plan.missingOnPhone)) })
            : t('O celular já tem todas as músicas do PC. 🎉')}
        </p>
        {plan.missingOnPhone.length > 0 && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setBring('none')} className={option(bring === 'none')}>
                {t('Nenhuma')}
              </button>
              {plan.playlists.length > 0 && (
                <button onClick={() => setBring('playlists')} className={option(bring === 'playlists')}>
                  {t('De algumas playlists')}
                </button>
              )}
              <button onClick={() => setBring('all')} className={option(bring === 'all')}>
                {t('Todas')}
              </button>
            </div>
            {bring === 'playlists' && (
              <div className="mt-3 flex flex-col gap-1.5">
                {plan.playlists.map((p) => {
                  const on = chosen.has(p.name)
                  return (
                    <label key={p.name} className="flex items-center gap-3 rounded-xl bg-[var(--bg-base)] px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setChosen((c) => {
                            const next = new Set(c)
                            if (next.has(p.name)) next.delete(p.name)
                            else next.add(p.name)
                            return next
                          })
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {p.emoji ? `${p.emoji} ` : ''}
                        {p.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted">
                        {tn(p.missing.length, '{n} música', '{n} músicas')} · {bytes(total(p.missing))}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {plan.missingOnPc.length > 0 && (
        <label className="flex items-start gap-3 rounded-2xl bg-[var(--bg-raised)] p-4">
          <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span>
            <span className="block text-sm font-medium">
              {tn(plan.missingOnPc.length, 'Enviar ao PC a música que só está no celular', 'Enviar ao PC as {n} músicas que só estão no celular')}
            </span>
            <span className="text-xs text-muted">{t('Elas vão para a pasta "Harmony do celular" no PC.')}</span>
          </span>
        </label>
      )}

      <button
        disabled={nothing}
        onClick={() => onSync({ download, upload, merge })}
        className="sticky bottom-0 rounded-full bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-[var(--on-accent,#fff)] shadow-lg disabled:opacity-40"
      >
        {download.length
          ? t('Sincronizar e trazer {n} músicas ({size})', { n: download.length, size: bytes(total(download)) })
          : t('Sincronizar')}
      </button>
    </div>
  )
}

function RunningStep({ progress, onCancel }: { progress: Progress | null; onCancel: () => void }): JSX.Element {
  const [cancelling, setCancelling] = useState(false)
  const p = progress
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0
  const title =
    !p || p.stage === 'merge'
      ? t('Juntando playlists e favoritos…')
      : p.stage === 'scan'
        ? t('Colocando as músicas novas na biblioteca…')
        : p.stage === 'down'
          ? t('Trazendo do PC: {done} de {total}', { done: p.done + 1, total: p.total })
          : t('Enviando ao PC: {done} de {total}', { done: p.done + 1, total: p.total })
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="m-bridge-spin" aria-hidden />
      <div className="w-full">
        <p className="text-base font-semibold">{title}</p>
        {p?.label && <p className="mt-1 truncate text-xs text-muted">{p.label}</p>}
        {p && (p.stage === 'down' || p.stage === 'up') && (
          <div className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--bg-raised)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <p className="text-xs text-muted">{t('Deixe o Harmony aberto nos dois aparelhos até terminar.')}</p>
      <button
        disabled={cancelling}
        onClick={() => {
          setCancelling(true)
          onCancel()
        }}
        className="rounded-full bg-[var(--bg-raised)] px-4 py-2.5 text-sm disabled:opacity-50"
      >
        {cancelling ? t('Parando depois desta música…') : t('Parar')}
      </button>
    </div>
  )
}

function DoneStep({ result, onClose }: { result: SyncResult; onClose: () => void }): JSX.Element {
  const lines: string[] = []
  if (result.downloaded) lines.push(tn(result.downloaded, '📥 {n} música veio do PC', '📥 {n} músicas vieram do PC'))
  if (result.uploaded) lines.push(tn(result.uploaded, '📤 {n} música foi para o PC', '📤 {n} músicas foram para o PC'))
  const merged = (r: SyncResult['phone']): number => (r ? r.playlistsCreated + r.playlistSongsAdded + r.favoritesAdded : 0)
  if (result.phone) {
    lines.push(
      merged(result.phone)
        ? t('📱 No celular: +{p} playlists, +{s} músicas em playlists, +{f} favoritos', {
            p: result.phone.playlistsCreated,
            s: result.phone.playlistSongsAdded,
            f: result.phone.favoritesAdded
          })
        : t('📱 As playlists do celular já estavam em dia')
    )
  }
  if (result.pc) {
    lines.push(
      merged(result.pc)
        ? t('💻 No PC: +{p} playlists, +{s} músicas em playlists, +{f} favoritos', {
            p: result.pc.playlistsCreated,
            s: result.pc.playlistSongsAdded,
            f: result.pc.favoritesAdded
          })
        : t('💻 As playlists do PC já estavam em dia')
    )
  }
  if (result.failed) lines.push(tn(result.failed, '⚠️ {n} música não passou (tente de novo depois)', '⚠️ {n} músicas não passaram (tente de novo depois)'))
  if (result.phone?.missing)
    lines.push(
      tn(
        result.phone.missing,
        'ℹ️ {n} música das playlists do PC não está no celular: traga-a na próxima vez',
        'ℹ️ {n} músicas das playlists do PC não estão no celular: traga-as na próxima vez'
      )
    )
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <p className="text-5xl" aria-hidden>
        🎉
      </p>
      <p className="text-lg font-bold">{t('Tudo sincronizado!')}</p>
      <div className="flex flex-col gap-1.5 text-sm text-muted">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      <button onClick={onClose} className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent,#fff)]">
        {t('Fechar')}
      </button>
    </div>
  )
}
