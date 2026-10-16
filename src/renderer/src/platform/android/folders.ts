/**
 * Which of the phone's folders hold the user's music. Android's MediaStore
 * lists every audio file (WhatsApp voice notes, recordings, ringtones…), so
 * the library only takes songs inside the folders chosen here.
 *
 * Light on purpose (no database, no plugins): the folder picker screen
 * imports it on the desktop build too.
 */

export interface AudioFile {
  path: string
}

export interface FolderNode {
  /** full path; songs below it belong to it */
  path: string
  /** what to show: "Music", or "Android › media › com.whatsapp" when collapsed */
  label: string
  /** songs anywhere below */
  count: number
  children: FolderNode[]
}

/** "/storage/emulated/0" (the phone) or "/storage/1A2B-3C4D" (a memory card) */
function rootOf(path: string): string {
  const p = path.split('/')
  return p[1] === 'storage' && p[2] === 'emulated' ? p.slice(0, 4).join('/') : p.slice(0, 3).join('/')
}

export const isInside = (path: string, folder: string): boolean => path === folder || path.startsWith(folder + '/')

/** the folder tree of where audio files are, one tree per storage */
export function folderTree(files: AudioFile[]): FolderNode[] {
  interface Raw {
    path: string
    name: string
    count: number
    kids: Map<string, Raw>
  }
  const roots = new Map<string, Raw>()
  for (const f of files) {
    const root = rootOf(f.path)
    let node = roots.get(root)
    if (!node) roots.set(root, (node = { path: root, name: root, count: 0, kids: new Map() }))
    node.count++
    const parts = f.path.slice(root.length + 1).split('/').slice(0, -1) // the folders, not the file
    let at = node
    for (const part of parts) {
      let kid = at.kids.get(part)
      if (!kid) at.kids.set(part, (kid = { path: `${at.path}/${part}`, name: part, count: 0, kids: new Map() }))
      kid.count++
      at = kid
    }
  }
  // a chain of single folders with nothing of their own reads as one: "Android › media › …"
  const build = (r: Raw, label: string): FolderNode => {
    const kids = [...r.kids.values()]
    const direct = r.count - kids.reduce((n, k) => n + k.count, 0)
    if (kids.length === 1 && direct === 0) return build(kids[0], `${label} › ${kids[0].name}`)
    return {
      path: r.path,
      label,
      count: r.count,
      children: kids.sort((a, b) => b.count - a.count).map((k) => build(k, k.name))
    }
  }
  // a storage itself is never folded into its folders (the screen names it: phone / memory card)
  return [...roots.values()].map((r) => ({
    path: r.path,
    label: r.path,
    count: r.count,
    children: [...r.kids.values()].sort((a, b) => b.count - a.count).map((k) => build(k, k.name))
  }))
}

/** folders that look like a music library, to start with */
export function guessMusicFolders(tree: FolderNode[]): string[] {
  const found: string[] = []
  const walk = (n: FolderNode): void => {
    if (n.label.split(' › ').some((part) => /^(music|músicas?|musicas?|my music|minhas músicas)$/i.test(part))) {
      found.push(n.path)
      return
    }
    n.children.forEach(walk)
  }
  tree.forEach((r) => r.children.forEach(walk))
  return found
}

// ---- the picker screen answers the Android library's request ----

type Answer = (folders: string[] | null) => void
interface Request {
  files: AudioFile[]
  chosen: string[]
  answer: Answer
}
let pending: Request | null = null
const listeners = new Set<() => void>()

/** asks the picker screen; resolves with the chosen folders, or null if cancelled */
export function askForFolders(files: AudioFile[], chosen: string[]): Promise<string[] | null> {
  return new Promise((resolve) => {
    pending?.answer(null)
    pending = { files, chosen, answer: resolve }
    listeners.forEach((l) => l())
  })
}

export function currentRequest(): Request | null {
  return pending
}

export function answerRequest(folders: string[] | null): void {
  const p = pending
  pending = null
  listeners.forEach((l) => l())
  p?.answer(folders)
}

export function onRequest(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
