import type { MusicProfile, Song } from '@/types'
import { t, tk } from '@/i18n'

/** What `stats:world` returns (see main/ipc/handlers.ts). */
export interface WorldStats {
  topSongs: { id: number; title: string; artist: string | null; coverPath: string | null; plays: number }[]
  topArtists: { id: number; name: string; plays: number; cover: string | null }[]
  topGenres: { genre: string; plays: number }[]
  /** plays per local hour, 0..23 */
  hours: number[]
  /** plays per weekday, 0 = Sunday */
  weekdays: number[]
  streak: { current: number; best: number }
  bestDay: { d: string; plays: number; seconds: number } | null
  artists: number
  playlists: number
  favorites: number
  songsPlayed: number
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

const LEVEL_TITLES: [number, string][] = [
  [1, tk('Primeiros acordes')],
  [3, tk('Ouvinte curioso')],
  [6, tk('Ouvinte apaixonado')],
  [10, tk('DJ de quarto')],
  [15, tk('Maestro em treinamento')],
  [22, tk('Lenda do play')],
  [30, 'Entidade musical']
]

export interface Level {
  level: number
  title: string
  xp: number
  /** 0..1 towards the next level */
  progress: number
  toNext: number
}

export function levelOf(p: MusicProfile, w: WorldStats): Level {
  const xp = Math.round(
    p.totalPlays * 10 + w.favorites * 15 + w.playlists * 40 + w.streak.best * 25 + w.songsPlayed * 5
  )
  const level = Math.floor(Math.sqrt(xp / 120)) + 1
  const from = 120 * (level - 1) ** 2
  const to = 120 * level ** 2
  let title = LEVEL_TITLES[0][1]
  for (const [l, name] of LEVEL_TITLES) if (level >= l) title = name
  title = t(title)
  return { level, title, xp, progress: (xp - from) / (to - from), toNext: to - xp }
}

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

export interface Personality {
  emoji: string
  title: string
  line: string
}

export function personalityOf(p: MusicProfile, w: WorldStats): Personality {
  const total = w.hours.reduce((a, b) => a + b, 0)
  if (total < 5) {
    return { emoji: '🌱', title: t('Recém-chegado'), line: t('Seu mundo está só começando a florescer.') }
  }
  const sum = (a: number, b: number): number => w.hours.slice(a, b).reduce((x, y) => x + y, 0)
  const night = (sum(0, 5) + sum(22, 24)) / total
  const morning = sum(5, 11) / total
  const topShare = (w.topSongs[0]?.plays ?? 0) / total
  if (night > 0.35)
    return { emoji: '🦉', title: t('Coruja da madrugada'), line: t('Quando o mundo dorme, sua playlist acorda.') }
  if (morning > 0.4)
    return { emoji: '🌅', title: t('Madrugador sonoro'), line: t('Você começa o dia com trilha sonora.') }
  if (topShare > 0.15)
    return { emoji: '💘', title: t('Fiel ao hit'), line: t('Quando você ama uma música, é para sempre (e no repeat).') }
  if (w.artists >= 40 && p.topArtistShare < 0.15)
    return { emoji: '🧭', title: t('Explorador sonoro'), line: t('Sempre atrás do próximo som que vai te arrepiar.') }
  if (p.hoursPlayed >= 150)
    return { emoji: '🏃', title: t('Maratonista musical'), line: t('Horas e horas de música, sem pausa pro café.') }
  if (w.streak.best >= 7)
    return { emoji: '🔥', title: t('Constante como um beat'), line: t('Todo dia é dia de dar play.') }
  return { emoji: '✨', title: t('Alma musical'), line: t('Seu gosto é só seu, e é lindo.') }
}

// ---------------------------------------------------------------------------
// Moods → mixes from the user's own library
// ---------------------------------------------------------------------------

export interface Mood {
  id: string
  emoji: string
  label: string
  /** genre keywords (lowercase substrings) */
  genres: string[]
  hue: number
}

export const MOODS: Mood[] = [
  { id: 'happy', emoji: '😊', label: tk('Feliz'), hue: 45, genres: ['pop', 'dance', 'funk', 'pagode', 'sertanejo', 'axé', 'axe', 'reggae', 'disco', 'k-pop'] },
  { id: 'calm', emoji: '😌', label: tk('Tranquilo'), hue: 170, genres: ['lofi', 'lo-fi', 'acoustic', 'acústic', 'mpb', 'bossa', 'jazz', 'chill', 'ambient', 'folk', 'classical', 'clássic'] },
  { id: 'hype', emoji: '🔥', label: tk('Animado'), hue: 10, genres: ['rock', 'metal', 'edm', 'electro', 'eletrô', 'house', 'trap', 'rap', 'hip hop', 'hip-hop', 'phonk', 'drum', 'techno'] },
  { id: 'blue', emoji: '🌧️', label: tk('Nostálgico'), hue: 220, genres: ['sad', 'indie', 'alternative', 'alternativ', 'emo', 'blues', 'soul', 'r&b', 'rnb', 'ballad', 'romântic'] },
  { id: 'focus', emoji: '🎯', label: tk('Foco'), hue: 260, genres: ['lofi', 'lo-fi', 'classical', 'clássic', 'ambient', 'instrumental', 'soundtrack', 'trilha', 'piano', 'jazz'] },
  { id: 'party', emoji: '🥳', label: tk('Festa'), hue: 310, genres: ['funk', 'dance', 'edm', 'house', 'reggaeton', 'pagode', 'sertanejo', 'pop', 'brega', 'forró'] }
]

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Songs that fit the mood by genre; topped up with favourites and most played. */
export function mixFor(mood: Mood, songs: Song[], size = 40): { songs: Song[]; matched: number } {
  const matches = songs.filter((s) => {
    const g = (s.genre ?? '').toLowerCase()
    return g && mood.genres.some((k) => g.includes(k))
  })
  const out = shuffle([...matches]).slice(0, size)
  if (out.length < size) {
    const have = new Set(out.map((s) => s.id))
    const extra = shuffle(
      songs.filter((s) => !have.has(s.id) && (s.favorite || s.playCount > 0))
    ).slice(0, size - out.length)
    out.push(...extra)
  }
  if (out.length < 10) {
    const have = new Set(out.map((s) => s.id))
    out.push(...shuffle(songs.filter((s) => !have.has(s.id))).slice(0, size - out.length))
  }
  return { songs: shuffle(out), matched: matches.length }
}

/** Eight songs for the roulette: favourites and played songs first, a few surprises. */
export function roulettePick(songs: Song[]): Song[] {
  const loved = shuffle(songs.filter((s) => s.favorite || s.playCount > 0)).slice(0, 5)
  const have = new Set(loved.map((s) => s.id))
  const rest = shuffle(songs.filter((s) => !have.has(s.id))).slice(0, 8 - loved.length)
  return shuffle([...loved, ...rest])
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface Badge {
  emoji: string
  title: string
  detail: string
  /** 0..1 */
  progress: number
}

export function badgesOf(p: MusicProfile, w: WorldStats): Badge[] {
  const prog = (v: number, goal: number): number => Math.max(0, Math.min(1, v / goal))
  const range = (a: number, b: number): number => w.hours.slice(a, b).reduce((x, y) => x + y, 0)
  const topPlays = w.topSongs[0]?.plays ?? 0
  return [
    { emoji: '🎉', title: t('Primeira música'), detail: t('Adicionar uma música'), progress: prog(p.totalSongs, 1) },
    { emoji: '💿', title: t('Colecionador'), detail: t('{n}/100 músicas', { n: Math.min(p.totalSongs, 100) }), progress: prog(p.totalSongs, 100) },
    { emoji: '📚', title: t('Biblioteca gigante'), detail: t('{n}/1000 músicas', { n: Math.min(p.totalSongs, 1000) }), progress: prog(p.totalSongs, 1000) },
    { emoji: '▶️', title: t('Dá o play'), detail: t('{n}/500 reproduções', { n: Math.min(p.totalPlays, 500) }), progress: prog(p.totalPlays, 500) },
    { emoji: '🎧', title: t('Maratonista'), detail: t('{n}/100 horas', { n: Math.min(Math.floor(p.hoursPlayed), 100) }), progress: prog(p.hoursPlayed, 100) },
    { emoji: '🔥', title: t('Em chamas'), detail: t('{n}/7 dias seguidos', { n: Math.min(w.streak.best, 7) }), progress: prog(w.streak.best, 7) },
    { emoji: '🦉', title: t('Coruja'), detail: t('Ouvir entre 0h e 5h'), progress: prog(range(0, 5), 1) },
    { emoji: '🌅', title: t('Madrugador'), detail: t('Ouvir entre 5h e 8h'), progress: prog(range(5, 8), 1) },
    { emoji: '🧭', title: t('Explorador'), detail: t('{n}/50 artistas ouvidos', { n: Math.min(w.artists, 50) }), progress: prog(w.artists, 50) },
    { emoji: '💘', title: t('Hit pessoal'), detail: t('Uma música {n}/100 vezes', { n: Math.min(topPlays, 100) }), progress: prog(topPlays, 100) },
    { emoji: '❤️', title: t('Coração mole'), detail: t('{n}/25 favoritas', { n: Math.min(w.favorites, 25) }), progress: prog(w.favorites, 25) },
    { emoji: '🗂️', title: t('Curador'), detail: t('{n}/5 playlists', { n: Math.min(w.playlists, 5) }), progress: prog(w.playlists, 5) }
  ]
}

// ---------------------------------------------------------------------------
// Little helpers
// ---------------------------------------------------------------------------

export const WEEKDAYS = [tk('domingo'), tk('segunda'), tk('terça'), tk('quarta'), tk('quinta'), tk('sexta'), tk('sábado')]

export function greetingWord(): string {
  const h = new Date().getHours()
  return h < 5 ? t('Boa madrugada') : h < 12 ? t('Bom dia') : h < 18 ? t('Boa tarde') : t('Boa noite')
}

/** Which "crowd" the listener belongs to, from their peak hour. */
export function clockLabel(hours: number[]): { emoji: string; text: string; peak: number } | null {
  const total = hours.reduce((a, b) => a + b, 0)
  if (!total) return null
  let peak = 0
  for (let i = 1; i < 24; i++) if (hours[i] > hours[peak]) peak = i
  if (peak < 5) return { emoji: '🌙', text: t('Você é da turma da madrugada'), peak }
  if (peak < 12) return { emoji: '☀️', text: t('Você é da turma da manhã'), peak }
  if (peak < 18) return { emoji: '🌤️', text: t('Você é da turma da tarde'), peak }
  return { emoji: '🌆', text: t('Você é da turma da noite'), peak }
}
