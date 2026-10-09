import { useEffect, useState } from 'react'
import { setUltraFast, useUltraFast } from '@/utils/perf'
import { useUiStore } from '@/store/uiStore'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'
import { WHATS_NEW_EVENT } from '@/components/WhatsNew'
import { PatchNotesArchive } from '@/components/PatchNotesArchive'
import { APP_VERSION } from '@/whatsNew'

/**
 * What makes the app work: performance, audio, online lookups, the library
 * and integrations. Everything about the look lives in Personalização.
 */
export function Settings(): JSX.Element {
  const crossfade = useUiStore((s) => s.crossfade)
  const setCrossfade = useUiStore((s) => s.setCrossfade)
  const ultraFast = useUltraFast()
  const [archive, setArchive] = useState(false)
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
      {archive && <PatchNotesArchive onClose={() => setArchive(false)} />}

      <a
        href="#/personalize"
        className="glass mb-4 flex items-center gap-4 rounded-2xl p-5 transition-colors hover:bg-[var(--bg-raised)]"
      >
        <span className="text-2xl" aria-hidden>
          🎨
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Procurando temas, mundos e o visual do app?</h2>
          <p className="mt-0.5 text-xs text-muted">
            Agora eles ficam em Personalização: temas, Mundos vivos, fundo, adesivos, ícones, barra de música e
            animação de abertura.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--on-accent,#fff)]">
          Abrir Personalização
        </span>
      </a>

      <section className="glass mb-4 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">⚡ Modo Ultra Rápido</h2>
            <p className="mt-0.5 text-xs text-muted">
              Deixa o Harmony leve e liso em computadores mais fracos: tira o desfoque de vidro,
              as sombras e as animações da interface, desenha os Worlds vivos e o Visualizer em
              resolução normal a 30 quadros por segundo e pausa os efeitos pequenos, como o LED do
              logo. O som não muda em nada.
            </p>
          </div>
          <button
            onClick={() => setUltraFast(!ultraFast)}
            role="switch"
            aria-checked={ultraFast}
            aria-label="Modo Ultra Rápido"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              ultraFast ? 'bg-[var(--accent)]' : 'bg-[var(--bg-raised)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                ultraFast ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      <section className="glass mb-4 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Novidades</h2>
            <p className="mt-0.5 text-xs text-muted">Você está no Harmony v{APP_VERSION}.</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              onClick={() => window.dispatchEvent(new Event(WHATS_NEW_EVENT))}
              className="rounded-full bg-[var(--bg-raised)] px-4 py-2 text-xs font-medium text-muted hover:text-ink"
            >
              ✨ Ver novidades
            </button>
            <button
              onClick={() => setArchive(true)}
              className="rounded-full bg-[var(--bg-raised)] px-4 py-2 text-xs font-medium text-muted hover:text-ink"
            >
              📜 Todas as versões
            </button>
          </div>
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
