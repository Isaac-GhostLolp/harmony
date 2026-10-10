import { NavLink } from 'react-router-dom'
import { LogoLed } from './LogoLed'
import { StickerZone } from './stickers/StickerZone'
import { AppIcon } from './icons/AppIcon'
import type { IconSlot } from './icons/slots'
import { t, tk } from '@/i18n'

const items: { to: string; label: string; slot: IconSlot }[] = [
  { to: '/', label: tk('Biblioteca'), slot: 'library' },
  { to: '/my-world', label: tk('Meu Mundo'), slot: 'myworld' },
  { to: '/search', label: tk('Pesquisar'), slot: 'search' },
  { to: '/playlists', label: tk('Playlists'), slot: 'playlists' },
  { to: '/artists', label: tk('Artistas'), slot: 'artists' },
  { to: '/albums', label: tk('Álbuns'), slot: 'albums' },
  { to: '/favorites', label: tk('Favoritos'), slot: 'favorites' },
  { to: '/visualizer', label: tk('Visualizer'), slot: 'visualizer' },
  { to: '/history', label: tk('Histórico'), slot: 'history' },
  { to: '/equalizer', label: tk('Equalizador'), slot: 'equalizer' },
  { to: '/personalize', label: tk('Personalização'), slot: 'personalize' },
  { to: '/settings', label: tk('Configurações'), slot: 'settings' }
]

const linkClass = (isActive: boolean): string =>
  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
    isActive
      ? 'bg-[var(--accent-soft)] text-ink'
      : 'text-muted hover:bg-[var(--bg-raised)] hover:text-ink'
  }`

export function Sidebar(): JSX.Element {
  return (
    <aside data-stk-host className="glass glass-panel z-10 m-3 flex w-56 shrink-0 flex-col rounded-2xl p-3">
      {/* Brand — fixed at top */}
      <div className="mb-4 flex shrink-0 items-center gap-4 px-3 pt-2">
        <LogoLed />
        <span className="text-lg font-semibold tracking-tight">{t('Harmony')}</span>
      </div>

      {/* Navigation — scrolls if the window is short, so nothing gets cut off */}
      <nav
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {items.map(({ to, label, slot }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => linkClass(isActive)}>
            <AppIcon slot={slot} size={17} strokeWidth={1.8} />
            {t(label)}
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
          <AppIcon
            slot="support"
            size={17}
            strokeWidth={1.8}
            className="text-[var(--accent)] transition-transform group-hover:scale-110"
          />
          {t('Apoie o Harmony')}
        </NavLink>
      </div>

      <StickerZone zone="sidebar" label={t('Barra lateral')} />
    </aside>
  )
}
