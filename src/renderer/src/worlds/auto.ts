import { usePlayerStore } from '@/store/playerStore'
import { findWorld } from './registry'
import type { World, WorldContext } from './types'

/**
 * 🎚️ Automático — a meta-world that picks the right world for each song.
 *
 * The genre tag decides when it says something (rock → Volcano, lo-fi →
 * Coffee Shop…). Songs without a telling genre are listened to for a few
 * seconds first and placed by their energy and the time of day. The same
 * song always lands in the same world, and worlds only change between
 * tracks, with a soft crossfade — never in the middle of a song.
 */

type Mood = 'hot' | 'electric' | 'retro' | 'cozy' | 'cosmic' | 'melancholy' | 'organic' | 'zen' | 'tropical' | 'frozen'

const MOOD_WORLDS: Record<Mood, string[]> = {
  hot: ['volcano'],
  electric: ['cyber-city', 'synthwave'],
  retro: ['synthwave'],
  cozy: ['coffee-shop'],
  cosmic: ['space-station', 'blackhole'],
  melancholy: ['rain'],
  organic: ['nature'],
  zen: ['japanese-garden'],
  tropical: ['ocean'],
  frozen: ['winter']
}

// first match wins, so the more specific families come first
const GENRE_MOODS: [string[], Mood][] = [
  [['k-pop', 'kpop', 'j-pop', 'jpop', 'j-rock', 'city pop', 'anime', 'japan', 'enka'], 'zen'],
  [['lo-fi', 'lofi', 'jazz', 'bossa', 'café', 'coffee', 'acoustic', 'acústic', 'mpb', 'chillhop'], 'cozy'],
  [['synthwave', 'retrowave', 'vaporwave', 'outrun', '80s', 'new wave', 'disco', 'synthpop', 'synth-pop'], 'retro'],
  [['ambient', 'space', 'classical', 'clássic', 'piano', 'soundtrack', 'trilha', 'score', 'instrumental', 'new age', 'orchestr', 'cinematic'], 'cosmic'],
  [['christmas', 'natal', 'holiday', 'xmas'], 'frozen'],
  [['metal', 'rock', 'punk', 'grunge', 'hardcore', 'thrash', 'doom'], 'hot'],
  [['edm', 'electro', 'eletrô', 'house', 'techno', 'trance', 'dubstep', 'drum', 'dance', 'phonk', 'trap', 'hip hop', 'hip-hop', 'rap', 'funk', 'grime', 'drill'], 'electric'],
  [['reggae', 'reggaeton', 'tropical', 'surf', 'axé', 'axe', 'samba', 'pagode', 'dancehall', 'calypso'], 'tropical'],
  [['sad', 'blues', 'emo', 'indie', 'alternativ', 'soul', 'r&b', 'rnb', 'ballad', 'balada', 'romântic', 'romantic', 'shoegaze'], 'melancholy'],
  [['folk', 'country', 'sertanejo', 'forró', 'forro', 'world', 'gospel', 'worship', 'bluegrass', 'celtic', 'nature'], 'organic']
]

/** Seconds of playback listened to before placing a song with no telling genre. */
const LISTEN = 8
const FADE = 1.4

export function moodForGenre(genre: string | null): Mood | null {
  const g = (genre ?? '').toLowerCase()
  if (!g.trim()) return null
  for (const [keys, mood] of GENRE_MOODS) if (keys.some((k) => g.includes(k))) return mood
  return null
}

function isNight(): boolean {
  const h = new Date().getHours()
  return h >= 20 || h < 6
}

/** Where a song with no telling genre goes, from how hot it measured. */
export function moodForEnergy(energy: number, night: boolean): Mood[] {
  if (energy > 0.5) return ['hot', 'electric', 'retro']
  if (energy < 0.25) return night ? ['cosmic', 'melancholy', 'cozy'] : ['cozy', 'zen', 'organic']
  return night ? ['electric', 'retro', 'melancholy'] : ['tropical', 'organic', 'zen', 'retro']
}

/** A stable pick from a list, so the same song always gets the same world. */
function pick<T>(list: T[], seed: number): T {
  return list[(Math.imul(seed | 0, 2654435761) >>> 0) % list.length]
}

function worldFor(moods: Mood[], seed: number): string {
  const mood = pick(moods, seed)
  return pick(MOOD_WORLDS[mood], seed >>> 3)
}

