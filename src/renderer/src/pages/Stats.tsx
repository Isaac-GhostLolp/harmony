import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Stats as StatsData } from '@/types'
import { api } from '@/services/api'
import { PageHeader } from '@/components/PageHeader'

export function Stats(): JSX.Element {
  const [stats, setStats] = useState<StatsData | null>(null)

  useEffect(() => {
    api.stats.get().then((s) => setStats(s as StatsData))
  }, [])

  if (!stats) return <PageHeader title="Estatísticas" />

  const cards = [
    { label: 'Artista mais ouvido', value: stats.topArtist?.name ?? '—', detail: stats.topArtist ? `${stats.topArtist.plays} reproduções` : '' },
    { label: 'Música favorita', value: stats.topSong?.title ?? '—', detail: stats.topSong ? `${stats.topSong.artist ?? ''} · ${stats.topSong.plays}x` : '' },
    { label: 'Horas reproduzidas', value: stats.hoursPlayed.toFixed(1) + 'h', detail: 'desde o início' },
    { label: 'Músicas na biblioteca', value: String(stats.totalSongs), detail: '' },
    { label: 'Artistas', value: String(stats.totalArtists), detail: '' },
    { label: 'Média diária', value: Math.round(stats.avgDailyMinutes) + ' min', detail: 'nos dias ativos' }
  ]

  return (
    <div>
      <PageHeader title="Estatísticas" subtitle="Seu Harmony Wrapped, sempre atualizado" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="glass rounded-2xl p-5"
          >
            <p className="text-[11px] uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-2 truncate text-2xl font-semibold text-[var(--accent)]">{card.value}</p>
            {card.detail && <p className="mt-1 text-xs text-muted">{card.detail}</p>}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
