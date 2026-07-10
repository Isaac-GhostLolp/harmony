import { useEffect, useState } from 'react'
import { useUiStore, type BackgroundMode } from '@/store/uiStore'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import type { ThemeName } from '@/types'

const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'darkpro', label: 'Dark Pro' },
  { id: 'light', label: 'Light' },
  { id: 'amoled', label: 'AMOLED' },
  { id: 'glass', label: 'Glass' },
  { id: 'synthwave', label: 'Synthwave' },
  { id: 'nature', label: 'Nature' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'ghostguard', label: 'GhostGuard' },
  { id: 'pixel', label: 'Pixel Art' }
]

export function Settings(): JSX.Element {
  const { theme, setTheme, crossfade, setCrossfade, background, setBackground } = useUiStore()
  const [libraryFolders, setLibraryFolders] = useState<string[]>([])
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordClientId, setDiscordClientId] = useState('')
  const [onlineEnabled, setOnlineEnabled] = useState(true)

  useEffect(() => {
    api.settings.get().then((raw) => {
      const s = raw as Record<string, unknown>
      if (Array.isArray(s.libraryFolders)) {
        setLibraryFolders(s.libraryFolders.filter((f): f is string => typeof f === 'string'))
      } else if (typeof s.libraryFolder === 'string') {
        setLibraryFolders([s.libraryFolder])
      }
      if (s.discordEnabled === true) setDiscordEnabled(true)
      if (typeof s.discordClientId === 'string') setDiscordClientId(s.discordClientId)
      if (s.onlineEnabled === false) setOnlineEnabled(false)
    })
  }, [])

  const applyDiscord = (enabled: boolean, clientId: string): void => {
    setDiscordEnabled(enabled)
    setDiscordClientId(clientId)
    api.settings.set('discordEnabled', enabled)
    api.settings.set('discordClientId', clientId)
    api.player.configureDiscord(enabled, clientId)
  }

  return (
    <div>
      <PageHeader title="Configurações" />

      <section className="glass mb-4 rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Tema</h2>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          A cor de destaque se adapta à capa do álbum atual.
        </p>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                theme === t.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <h3 className="mt-5 text-xs font-semibold">Fundo dinâmico</h3>
        <div className="mt-2 flex gap-2">
          {(
            [
              { id: 'cover', label: 'Blur da capa' },
              { id: 'none', label: 'Nenhum' }
            ] as { id: BackgroundMode; label: string }[]
          ).map((b) => (
            <button
              key={b.id}
              onClick={() => setBackground(b.id)}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                background === b.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass mb-4 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Busca online</h2>
            <p className="mt-0.5 text-xs text-muted">
              Procura letras, capas e álbuns em provedores públicos (LRCLIB, Deezer, iTunes,
              MusicBrainz) quando os arquivos locais não têm essas informações. Filtra
              automaticamente variações como feat, remix e slowed.
            </p>
          </div>
          <button
            onClick={() => {
              const next = !onlineEnabled
              setOnlineEnabled(next)
              api.settings.set('onlineEnabled', next)
            }}
            role="switch"
            aria-checked={onlineEnabled}
            className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${
              onlineEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                onlineEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      <section className="glass mb-4 flex items-center justify-between rounded-2xl p-5">
        <div>
          <h2 className="text-sm font-semibold">Equalizador</h2>
          <p className="mt-0.5 text-xs text-muted">10 bandas, presets e gráfico em tempo real</p>
        </div>
        <a
          href="#/equalizer"
          className="press rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          Abrir equalizador
        </a>
      </section>

      <section className="glass mb-4 rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Crossfade</h2>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          Mistura o fim de uma música com o início da próxima. {crossfade === 0 ? 'Desativado.' : `${crossfade}s.`}
        </p>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={crossfade}
          onChange={(e) => setCrossfade(Number(e.target.value))}
          className="w-full max-w-sm"
          style={{ '--fill': `${(crossfade / 12) * 100}%` } as React.CSSProperties}
          aria-label="Duração do crossfade"
        />
      </section>

      <section className="glass mb-4 rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Discord Rich Presence</h2>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          Mostra o que você está ouvindo no seu perfil. Crie um app em
          discord.com/developers, copie o Application ID e cole abaixo.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => applyDiscord(!discordEnabled, discordClientId)}
            role="switch"
            aria-checked={discordEnabled}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              discordEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                discordEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
          <input
            value={discordClientId}
            onChange={(e) => applyDiscord(discordEnabled, e.target.value)}
            placeholder="Application ID"
            className="glass w-64 rounded-full px-4 py-2 text-xs outline-none placeholder:text-muted"
          />
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <h2 className="text-sm font-semibold">Biblioteca</h2>
        <p className="mt-0.5 text-xs text-muted">
          Pastas monitoradas pelo botão Atualizar da Biblioteca:
        </p>
        {libraryFolders.length === 0 ? (
          <p className="mt-1 text-xs text-ink">nenhuma pasta importada ainda</p>
        ) : (
          libraryFolders.map((f) => (
            <p key={f} className="mt-1 truncate text-xs text-ink">
              {f}
            </p>
          ))
        )}
        <p className="mt-2 text-xs text-muted">
          Para adicionar novas pastas, use o botão Importar na Biblioteca.
        </p>
      </section>
    </div>
  )
}
