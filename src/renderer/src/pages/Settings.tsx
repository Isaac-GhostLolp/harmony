import { useEffect, useState } from 'react'
import { useUiStore, type BackgroundMode } from '@/store/uiStore'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import type { ThemeName } from '@/types'
import { WORLDS } from '@/worlds/registry'

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
  const {
    theme,
    setTheme,
    crossfade,
    setCrossfade,
    background,
    setBackground,
    world,
    setWorld,
    worldOpacity,
    setWorldOpacity,
    worldBlur,
    setWorldBlur,
    customMedia,
    setCustomMedia
  } = useUiStore()
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
        <h2 className="text-sm font-semibold">Em qual mundo você quer ouvir hoje?</h2>
        <p className="mb-4 mt-0.5 text-xs text-muted">
          Temas clássicos são leves e rápidos. Os Worlds transformam o Harmony em um
          universo vivo que reage à sua música.
        </p>

        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Clássicos
        </h3>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setWorld(null)
                setTheme(t.id)
              }}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                theme === t.id && !world
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-raised)] text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Worlds vivos
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {WORLDS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWorld(world === w.id ? null : w.id)}
              className={`lift flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
                world === w.id
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-white/5 bg-[var(--bg-raised)] hover:border-white/15'
              }`}
            >
              <span className="text-2xl">{w.emoji}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {w.name}
                  {w.category === 'signature' && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase text-[var(--accent)]">
                      Signature
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">{w.blurb}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Mais mundos a caminho — e, futuramente, criados pela própria comunidade. 🌌
        </p>

        {world && (
          <div className="mt-5 rounded-2xl bg-[var(--bg-raised)] p-4">
            <h3 className="mb-3 text-xs font-semibold">Personalizar este mundo</h3>
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>Transparência dos painéis</span>
                  <span>{worldOpacity}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={worldOpacity}
                  onChange={(e) => setWorldOpacity(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>Desfoque (blur)</span>
                  <span>{worldBlur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={worldBlur}
                  onChange={(e) => setWorldBlur(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Custom media importer — visible when the "Meu fundo" world is active */}
        {world === 'custom' && (
          <div className="mt-3 rounded-2xl bg-[var(--bg-raised)] p-4">
            <h3 className="mb-1 text-xs font-semibold">Meu fundo personalizado 🖼️</h3>
            <p className="mb-3 text-[11px] text-muted">
              Importe uma imagem (PNG/JPG) ou um vídeo (MP4/WebM) para usar como fundo. Vídeos
              muito pesados podem deixar o app mais lento.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="press cursor-pointer rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white">
                Escolher arquivo
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const url = URL.createObjectURL(file)
                    const type = file.type.startsWith('video') ? 'video' : 'image'
                    setCustomMedia({ type, url })
                  }}
                />
              </label>
              {customMedia && (
                <button
                  onClick={() => setCustomMedia(null)}
                  className="rounded-full bg-[var(--bg-surface)] px-4 py-2 text-xs text-muted hover:text-ink"
                >
                  Remover
                </button>
              )}
              {customMedia && (
                <span className="text-[11px] text-muted">
                  {customMedia.type === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'} carregado
                </span>
              )}
            </div>
          </div>
        )}

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
