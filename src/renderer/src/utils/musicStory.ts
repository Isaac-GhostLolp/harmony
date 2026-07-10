import type { MusicProfile } from '@/types'

/** Turns raw numbers into warm, readable sentences (Humanized Stats #11). */
export function humanizedStats(p: MusicProfile): string[] {
  const out: string[] = []
  const days = p.hoursPlayed / 24

  if (p.hoursPlayed >= 1) {
    if (days >= 1) {
      out.push(
        `Você já passou mais de ${Math.floor(days)} ${
          Math.floor(days) === 1 ? 'dia inteiro' : 'dias inteiros'
        } ouvindo música.`
      )
    } else {
      out.push(`Você já ouviu música por mais de ${Math.floor(p.hoursPlayed)} horas.`)
    }
  }

  if (p.topSong && p.topSong.seconds >= 600) {
    const h = p.topSong.seconds / 3600
    out.push(
      h >= 1
        ? `"${p.topSong.title}" acompanhou você por mais de ${h.toFixed(1)} horas.`
        : `"${p.topSong.title}" já tocou ${p.topSong.plays} vezes para você.`
    )
  }

  if (p.topArtist && p.topArtistShare > 0.05) {
    out.push(
      `${p.topArtist.name} está presente em ${Math.round(p.topArtistShare * 100)}% da sua biblioteca.`
    )
  }

  if (p.newThisMonth > 0) {
    out.push(
      `Você descobriu ${p.newThisMonth} ${
        p.newThisMonth === 1 ? 'música nova' : 'músicas novas'
      } este mês.`
    )
  }

  if (p.topGenre) {
    out.push(`Seu som é ${p.topGenre.genre.toLowerCase()} — de longe o gênero que mais te move.`)
  }

  if (p.activeDays >= 2) {
    out.push(`Você abriu o Harmony para ouvir algo em ${p.activeDays} dias diferentes.`)
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
      title: 'Primeira música',
      detail: p.firstSong
        ? `Tudo começou com "${p.firstSong.title}".`
        : 'Adicione sua primeira música para começar.',
      reached: Boolean(p.firstSong)
    },
    {
      emoji: '💿',
      title: '100 músicas',
      detail:
        p.totalSongs >= 100
          ? `Sua biblioteca tem ${p.totalSongs} músicas!`
          : `Faltam ${100 - p.totalSongs} para chegar lá.`,
      reached: p.totalSongs >= 100
    },
    {
      emoji: '❤️',
      title: 'Hit pessoal',
      detail:
        p.mostPlayedCount >= 100
          ? `Você tocou uma música ${p.mostPlayedCount} vezes!`
          : `Sua mais tocada já soma ${p.mostPlayedCount} plays.`,
      reached: p.mostPlayedCount >= 100
    },
    {
      emoji: '🎧',
      title: '100 horas',
      detail:
        p.hoursPlayed >= 100
          ? `Já são ${Math.floor(p.hoursPlayed)} horas de música.`
          : `${Math.floor(p.hoursPlayed)}h ouvidas até agora.`,
      reached: p.hoursPlayed >= 100
    },
    {
      emoji: '🌙',
      title: 'Ouvinte da madrugada',
      detail: p.nightPlay
        ? 'Você já ouviu música de madrugada.'
        : 'Uma música entre 0h e 5h desbloqueia isto.',
      reached: Boolean(p.nightPlay)
    },
    {
      emoji: '🚗',
      title: 'Playlist favorita',
      detail: p.topPlaylist
        ? `"${p.topPlaylist.name}" é a sua mais recheada.`
        : 'Crie uma playlist para desbloquear.',
      reached: Boolean(p.topPlaylist && p.topPlaylist.count > 0)
    }
  ]
  return moments
}

/** Diary-style journey entries (Harmony Journey #9). */
export function harmonyJourney(p: MusicProfile): string[] {
  const entries: string[] = []
  const fmt = (ts: number): string =>
    new Date(ts * 1000).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  const monthName = (ts: number): string =>
    new Date(ts * 1000).toLocaleDateString('pt-BR', { month: 'long' })

  if (p.firstAdded) {
    const months = Math.floor((Date.now() / 1000 - p.firstAdded) / (30 * 86400))
    entries.push(
      months >= 1
        ? `Você começou a usar o Harmony há ${months} ${months === 1 ? 'mês' : 'meses'}.`
        : `Você começou a usar o Harmony recentemente. Bem-vindo!`
    )
  }
  if (p.firstSong) {
    entries.push(
      `Sua primeira música foi "${p.firstSong.title}"${
        p.firstSong.artist ? `, de ${p.firstSong.artist}` : ''
      }, adicionada em ${fmt(p.firstSong.addedAt)}.`
    )
  }
  if (p.topSong && p.firstPlay) {
    entries.push(`Você ouviu "${p.topSong.title}" pela primeira vez em ${monthName(p.firstPlay)}.`)
  }
  if (p.topArtist) {
    entries.push(`${p.topArtist.name} continua sendo o seu artista favorito.`)
  }
  if (p.newThisMonth > 0) {
    entries.push(`Você descobriu ${p.newThisMonth} músicas novas este mês.`)
  }
  if (p.hoursPlayed >= 1) {
    entries.push(`No total, você já ouviu música durante ${Math.floor(p.hoursPlayed)} horas.`)
  }
  if (p.lastSong) {
    entries.push(`A última música que tocou foi "${p.lastSong.title}", em ${fmt(p.lastSong.playedAt)}.`)
  }
  return entries
}
