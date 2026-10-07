/**
 * "O que há de novo" — the release notes shown once after an update.
 *
 * To announce a release, add an entry at the TOP of RELEASES with the new
 * version (the same as package.json). Listeners who skipped versions see
 * every entry they missed, newest first.
 */

declare const __APP_VERSION__: string

/** The running app's version (from package.json at build time). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export type WhatsNewAction =
  | { kind: 'route'; label: string; to: string }
  | { kind: 'world'; label: string; world: string }

export interface WhatsNewItem {
  emoji: string
  title: string
  text: string
  action?: WhatsNewAction
}

export interface Release {
  version: string
  title: string
  items: WhatsNewItem[]
}

export const RELEASES: Release[] = [
  {
    version: '0.17.0',
    title: 'Seu ano, seus mundos, suas lembranças',
    items: [
      {
        emoji: '🎬',
        title: 'Retrospectiva em vídeo',
        text: 'Seus minutos, artistas, músicas e horários do ano num vídeo vertical pronto para os stories, pulsando no ritmo da sua música nº 1.',
        action: { kind: 'route', label: 'Criar minha retrospectiva', to: '/my-world?recap=1' }
      },
      {
        emoji: '🎚️',
        title: 'Mundo Automático',
        text: 'O Harmony escolhe o mundo certo para cada música (rock no Vulcão, lo-fi na Cafeteria…) e troca suavemente entre as faixas. Nas Configurações dá para ligar também a Explosão no refrão.',
        action: { kind: 'world', label: 'Experimentar', world: 'auto' }
      },
      {
        emoji: '📮',
        title: 'Cápsulas do tempo',
        text: 'Guarde uma lembrança numa música e escolha quando ela abre. Quando a data chegar, seu eu do passado aparece na próxima vez que ela tocar. Use o ⏳ no player.',
        action: { kind: 'route', label: 'Ver no Meu Mundo', to: '/my-world?section=capsules' }
      },
      {
        emoji: '🛠️',
        title: 'Ajustes e correções',
        text: 'O menu da foto de perfil no Meu Mundo não fica mais cortado, as fotos ficam mais leves e agora dá para removê-las.'
      }
    ]
  }
]

/** Compares dotted versions numerically ("0.10.0" > "0.9.3"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** Releases newer than `lastSeen`, up to the running version, newest first. */
export function releasesSince(lastSeen: string | null, current = APP_VERSION): Release[] {
  return RELEASES.filter(
    (r) => compareVersions(r.version, current) <= 0 && (!lastSeen || compareVersions(r.version, lastSeen) > 0)
  )
}
