import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { MusicProfile, Song } from '@/types'
import { api } from '@/services/api'
import { useProfileStore } from '@/store/profileStore'
import { InputDialog } from '@/components/InputDialog'
import { Spinner } from '@/components/Spinner'
import { RecapStudio } from '@/components/recap/RecapStudio'
import { persistSettingDebounced } from '@/utils/persistSetting'
import { humanizedStats, harmonyJourney } from '@/utils/musicStory'
import { Hero, WORLD_HUES } from './myworld/Hero'
import { MoodMix, Roulette } from './myworld/Fun'
import { Achievements, Anthem, GenreDNA, Journey, ListeningClock, Numbers, Podium, TopSongs } from './myworld/Insights'
import { Confetti, type ConfettiHandle } from './myworld/parts'
import { Capsules } from './myworld/Capsules'
import { badgesOf, greetingWord, levelOf, personalityOf, type WorldStats } from './myworld/worldData'

/**
 * Meu Mundo — the listener's own corner of Harmony. Everything here is about
 * them: their avatar, colour and a line about themselves, a level that grows
 * as they listen, their musical personality, a mood picker and a roulette
 * that play from their library, their podium and top songs, when they
 * listen, what their sound is made of, the song of their life, achievements
 * and a little diary.
 *
 * Personal choices live in settings under `world.*`.
 */

interface WorldPrefs {
  bio: string
  hue: number | null
  avatar: string
  mood: string | null
  anthem: { songId: number; note: string } | null
  level: number
}

const DEFAULT_PREFS: WorldPrefs = { bio: '', hue: null, avatar: '🎧', mood: null, anthem: null, level: 0 }

