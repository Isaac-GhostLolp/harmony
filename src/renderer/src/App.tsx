import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { PlayerBar } from '@/components/PlayerBar'
import { QueuePanel } from '@/components/QueuePanel'
import { LyricsOverlay } from '@/components/LyricsOverlay'
import { UpdateNotice } from '@/components/UpdateNotice'
import { DjMode } from '@/components/DjMode'
import { Library } from '@/pages/Library'
import { Albums } from '@/pages/Albums'
import { Artists } from '@/pages/Artists'
import { Playlists } from '@/pages/Playlists'
import { Favorites } from '@/pages/Favorites'
import { History } from '@/pages/History'
import { Search } from '@/pages/Search'
import { Stats } from '@/pages/Stats'
import { Visualizer } from '@/pages/Visualizer'
import { Settings } from '@/pages/Settings'
import { Equalizer } from '@/pages/Equalizer'
import { MyWorld } from '@/pages/MyWorld'
import { Support } from '@/pages/Support'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useUiStore, type BackgroundMode, type LyricsMode } from '@/store/uiStore'
import { usePlayerStore } from '@/store/playerStore'
import { useEqStore } from '@/store/eqStore'
import { useProfileStore } from '@/store/profileStore'
import { api } from '@/services/api'
import { mediaUrl } from '@/utils/format'
import type { ThemeName } from '@/types'

export function App(): JSX.Element {
  // Single audio engine for the whole app
  useAudioPlayer()

  const backgroundMode = useUiStore((s) => s.background)
  const coverPath = usePlayerStore((s) => s.queue[s.currentIndex]?.coverPath ?? null)

  // Restore persisted settings on boot
  useEffect(() => {
    api.settings.get().then((raw) => {
      const s = raw as Record<string, unknown>
      if (typeof s.theme === 'string') useUiStore.getState().setTheme(s.theme as ThemeName)
      if (typeof s.volume === 'number') usePlayerStore.getState().setVolume(s.volume)
      if (typeof s.crossfade === 'number') useUiStore.setState({ crossfade: s.crossfade })
      if (typeof s.background === 'string')
        useUiStore.setState({ background: s.background as BackgroundMode })
      if (typeof s.lyricsMode === 'string')
        useUiStore.setState({ lyricsMode: s.lyricsMode as LyricsMode })
      if (s.eq && typeof s.eq === 'object') {
        useEqStore
          .getState()
          .hydrate(s.eq as { enabled: boolean; preset: string; gains: number[] })
      }
      useProfileStore.getState().hydrate({
        name: typeof s.profileName === 'string' ? s.profileName : undefined,
        photo: typeof s.profilePhoto === 'string' ? s.profilePhoto : null
      })
      const discordEnabled = s.discordEnabled === true
      const discordClientId = typeof s.discordClientId === 'string' ? s.discordClientId : ''
      api.player.configureDiscord(discordEnabled, discordClientId)
    })
  }, [])

  // Broadcast playback state (mini player + Discord Rich Presence)
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((s) => {
      const song = s.queue[s.currentIndex] ?? null
      api.player.sendState({
        title: song?.title ?? null,
        artist: song?.artist ?? null,
        cover: mediaUrl(song?.coverPath ?? null) ?? null,
        isPlaying: s.isPlaying,
        currentTime: s.currentTime,
        duration: song?.duration ?? 0
      })
    })
    const offCmd = api.player.onCommand((cmd) => {
      const s = usePlayerStore.getState()
      if (cmd === 'toggle') s.togglePlay()
      else if (cmd === 'next') s.next()
      else if (cmd === 'prev') s.previous()
    })
    return () => {
      unsub()
      offCmd()
    }
  }, [])

  const bgCover = backgroundMode === 'cover' ? mediaUrl(coverPath) : undefined

  return (
    <HashRouter>
      <div className="ambient relative flex h-full flex-col">
        {/* Dynamic blurred-cover background */}
        {bgCover && (
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center opacity-25 transition-[background-image] duration-700"
            style={{ backgroundImage: `url(${bgCover})`, filter: 'blur(64px) saturate(1.2)' }}
          />
        )}

        <div className="relative flex min-h-0 flex-1">
          <Sidebar />
          <main className="glass z-10 m-3 ml-0 min-w-0 flex-1 overflow-y-auto rounded-2xl p-6">
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/search" element={<Search />} />
              <Route path="/albums" element={<Albums />} />
              <Route path="/artists" element={<Artists />} />
              <Route path="/playlists" element={<Playlists />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/history" element={<History />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/visualizer" element={<Visualizer />} />
              <Route path="/cinema" element={<Visualizer />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/equalizer" element={<Equalizer />} />
              <Route path="/my-world" element={<MyWorld />} />
              <Route path="/support" element={<Support />} />
            </Routes>
          </main>
          <QueuePanel />
          <LyricsOverlay />
        </div>
        <PlayerBar />
        <UpdateNotice />
        <DjMode />
      </div>
    </HashRouter>
  )
}
