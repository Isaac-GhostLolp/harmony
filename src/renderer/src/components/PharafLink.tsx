import { useEffect, useRef, useState } from 'react'
import { Radio, X } from 'lucide-react'
import { api } from '@/services/api'
import { getEngine } from '@/services/audioEngine'
import { usePlayerStore } from '@/store/playerStore'
import type { Song } from '@/types'
import { t } from '@/i18n'

/**
 * Pharaf link — the renderer half of the bridge (main: services/pharafBridge.ts).
 *
 * - Sends the player state (no file paths) whenever it changes, so friends in
 *   the Pharaf call see what is playing and the queue in real time.
 * - Obeys player commands coming from Pharaf (play, queue, skip…), exactly as
 *   if they were clicked here — this Harmony stays the one source of truth.
 * - Sends the sound to Pharaf over a local WebRTC link (after the equalizer).
 * - Shows a small "In Pharaf" badge and what friends just did.
 */

interface Status {
  room?: string
  people?: string[]
  locked?: boolean
}

function publicState(): unknown {
  const s = usePlayerStore.getState()
  const song = s.queue[s.currentIndex] ?? null
  const strip = (x: Song) => ({ id: x.id, title: x.title, artist: x.artist, album: x.album, albumId: x.albumId, duration: x.duration })
  return {
    song: song ? strip(song) : null,
    index: s.currentIndex,
    queue: s.queue.slice(0, 300).map(strip),
    queueLength: s.queue.length,
    playing: s.isPlaying,
    position: s.currentTime,
    shuffle: s.shuffle,
    repeat: s.repeat,
    at: Date.now()
  }
}

export function PharafLink(): JSX.Element | null {
  const [status, setStatus] = useState<Status | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const toastTimer = useRef<number>()

  // Player state → Pharaf (on every change that matters, and the position every 5 s)
  useEffect(() => {
    if (!api.pharaf) return
    let last = ''
    const push = (): void => {
      const s = usePlayerStore.getState()
      const key = JSON.stringify([s.queue.map((q) => q.id), s.currentIndex, s.isPlaying, s.shuffle, s.repeat, s.epoch])
      if (key === last) return
      last = key
      api.pharaf.pushState(publicState())
    }
    push()
    const unsub = usePlayerStore.subscribe(push)
    // a seek doesn't change the key above: send the position when it jumps
    let lastTime = 0
    const unsubTime = usePlayerStore.subscribe((s) => {
      if (Math.abs(s.currentTime - lastTime) > 2.5) api.pharaf.pushState(publicState())
      lastTime = s.currentTime
    })
    const timer = window.setInterval(() => api.pharaf.pushState(publicState()), 5000)
    return () => {
      unsub()
      unsubTime()
      window.clearInterval(timer)
    }
  }, [])

  // Requests from Pharaf
  useEffect(() => {
    if (!api.pharaf) return
    const showToast = (text: string): void => {
      setToast(text)
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setToast(null), 4500)
    }
    return api.pharaf.onRequest(async ({ rid, method, params }) => {
      try {
        let result: unknown = null
        const store = usePlayerStore.getState()
        if (method === 'player.cmd') {
          const songs = (params.songs as Song[]) ?? []
          const index = Number(params.index) || 0
          switch (params.cmd) {
            case 'play':
              if (!store.isPlaying) store.togglePlay()
              break
            case 'pause':
              if (store.isPlaying) store.togglePlay()
              break
            case 'toggle':
              store.togglePlay()
              break
            case 'next':
              store.next()
              break
            case 'prev':
              store.previous()
              break
            case 'seek':
              store.seek(Math.max(0, Number(params.value) || 0))
              break
            case 'jump':
              if (index >= 0 && index < store.queue.length) {
                usePlayerStore.setState((st) => ({ currentIndex: index, isPlaying: true, currentTime: 0, epoch: st.epoch + 1 }))
              }
              break
            case 'playSongs': // play these now (an album, a playlist, or one song)
              if (songs.length) store.playQueue(songs, Math.min(Math.max(0, index), songs.length - 1))
              break
            case 'queueAdd': // to the end, or right after the current one
              if (!songs.length) break
              if (store.queue.length === 0) store.playQueue(songs, 0)
              else if (params.next) [...songs].reverse().forEach((sg) => usePlayerStore.getState().addNext(sg))
              else songs.forEach((sg) => usePlayerStore.getState().addToQueue(sg))
              break
            case 'queueRemove':
              if (index !== store.currentIndex && index >= 0 && index < store.queue.length) store.removeFromQueue(index)
              break
            case 'queueMove': {
              const from = Number(params.from)
              const to = Number(params.to)
              if (from >= 0 && to >= 0 && from < store.queue.length && to < store.queue.length) store.moveInQueue(from, to)
              break
            }
            case 'shuffle':
              store.toggleShuffle()
              break
            case 'repeat':
              store.cycleRepeat()
              break
          }
          result = publicState()
        } else if (method === 'audio.offer') {
          // Pharaf asks for the sound: answer its offer with Harmony's music track.
          pcRef.current?.close()
          const pc = new RTCPeerConnection({ iceServers: [] })
          pcRef.current = pc
          const stream = getEngine().getShareStream()
          for (const track of stream.getAudioTracks()) pc.addTrack(track, stream)
          await pc.setRemoteDescription({ type: 'offer', sdp: String(params.sdp) })
          await pc.setLocalDescription(await pc.createAnswer())
          // no trickle: wait until all local candidates are in the answer
          await new Promise<void>((resolve) => {
            if (pc.iceGatheringState === 'complete') return resolve()
            const done = (): void => {
              if (pc.iceGatheringState === 'complete') resolve()
            }
            pc.addEventListener('icegatheringstatechange', done)
            setTimeout(resolve, 3000)
          })
          result = { sdp: pc.localDescription?.sdp }
        } else if (method === 'audio.stop' || method === 'disconnected') {
          pcRef.current?.close()
          pcRef.current = null
          setStatus(null)
        } else if (method === 'notify') {
          showToast(String(params.text ?? ''))
        } else if (method === 'status') {
          setStatus(params as Status)
        }
        api.pharaf.respond(rid, result)
      } catch (err) {
        api.pharaf.respond(rid, null, (err as Error).message)
      }
    })
  }, [])

  if (!status) return null
  const people = status.people ?? []
  return (
    <div className="glass fixed bottom-24 left-4 z-[90] w-72 rounded-2xl p-3 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)]">
          <Radio size={16} className="text-[var(--accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">
            {t('No Pharaf')}
            {status.room ? ` · ${status.room}` : ''}
          </p>
          <p className="truncate text-[11px] text-muted">
            {people.length
              ? t('{n} ouvindo: {names}', { n: people.length, names: people.join(', ') })
              : t('Tocando para a chamada')}
            {status.locked ? ` · ${t('só você controla')}` : ''}
          </p>
        </div>
        <button onClick={() => setStatus(null)} className="text-muted hover:text-ink" aria-label={t('Dispensar')}>
          <X size={14} />
        </button>
      </div>
      {toast && <p className="mt-2 rounded-xl bg-[var(--bg-raised)] px-3 py-2 text-[11px] text-ink">{toast}</p>}
    </div>
  )
}
