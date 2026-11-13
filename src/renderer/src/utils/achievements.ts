import type { AchievementMetrics } from '../../../core/achievements'
import { useCursorStore } from '@/utils/cursor'
import { useFlairStore } from '@/store/flairStore'
import { useUiStore } from '@/store/uiStore'
import { useAppearanceStore } from '@/store/appearanceStore'
import { IS_ANDROID } from '@/platform'
import { t, tk } from '@/i18n'

/**
 * Meu Mundo → Conquistas: what there is to unlock, in four tiers (bronze to
 * legendary — some take months), by category, a few of them secret until
 * found. The numbers come from the library (src/core/achievements.ts); the
 * personalization ones from the app's own settings.
 *
 * Unlocking is remembered (with the date) so the Harmony can celebrate the
 * moment it happens (components/AchievementToast.tsx).
 */

export type Tier = 'bronze' | 'silver' | 'gold' | 'legend'
export type Category = 'listen' | 'habit' | 'clock' | 'explore' | 'loyal' | 'collect' | 'playlists' | 'style' | 'secret'

export interface ClientMetrics {
  customCursor: boolean
  coverStyle: boolean
  uiSounds: boolean
  worldOn: boolean
  ownTheme: boolean
}

export type Metrics = AchievementMetrics & ClientMetrics

interface Def {
  id: string
  emoji: string
  title: string
  /** how to get it ({n} = the goal) */
  how: string
  tier: Tier
  cat: Category
  goal: number
  value: (m: Metrics) => number
  /** hidden ("???") until unlocked */
  secret?: boolean
  /** only where it can happen */
  desktopOnly?: boolean
}

const b = (v: boolean): number => (v ? 1 : 0)
const hours = (m: Metrics): number => m.seconds / 3600

export const TIER_XP: Record<Tier, number> = { bronze: 60, silver: 180, gold: 500, legend: 2000 }
export const TIERS: { id: Tier; label: string; emoji: string; colour: string }[] = [
  { id: 'bronze', label: tk('Bronze'), emoji: '🥉', colour: '#cd8a4f' },
  { id: 'silver', label: tk('Prata'), emoji: '🥈', colour: '#c7ccd6' },
  { id: 'gold', label: tk('Ouro'), emoji: '🥇', colour: '#ffcc33' },
  { id: 'legend', label: tk('Lendária'), emoji: '💎', colour: '#b98bff' }
]
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'listen', label: tk('Ouvir') },
  { id: 'habit', label: tk('Constância') },
  { id: 'clock', label: tk('Horários') },
  { id: 'explore', label: tk('Exploração') },
  { id: 'loyal', label: tk('Fidelidade') },
  { id: 'collect', label: tk('Coleção') },
  { id: 'playlists', label: tk('Playlists') },
  { id: 'style', label: tk('Estilo') },
  { id: 'secret', label: tk('Secretas') }
]

