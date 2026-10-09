/**
 * "O que há de novo" — the release notes shown once after an update.
 *
 * To announce a release, add an entry at the TOP of RELEASES with the new
 * version (the same as package.json). Listeners who skipped versions see
 * every entry they missed, newest first.
 *
 * HISTORY holds the releases from before this screen existed (0.9 – 0.16),
 * rebuilt from the changelog. They are never announced after an update;
 * Settings → Novidades → "Todas as versões" lists them with the rest.
 */

declare const __APP_VERSION__: string

/** The running app's version (from package.json at build time). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

export type WhatsNewAction =
  | { kind: 'route'; label: string; to: string }
  | { kind: 'world'; label: string; world: string }
  | { kind: 'karaoke'; label: string }

export interface WhatsNewItem {
  emoji: string
  title: string
  text: string
  action?: WhatsNewAction
}

export interface Release {
  version: string
  title: string
  /** release day (YYYY-MM-DD), shown in the archive */
  date?: string
  items: WhatsNewItem[]
}

export const RELEASES: Release[] = [
  {
    version: '0.18.1',
    title: 'Mais espaço para a música',
    date: '2026-10-09',
    items: [
      {
        emoji: '🧹',
        title: 'Adeus, barra de menu',
        text: 'A barra "File, Edit, View, Window, Help" saiu do topo da janela: o Harmony já tem tudo na própria interface, e a música ganhou mais espaço. Os atalhos continuam: F11 para tela cheia, Ctrl + e Ctrl − para o zoom, Ctrl 0 para voltar ao normal e Ctrl+Q para sair.'
      }
    ]
  },
  {
    version: '0.18.0',
    title: 'Do seu jeito',
    date: '2026-10-09',
    items: [
      {
        emoji: '🎨',
        title: 'Nova aba Personalização',
        text: 'Tudo o que muda o visual do Harmony num lugar só: temas, Mundos vivos, fundo, adesivos, ícones, barra de música e animação de abertura, com atalhos no topo. As Configurações ficaram só com o essencial, e as Estatísticas agora moram no Meu Mundo.',
        action: { kind: 'route', label: 'Abrir Personalização', to: '/personalize' }
      },
      {
        emoji: '🌈',
        title: 'Temas 100% seus',
        text: 'Um estúdio para criar o seu tema: cores, transparência, desfoque, cantos, sombras, brilho e fonte, com prévia ao vivo. São 10 temas novos além dos clássicos, e o Harmony pode trocar sozinho entre um tema de dia e outro de noite.'
      },
      {
        emoji: '📀',
        title: 'Novos jeitos de ver suas músicas',
        text: 'Além da lista, a Biblioteca e os Favoritos agora podem virar uma grade de capas, uma caixa de discos com toca-discos (lado A e lado B) ou uma estante de livros, em que cada álbum abre com sumário.',
        action: { kind: 'route', label: 'Ver a Biblioteca', to: '/' }
      },
      {
        emoji: '🎃',
        title: 'Mais Mundos vivos',
        text: 'Toque em "Carregar mais Worlds vivos": Halloween, Natal, Réveillon em Copacabana, Arcade, Deserto, Floresta Bioluminescente e Chuva de Código. Os de datas comemorativas aparecem "em alta" na época certa.',
        action: { kind: 'world', label: 'Ligar o Halloween', world: 'halloween' }
      },
      {
        emoji: '🖌️',
        title: 'Criador de capas',
        text: 'Música sem capa? Crie uma com 10 estilos e paletas, ou deixe o Harmony gerar sozinho. Use pelo menu da música ou pelo aviso de capas faltando na Biblioteca.'
      },
      {
        emoji: '⭐',
        title: 'Adesivos',
        text: 'Cole figurinhas na barra lateral, no player e nas capas das playlists. São 30 adesivos, alguns animados e outros que pulsam com a batida, e você também pode usar as suas próprias imagens, até GIF animado.'
      },
      {
        emoji: '🧩',
        title: 'Pacotes de ícones',
        text: 'Dez estilos para os ícones da barra lateral e do player: Duotone, Neon, Degradê, Colorido, Figurinha, Emoji, Pixel, Rabisco e Terminal, ou monte um pacote com as suas próprias imagens.'
      },
      {
        emoji: '💿',
        title: 'Barra de música com estilo',
        text: 'Escolha entre Clássico, Flutuante, Compacto, Vinil (com o disco girando no toca-discos) e Capa. Na barra de progresso, use uma onda que dança com a música ou o desenho real do som da faixa.'
      },
      {
        emoji: '📌',
        title: 'Sempre à mão',
        text: 'O cabeçalho e os filtros ficam fixos ao rolar, o botão "Tocando agora" leva direto à música que está tocando, e cada aba lembra até onde você tinha descido.'
      },
      {
        emoji: '📜',
        title: 'A história do Harmony',
        text: 'Em Configurações → Novidades, "Todas as versões" mostra tudo o que já chegou desde a primeira versão, com busca.'
      }
    ]
  },
  {
    version: '0.17.5',
    title: 'Solta a voz!',
    date: '2026-10-08',
    items: [
      {
        emoji: '🎤',
        title: 'Novo modo karaokê',
        text: 'Tire a voz original da música em tempo real, acompanhe a letra palavra por palavra com a bolinha pulando e cante no microfone para ganhar uma nota de S a D. Se a letra estiver adiantada ou atrasada, ajuste com − / + (fica salvo para cada música).',
        action: { kind: 'karaoke', label: 'Abrir o karaokê' }
      },
      {
        emoji: '🌌',
        title: 'Mundos vivos refeitos',
        text: 'Todos os mundos ganharam um remake com muito mais detalhe, sem perder a essência: um buraco negro com lente gravitacional de verdade, um planeta que gira com cidades acendendo à noite, a cafeteria, o jardim japonês, o oceano, o inverno, a floresta, a chuva, o vulcão, o synthwave e a cidade cyberpunk. A maioria muda de luz conforme o horário do dia.',
        action: { kind: 'world', label: 'Ver o Black Hole', world: 'blackhole' }
      },
      {
        emoji: '🎆',
        title: 'Visualizer: quatro palcos novos',
        text: 'Cyber Arena, Nature Pulse, Synthwave City e Space Odyssey foram refeitos no nível do Festival e do Pyramid: arena de hologramas com telão de hexágonos, clareira com aurora e arco de árvores, triângulo neon na rodovia dos anos 80 e show no convés de uma estação espacial com warp nos drops.',
        action: { kind: 'route', label: 'Abrir o Visualizer', to: '/visualizer' }
      },
      {
        emoji: '⚡',
        title: 'Modo Ultra Rápido',
        text: 'Computador mais fraco? Ligue nas Configurações e o Harmony fica leve e liso: sem desfoque de vidro, sombras e animações na interface, Worlds e Visualizer a 30 quadros por segundo em resolução normal. O som continua igualzinho.',
        action: { kind: 'route', label: 'Ir para as Configurações', to: '/settings' }
      },
      {
        emoji: '🧡',
        title: 'Cara nova',
        text: 'O Harmony ganhou um ícone novo, que agora aparece também na barra lateral.'
      }
    ]
  },
  {
    version: '0.17.0',
    title: 'Seu ano, seus mundos, suas lembranças',
    date: '2026-10-07',
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

/** Releases from before the "Novidades" screen, oldest last (see the note at the top). */
export const HISTORY: Release[] = [
  {
    version: '0.16.1',
    title: 'Ajustes no Meu Mundo',
    date: '2026-10-06',
    items: [
      { emoji: '🖼️', title: 'Sua foto de perfil sem cortes', text: 'O seletor de avatar não fica mais cortado, e a opção "usar minha foto" voltou a aparecer. Agora dá para trocar ou remover a foto, e ela é ajustada sozinha para ficar leve.' },
      { emoji: '🔁', title: 'Meu Mundo mais confiável', text: 'Se algo der errado ao carregar o seu mundo, aparece um botão para tentar de novo em vez de ficar carregando para sempre.' }
    ]
  },
  {
    version: '0.16.0',
    title: 'O show começa ao abrir',
    date: '2026-10-03',
    items: [
      { emoji: '🎬', title: 'Animação de abertura', text: 'Um pequeno show de luz e som ao abrir o Harmony, com o seu nome e um "bom dia" ou "boa noite". Clique ou aperte qualquer tecla para pular.' },
      { emoji: '🌍', title: 'Meu Mundo refeito', text: 'Uma página só sua: avatar, bio, cor e nível, mixes de humor, roleta musical, pódio de artistas, suas músicas do coração, relógio musical, DNA de gêneros, conquistas e diário.' },
      { emoji: '🎞️', title: 'Modo Edit com vídeo', text: 'O modo Edit das letras virou um estúdio vertical estilo TikTok, com CD girando, letras palavra por palavra e exportação em vídeo MP4 com a música. Escolha formato, estilo, cores e efeitos.' },
      { emoji: '🔺', title: 'Visualizer de festival', text: 'O palco Festival foi reconstruído como um mainstage de verdade, a Pyramid virou o palco Alive do Daft Punk, e todos os palcos ganharam um DJ animado que mexe na mesa e vibra nos drops.' },
      { emoji: '⚡', title: 'Bem mais rápido', text: 'Bibliotecas enormes abrem em cerca de um segundo, e mexer no volume, na barra de progresso ou passar o mouse não trava mais o app.' }
    ]
  },
  {
    version: '0.15.1',
    title: 'Seu fundo fica salvo',
    date: '2026-07-14',
    items: [
      { emoji: '🖼️', title: 'Meu fundo não some mais', text: 'A imagem ou o vídeo que você escolhe como fundo agora é guardado pelo Harmony e continua lá depois de fechar e abrir o app.' }
    ]
  },
  {
    version: '0.15.0',
    title: 'Mundos vivos',
    date: '2026-07-14',
    items: [
      { emoji: '🕳️', title: 'Chegaram os Worlds', text: 'Temas que viram universos vivos atrás do app e reagem à música: Black Hole, Rain, Nature, Cyberpunk, Ocean, Winter, Coffee Shop, Japanese Garden, Synthwave, Space Station e Volcano.' },
      { emoji: '🎚️', title: 'Do seu jeito', text: 'Ajuste a transparência e o desfoque dos painéis para ver mais ou menos do mundo por trás.' },
      { emoji: '🖼️', title: 'Meu fundo', text: 'Use a sua própria imagem ou vídeo como fundo do Harmony. Imagens ganham um leve movimento que acompanha a música.' },
      { emoji: '☑️', title: 'Seleção estilo Spotify', text: 'Selecione várias músicas com a caixinha, Shift para um intervalo, Ctrl para escolher uma a uma e Ctrl+A para todas. Depois toque, adicione a uma playlist ou remova de uma vez.' }
    ]
  },
  {
    version: '0.12.1',
    title: 'Nosso primeiro apoiador',
    date: '2026-07-13',
    items: [
      { emoji: '👑', title: 'Obrigado, CP-405!', text: 'O primeiro apoiador oficial do Harmony ganhou um lugar de honra na página Apoie, com coroa e tudo.' },
      { emoji: '🏷️', title: 'Gêneros pela internet', text: '"Atualizar metadados" agora também descobre o gênero das músicas que não têm, deixando os filtros e o seu gênero favorito muito mais certeiros.' }
    ]
  },
  {
    version: '0.12.0',
    title: 'Apoie o Harmony',
    date: '2026-07-12',
    items: [
      { emoji: '❤️', title: 'Página Apoie', text: 'Uma página nova contando como o Harmony nasceu, para onde ele vai e como apoiar, sempre opcional e sem pressão.' },
      { emoji: '📜', title: 'Barra lateral que rola', text: 'Em janelas baixas a barra lateral rola, e o "Apoie o Harmony" fica sempre visível no rodapé.' }
    ]
  },
  {
    version: '0.11.9',
    title: 'DJ Mode no ritmo certo',
    date: '2026-07-10',
    items: [
      { emoji: '🎧', title: 'Respiração corrigida', text: 'A capa do DJ Mode não pulsa mais rápido demais em alguns computadores com Windows.' }
    ]
  },
  {
    version: '0.11.8',
    title: 'A grande atualização do encanto',
    date: '2026-07-10',
    items: [
      { emoji: '✨', title: 'Tudo mais gostoso de usar', text: 'Barra de progresso com balão de tempo, volume pela rodinha do mouse e pequenas animações em todo o app.' },
      { emoji: '🏷️', title: 'Biblioteca inteligente', text: 'Filtros rápidos (recentes, mais tocadas, nunca tocadas, favoritas e por gênero) e capas coloridas para músicas sem arte.' },
      { emoji: '🎛️', title: 'Equalizador novo', text: 'Agora numa página própria, com gráfico ao vivo, barras grandes e predefinições.' },
      { emoji: '🎵', title: 'Meu Mundo Musical', text: 'Seu painel pessoal com foto, nome, artista e gênero favoritos, horas ouvidas, conquistas e um diário da sua história com a música.' },
      { emoji: '🎨', title: 'Temas e DJ Mode', text: 'Temas com personalidade (Synthwave, Nature, Glass e Dark Pro), playlists com capa, emoji e cor, e o DJ Mode, uma tela imersiva só com a capa e os controles.' },
      { emoji: '🎤', title: 'Artistas de verdade', text: 'Fotos dos artistas e um "feat." que não duplica mais: cada artista de uma parceria aparece na própria página.' }
    ]
  },
  {
    version: '0.10.2',
    title: 'Linux sem dor de cabeça',
    date: '2026-07-09',
    items: [
      { emoji: '🐧', title: 'AppImage abre de primeira', text: 'O Harmony abre normalmente nas distribuições Linux mais novas, sem precisar de nenhum comando extra.' }
    ]
  },
  {
    version: '0.10.1',
    title: 'Animações no compasso',
    date: '2026-07-09',
    items: [
      { emoji: '💿', title: 'Nada de tremedeira', text: 'O disco e as letras do modo Edit não giram mais rápido demais em monitores de alta taxa de atualização.' }
    ]
  },
  {
    version: '0.10.0',
    title: 'Atualizações automáticas',
    date: '2026-07-09',
    items: [
      { emoji: '🔄', title: 'O Harmony se atualiza sozinho', text: 'As novas versões são baixadas em segundo plano, e você escolhe quando reiniciar. Suas músicas e configurações ficam sempre guardadas.' }
    ]
  },
  {
    version: '0.9.2',
    title: 'Volume liso e dados seguros',
    date: '2026-07-09',
    items: [
      { emoji: '🔊', title: 'Volume sem travar', text: 'Arrastar o volume, o equalizador ou o crossfade não trava mais o app, e o volume muda suave, sem estalos.' },
      { emoji: '🛡️', title: 'Seus dados protegidos', text: 'Biblioteca, playlists, favoritos e histórico ficam numa pasta separada, que nunca é apagada ao atualizar ou reinstalar.' }
    ]
  },
  {
    version: '0.9.1',
    title: 'Primeiros ajustes',
    date: '2026-07-09',
    items: [
      { emoji: '📝', title: 'Playlists funcionando', text: 'Criar, renomear e apagar playlists voltou a funcionar, agora com janelas próprias do Harmony.' },
      { emoji: '🎼', title: 'Letras no tempo certo', text: 'As letras não ficam mais adiantadas ou atrasadas e seguem o tempo real da música.' },
      { emoji: '🌆', title: 'Synthwave mais leve', text: 'O palco Synthwave City do Visualizer pesa bem menos na placa de vídeo.' }
    ]
  },
  {
    version: '0.9.0',
    title: 'Olá, Harmony!',
    date: '2026-07-08',
    items: [
      { emoji: '🎵', title: 'O primeiro lançamento', text: 'Um player de música offline e de código aberto: importe suas pastas e o Harmony organiza álbuns, artistas, playlists, favoritos e histórico, com capas e informações automáticas.' },
      { emoji: '🎛️', title: 'Som de verdade', text: 'Equalizador de 10 bandas, crossfade e reprodução sem pausas entre as faixas.' },
      { emoji: '🎤', title: 'Letras de três jeitos', text: 'Sincronizadas, em karaokê e no modo Edit, buscadas na internet ou de arquivos .lrc.' },
      { emoji: '🎆', title: 'O Visualizer', text: 'Transforma qualquer música num show ao vivo com seis palcos: Festival, Pyramid, Cyber Arena, Nature Pulse, Synthwave City e Space Odyssey.' },
      { emoji: '🧩', title: 'E mais', text: 'Seis temas, cor de destaque que acompanha a capa, mini player, busca e Discord Rich Presence.' }
    ]
  }
]

/** Every release up to the running version (announced and archived), newest first. */
export function allReleases(current = APP_VERSION): Release[] {
  return [...RELEASES, ...HISTORY]
    .filter((r) => compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
