/**
 * Show Packs — complete spectacles, one engine.
 *
 * Every pack is a scene function fed by the same StageDirector frame: same
 * narrative states, same impact events, same light groups — but each pack
 * has its own personality, architecture and color language:
 *
 *   🎧 festival   — Tomorrowland/Ultra mainstage (festival.ts): truss, LED wall, pyro
 *   🔺 pyramid    — Daft Punk's Alive stage (pyramid.ts) — para o Arthur 🤖
 *   🌌 cyber      — sci-fi arena (cyber.ts): neon portals, hex screen, hologram ring
 *   🌲 nature     — forest clearing (nature.ts): aurora over a lake, living arch
 *   🌃 synthwave  — 80s highway (synthcity.ts): striped sun, neon triangle, VHS
 *   🚀 space      — station deck (space.ts): ringed planet, station wheel, warp
 *
 * Never a frozen frame: every pack breathes (F.breath / F.sway) even in
 * silence. Zero per-frame allocations: pools and buffers live in SceneState.
 */
import type { DirectorFrame } from '@/services/stageDirector'
import { createDJState, type DJState } from './dj'
import { createFestivalState, drawFestival, type FestivalState } from './festival'
import { createPyramidState, drawPyramid, type PyramidState } from './pyramid'
import { createCyberState, drawCyber, type CyberState } from './cyber'
import { createNatureState, drawNature, type NatureState } from './nature'
import { createSynthState, drawSynthCity, type SynthState } from './synthcity'
import { createSpaceState, drawSpace, type SpaceState } from './space'

// ---------------------------------------------------------------------------
// Scene state (allocated once)
// ---------------------------------------------------------------------------

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  hue: number
}

export interface SceneState {
  particles: Particle[]
  ledIdx: number
  ledMix: number
  ledTimer: number
  // performers (pyramid has two, every other pack uses the first)
  djs: DJState[]
  // festival mainstage FX pools
  fest: FestivalState
  // Alive pyramid panels, wall and marquee
  pyr: PyramidState
  cyber: CyberState
  nature: NatureState
  synth: SynthState
  space: SpaceState
}

export const MAX_PARTICLES = 360

export function createSceneState(): SceneState {
  const particles: Particle[] = []
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, hue: 0 })
  }
  return {
    particles,
    ledIdx: 0,
    ledMix: 0,
    ledTimer: 0,
    djs: [createDJState(), createDJState()],
    fest: createFestivalState(),
    pyr: createPyramidState(),
    cyber: createCyberState(),
    nature: createNatureState(),
    synth: createSynthState(),
    space: createSpaceState()
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function spawnBurst(
  S: SceneState,
  x: number,
  y: number,
  count: number,
  hueBase: number,
  power = 1
): void {
  let spawned = 0
  for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
    const p = S.particles[i]
    if (p.life > 0) continue
    p.x = x + (Math.random() - 0.5) * 12
    p.y = y
    p.vx = (Math.random() - 0.5) * 3
    p.vy = -2.4 * power - Math.random() * 3.4 * power
    p.life = 1
    p.hue = (hueBase + Math.random() * 60) % 360
    spawned++
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, S: SceneState): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = S.particles[i]
    if (p.life <= 0) continue
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.08
    p.life -= 0.016
    if (p.life <= 0) continue
    ctx.fillStyle = `hsla(${p.hue}, 100%, ${55 + p.life * 25}%, ${p.life * 0.9})`
    const s = 1.4 + p.life * 1.6
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type PackId = 'festival' | 'pyramid' | 'cyber' | 'nature' | 'synthwave' | 'space'

export interface ShowPack {
  id: PackId
  name: string
  emoji: string
  blurb: string
  /** Some packs manage their own background; the shell keeps it black. */
  draw: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    F: DirectorFrame,
    S: SceneState,
    E: number
  ) => void
}

export const SHOW_PACKS: ShowPack[] = [
  { id: 'festival', name: 'Festival Mainstage', emoji: '🎧', blurb: 'Tomorrowland · Ultra · EDC', draw: drawFestival },
  { id: 'pyramid', name: 'Pyramid', emoji: '🔺', blurb: 'Daft Punk · Alive', draw: drawPyramid },
  { id: 'cyber', name: 'Cyber Arena', emoji: '🌌', blurb: 'Holograms · neon · sci-fi', draw: drawCyber },
  { id: 'nature', name: 'Nature Pulse', emoji: '🌲', blurb: 'Auroras · trees · fireflies', draw: drawNature },
  { id: 'synthwave', name: 'Synthwave City', emoji: '🌃', blurb: 'Retro neon · 80s sunset', draw: drawSynthCity },
  { id: 'space', name: 'Space Odyssey', emoji: '🚀', blurb: 'Starfield · nebulae · station', draw: drawSpace }
]

export function getPack(id: PackId): ShowPack {
  return SHOW_PACKS.find((p) => p.id === id) ?? SHOW_PACKS[0]
}
