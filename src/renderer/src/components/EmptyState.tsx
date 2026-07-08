import { Music4 } from 'lucide-react'

export function EmptyState({ title, hint }: { title: string; hint: string }): JSX.Element {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--bg-raised)]">
        <Music4 size={24} className="text-muted" />
      </div>
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-xs text-muted">{hint}</p>
    </div>
  )
}
