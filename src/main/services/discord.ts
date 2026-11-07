/**
 * Discord Rich Presence (optional).
 * Requires the user to create a Discord Application and paste its
 * Client ID in Settings. Fails silently if Discord isn't running.
 */
import { getDb } from '../db/database'
import { artLinkFor } from './presenceArt'

export interface PresenceState {
  songId?: number | null
  album?: string | null
  title: string | null
  artist: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
}

interface RpcClient {
  login(): Promise<unknown>
  destroy(): Promise<void>
  user?: { setActivity(activity: Record<string, unknown>): Promise<unknown> } | null
  on(event: string, cb: () => void): void
}

let client: RpcClient | null = null
let ready = false
let lastKey = ''

export async function initDiscord(enabled: boolean, clientId: string): Promise<void> {
  if (client) {
    try {
      await client.destroy()
    } catch {
      /* ignore */
    }
    client = null
    ready = false
  }
  if (!enabled || !clientId.trim()) return

  try {
    const { Client } = await import('@xhayper/discord-rpc')
    const c = new Client({ clientId: clientId.trim() }) as unknown as RpcClient
    c.on('ready', () => {
      ready = true
    })
    await c.login()
    client = c
  } catch {
    // Discord not running or invalid client id — presence stays off.
    client = null
    ready = false
  }
}

/** where "Ouvir no Harmony" leads: the Harmony's page, with the downloads */
const HARMONY_URL = 'https://github.com/Isaac-GhostLolp/harmony'

function english(): boolean {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'language'").get() as { value: string } | undefined
    return row ? JSON.parse(row.value) === 'en' : false
  } catch {
    return false
  }
}

/**
 * "Listening to" like Spotify's: the song's cover (when a public link to it
 * is known) with the Harmony logo in its corner, the album on hover, and a
 * button to the Harmony's page. Without a cover link, the Harmony logo.
 */
function activity(state: PresenceState, startedAt: number, cover: string | null): Record<string, unknown> {
  const en = english()
  return {
    type: 2, // "Listening to"
    statusDisplayType: 2, // the status line shows the song, as Spotify's does
    details: state.title,
    state: state.artist ?? (en ? 'Unknown artist' : 'Artista desconhecido'),
    startTimestamp: startedAt,
    endTimestamp: startedAt + state.duration * 1000,
    largeImageKey: cover ?? 'harmony',
    largeImageText: cover ? (state.album ?? state.title ?? 'Harmony') : 'Harmony',
    ...(cover ? { smallImageKey: 'harmony', smallImageText: 'Harmony' } : {}),
    buttons: [{ label: en ? 'Listen on Harmony' : 'Ouvir no Harmony', url: HARMONY_URL }]
  }
}

export function updatePresence(state: PresenceState): void {
  if (!client || !ready || !client.user) return
  const key = `${state.songId ?? state.title}|${state.isPlaying}`
  if (key === lastKey) return // only push on song/play state change
  lastKey = key

  if (!state.title || !state.isPlaying) {
    client.user.setActivity({}).catch(() => {})
    return
  }
  const user = client.user
  const startedAt = Date.now() - state.currentTime * 1000
  // right away with what's known, then again once the cover's link is found
  const known = state.songId != null ? cachedArt.get(state.songId) : undefined
  user.setActivity(activity(state, startedAt, known ?? null)).catch(() => {})
  if (state.songId == null || known !== undefined) return
  const songId = state.songId
  void artLinkFor(songId)
    .then((url) => {
      cachedArt.set(songId, url)
      if (url && lastKey === key && client?.user) client.user.setActivity(activity(state, startedAt, url)).catch(() => {})
    })
    .catch(() => undefined)
}

/** cover links already resolved this session */
const cachedArt = new Map<number, string | null>()
