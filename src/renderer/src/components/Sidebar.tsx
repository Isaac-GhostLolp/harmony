import { NavLink } from 'react-router-dom'
import {
  Library,
  ListMusic,
  MicVocal,
  Disc3,
  Heart,
  Clock,
  Clapperboard,
  Settings,
  BarChart3,
  Search,
  SlidersHorizontal,
  Globe2
} from 'lucide-react'

const items = [
  { to: '/', label: 'Biblioteca', icon: Library },
  { to: '/my-world', label: 'Meu Mundo', icon: Globe2 },
  { to: '/search', label: 'Pesquisar', icon: Search },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/artists', label: 'Artistas', icon: MicVocal },
  { to: '/albums', label: 'Álbuns', icon: Disc3 },
  { to: '/favorites', label: 'Favoritos', icon: Heart },
  { to: '/visualizer', label: 'Visualizer', icon: Clapperboard },
  { to: '/history', label: 'Histórico', icon: Clock },
  { to: '/stats', label: 'Estatísticas', icon: BarChart3 },
  { to: '/equalizer', label: 'Equalizador', icon: SlidersHorizontal },
  { to: '/settings', label: 'Configurações', icon: Settings }
]

export function Sidebar(): JSX.Element {
  return (
    <aside className="glass z-10 m-3 flex w-56 shrink-0 flex-col gap-1 rounded-2xl p-3">
      <div className="mb-4 flex items-center gap-2 px-2 pt-1">
        <div
          className="h-8 w-8 rounded-lg"
          style={{
            background: 'linear-gradient(135deg, var(--accent), transparent 160%)'
          }}
        />
        <span className="text-lg font-semibold tracking-tight">Harmony</span>
      </div>

      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-[var(--accent-soft)] text-ink'
                : 'text-muted hover:bg-[var(--bg-raised)] hover:text-ink'
            }`
          }
        >
          <Icon size={17} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
    </aside>
  )
}
