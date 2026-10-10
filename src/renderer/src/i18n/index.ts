/// <reference types="vite/client" />
import { useSyncExternalStore } from 'react'
import { en } from './en'

/**
 * The app's languages. Portuguese is the source: every text is written in
 * Portuguese in the code and passed through t(), which returns it as is in
 * Portuguese and looks it up in the English dictionary (./en.ts) otherwise.
 * A text missing from a dictionary falls back to Portuguese instead of
 * breaking, and is listed in window.__i18nMissing during development.
 *
 * Texts can carry values: t('{n} músicas', { n }) → "12 songs". tn() picks
 * the singular or plural form. Lists of data (sidebar items, themes, worlds…)
 * keep their Portuguese names and are translated where they are shown.
 *
 * The choice lives in localStorage (so the first paint is already in the
 * right language) and in the settings (for the main process). With no
 * choice yet, the system language decides: Portuguese for pt-*, else
 * English. Switching re-renders the whole app (main.tsx keys it by the
 * language); the music keeps playing.
 */

export type Lang = 'pt' | 'en'

export const LANGUAGES: { id: Lang; name: string; flag: string }[] = [
  { id: 'pt', name: 'Português (Brasil)', flag: '🇧🇷' },
  { id: 'en', name: 'English', flag: '🇺🇸' }
]

const KEY = 'harmony.lang'
const DICTS: Record<Exclude<Lang, 'pt'>, Record<string, string>> = { en }

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'pt' || saved === 'en') return saved
  } catch {
    /* no storage: fall through to the system language */
  }
  const sys = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase()
  return sys.startsWith('pt') ? 'pt' : 'en'
}

let lang: Lang = detect()
document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
const listeners = new Set<() => void>()
const missing = new Set<string>()
if (import.meta.env.DEV) (window as unknown as { __i18nMissing: Set<string> }).__i18nMissing = missing
// the main process reads it for its own few texts (dialogs, progress)
window.harmony?.settings.set('language', lang)

export function getLang(): Lang {
  return lang
}

export function setLang(next: Lang): void {
  if (next === lang) return
  lang = next
  document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en'
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* still applies for this session */
  }
  window.harmony?.settings.set('language', next)
  for (const fn of listeners) fn()
}

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** the current language, re-rendering on change */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang)
}

/** the locale for dates and numbers */
export function locale(): string {
  return lang === 'pt' ? 'pt-BR' : 'en-US'
}

type Vars = Record<string, string | number>

/** a text in the current language (`pt` is the Portuguese source and the key) */
export function t(pt: string, vars?: Vars): string {
  let s = pt
  if (lang !== 'pt') {
    const hit = DICTS[lang][pt]
    if (hit !== undefined) s = hit
    else if (import.meta.env.DEV && pt.trim()) missing.add(pt)
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** singular or plural by `n` (also available as {n} in the text) */
export function tn(n: number, one: string, many: string, vars?: Vars): string {
  return t(n === 1 ? one : many, { n, ...vars })
}

/**
 * Marks a text kept in data (a list of items, a preset's name) for the
 * dictionaries without translating it there: it is translated with t()
 * where it is shown, so it follows the language when it changes.
 */
export const tk = (pt: string): string => pt
