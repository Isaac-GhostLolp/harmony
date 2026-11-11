import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { api } from '@/services/api'
import { t } from '@/i18n'

/**
 * "Ponte com o celular" on the PC: while this window is open the Harmony
 * answers the phone's Harmony over the home Wi-Fi (src/main/services/
 * phoneBridge.ts). It shows a QR code and the address with a six-digit
 * code, and what the phone is doing.
 */

interface Info {
  addresses: string[]
  port: number
  code: string
  name: string
}

type BridgeEvent = { type: string; device?: string; title?: string; code?: string; [k: string]: unknown }

export function PcBridgeCard(): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <section className="glass mb-4 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{t('📱 Ponte com o celular')}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {t('Junte playlists e favoritos com o Harmony do celular e troque músicas pelo Wi-Fi de casa. Sem nuvem e sem conta.')}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--on-accent,#fff)]"
        >
          {t('Conectar um celular')}
        </button>
      </div>
      {open && <BridgeWindow onClose={() => setOpen(false)} />}
    </section>
  )
}

function eventText(e: BridgeEvent): string | null {
  const d = e.device ?? t('Celular')
  switch (e.type) {
    case 'connected':
      return t('📱 {device} conectou', { device: d })
    case 'sending':
      return t('📤 Enviando ao celular: {title}', { title: e.title ?? '' })
    case 'received':
      return t('📥 Chegou do celular: {title}', { title: e.title ?? '' })
    case 'merged':
      return t('🔗 Playlists juntadas: +{p} playlists, +{s} músicas em playlists, +{f} favoritos', {
        p: Number(e.playlistsCreated ?? 0),
        s: Number(e.playlistSongsAdded ?? 0),
        f: Number(e.favoritesAdded ?? 0)
      })
    case 'code':
      return t('🔒 Muitas tentativas com o código errado: o código mudou')
    default:
      return null
  }
}

function BridgeWindow({ onClose }: { onClose: () => void }): JSX.Element {
  const [info, setInfo] = useState<Info | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [log, setLog] = useState<{ id: number; text: string }[]>([])

  useEffect(() => {
    let live = true
    void api.bridge
      .start()
      .then((i) => {
        if (live && i) setInfo(i as Info)
      })
      .catch(() => live && setFailed(true))
    const off = api.bridge.onEvent((e: BridgeEvent) => {
      if (e.type === 'code' && e.code) setInfo((i) => (i ? { ...i, code: String(e.code) } : i))
      const text = eventText(e)
      // "sending" comes once per song: keep only the latest of a run
      if (text)
        setLog((l) => {
          const last = l[l.length - 1]
          const same = last && e.type !== 'merged' && last.text.split(':')[0] === text.split(':')[0]
          return [...(same ? l.slice(0, -1) : l), { id: Date.now() + Math.random(), text }].slice(-6)
        })
    })
    return () => {
      live = false
      off()
      void api.bridge.stop()
    }
  }, [])

  useEffect(() => {
    if (!info) return
    const url = `harmony://bridge?h=${info.addresses.join(',')}&p=${info.port}&c=${info.code}&n=${encodeURIComponent(info.name)}`
    void QRCode.toDataURL(url, { margin: 1, width: 520, errorCorrectionLevel: 'M', color: { dark: '#0b0b10', light: '#ffffff' } }).then(setQr)
  }, [info])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const code = info ? `${info.code.slice(0, 3)} ${info.code.slice(3)}` : ''

  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div className="glass fade-rise w-full max-w-2xl rounded-3xl bg-[var(--bg-base)] p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{t('📱 Ponte com o celular')}</h2>
            <p className="mt-1 text-sm text-muted">
              {t('No celular, abra o Harmony em Configurações → Ponte com o PC e leia este QR code. Os dois precisam estar no mesmo Wi-Fi.')}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-muted hover:text-ink" aria-label={t('Fechar')}>
            ✕
          </button>
        </div>

        {failed ? (
          <p className="mt-6 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {t('Não deu para abrir a ponte neste computador. Feche outros programas que usem a rede e tente de novo.')}
          </p>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-7">
            <div className="grid h-[260px] w-[260px] shrink-0 place-items-center rounded-2xl bg-white p-3">
              {qr ? <img src={qr} alt={t('QR code da ponte')} className="h-full w-full" /> : <span className="text-sm text-black/50">…</span>}
            </div>
            <div className="min-w-[220px] flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('Ou digite no celular')}</p>
              <p className="mt-2 text-xs text-muted">{t('Endereço')}</p>
              <p className="font-mono text-lg font-semibold">{info ? `${info.addresses[0] ?? '?'}:${info.port}` : '…'}</p>
              {info && info.addresses.length > 1 && (
                <p className="mt-0.5 text-[11px] text-muted">
                  {t('Se não conectar, tente: {list}', { list: info.addresses.slice(1).map((a) => `${a}:${info.port}`).join(', ') })}
                </p>
              )}
              <p className="mt-3 text-xs text-muted">{t('Código')}</p>
              <p className="font-mono text-3xl font-bold tracking-[0.2em] text-[var(--accent)]">{code || '…'}</p>
              {info && !info.addresses.length && (
                <p className="mt-3 text-xs text-amber-300">{t('Este computador não parece estar conectado a uma rede.')}</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 min-h-[64px] rounded-2xl bg-[var(--bg-raised)] px-4 py-3">
          {log.length ? (
            log.map((l) => (
              <p key={l.id} className="truncate text-xs">
                {l.text}
              </p>
            ))
          ) : (
            <p className="text-xs text-muted">{t('Esperando o celular…')}</p>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          {t('A ponte fica ligada só enquanto esta janela estiver aberta. As músicas do celular vão para a pasta "Harmony do celular".')}
        </p>
      </div>
    </div>,
    document.body
  )
}