function accentHue(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const m = v.match(/(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/)
  const h = v.match(/^#?([0-9a-f]{6})$/i)
  let [r, g, b] = [124, 108, 244]
  if (m) [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else if (h) {
    const n = parseInt(h[1], 16)
    ;[r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mx === mn) return WORLD_HUES[0]
  const d = mx - mn
  const hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return Math.round((hue * 60 + 360) % 360)
}

export function MyWorld(): JSX.Element {
  const [profile, setProfile] = useState<MusicProfile | null>(null)
  const [world, setWorld] = useState<WorldStats | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [prefs, setPrefs] = useState<WorldPrefs>(DEFAULT_PREFS)
  const [editingName, setEditingName] = useState(false)
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [recapOpen, setRecapOpen] = useState(false)
  const [params, setParams] = useSearchParams()
  const { name, photo, setName, setPhoto } = useProfileStore()
  const confetti = useRef<ConfettiHandle | null>(null)

  useEffect(() => {
    let alive = true
    setLoadError(false)
    Promise.all([api.stats.profile(), api.stats.world(), api.library.getSongs(), api.settings.get()]).then(
      ([p, w, s, raw]) => {
        if (!alive) return
        const st = raw as Record<string, unknown>
        setProfile(p as MusicProfile)
        setWorld(w as WorldStats)
        setSongs(s as Song[])
        setPrefs({
          bio: typeof st['world.bio'] === 'string' ? st['world.bio'] : '',
          hue: typeof st['world.hue'] === 'number' ? st['world.hue'] : null,
          avatar: typeof st['world.avatar'] === 'string' ? st['world.avatar'] : '🎧',
          mood: typeof st['world.mood'] === 'string' ? st['world.mood'] : null,
          anthem:
            st['world.anthem'] && typeof st['world.anthem'] === 'object'
              ? (st['world.anthem'] as { songId: number; note: string })
              : null,
          level: typeof st['world.level'] === 'number' ? st['world.level'] : 0
        })
      }
    ).catch((err) => {
      console.error('[MyWorld] failed to load', err)
      if (alive) setLoadError(true)
    })
    return () => {
      alive = false
    }
  }, [reloadKey])

  const set = <K extends keyof WorldPrefs>(key: K, value: WorldPrefs[K], delay = 250): void => {
    setPrefs((p) => ({ ...p, [key]: value }))
    persistSettingDebounced(`world.${key}`, value, delay)
  }

  const level = profile && world ? levelOf(profile, world) : null

  // deep links (e.g. from the "what's new" card): ?recap=1, ?section=capsules
  useEffect(() => {
    if (!profile) return
    const recap = params.get('recap') === '1'
    const section = params.get('section')
    if (!recap && !section) return
    if (recap) setRecapOpen(true)
    if (section) window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' }), 150)
    setParams({}, { replace: true })
  }, [params, profile])

  // celebrate a level gained since the last visit
  useEffect(() => {
    if (!level || !world) return
    if (prefs.level && level.level > prefs.level) {
      setLevelUp(level.level)
      window.setTimeout(() => confetti.current?.burst(window.innerWidth / 2, window.innerHeight / 3), 400)
    }
    if (level.level !== prefs.level) set('level', level.level, 0)
    // only once the data has loaded
  }, [world])

  const facts = useMemo(() => {
    if (!profile || !world) return []
    const out = humanizedStats(profile)
    // the old Estatísticas tab's "média diária", now one of the curiosities
    if (profile.activeDays > 0 && profile.hoursPlayed > 0) {
      const perDay = Math.round((profile.hoursPlayed * 60) / profile.activeDays)
      if (perDay > 0)
        out.push(
          `Nos dias em que você ouve música, são em média ${perDay >= 60 ? `${Math.floor(perDay / 60)}h${String(perDay % 60).padStart(2, '0')}` : `${perDay} minutos`} por dia.`
        )
    }
    if (world.bestDay && world.bestDay.plays >= 3) {
      const d = new Date(world.bestDay.d + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
      out.push(`Seu maior dia de música foi ${d}: ${world.bestDay.plays} plays, ${Math.round(world.bestDay.seconds / 60)} minutos.`)
    }
    if (world.songsPlayed > 0 && profile.totalSongs > 0) {
      out.push(`Você já ouviu ${Math.round((world.songsPlayed / profile.totalSongs) * 100)}% da sua biblioteca. ${world.songsPlayed < profile.totalSongs ? 'Tem tesouro esperando por você!' : 'Tudinho!'}`)
    }
    return out
  }, [profile, world])

  if (loadError) {
    return (
      <div className="grid h-64 place-items-center text-center">
        <div>
          <p className="mb-3 text-sm text-muted">Não consegui carregar o seu mundo agora.</p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  if (!profile || !world || !level) {
    return (
      <div className="grid h-64 place-items-center">
        <Spinner size={22} />
      </div>
    )
  }

  const hue = prefs.hue ?? accentHue()
  const personality = personalityOf(profile, world)
  const badges = badgesOf(profile, world)
  const journey = harmonyJourney(profile)

  return (
    <div className="pb-10">
      <Hero
        name={name}
        photo={photo}
        avatar={prefs.avatar}
        bio={prefs.bio}
        hue={hue}
        greeting={greetingWord()}
        personality={personality}
        level={level}
        onEditName={() => setEditingName(true)}
        onPhoto={(p) => setPhoto(p)}
        onAvatar={(a) => set('avatar', a, 0)}
        onBio={(b) => set('bio', b, 500)}
        onHue={(h) => set('hue', h, 0)}
      />

      {levelUp && (
        <div className="fade-rise mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-yellow-400/25 to-transparent px-4 py-3 ring-1 ring-yellow-300/30">
          <span className="text-2xl">🎉</span>
          <p className="flex-1 text-sm">
            <span className="font-semibold">Subiu de nível!</span> Desde a sua última visita você chegou ao nível{' '}
            <span className="font-semibold">{levelUp}</span>: {level.title}.
          </p>
          <button onClick={() => setLevelUp(null)} className="text-xs text-muted hover:text-ink">
            fechar
          </button>
        </div>
      )}

      {profile.totalPlays > 0 && (
        <button
          onClick={() => setRecapOpen(true)}
          className="group mb-6 flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left text-white ring-1 ring-white/10 transition-transform hover:scale-[1.01]"
          style={{
            background: `linear-gradient(110deg, hsl(${hue} 70% 22%), hsl(${hue + 50} 70% 28%) 60%, hsl(${hue - 30} 70% 24%))`
          }}
        >
          <span className="text-3xl transition-transform group-hover:scale-110">🎬</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Sua Retrospectiva {new Date().getFullYear()}</span>
            <span className="block text-xs text-white/70">
              Seus minutos, artistas e músicas do ano num vídeo pronto para os stories.
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black">
            Criar meu vídeo
          </span>
        </button>
      )}

      <Numbers p={profile} w={world} hue={hue} facts={facts} />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <MoodMix songs={songs} mood={prefs.mood} onMood={(m) => set('mood', m, 0)} />
        <Roulette songs={songs} hue={hue} onWin={(x, y) => confetti.current?.burst(x, y, hue)} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Podium w={world} />
        <TopSongs w={world} songs={songs} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ListeningClock w={world} hue={hue} />
        <div className="flex flex-col gap-4">
          <GenreDNA w={world} hue={hue} />
          <Anthem
            songs={songs}
            anthem={prefs.anthem}
            hue={hue}
            onChange={(a) => set('anthem', a, 500)}
            onSaved={(x, y) => confetti.current?.burst(x, y, hue + 300)}
          />
        </div>
      </div>

      <Capsules songs={songs} hue={hue} />
      <Achievements badges={badges} hue={hue} />
      <Journey entries={journey} />

      <Confetti ref={confetti} />
      {recapOpen && (
        <RecapStudio name={name} photo={photo} avatar={prefs.avatar} hue={hue} onClose={() => setRecapOpen(false)} />
      )}
      <InputDialog
        open={editingName}
        title="Como podemos te chamar?"
        initialValue={name}
        confirmLabel="Salvar"
        onConfirm={(v) => {
          setName(v)
          setEditingName(false)
        }}
        onCancel={() => setEditingName(false)}
      />
    </div>
  )
}
