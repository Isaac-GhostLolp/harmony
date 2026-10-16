import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { Spinner } from '@/components/Spinner'
import { t } from '@/i18n'

/** Settings → Pastas de música (Android): which folders the library reads, and changing them. */
export function AndroidFolders(): JSX.Element {
  const [folders, setFolders] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = (): void => {
    void api.settings.get().then((raw) => {
      const f = (raw as Record<string, unknown>).androidFolders
      setFolders(Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [])
    })
  }
  useEffect(load, [])

  const choose = async (): Promise<void> => {
    setBusy(true)
    setMsg(null)
    try {
      const r = (await api.library.selectAndScan()) as { added: number } | null
      if (r) setMsg(t('Biblioteca atualizada com as pastas escolhidas.'))
      load()
    } finally {
      setBusy(false)
    }
  }

  // "/storage/emulated/0/Music/Rock" → "Music › Rock"; a memory card keeps its name in front
  const label = (path: string): string => {
    const p = path.split('/').filter(Boolean)
    const rest = p[1] === 'emulated' ? p.slice(3) : p.slice(2)
    const name = rest.join(' › ') || t('Todo o armazenamento')
    return p[1] === 'emulated' ? name : `${t('Cartão de memória')} › ${name}`
  }

  return (
    <section className="glass mb-4 rounded-2xl p-5">
      <h2 className="text-sm font-semibold">{t('Pastas de música')}</h2>
      <p className="mt-0.5 text-xs text-muted">{t('O Harmony só mostra as músicas destas pastas do celular.')}</p>
      <ul className="mt-3 space-y-1.5">
        {folders.length === 0 && <li className="text-xs text-muted">{t('Nenhuma pasta escolhida ainda.')}</li>}
        {folders.map((f) => (
          <li key={f} className="truncate rounded-lg bg-[var(--bg-raised)] px-3 py-2 text-xs">
            📁 {label(f)}
          </li>
        ))}
      </ul>
      <button
        onClick={() => void choose()}
        disabled={busy}
        className="mt-3 flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--on-accent,#fff)] disabled:opacity-60"
      >
        {busy && <Spinner size={13} />}
        {folders.length ? t('Mudar pastas') : t('Escolher pastas')}
      </button>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </section>
  )
}
