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

const linkClass = (isActive: boolean): string =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
    isActive
      ? 'bg-[var(--accent-soft)] text-ink'
      : 'text-muted hover:bg-[var(--bg-raised)] hover:text-ink'
  }`

export function Sidebar(): JSX.Element {
  return (
    <aside className="glass z-10 m-3 flex w-56 shrink-0 flex-col rounded-2xl p-3">
      {/* Brand — fixed at top */}
      <div className="mb-4 flex shrink-0 items-center gap-2 px-2 pt-1">
        <div
          className="h-8 w-8 rounded-lg"
          style={{ background: 'linear-gradient(135deg, var(--accent), transparent 160%)' }}
        />
        <span className="text-lg font-semibold tracking-tight">Harmony</span>
      </div>

      {/* Navigation — scrolls if the window is short, so nothing gets cut off */}
      <nav
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => linkClass(isActive)}>
            <Icon size={17} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Support — pinned to the bottom so it's always reachable */}
      <div className="mt-2 shrink-0 border-t border-white/5 pt-2">
        <NavLink
          to="/support"
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-[var(--accent-soft)] text-ink'
                : 'text-muted hover:bg-[var(--bg-raised)] hover:text-ink'
            }`
          }
        >
          <Heart
            size={17}
            strokeWidth={1.8}
            className="text-[var(--accent)] transition-transform group-hover:scale-110"
          />
          Apoie o Harmony
        </NavLink>
      </div>
    </aside>
  )
}
