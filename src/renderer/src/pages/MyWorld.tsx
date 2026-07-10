import { useEffect, useRef, useState } from 'react'
import { Camera, Pencil, Sparkles, Music2, Disc3, Mic2, Clock, CalendarDays } from 'lucide-react'
import type { MusicProfile } from '@/types'
import { api } from '@/services/api'
import { useProfileStore } from '@/store/profileStore'
import { PageHeader } from '@/components/PageHeader'
import { InputDialog } from '@/components/InputDialog'
import { humanizedStats, harmonyMoments, harmonyJourney } from '@/utils/musicStory'
import { BreathingEmoji } from '@/hooks/useBreathe'

export function MyWorld(): JSX.Element {
  const [profile, setProfile] = useState<MusicProfile | null>(null)
  const { name, photo, setName, setPhoto } = useProfileStore()
  const [editingName, setEditingName] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    api.stats.profile().then((p) => setProfile(p as MusicProfile))
  }, [])

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  if (!profile) return <PageHeader title="Meu Mundo Musical" />

  const stats = humanizedStats(profile)
  const moments = harmonyMoments(profile)
  const journey = harmonyJourney(profile)
  const daysUsing = profile.firstAdded
    ? Math.max(1, Math.floor((Date.now() / 1000 - profile.firstAdded) / 86400))
    : 0

  const facts = [
    { icon: Mic2, label: 'Artista favorito', value: profile.topArtist?.name ?? '—' },
    { icon: Disc3, label: 'Álbum favorito', value: profile.topAlbum?.title ?? '—' },
    { icon: Sparkles, label: 'Gênero favorito', value: profile.topGenre?.genre ?? '—' },
    { icon: Music2, label: 'Total de músicas', value: String(profile.totalSongs) },
    { icon: Mic2, label: 'Total de artistas', value: String(profile.totalArtists) },
    { icon: Clock, label: 'Horas escutando', value: `${Math.floor(profile.hoursPlayed)}h` },
    { icon: CalendarDays, label: 'Dias usando o Harmony', value: String(daysUsing) },
    {
      icon: Music2,
      label: 'Playlist favorita',
      value: profile.topPlaylist?.name ?? '—'
    }
  ]

  return (
    <div className="pb-8">
      <PageHeader title="🎵 Meu Mundo Musical" subtitle="Seu pequeno painel pessoal" />

      {/* Profile header */}
      <div className="glass fade-rise mb-6 flex items-center gap-5 rounded-2xl p-6">
        <button
          onClick={() => fileRef.current?.click()}
          className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full"
          title="Trocar foto"
        >
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="grid h-full w-full place-items-center"
              style={{ background: 'linear-gradient(135deg, var(--accent), hsl(280 50% 40%))' }}
            >
              <span className="text-3xl font-semibold text-white/90">
                {name ? name[0].toUpperCase() : '♪'}
              </span>
            </div>
          )}
          <div className="absolute inset-0 hidden place-items-center bg-black/50 group-hover:grid">
            <Camera size={20} className="text-white" />
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
        <div className="min-w-0">
          <button
            onClick={() => setEditingName(true)}
            className="group flex items-center gap-2 text-left"
          >
            <h2 className="text-2xl font-semibold tracking-tight">{name}</h2>
            <Pencil size={15} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <p className="mt-1 text-sm text-muted">
            {profile.totalPlays > 0
              ? `${profile.totalPlays} reproduções · ${daysUsing} dias de jornada`
              : 'Sua história musical começa agora.'}
          </p>
          {profile.lastSong && (
            <p className="mt-2 text-xs text-muted">
              Última: <span className="text-ink">{profile.lastSong.title}</span>
            </p>
          )}
        </div>
      </div>

      {/* Humanized stats — the emotional highlights */}
      {stats.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {stats.map((line, i) => (
            <div
              key={i}
              className="glass fade-rise rounded-2xl p-4 text-sm leading-relaxed"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Facts grid */}
      <h3 className="mb-3 text-sm font-semibold text-muted">Panorama</h3>
      <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {facts.map((f, i) => (
          <div
            key={f.label}
            className="glass lift fade-rise rounded-2xl p-4"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <f.icon size={16} className="text-[var(--accent)]" />
            <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">{f.label}</p>
            <p className="mt-1 truncate text-lg font-semibold">{f.value}</p>
          </div>
        ))}
      </div>

      {/* Harmony Moments */}
      <h3 className="mb-3 text-sm font-semibold text-muted">Harmony Moments</h3>
      <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {moments.map((m, i) => (
          <div
            key={m.title}
            className={`glass lift fade-rise flex items-center gap-3 rounded-2xl p-4 ${
              m.reached ? '' : 'opacity-55'
            }`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <BreathingEmoji emoji={m.emoji} active={m.reached} className="text-2xl" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{m.title}</p>
              <p className="truncate text-xs text-muted">{m.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Harmony Journey */}
      {journey.length > 0 && (
        <>
          <h3 className="mb-3 text-sm font-semibold text-muted">Harmony Journey</h3>
          <div className="glass rounded-2xl p-6">
            <div className="relative border-l border-white/10 pl-6">
              {journey.map((entry, i) => (
                <div
                  key={i}
                  className="fade-rise relative mb-5 last:mb-0"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                  <p className="text-sm leading-relaxed">{entry}</p>
                </div>
              ))}
            </div>
          </div>
        </>
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