const DEFS: Def[] = [
  // ── ouvir ──
  { id: 'first-song', emoji: '🎉', title: tk('Primeira música'), how: tk('Adicionar uma música'), tier: 'bronze', cat: 'listen', goal: 1, value: (m) => m.totalSongs },
  { id: 'plays-500', emoji: '▶️', title: tk('Dá o play'), how: tk('{n} reproduções'), tier: 'silver', cat: 'listen', goal: 500, value: (m) => m.plays },
  { id: 'plays-1000', emoji: '🎚️', title: tk('Mil plays'), how: tk('{n} reproduções'), tier: 'gold', cat: 'listen', goal: 1000, value: (m) => m.plays },
  { id: 'plays-10000', emoji: '🏆', title: tk('Lenda do play'), how: tk('{n} reproduções'), tier: 'legend', cat: 'listen', goal: 10000, value: (m) => m.plays },
  { id: 'hours-24', emoji: '⏳', title: tk('Um dia inteiro'), how: tk('{n} horas de música no total'), tier: 'bronze', cat: 'listen', goal: 24, value: hours },
  { id: 'hours-100', emoji: '🎧', title: tk('Maratonista'), how: tk('{n} horas de música no total'), tier: 'gold', cat: 'listen', goal: 100, value: hours },
  { id: 'hours-1000', emoji: '🌌', title: tk('Mil horas'), how: tk('{n} horas de música no total'), tier: 'legend', cat: 'listen', goal: 1000, value: hours },
  { id: 'day-8h', emoji: '🏃', title: tk('Maratona'), how: tk('{n} horas de música num único dia'), tier: 'gold', cat: 'listen', goal: 8, value: (m) => m.maxSecondsInDay / 3600 },
  { id: 'day-100', emoji: '📈', title: tk('Dia intenso'), how: tk('{n} músicas num único dia'), tier: 'gold', cat: 'listen', goal: 100, value: (m) => m.maxPlaysInDay },

  // ── constância ──
  { id: 'week-all', emoji: '🗓️', title: tk('Semana completa'), how: tk('Ouvir em todos os 7 dias da semana'), tier: 'bronze', cat: 'habit', goal: 7, value: (m) => m.weekdaysCovered },
  { id: 'streak-7', emoji: '🔥', title: tk('Em chamas'), how: tk('{n} dias seguidos com música'), tier: 'silver', cat: 'habit', goal: 7, value: (m) => m.bestStreak },
  { id: 'streak-30', emoji: '☄️', title: tk('Mês sem pausa'), how: tk('{n} dias seguidos com música'), tier: 'gold', cat: 'habit', goal: 30, value: (m) => m.bestStreak },
  { id: 'streak-100', emoji: '💯', title: tk('Centenário'), how: tk('{n} dias seguidos com música'), tier: 'legend', cat: 'habit', goal: 100, value: (m) => m.bestStreak },
  { id: 'months-12', emoji: '🌙', title: tk('Doze luas'), how: tk('Música em todos os {n} meses de um mesmo ano'), tier: 'gold', cat: 'habit', goal: 12, value: (m) => m.bestYearMonths },
  { id: 'year-300', emoji: '📅', title: tk('Ano musical'), how: tk('Música em {n} dias de um mesmo ano'), tier: 'legend', cat: 'habit', goal: 300, value: (m) => m.bestYearDays },
  { id: 'veteran', emoji: '🎂', title: tk('Veterano'), how: tk('{n} dias desde a sua primeira música'), tier: 'gold', cat: 'habit', goal: 365, value: (m) => m.daysSinceFirst },

  // ── horários ──
  { id: 'owl', emoji: '🦉', title: tk('Coruja'), how: tk('Ouvir entre 0h e 5h'), tier: 'bronze', cat: 'clock', goal: 1, value: (m) => m.nightPlays },
  { id: 'early', emoji: '🌅', title: tk('Madrugador'), how: tk('Ouvir entre 5h e 8h'), tier: 'bronze', cat: 'clock', goal: 1, value: (m) => m.dawnPlays },
  { id: 'vampire', emoji: '🌃', title: tk('Vampiro'), how: tk('{n} músicas entre 0h e 5h'), tier: 'gold', cat: 'clock', goal: 100, value: (m) => m.nightPlays },
  { id: 'rooster', emoji: '☀️', title: tk('Galo cantor'), how: tk('{n} músicas entre 5h e 8h'), tier: 'gold', cat: 'clock', goal: 100, value: (m) => m.dawnPlays },
  { id: 'weekend', emoji: '🛋️', title: tk('Fim de semana sonoro'), how: tk('{n} músicas aos sábados e domingos'), tier: 'silver', cat: 'clock', goal: 200, value: (m) => m.weekendPlays },

  // ── exploração ──
  { id: 'artists-50', emoji: '🧭', title: tk('Explorador'), how: tk('{n} artistas ouvidos'), tier: 'silver', cat: 'explore', goal: 50, value: (m) => m.artistsPlayed },
  { id: 'artists-200', emoji: '🗺️', title: tk('Cartógrafo'), how: tk('{n} artistas ouvidos'), tier: 'gold', cat: 'explore', goal: 200, value: (m) => m.artistsPlayed },
  { id: 'genres-15', emoji: '🌍', title: tk('Volta ao mundo'), how: tk('{n} gêneros diferentes ouvidos'), tier: 'gold', cat: 'explore', goal: 15, value: (m) => m.genresPlayed },
  { id: 'decades-5', emoji: '⏰', title: tk('Viajante do tempo'), how: tk('Músicas de {n} décadas diferentes'), tier: 'silver', cat: 'explore', goal: 5, value: (m) => m.decadesPlayed },
  { id: 'album-1', emoji: '💽', title: tk('Álbum inteiro'), how: tk('Ouvir todas as faixas de um álbum'), tier: 'bronze', cat: 'explore', goal: 1, value: (m) => m.completeAlbums },
  { id: 'album-10', emoji: '📀', title: tk('Discófilo'), how: tk('Ouvir todas as faixas de {n} álbuns'), tier: 'gold', cat: 'explore', goal: 10, value: (m) => m.completeAlbums },
  {
    id: 'library-half',
    emoji: '🎲',
    title: tk('Meio caminho'),
    how: tk('Ouvir metade da sua biblioteca'),
    tier: 'silver',
    cat: 'explore',
    goal: 50,
    value: (m) => (m.totalSongs >= 50 ? (m.songsPlayed / m.totalSongs) * 100 : 0)
  },
  {
    id: 'library-all',
    emoji: '🔎',
    title: tk('Sem pedra sobre pedra'),
    how: tk('Ouvir 100% da biblioteca (com 100+ músicas)'),
    tier: 'legend',
    cat: 'explore',
    goal: 100,
    value: (m) => (m.totalSongs >= 100 ? (m.songsPlayed / m.totalSongs) * 100 : 0)
  },

  // ── fidelidade ──
  { id: 'song-100', emoji: '💘', title: tk('Hit pessoal'), how: tk('Uma música {n} vezes'), tier: 'gold', cat: 'loyal', goal: 100, value: (m) => m.topSongPlays },
  { id: 'song-365', emoji: '🔁', title: tk('Obsessão'), how: tk('Uma música {n} vezes'), tier: 'legend', cat: 'loyal', goal: 365, value: (m) => m.topSongPlays },
  { id: 'artist-500', emoji: '👑', title: tk('Fã número 1'), how: tk('{n} músicas de um mesmo artista'), tier: 'gold', cat: 'loyal', goal: 500, value: (m) => m.topArtistPlays },
  { id: 'favs-25', emoji: '❤️', title: tk('Coração mole'), how: tk('{n} favoritas'), tier: 'bronze', cat: 'loyal', goal: 25, value: (m) => m.favorites },
  { id: 'favs-250', emoji: '💞', title: tk('Apaixonado'), how: tk('{n} favoritas'), tier: 'gold', cat: 'loyal', goal: 250, value: (m) => m.favorites },

  // ── coleção ──
  { id: 'songs-100', emoji: '💿', title: tk('Colecionador'), how: tk('{n} músicas na biblioteca'), tier: 'bronze', cat: 'collect', goal: 100, value: (m) => m.totalSongs },
  { id: 'songs-1000', emoji: '📚', title: tk('Biblioteca gigante'), how: tk('{n} músicas na biblioteca'), tier: 'gold', cat: 'collect', goal: 1000, value: (m) => m.totalSongs },
  { id: 'songs-5000', emoji: '🏛️', title: tk('Arquivo nacional'), how: tk('{n} músicas na biblioteca'), tier: 'legend', cat: 'collect', goal: 5000, value: (m) => m.totalSongs },
  { id: 'capsule-open', emoji: '📮', title: tk('Mensagem do passado'), how: tk('Abrir uma cápsula do tempo'), tier: 'silver', cat: 'collect', goal: 1, value: (m) => m.capsulesOpened },
  { id: 'bridge', emoji: '🌉', title: tk('Ponte construída'), how: tk('Sincronizar o PC e o celular pela Ponte'), tier: 'silver', cat: 'collect', goal: 1, value: (m) => m.bridgeSyncs },

  // ── playlists ──
  { id: 'playlists-5', emoji: '🗂️', title: tk('Curador'), how: tk('{n} playlists'), tier: 'bronze', cat: 'playlists', goal: 5, value: (m) => m.playlists },
  { id: 'playlists-25', emoji: '🎛️', title: tk('Arquiteto de playlists'), how: tk('{n} playlists'), tier: 'gold', cat: 'playlists', goal: 25, value: (m) => m.playlists },
  { id: 'smart', emoji: '🧠', title: tk('Mente inteligente'), how: tk('Criar uma playlist inteligente'), tier: 'bronze', cat: 'playlists', goal: 1, value: (m) => m.smartPlaylists },
  { id: 'mood', emoji: '🌦️', title: tk('Clima perfeito'), how: tk('Dar um clima a uma playlist'), tier: 'bronze', cat: 'playlists', goal: 1, value: (m) => m.moodPlaylists },
  { id: 'sections', emoji: '🔖', title: tk('Roteirista'), how: tk('Seções em {n} playlists'), tier: 'silver', cat: 'playlists', goal: 3, value: (m) => m.playlistsWithSections },
  { id: 'notes', emoji: '📝', title: tk('Contador de histórias'), how: tk('{n} notas em músicas de playlists'), tier: 'gold', cat: 'playlists', goal: 25, value: (m) => m.notes },
  { id: 'folders', emoji: '📁', title: tk('Organizado'), how: tk('Playlists em {n} pastas'), tier: 'silver', cat: 'playlists', goal: 3, value: (m) => m.folders },

  // ── estilo ──
  { id: 'world', emoji: '🌍', title: tk('Mundo vivo'), how: tk('Ligar um Mundo vivo'), tier: 'bronze', cat: 'style', goal: 1, value: (m) => b(m.worldOn) },
  { id: 'theme', emoji: '🖌️', title: tk('Designer'), how: tk('Criar e salvar um tema seu'), tier: 'silver', cat: 'style', goal: 1, value: (m) => b(m.ownTheme) },
  {
    id: 'stylist',
    emoji: '🎨',
    title: tk('Estilista'),
    how: tk('Personalizar cursor, capas e sons da interface'),
    tier: 'silver',
    cat: 'style',
    goal: 3,
    value: (m) => b(m.customCursor) + b(m.coverStyle) + b(m.uiSounds),
    desktopOnly: true
  },

  // ── secretas ──
  { id: 'new-year', emoji: '🎆', title: tk('Virada musical'), how: tk('Ouvir música na primeira hora do Ano Novo'), tier: 'gold', cat: 'secret', goal: 1, value: (m) => b(m.newYearPlay), secret: true },
  { id: 'christmas', emoji: '🎄', title: tk('Noite feliz'), how: tk('Ouvir música no Natal'), tier: 'silver', cat: 'secret', goal: 1, value: (m) => b(m.christmasPlay), secret: true },
  { id: 'halloween', emoji: '🎃', title: tk('Assombrado'), how: tk('Ouvir música no Halloween'), tier: 'silver', cat: 'secret', goal: 1, value: (m) => b(m.halloweenPlay), secret: true },
  { id: 'friday13', emoji: '🍀', title: tk('Sexta-feira 13'), how: tk('Ouvir música numa sexta-feira 13'), tier: 'silver', cat: 'secret', goal: 1, value: (m) => b(m.friday13Play), secret: true }
]

