import { useEffect, useState } from 'react'
import {
  Heart,
  Coffee,
  Github,
  Check,
  Wrench,
  Music4,
  Sparkles,
  HandHeart,
  Crown
} from 'lucide-react'
import type { MusicProfile } from '@/types'
import { api } from '@/services/api'
import { CP405_PHOTO } from '@/assets/supporterCP405'

// ---- Configure your real links here -------------------------------------
// Empty strings hide the card, so you can enable each channel when it's ready.
const SUPPORT_LINKS = {
  pix: '', // e.g. a copy-paste PIX key handled below, or a link
  kofi: 'https://ko-fi.com/isaacghostlolp',
  buymeacoffee: '', // add a Buy Me a Coffee link to enable that card
  githubSponsors: '' // add a GitHub Sponsors link to enable that card
}
const PIX_KEY = '' // put your PIX key here to enable the PIX card
// -------------------------------------------------------------------------

function open(url: string): void {
  if (url) api.app?.openExternal(url)
}

export function Support(): JSX.Element {
  const [profile, setProfile] = useState<MusicProfile | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.stats.profile().then((p) => setProfile(p as MusicProfile))
  }, [])

  const hours = profile ? Math.max(0, Math.floor(profile.hoursPlayed)) : 0
  const songs = profile?.totalSongs ?? 0

  const supportCards = [
    PIX_KEY && {
      icon: Heart,
      emoji: '❤️',
      title: 'Doação via PIX',
      desc: 'A forma mais direta de apoiar, aqui no Brasil.',
      action: () => {
        navigator.clipboard.writeText(PIX_KEY)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2500)
      },
      cta: copied ? 'Chave copiada!' : 'Copiar chave PIX'
    },
    SUPPORT_LINKS.kofi && {
      icon: Coffee,
      emoji: '☕',
      title: 'Me pagar um café',
      desc: 'Um cafezinho ajuda a manter as madrugadas de código.',
      action: () => open(SUPPORT_LINKS.kofi),
      cta: 'Abrir Ko-fi'
    },
    SUPPORT_LINKS.buymeacoffee && {
      icon: Music4,
      emoji: '🎵',
      title: 'Buy Me a Coffee',
      desc: 'Apoie por lá se preferir essa plataforma.',
      action: () => open(SUPPORT_LINKS.buymeacoffee),
      cta: 'Abrir'
    },
    SUPPORT_LINKS.githubSponsors && {
      icon: Github,
      emoji: '🌎',
      title: 'GitHub Sponsors',
      desc: 'Apoio recorrente direto pelo GitHub do projeto.',
      action: () => open(SUPPORT_LINKS.githubSponsors),
      cta: 'Ser sponsor'
    }
  ].filter(Boolean) as {
    icon: typeof Heart
    emoji: string
    title: string
    desc: string
    action: () => void
    cta: string
  }[]

  const reasons = [
    'Desenvolvimento de novas funcionalidades',
    'Publicação da versão Android',
    'Compra de equipamentos',
    'Hospedagem e recursos gráficos',
    'Melhorias de performance',
    'Tempo dedicado ao projeto'
  ]

  const roadmap: { label: string; done: boolean }[] = [
    { label: 'Player offline', done: true },
    { label: 'Biblioteca inteligente', done: true },
    { label: 'Letras sincronizadas', done: true },
    { label: 'Visualizer cinemático', done: true },
    { label: 'Melhorias no Visualizer', done: false },
    { label: 'Versão Android', done: false },
    { label: 'Sistema de plugins', done: false },
    { label: 'Cloud Sync (opcional)', done: false },
    { label: 'Novos Show Packs', done: false }
  ]

  return (
    <div className="mx-auto max-w-3xl pb-10">
      {/* Header */}
      <header className="fade-rise relative mb-8 overflow-hidden rounded-3xl p-8 text-center">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, var(--accent-soft), transparent 65%)'
          }}
        />
        <div className="mb-4 flex justify-center">
          <div className="relative grid h-20 w-20 place-items-center rounded-full bg-[var(--accent-soft)]">
            <HandHeart size={38} className="text-[var(--accent)]" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">❤️ Apoie o Harmony</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
          O Harmony continuará sendo gratuito e open source. Se ele tornou seus dias um pouco
          melhores e você quiser ajudar no desenvolvimento, qualquer apoio será muito bem-vindo —
          mas nunca obrigatório.
        </p>
      </header>

      {/* Live counter — real data from this user */}
      {profile && (hours > 0 || songs > 0) && (
        <div className="fade-rise mb-8 grid gap-3 sm:grid-cols-2">
          <div className="glass rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-[var(--accent)]">
              {hours.toLocaleString('pt-BR')}h
            </p>
            <p className="mt-1 text-xs text-muted">🎵 de música você já reproduziu no Harmony</p>
          </div>
          <div className="glass rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-[var(--accent)]">
              {songs.toLocaleString('pt-BR')}
            </p>
            <p className="mt-1 text-xs text-muted">💿 músicas na sua biblioteca</p>
          </div>
        </div>
      )}

      {/* How it started */}
      <section className="glass fade-rise mb-5 rounded-2xl p-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={15} className="text-[var(--accent)]" /> Como tudo começou
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          O Harmony começou como um projeto pessoal porque eu queria um player offline bonito para
          ouvir minhas próprias músicas — principalmente aquelas que não existiam nas plataformas de
          streaming. Com o tempo, o projeto cresceu, ganhou novas funcionalidades e acabou se
          tornando um aplicativo open source para qualquer pessoa utilizar.
        </p>
      </section>

      {/* Why support */}
      <section className="glass fade-rise mb-5 rounded-2xl p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Heart size={15} className="text-[var(--accent)]" /> Por que apoiar?
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          Seu apoio ajuda a manter o projeto vivo. De forma transparente, as contribuições poderão
          ser usadas para:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {reasons.map((r) => (
            <div key={r} className="flex items-center gap-2 text-sm text-muted">
              <Check size={14} className="shrink-0 text-[var(--accent)]" />
              {r}
            </div>
          ))}
        </div>
      </section>

      {/* How to support */}
      {supportCards.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">Como apoiar</h2>
          <div
            className={`grid gap-3 ${
              supportCards.length > 1 ? 'sm:grid-cols-2' : 'mx-auto max-w-md'
            }`}
          >
            {supportCards.map((c) => (
              <div key={c.title} className="glass lift flex flex-col gap-3 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-xl">
                    {c.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{c.title}</p>
                    <p className="text-xs text-muted">{c.desc}</p>
                  </div>
                </div>
                <button
                  onClick={c.action}
                  className="press mt-auto w-full rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-transform"
                >
                  {c.cta}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roadmap */}
      <section className="glass fade-rise mb-5 rounded-2xl p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Wrench size={15} className="text-[var(--accent)]" /> Para onde o Harmony vai
        </h2>
        <div className="relative border-l border-white/10 pl-6">
          {roadmap.map((item) => (
            <div key={item.label} className="relative mb-4 last:mb-0">
              <span
                className={`absolute -left-[27px] top-0.5 grid h-4 w-4 place-items-center rounded-full ${
                  item.done ? 'bg-[var(--accent)]' : 'border border-white/20 bg-[var(--bg-raised)]'
                }`}
              >
                {item.done && <Check size={10} className="text-white" />}
              </span>
              <p className={`text-sm ${item.done ? 'text-ink' : 'text-muted'}`}>
                {item.done ? '✅' : '🚧'} {item.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Thank you */}
      <section
        className="fade-rise mb-5 rounded-2xl p-6 text-center"
        style={{ background: 'linear-gradient(135deg, var(--accent-soft), transparent)' }}
      >
        <h2 className="mb-2 text-sm font-semibold">Obrigado 💜</h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted">
          O maior apoio que o Harmony já recebeu foi cada pessoa que decidiu baixar o aplicativo,
          testá-lo e compartilhar sugestões. Muito obrigado por fazer parte dessa jornada.
        </p>
      </section>

      {/* Supporters */}
      <section className="glass fade-rise rounded-2xl p-6 text-center">
        <h2 className="mb-1 text-sm font-semibold">Apoiadores</h2>
        <p className="mb-6 text-xs text-muted">
          As pessoas que decidiram apoiar oficialmente o Harmony. 💛
        </p>

        <div className="flex flex-wrap items-start justify-center gap-6">
          {/* First supporter — CP-405, crowned */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {/* crown */}
              <Crown
                size={30}
                className="absolute -top-4 left-1/2 z-10 -translate-x-1/2 -rotate-[8deg] drop-shadow"
                style={{ color: '#f5c542', fill: '#f5c542' }}
              />
              {/* glowing ring */}
              <div
                className="grid h-24 w-24 place-items-center rounded-full p-[3px]"
                style={{
                  background: 'linear-gradient(135deg, #f5c542, #ff8c42)',
                  boxShadow: '0 0 24px rgba(245,197,66,0.45)'
                }}
              >
                <img
                  src={CP405_PHOTO}
                  alt="CP-405"
                  className="h-full w-full rounded-full object-cover"
                />
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold">CP-405</p>
            <span
              className="mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-black"
              style={{ background: 'linear-gradient(135deg, #f5c542, #ff8c42)' }}
            >
              1º apoiador
            </span>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted">
          Obrigado, CP-405, por ser o primeiro a acreditar no projeto. ✨
        </p>
      </section>
    </div>
  )
}
