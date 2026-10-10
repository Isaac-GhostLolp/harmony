import { useEffect, useMemo, useState } from 'react'
import { Play, Search, X } from 'lucide-react'
import type { MusicProfile, Song } from '@/types'
import { usePlayerStore } from '@/store/playerStore'
import { CoverArt } from '@/components/CoverArt'
import { clockLabel, WEEKDAYS, type Badge, type WorldStats } from './worldData'
import { SectionTitle, useCountUp } from './parts'
import { t, locale } from '@/i18n'

// ---------------------------------------------------------------------------
// Big numbers + "você sabia?"
// ---------------------------------------------------------------------------

function Tile({ emoji, value, suffix, label, hue, delay }: { emoji: string; value: number; suffix?: string; label: string; hue: number; delay: number }): JSX.Element {
  const v = useCountUp(value)
  return (
    <div
      className="glass lift fade-rise relative overflow-hidden rounded-2xl p-4"
      style={{ animationDelay: `${delay}ms`, background: `linear-gradient(140deg, hsl(${hue} 85% 55% / 0.18), transparent 65%)` }}
    >
      <span className="absolute -right-2 -top-3 text-6xl opacity-20">{emoji}</span>
      <p className="text-3xl font-black tabular-nums tracking-tight">
        {v.toLocaleString(locale())}
        {suffix && <span className="ml-0.5 text-lg font-bold text-muted">{suffix}</span>}
      </p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  )
}

