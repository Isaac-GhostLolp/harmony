import { X, GripVertical, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useUiStore } from '@/store/uiStore'
import { formatDuration } from '@/utils/format'

export function QueuePanel(): JSX.Element {
  const open = useUiStore((s) => s.queueOpen)
  const toggle = useUiStore((s) => s.toggleQueue)
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const { playQueue, removeFromQueue, moveInQueue } = usePlayerStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="glass z-20 m-3 ml-0 flex w-80 shrink-0 flex-col rounded-2xl p-3"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">Fila</h2>
            <button onClick={toggle} className="text-muted hover:text-ink" aria-label="Fechar fila">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {queue.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted">
                A fila está vazia. Toque algo na biblioteca.
              </p>
            )}
            {queue.map((song, i) => (
              <div
                key={`${song.id}-${i}`}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== i) moveInQueue(dragIndex, i)
                  setDragIndex(null)
                }}
                className={`group flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[var(--bg-raised)] ${
                  i === currentIndex ? 'text-[var(--accent)]' : ''
                }`}
              >
                <GripVertical size={13} className="shrink-0 text-muted" />
                <button
                  onClick={() => playQueue(queue, i)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-medium">{song.title}</p>
                  <p className="truncate text-[10px] text-muted">{song.artist ?? '—'}</p>
                </button>
                <span className="tabular-nums text-muted">{formatDuration(song.duration)}</span>
                <button
                  onClick={() => removeFromQueue(i)}
                  className="text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
                  aria-label="Remover da fila"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
