import type { MusicProfile } from '@/types'
import { locale, t, tn } from '@/i18n'

/** Turns raw numbers into warm, readable sentences (Humanized Stats #11). */
export function humanizedStats(p: MusicProfile): string[] {
  const out: string[] = []
  const days = p.hoursPlayed / 24

  if (p.hoursPlayed >= 1) {
    if (days >= 1) {
      out.push(
        tn(
          Math.floor(days),
          'Você já passou mais de {n} dia inteiro ouvindo música.',
          'Você já passou mais de {n} dias inteiros ouvindo música.'
        )
      )
    } else {
      out.push(t('Você já ouviu música por mais de {n} horas.', { n: Math.floor(p.hoursPlayed) }))
    }
  }

  if (p.topSong && p.topSong.seconds >= 600) {
    const h = p.topSong.seconds / 3600
    out.push(
      h >= 1
        ? t('“{title}” acompanhou você por mais de {h} horas.', {
            title: p.topSong.title,
            h: h.toLocaleString(locale(), { maximumFractionDigits: 1 })
          })
        : t('“{title}” já tocou {n} vezes para você.', { title: p.topSong.title, n: p.topSong.plays })
    )
  }

  if (p.topArtist && p.topArtistShare > 0.05) {
    out.push(
      t('{artist} está presente em {pct}% da sua biblioteca.', {
        artist: p.topArtist.name,
        pct: Math.round(p.topArtistShare * 100)
      })
    )
  }

  if (p.newThisMonth > 0) {
    out.push(tn(p.newThisMonth, 'Você descobriu {n} música nova este mês.', 'Você descobriu {n} músicas novas este mês.'))
  }

  if (p.topGenre) {
    out.push(t('Seu som é {genre} — de longe o gênero que mais te move.', { genre: p.topGenre.genre.toLowerCase() }))
  }

  if (p.activeDays >= 2) {
    out.push(t('Você abriu o Harmony para ouvir algo em {n} dias diferentes.', { n: p.activeDays }))
  }

  return out
}

export interface Moment {
  emoji: string
  title: string
  detail: string
  reached: boolean
}

/** Milestone cards — small celebrations, never popups (Harmony Moments #10). */
export function harmonyMoments(p: MusicProfile): Moment[] {
  const moments: Moment[] = [
    {
      emoji: '🎉',
      title: t('Primeira música'),
      detail: p.firstSong
        ? t('Tudo começou com “{title}”.', { title: p.firstSong.title })
        : t('Adicione sua primeira música para começar.'),
      reached: Boolean(p.firstSong)
    },
    {
      emoji: '💿',
      title: t('100 músicas'),
      detail:
        p.totalSongs >= 100
          ? t('Sua biblioteca tem {n} músicas!', { n: p.totalSongs })
          : t('Faltam {n} para chegar lá.', { n: 100 - p.totalSongs }),
      reached: p.totalSongs >= 100
    },
    {
      emoji: '❤️',
      title: t('Hit pessoal'),
      detail:
        p.mostPlayedCount >= 100
          ? t('Você tocou uma música {n} vezes!', { n: p.mostPlayedCount })
          : t('Sua mais tocada já soma {n} plays.', { n: p.mostPlayedCount }),
      reached: p.mostPlayedCount >= 100
    },
    {
      emoji: '🎧',
      title: t('100 horas'),
      detail:
        p.hoursPlayed >= 100
          ? t('Já são {n} horas de música.', { n: Math.floor(p.hoursPlayed) })
          : t('{n}h ouvidas até agora.', { n: Math.floor(p.hoursPlayed) }),
      reached: p.hoursPlayed >= 100
    },
    {
      emoji: '🌙',
      title: t('Ouvinte da madrugada'),
      detail: p.nightPlay ? t('Você já ouviu música de madrugada.') : t('Uma música entre 0h e 5h desbloqueia isto.'),
      reached: Boolean(p.nightPlay)
    },
    {
      emoji: '🚗',
      title: t('Playlist favorita'),
      detail: p.topPlaylist
        ? t('“{name}” é a sua mais recheada.', { name: p.topPlaylist.name })
        : t('Crie uma playlist para desbloquear.'),
      reached: Boolean(p.topPlaylist && p.topPlaylist.count > 0)
    }
  ]
  return moments
}

/** Diary-style journey entries (Harmony Journey #9). */
export function harmonyJourney(p: MusicProfile): string[] {
  const entries: string[] = []
  const fmt = (ts: number): string =>
    new Date(ts * 1000).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
  const monthName = (ts: number): string => new Date(ts * 1000).toLocaleDateString(locale(), { month: 'long' })

  if (p.firstAdded) {
    const months = Math.floor((Date.now() / 1000 - p.firstAdded) / (30 * 86400))
    entries.push(
      months >= 1
        ? tn(months, 'Você começou a usar o Harmony há {n} mês.', 'Você começou a usar o Harmony há {n} meses.')
        : t('Você começou a usar o Harmony recentemente. Bem-vindo!')
    )
  }
  if (p.firstSong) {
    entries.push(
      p.firstSong.artist
        ? t('Sua primeira música foi “{title}”, de {artist}, adicionada em {date}.', {
            title: p.firstSong.title,
            artist: p.firstSong.artist,
            date: fmt(p.firstSong.addedAt)
          })
        : t('Sua primeira música foi “{title}”, adicionada em {date}.', {
            title: p.firstSong.title,
            date: fmt(p.firstSong.addedAt)
          })
    )
  }
  if (p.topSong && p.firstPlay) {
    entries.push(t('Você ouviu “{title}” pela primeira vez em {month}.', { title: p.topSong.title, month: monthName(p.firstPlay) }))
  }
  if (p.topArtist) {
    entries.push(t('{artist} continua sendo o seu artista favorito.', { artist: p.topArtist.name }))
  }
  if (p.newThisMonth > 0) {
    entries.push(tn(p.newThisMonth, 'Você descobriu {n} música nova este mês.', 'Você descobriu {n} músicas novas este mês.'))
  }
  if (p.hoursPlayed >= 1) {
    entries.push(t('No total, você já ouviu música durante {n} horas.', { n: Math.floor(p.hoursPlayed) }))
  }
  if (p.lastSong) {
    entries.push(
      t('A última música que tocou foi “{title}”, em {date}.', { title: p.lastSong.title, date: fmt(p.lastSong.playedAt) })
    )
  }
  return entries
}
