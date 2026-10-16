import { useCallback, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AppIcon } from '@/components/icons/AppIcon'
import type { IconSlot } from '@/components/icons/slots'
import { t, tk } from '@/i18n'
import { useBackCloses } from './back'

/**
 * The phone's navigation: the four most used places as tabs at the bottom,
 * and "Mais" opening a sheet with the rest.
 */
const TABS: { to: string; label: string; slot: IconSlot }[] = [
  { to: '/', label: tk('Biblioteca'), slot: 'library' },
  { to: '/search', label: tk('Pesquisar'), slot: 'search' },
  { to: '/playlists', label: tk('Playlists'), slot: 'playlists' },
  { to: '/favorites', label: tk('Favoritos'), slot: 'favorites' }
]

const MORE: { to: string; label: string; slot: IconSlot }[] = [
  { to: '/my-world', label: tk('Meu Mundo'), slot: 'myworld' },
  { to: '/albums', label: tk('Álbuns'), slot: 'albums' },
  { to: '/artists', label: tk('Artistas'), slot: 'artists' },
  { to: '/history', label: tk('Histórico'), slot: 'history' },
  { to: '/equalizer', label: tk('Equalizador'), slot: 'equalizer' },
  { to: '/personalize', label: tk('Personalização'), slot: 'personalize' },
  { to: '/settings', label: tk('Configurações'), slot: 'settings' },
  { to: '/support', label: tk('Apoie o Harmony'), slot: 'support' }
]

export function BottomNav(): JSX.Element {
  const [more, setMore] = useState(false)
  const close = useCallback(() => setMore(false), [])
  useBackCloses(more, close)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const inMore = MORE.some((m) => m.to === pathname)

  return (
    <>
      <nav className="m-nav fixed inset-x-0 bottom-0 z-[60] flex">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            onClick={close}
            className={({ isActive }) => `m-tab ${isActive && !more ? 'is-active' : ''}`}
          >
            <AppIcon slot={tab.slot} size={21} strokeWidth={1.8} />
            <span>{t(tab.label)}</span>
          </NavLink>
        ))}
        <button className={`m-tab ${more || inMore ? 'is-active' : ''}`} onClick={() => setMore((v) => !v)}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
          <span>{t('Mais')}</span>
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-[59] bg-black/50" onClick={close}>
          <div className="m-sheet glass fade-rise" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--bg-raised)]" />
            <div className="grid grid-cols-4 gap-1">
              {MORE.map((m) => (
                <button
                  key={m.to}
                  onClick={() => {
                    navigate(m.to)
                    close()
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-[11px] leading-tight ${
                    pathname === m.to ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted active:bg-[var(--bg-raised)]'
                  }`}
                >
                  <AppIcon slot={m.slot} size={22} strokeWidth={1.8} />
                  {t(m.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