export function Numbers({ p, w, hue, facts }: { p: MusicProfile; w: WorldStats; hue: number; facts: string[] }): JSX.Element {
  const [fact, setFact] = useState(0)
  useEffect(() => {
    if (facts.length < 2) return
    const id = window.setInterval(() => setFact((f) => (f + 1) % facts.length), 5000)
    return () => window.clearInterval(id)
  }, [facts.length])

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile emoji="🎧" value={Math.floor(p.hoursPlayed)} suffix="h" label={t('de música ouvida')} hue={hue} delay={0} />
        <Tile emoji="▶️" value={p.totalPlays} label={t('plays no total')} hue={hue + 40} delay={60} />
        <Tile emoji="🔥" value={w.streak.current} suffix={w.streak.current === 1 ? t(' dia') : t(' dias')} label={t('seguidos agora · recorde: {n}', { n: w.streak.best })} hue={20} delay={120} />
        <Tile emoji="🧭" value={w.artists} label={t('artistas que você já ouviu')} hue={hue - 60} delay={180} />
      </div>
      {facts.length > 0 && (
        <div className="glass mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
          <span className="text-xl">💡</span>
          <p key={fact} className="fade-rise flex-1">
            <span className="mr-1 font-semibold">{t('Você sabia?')}</span>
            {facts[fact % facts.length]}
          </p>
          {facts.length > 1 && (
            <div className="flex gap-1">
              {facts.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setFact(i)}
                  aria-label={t('Curiosidade {n}', { n: i + 1 })}
                  className={`h-1.5 rounded-full transition-all ${i === fact % facts.length ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-white/25'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Podium + top songs
// ---------------------------------------------------------------------------

export function Podium({ w }: { w: WorldStats }): JSX.Element {
  const [a, b, c] = w.topArtists
  const steps: { artist: (typeof w.topArtists)[number] | undefined; place: number; h: string; medal: string }[] = [
    { artist: b, place: 2, h: 'h-20', medal: '🥈' },
    { artist: a, place: 1, h: 'h-28', medal: '🥇' },
    { artist: c, place: 3, h: 'h-14', medal: '🥉' }
  ]
  return (
    <div className="glass fade-rise rounded-3xl p-5">
      <SectionTitle emoji="🏆" title={t('Seu pódio')} hint={t('os artistas da sua vida')} />
      {!a ? (
        <p className="py-10 text-center text-sm text-muted">{t('Ouça algumas músicas e seu pódio aparece aqui.')}</p>
      ) : (
        <>
          <div className="flex items-end justify-center gap-3">
            {steps.map(({ artist, place, h, medal }) => (
              <div key={place} className="flex w-28 flex-col items-center">
                {artist ? (
                  <>
                    <span className="mb-1 text-2xl">{medal}</span>
                    <div className={`overflow-hidden rounded-full ring-2 ${place === 1 ? 'h-20 w-20 ring-yellow-300' : 'h-16 w-16 ring-white/30'}`}>
                      <CoverArt src={artist.cover} title={artist.name} size="full" rounded="full" />
                    </div>
                    <p className="mt-2 w-full truncate text-center text-sm font-semibold">{artist.name}</p>
                    <p className="text-[11px] text-muted">{artist.plays} plays</p>
                  </>
                ) : (
                  <div className="h-16" />
                )}
                <div
                  className={`mt-2 grid w-full ${h} place-items-center rounded-t-xl text-2xl font-black text-white/80`}
                  style={{
                    background:
                      place === 1
                        ? 'linear-gradient(180deg, #facc15, #a16207)'
                        : place === 2
                          ? 'linear-gradient(180deg, #e5e7eb, #6b7280)'
                          : 'linear-gradient(180deg, #fb923c, #9a3412)'
                  }}
                >
                  {place}
                </div>
              </div>
            ))}
          </div>
          {w.topArtists.length > 3 && (
            <div className="mt-3 flex justify-center gap-4 text-xs text-muted">
              {w.topArtists.slice(3).map((x, i) => (
                <span key={x.id}>
                  {i + 4}º <span className="text-ink">{x.name}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function TopSongs({ w, songs }: { w: WorldStats; songs: Song[] }): JSX.Element {
  const playQueue = usePlayerStore((s) => s.playQueue)
  const max = w.topSongs[0]?.plays ?? 1
  const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs])
  return (
    <div className="glass fade-rise rounded-3xl p-5">
      <SectionTitle emoji="🎶" title={t('Suas 5 do coração')} hint={t('as que mais tocaram')} />
      {w.topSongs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('Suas músicas mais tocadas aparecem aqui.')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {w.topSongs.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                const queue = w.topSongs.map((t) => byId.get(t.id)).filter((x): x is Song => Boolean(x))
                const at = queue.findIndex((q) => q.id === s.id)
                if (at >= 0) playQueue(queue, at)
              }}
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl p-2 text-left hover:bg-white/5"
            >
              <div
                className="absolute inset-y-1 left-0 origin-left rounded-xl bg-[var(--accent-soft)]"
                style={{ width: '100%', transform: `scaleX(${s.plays / max})`, opacity: 0.55 }}
              />
              <span className="relative w-5 text-center text-sm font-black text-muted">{i + 1}</span>
              <div className="relative">
                <CoverArt src={s.coverPath} title={s.title} size="sm" rounded="lg" />
                <Play size={14} fill="white" stroke="white" className="absolute inset-0 m-auto hidden group-hover:block" />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.title}</p>
                <p className="truncate text-xs text-muted">{s.artist ?? '—'}</p>
              </div>
              <span className="relative text-xs tabular-nums text-muted">{s.plays}×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Listening clock + week + genre DNA
// ---------------------------------------------------------------------------

export function ListeningClock({ w, hue }: { w: WorldStats; hue: number }): JSX.Element {
  const label = clockLabel(w.hours)
  const max = Math.max(1, ...w.hours)
  const nowH = new Date().getHours()
  const size = 200
  const c = size / 2
  const r0 = 46
  const r1 = 92
  const weekMax = Math.max(1, ...w.weekdays)
  let favDay = 0
  for (let i = 1; i < 7; i++) if (w.weekdays[i] > w.weekdays[favDay]) favDay = i
  return (
    <div className="glass fade-rise rounded-3xl p-5">
      <SectionTitle emoji="🕰️" title={t('Seu relógio musical')} />
      {!label ? (
        <p className="py-10 text-center text-sm text-muted">{t('Quando você ouvir mais, mostramos sua hora favorita.')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <svg viewBox={`0 0 ${size} ${size}`} className="h-48 w-48 shrink-0">
            {w.hours.map((n, h) => {
              const a = (h / 24) * Math.PI * 2 - Math.PI / 2
              const len = r0 + 4 + (n / max) * (r1 - r0 - 4)
              return (
                <line
                  key={h}
                  x1={c + Math.cos(a) * r0}
                  y1={c + Math.sin(a) * r0}
                  x2={c + Math.cos(a) * len}
                  y2={c + Math.sin(a) * len}
                  stroke={h === label.peak ? `hsl(${hue + 40} 95% 70%)` : `hsl(${hue} 80% ${h === nowH ? 80 : 60}%)`}
                  strokeOpacity={n ? 1 : 0.25}
                  strokeWidth={h === label.peak ? 9 : 7}
                  strokeLinecap="round"
                />
              )
            })}
            {[0, 6, 12, 18].map((h) => {
              const a = (h / 24) * Math.PI * 2 - Math.PI / 2
              return (
                <text key={h} x={c + Math.cos(a) * 30} y={c + Math.sin(a) * 30 + 3} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.5">
                  {h}h
                </text>
              )
            })}
            <text x={c} y={c + 4} textAnchor="middle" fontSize="16">
              {label.emoji}
            </text>
          </svg>
          <div className="min-w-[160px] flex-1">
            <p className="text-lg font-semibold leading-snug">{label.text}</p>
            <p className="mt-1 text-xs text-muted">
              {t('Seu horário de pico é por volta das')} <span className="text-ink">{label.peak}h</span>.
            </p>
            <div className="mt-4 flex h-16 items-end gap-1.5">
              {w.weekdays.map((n, d) => (
                <div key={d} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-md"
                    style={{
                      height: `${Math.max(6, (n / weekMax) * 48)}px`,
                      background: d === favDay ? `hsl(${hue + 40} 95% 65%)` : `hsl(${hue} 60% 55% / 0.55)`
                    }}
                  />
                  <span className="text-[9px] uppercase text-muted">{t(WEEKDAYS[d]).slice(0, 3)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {t('Seu dia favorito para ouvir é')} <span className="text-ink">{t(WEEKDAYS[favDay])}</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export function GenreDNA({ w, hue }: { w: WorldStats; hue: number }): JSX.Element | null {
  const total = w.topGenres.reduce((a, g) => a + g.plays, 0)
  if (!total) return null
  return (
    <div className="glass fade-rise rounded-3xl p-5">
      <SectionTitle emoji="🧬" title={t('Seu DNA musical')} hint={t('do que o seu som é feito')} />
      <div className="flex h-5 overflow-hidden rounded-full">
        {w.topGenres.map((g, i) => (
          <div
            key={g.genre}
            title={`${g.genre} · ${Math.round((g.plays / total) * 100)}%`}
            style={{ width: `${(g.plays / total) * 100}%`, background: `hsl(${hue + i * 47} 85% 60%)` }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {w.topGenres.map((g, i) => (
          <span key={g.genre} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${hue + i * 47} 85% 60%)` }} />
            <span className="font-medium">{g.genre}</span>
            <span className="text-muted">{Math.round((g.plays / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The song of my life
// ---------------------------------------------------------------------------

export function Anthem({
  songs,
  anthem,
  hue,
  onChange,
  onSaved
}: {
  songs: Song[]
  anthem: { songId: number; note: string } | null
  hue: number
  onChange: (a: { songId: number; note: string } | null) => void
  onSaved: (x: number, y: number) => void
}): JSX.Element {
  const playQueue = usePlayerStore((s) => s.playQueue)
  const [query, setQuery] = useState('')
  const [choosing, setChoosing] = useState(false)
  const song = anthem ? songs.find((s) => s.id === anthem.songId) ?? null : null
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return songs.slice(0, 6)
    return songs.filter((s) => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)).slice(0, 6)
  }, [songs, query])

  return (
    <div
      className="glass fade-rise relative overflow-hidden rounded-3xl p-5"
      style={{ background: `radial-gradient(circle at 15% 20%, hsl(${hue + 20} 90% 60% / 0.22), transparent 60%)` }}
    >
      <SectionTitle emoji="💖" title={t('A música da minha vida')} hint={t('aquela que diz tudo sobre você')} />
      {song && !choosing ? (
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative">
            <div className="h-32 w-32 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15">
              <CoverArt src={song.coverPath} title={song.title} size="full" rounded="2xl" />
            </div>
            <span className="absolute -right-3 -top-3 text-3xl">💖</span>
          </div>
          <div className="min-w-[200px] flex-1">
            <p className="text-xl font-bold">{song.title}</p>
            <p className="text-sm text-muted">{song.artist ?? '—'}</p>
            <textarea
              value={anthem?.note ?? ''}
              onChange={(e) => onChange({ songId: song.id, note: e.target.value })}
              maxLength={160}
              rows={2}
              placeholder={t('Por que ela é especial? Escreva um recadinho…')}
              className="mt-2 w-full resize-none rounded-xl bg-white/5 px-3 py-2 font-serif text-sm italic placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => playQueue([song], 0)}
                className="press flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white"
              >
                <Play size={12} fill="white" /> {t('Tocar')}
              </button>
              <button onClick={() => setChoosing(true)} className="rounded-full bg-white/10 px-4 py-1.5 text-xs">
                {t('Trocar')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            <Search size={14} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Procure na sua biblioteca…')}
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {song && (
              <button onClick={() => setChoosing(false)} aria-label={t('Cancelar')}>
                <X size={14} className="text-muted" />
              </button>
            )}
          </div>
          {songs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t('Importe músicas para escolher a sua.')}</p>
          ) : (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {results.map((s) => (
                <button
                  key={s.id}
                  onClick={(e) => {
                    onChange({ songId: s.id, note: anthem?.songId === s.id ? anthem.note : '' })
                    setChoosing(false)
                    setQuery('')
                    onSaved(e.clientX, e.clientY)
                  }}
                  className="flex items-center gap-2 rounded-xl p-2 text-left hover:bg-white/5"
                >
                  <CoverArt src={s.coverPath} title={s.title} size="sm" rounded="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{s.title}</p>
                    <p className="truncate text-xs text-muted">{s.artist ?? '—'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Achievements + journey
// ---------------------------------------------------------------------------

export function Achievements({ badges, hue }: { badges: Badge[]; hue: number }): JSX.Element {
  const done = badges.filter((b) => b.progress >= 1).length
  return (
    <div className="mb-6">
      <SectionTitle emoji="🏅" title={t('Conquistas')} hint={t('{done} de {total} desbloqueadas', { done, total: badges.length })} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
        {badges.map((b, i) => {
          const got = b.progress >= 1
          return (
            <div
              key={b.title}
              className={`glass lift fade-rise group relative overflow-hidden rounded-2xl p-4 text-center ${got ? '' : 'opacity-70'}`}
              style={{
                animationDelay: `${i * 35}ms`,
                background: got ? `linear-gradient(160deg, hsl(${hue + i * 25} 90% 60% / 0.25), transparent 70%)` : undefined
              }}
            >
              <div
                className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-3xl transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110 ${
                  got ? 'bg-white/15 ring-2 ring-white/30' : 'bg-white/5 grayscale'
                }`}
              >
                {got ? b.emoji : '🔒'}
              </div>
              <p className="mt-2 text-sm font-semibold">{b.title}</p>
              <p className="text-[11px] text-muted">{b.detail}</p>
              {!got && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full origin-left bg-[var(--accent)]" style={{ transform: `scaleX(${b.progress})` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Journey({ entries }: { entries: string[] }): JSX.Element | null {
  if (entries.length === 0) return null
  return (
    <div className="mb-6">
      <SectionTitle emoji="📖" title={t('Seu diário musical')} />
      <div className="glass rounded-3xl p-6">
        <div className="relative border-l border-white/10 pl-6">
          {entries.map((entry, i) => (
            <div key={i} className="fade-rise relative mb-5 last:mb-0" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-[var(--accent)] ring-4 ring-[var(--accent-soft)]" />
              <p className="text-sm leading-relaxed">{entry}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
