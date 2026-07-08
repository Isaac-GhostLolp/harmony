/**
 * Discord Rich Presence (optional).
 * Requires the user to create a Discord Application and paste its
 * Client ID in Settings. Fails silently if Discord isn't running.
 */
export interface PresenceState {
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

export function updatePresence(state: PresenceState): void {
  if (!client || !ready || !client.user) return
  const key = `${state.title}|${state.isPlaying}`
  if (key === lastKey) return // only push on song/play state change
  lastKey = key

  if (!state.title || !state.isPlaying) {
    client.user.setActivity({}).catch(() => {})
    return
  }
  const now = Date.now()
  client.user
    .setActivity({
      type: 2, // "Listening to"
      details: state.title,
      state: state.artist ?? 'Unknown artist',
      startTimestamp: now - state.currentTime * 1000,
      endTimestamp: now + (state.duration - state.currentTime) * 1000,
      largeImageKey: 'harmony',
      largeImageText: 'Harmony'
    })
    .catch(() => {})
}