export interface Achievement {
  id: string
  emoji: string
  title: string
  detail: string
  tier: Tier
  cat: Category
  secret: boolean
  /** 0..1 */
  progress: number
  got: boolean
  /** when it was unlocked (ms), if remembered */
  unlockedAt: number | null
}

/** the personalization side, read from the app's own settings */
export function clientMetrics(): ClientMetrics {
  return {
    customCursor: useCursorStore.getState().pack !== 'system',
    coverStyle: useFlairStore.getState().coverShape !== 'default' || useFlairStore.getState().coverTilt,
    uiSounds: useFlairStore.getState().uiSounds !== 'off',
    worldOn: Boolean(useUiStore.getState().world),
    ownTheme: useAppearanceStore.getState().mine.length > 0
  }
}

const KEY = 'harmony.achievements'

export function loadUnlocked(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : null
  } catch {
    return null
  }
}

export function saveUnlocked(map: Record<string, number>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* kept for this session */
  }
}

const fmt = (v: number): string => Math.floor(v).toLocaleString()

export function evaluate(m: Metrics, unlocked: Record<string, number> = loadUnlocked() ?? {}): Achievement[] {
  return DEFS.filter((d) => !(d.desktopOnly && IS_ANDROID)).map((d) => {
    const v = Math.max(0, d.value(m))
    const got = v >= d.goal || unlocked[d.id] !== undefined
    const progress = got ? 1 : Math.min(1, v / d.goal)
    const how = t(d.how, { n: fmt(d.goal) })
    const detail = got || d.goal === 1 ? how : `${how} · ${fmt(Math.min(v, d.goal))}/${fmt(d.goal)}`
    return {
      id: d.id,
      emoji: d.emoji,
      title: t(d.title),
      detail,
      tier: d.tier,
      cat: d.cat,
      secret: Boolean(d.secret),
      progress,
      got,
      unlockedAt: unlocked[d.id] ?? null
    }
  })
}

/** XP the unlocked achievements add to the Meu Mundo level */
export function achievementXp(list: Achievement[]): number {
  return list.filter((a) => a.got).reduce((n, a) => n + TIER_XP[a.tier], 0)
}