// ---- what the Settings page shows ------------------------------------------

export interface AutoPick {
  worldId: string
  /** 'listening' while a song with no telling genre is still being measured */
  reason: 'genre' | 'energy' | 'time' | 'listening'
  genre: string | null
}

let lastPick: AutoPick | null = null
const listeners = new Set<(p: AutoPick | null) => void>()

export function getAutoPick(): AutoPick | null {
  return lastPick
}

export function onAutoPick(cb: (p: AutoPick | null) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function announce(p: AutoPick | null): void {
  lastPick = p
  for (const cb of listeners) cb(p)
}

// ---- the world itself ---------------------------------------------------------

let current: World | null = null
let currentId = ''
let wantedId = ''
let ready: World | null = null
let snapshot: HTMLCanvasElement | null = null
let fade = 0
let trackKey: number | null | undefined = undefined
let listened = 0
let energySum = 0
let decided = false

function request(id: string, pickInfo: AutoPick): void {
  announce(pickInfo)
  if (id === wantedId) return
  wantedId = id
  findWorld(id)
    ?.load()
    .then((w) => {
      if (wantedId === id) ready = w
    })
    .catch(() => {
      /* keep the current world */
    })
}

/** Copies what is on screen so the old world can fade out over the new one. */
function capture(ctx: CanvasRenderingContext2D): void {
  const src = ctx.canvas
  if (!snapshot || snapshot.width !== src.width || snapshot.height !== src.height) {
    snapshot = document.createElement('canvas')
    snapshot.width = src.width
    snapshot.height = src.height
  }
  const s = snapshot.getContext('2d')!
  s.clearRect(0, 0, snapshot.width, snapshot.height)
  s.drawImage(src, 0, 0)
}

export const autoWorld: World = {
  id: 'auto',
  name: 'Automático',
  // hand the active world the spectrum size it asked for
  get spectrumBins(): number {
    return current?.spectrumBins ?? 32
  },

  mount(): void {
    trackKey = undefined
    current = null
    currentId = ''
    wantedId = ''
    ready = null
    fade = 0
  },

  frame(c: WorldContext): void {
    const ps = usePlayerStore.getState()
    const song = ps.queue[ps.currentIndex] ?? null
    const key = song?.id ?? null

    // a new track: place it by genre right away, or start listening
    if (key !== trackKey) {
      trackKey = key
      listened = 0
      energySum = 0
      decided = false
      const mood = song ? moodForGenre(song.genre) : null
      if (song && mood) {
        decided = true
        const id = pick(MOOD_WORLDS[mood], song.id)
        request(id, { worldId: id, reason: 'genre', genre: song.genre })
      } else if (!currentId && !wantedId) {
        // nothing on screen yet: something calm for the time of day while we listen
        const id = worldFor(isNight() ? ['cosmic', 'cozy'] : ['organic', 'zen', 'cozy'], song?.id ?? 1)
        request(id, { worldId: id, reason: song ? 'listening' : 'time', genre: null })
      } else if (song) {
        // the current world stays while this one is measured
        announce({ worldId: wantedId || currentId, reason: 'listening', genre: song.genre })
      }
    }
    if (!decided && song && c.playing) {
      listened += c.dt
      energySum += c.energy * c.dt
      if (listened >= LISTEN) {
        decided = true
        const id = worldFor(moodForEnergy(energySum / listened, isNight()), song.id)
        request(id, { worldId: id, reason: 'energy', genre: song.genre })
      }
    }

    // swap in the newly loaded world, keeping the old frame to fade from
    if (ready) {
      const next = ready
      ready = null
      if (current) {
        capture(c.ctx)
        fade = 1
        current.unmount?.()
      }
      current = next
      currentId = next.id
      current.mount?.(c)
    }

    if (!current) {
      c.ctx.fillStyle = '#05050a'
      c.ctx.fillRect(0, 0, c.width, c.height)
      return
    }
    current.frame(c)

    if (fade > 0 && snapshot) {
      const { ctx } = c
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = fade * fade * (3 - 2 * fade) // smoothstep
      ctx.drawImage(snapshot, 0, 0)
      ctx.restore()
      fade = Math.max(0, fade - c.dt / FADE)
    }
  },

  unmount(): void {
    current?.unmount?.()
    current = null
    currentId = ''
    wantedId = ''
    ready = null
    snapshot = null
    announce(null)
  }
}
