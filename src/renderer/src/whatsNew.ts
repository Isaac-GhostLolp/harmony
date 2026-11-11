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

import { tk } from '@/i18n'
import { IS_ANDROID } from '@/platform'

declare const __APP_VERSION__: string

/**
 * The Android app counts its own versions (it started long after the
 * desktop one): raise this and add an entry to ANDROID_RELEASES with each
 * Android update.
 */
export const ANDROID_VERSION = '0.8.0'

/** The running app's version: package.json's on the desktop, ANDROID_VERSION on the phone. */
export const APP_VERSION: string = IS_ANDROID
  ? ANDROID_VERSION
  : typeof __APP_VERSION__ === 'string'
    ? __APP_VERSION__
    : '0.0.0'

/** Where the last version seen is kept (the phone has its own numbering). */
export const LAST_SEEN_KEY = IS_ANDROID ? 'lastSeenAndroid' : 'lastSeenVersion'

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
    version: '0.20.0',
    title: tk('A ponte entre o PC e o celular'),
    date: '2026-11-11',
    items: [
      {
        emoji: '📱',
        title: tk('Ponte com o celular'),
        text: tk('Em Configurações → Ponte com o celular, o Harmony do PC mostra um QR code. O Harmony do celular lê, e os dois juntam playlists e favoritos e trocam músicas pelo Wi-Fi de casa. Sem nuvem e sem conta.')
      }
    ]
  },
  {
    version: '0.19.3',
    title: tk('Botões da janela de volta'),
    date: '2026-11-07',
    items: [
      {
        emoji: '🪟',
        title: tk('Minimizar, maximizar e fechar funcionam de novo'),
        text: tk('Os botões da barra da janela do Harmony pararam de responder ao clique. Agora voltaram ao normal.')
      }
    ]
  },
  {
    version: '0.19.2',
    title: tk('Capa no Discord, timer e som mais limpo'),
    date: '2026-11-07',
    items: [
      {
        emoji: '🎧',
        title: tk('Sua música no Discord, com capa'),
        text: tk('O "Ouvindo" do Discord agora mostra a capa da música (com o logo do Harmony no canto), o álbum e um botão "Ouvir no Harmony" para os seus amigos. A capa é a oficial, buscada na internet: nada do seu computador é enviado. Músicas sem capa online ficam com o logo.'),
        action: { kind: 'route', label: tk('Ir para as Configurações'), to: '/settings' }
      },
      {
        emoji: '🌙',
        title: tk('Timer para dormir'),
        text: tk('Toque na lua da barra de música e escolha por quanto tempo ainda tocar — ou até o fim da música. No final ela vai sumindo devagar, pausa e o Harmony fecha sozinho.')
      },
      {
        emoji: '🎚️',
        title: tk('Equalizador sem estourar'),
        text: tk('Os presets que aumentam o som (como o Bass Boost) agora compensam o volume sozinhos, sem distorcer.'),
        action: { kind: 'route', label: tk('Abrir o equalizador'), to: '/equalizer' }
      },
      {
        emoji: '🔎',
        title: tk('Letras e capas mais fáceis de achar'),
        text: tk('Músicas com o artista no nome, como "Espresso Sabrina Carpenter", agora encontram letra e capa; a letra sincronizada ganha da sem tempo; e quando o site das letras está ocupado, o Harmony tenta de novo em vez de desistir.')
      },
      {
        emoji: '🖼️',
        title: tk('Playlists do seu tamanho'),
        text: tk('Escolha capas grandes, médias ou uma lista compacta (G, M, P no topo de Playlists), e a cópia de uma playlist agora leva a foto junto.'),
        action: { kind: 'route', label: tk('Ver as playlists'), to: '/playlists' }
      },
      {
        emoji: '🧩',
        title: tk('Pequenos consertos'),
        text: tk('O fundo do DJ Mode volta a mostrar a capa, a Roleta do Meu Mundo não trava mais o app, os contadores do Meu Mundo não mostram mais "-0" e, se uma tela falhar, só ela mostra um aviso — a música continua.')
      }
    ]
  },
  {
    version: '0.19.1',
    title: tk('Harmony e Pharaf mais firmes'),
    date: '2026-10-14',
    items: [
      {
        emoji: '🔧',
        title: tk('Obedece mesmo em segundo plano'),
        text: tk('Com o Pharaf conectado, o Harmony continua atendendo os amigos mesmo minimizado ou atrás de um jogo — antes ele podia guardar os pedidos até você abrir a janela de novo.'),
      }
    ]
  },
  {
    version: '0.19.0',
    title: tk('Harmony na chamada do Pharaf'),
    date: '2026-10-14',
    items: [
      {
        emoji: '💬',
        title: tk('O que é o Pharaf?'),
        text: tk('O Pharaf é um app de conversa por voz, vídeo e texto, parecido com o Discord, feito pelo mesmo criador do Harmony. Ele ainda não está aberto ao público: por enquanto é usado por um grupo fechado de amigos. Esta versão já deixa o Harmony pronto para quando ele abrir.'),
      },
      {
        emoji: '🎧',
        title: tk('Ouça junto com os amigos'),
        text: tk('Numa chamada do Pharaf, quem conecta o Harmony toca para a sala toda: o som do Harmony (com o seu equalizador e crossfade) vai para a chamada, e os amigos veem o que está tocando, a fila e a sua biblioteca.'),
      },
      {
        emoji: '🎛️',
        title: tk('Todo mundo escolhe'),
        text: tk('Os amigos podem tocar, pôr na fila, pular e reordenar as músicas, e tudo aparece aqui na hora. Quer o controle só para você? Ligue "Só eu controlo" no Pharaf.'),
      },
      {
        emoji: '🔒',
        title: tk('Só com a sua permissão'),
        text: tk('Sem o Pharaf, nada muda no Harmony. Na primeira vez que o Pharaf tenta se conectar, o Harmony pergunta se pode. A ligação fica só no seu computador: nenhum site consegue usar.'),
      }
    ]
  },
  {
    version: '0.18.6',
    title: tk('Uma janela com a cara do Harmony'),
    date: '2026-10-12',
    items: [
      {
        emoji: '🪟',
        title: tk('Nova barra da janela'),
        text: tk('A barra do topo agora é do próprio Harmony: tem as cores do tema, deixa os mundos aparecerem por trás e mostra a música que está tocando. Escolha entre quatro estilos de botões (Harmony, Bolinhas, Mínimo e Cápsula) em Personalização → Barra da janela. Prefere a barra antiga? A opção "Do sistema" continua lá.'),
        action: { kind: 'route', label: tk('Abrir Personalização'), to: '/personalize' }
      }
    ]
  },
  {
    version: '0.18.5',
    title: tk('Harmony em inglês'),
    date: '2026-10-10',
    items: [
      {
        emoji: '🌐',
        title: tk('Agora também em inglês'),
        text: tk('O Harmony fala inglês! Na primeira vez, ele abre no idioma do seu computador (português ou, para os outros idiomas, inglês). Para trocar, é só ir em Configurações → Idioma · Language: a mudança é na hora, sem parar a música.'),
        action: { kind: 'route', label: tk('Ir para as Configurações'), to: '/settings' }
      },
      {
        emoji: '❤️',
        title: tk('Favoritos na hora'),
        text: tk('Favoritou uma música pela barra do player? Agora o coração aparece na mesma hora na Biblioteca, nas playlists, nos álbuns e nos favoritos, sem precisar recarregar a aba.')
      },
      {
        emoji: '💜',
        title: tk('Obrigado, P4TIW!'),
        text: tk('O Harmony ganhou o seu segundo apoiador oficial. P4TIW agora está na página Apoie, ao lado do CP-405.'),
        action: { kind: 'route', label: tk('Ver os apoiadores'), to: '/support' }
      }
    ]
  },
  {
    version: '0.18.1',
    title: tk('Mais espaço para a música'),
    date: '2026-10-09',
    items: [
      {
        emoji: '🧹',
        title: tk('Adeus, barra de menu'),
        text: tk('A barra "File, Edit, View, Window, Help" saiu do topo da janela: o Harmony já tem tudo na própria interface, e a música ganhou mais espaço. Os atalhos continuam: F11 para tela cheia, Ctrl + e Ctrl − para o zoom, Ctrl 0 para voltar ao normal e Ctrl+Q para sair.')
      }
    ]
  },
  {
    version: '0.18.0',
    title: tk('Do seu jeito'),
    date: '2026-10-09',
    items: [
      {
        emoji: '🎨',
        title: tk('Nova aba Personalização'),
        text: tk('Tudo o que muda o visual do Harmony num lugar só: temas, Mundos vivos, fundo, adesivos, ícones, barra de música e animação de abertura, com atalhos no topo. As Configurações ficaram só com o essencial, e as Estatísticas agora moram no Meu Mundo.'),
        action: { kind: 'route', label: tk('Abrir Personalização'), to: '/personalize' }
      },
      {
        emoji: '🌈',
        title: tk('Temas 100% seus'),
        text: tk('Um estúdio para criar o seu tema: cores, transparência, desfoque, cantos, sombras, brilho e fonte, com prévia ao vivo. São 10 temas novos além dos clássicos, e o Harmony pode trocar sozinho entre um tema de dia e outro de noite.')
      },
      {
        emoji: '📀',
        title: tk('Novos jeitos de ver suas músicas'),
        text: tk('Além da lista, a Biblioteca e os Favoritos agora podem virar uma grade de capas, uma caixa de discos com toca-discos (lado A e lado B) ou uma estante de livros, em que cada álbum abre com sumário.'),
        action: { kind: 'route', label: tk('Ver a Biblioteca'), to: '/' }
      },
      {
        emoji: '🎃',
        title: tk('Mais Mundos vivos'),
        text: tk('Toque em "Carregar mais Worlds vivos": Halloween, Natal, Réveillon em Copacabana, Arcade, Deserto, Floresta Bioluminescente e Chuva de Código. Os de datas comemorativas aparecem "em alta" na época certa.'),
        action: { kind: 'world', label: tk('Ligar o Halloween'), world: 'halloween' }
      },
      {
        emoji: '🖌️',
        title: tk('Criador de capas'),
        text: tk('Música sem capa? Crie uma com 10 estilos e paletas, ou deixe o Harmony gerar sozinho. Use pelo menu da música ou pelo aviso de capas faltando na Biblioteca.')
      },
      {
        emoji: '⭐',
        title: tk('Adesivos'),
        text: tk('Cole figurinhas na barra lateral, no player e nas capas das playlists. São 30 adesivos, alguns animados e outros que pulsam com a batida, e você também pode usar as suas próprias imagens, até GIF animado.')
      },
      {
        emoji: '🧩',
        title: tk('Pacotes de ícones'),
        text: tk('Dez estilos para os ícones da barra lateral e do player: Duotone, Neon, Degradê, Colorido, Figurinha, Emoji, Pixel, Rabisco e Terminal, ou monte um pacote com as suas próprias imagens.')
      },
      {
        emoji: '💿',
        title: tk('Barra de música com estilo'),
        text: tk('Escolha entre Clássico, Flutuante, Compacto, Vinil (com o disco girando no toca-discos) e Capa. Na barra de progresso, use uma onda que dança com a música ou o desenho real do som da faixa.')
      },
      {
        emoji: '📌',
        title: tk('Sempre à mão'),
        text: tk('O cabeçalho e os filtros ficam fixos ao rolar, o botão "Tocando agora" leva direto à música que está tocando, e cada aba lembra até onde você tinha descido.')
      },
      {
        emoji: '📜',
        title: tk('A história do Harmony'),
        text: tk('Em Configurações → Novidades, "Todas as versões" mostra tudo o que já chegou desde a primeira versão, com busca.')
      }
    ]
  },
  {
    version: '0.17.5',
    title: tk('Solta a voz!'),
    date: '2026-10-08',
    items: [
      {
        emoji: '🎤',
        title: tk('Novo modo karaokê'),
        text: tk('Tire a voz original da música em tempo real, acompanhe a letra palavra por palavra com a bolinha pulando e cante no microfone para ganhar uma nota de S a D. Se a letra estiver adiantada ou atrasada, ajuste com − / + (fica salvo para cada música).'),
        action: { kind: 'karaoke', label: tk('Abrir o karaokê') }
      },
      {
        emoji: '🌌',
        title: tk('Mundos vivos refeitos'),
        text: tk('Todos os mundos ganharam um remake com muito mais detalhe, sem perder a essência: um buraco negro com lente gravitacional de verdade, um planeta que gira com cidades acendendo à noite, a cafeteria, o jardim japonês, o oceano, o inverno, a floresta, a chuva, o vulcão, o synthwave e a cidade cyberpunk. A maioria muda de luz conforme o horário do dia.'),
        action: { kind: 'world', label: tk('Ver o Black Hole'), world: 'blackhole' }
      },
      {
        emoji: '🎆',
        title: tk('Visualizer: quatro palcos novos'),
        text: tk('Cyber Arena, Nature Pulse, Synthwave City e Space Odyssey foram refeitos no nível do Festival e do Pyramid: arena de hologramas com telão de hexágonos, clareira com aurora e arco de árvores, triângulo neon na rodovia dos anos 80 e show no convés de uma estação espacial com warp nos drops.'),
        action: { kind: 'route', label: tk('Abrir o Visualizer'), to: '/visualizer' }
      },
      {
        emoji: '⚡',
        title: tk('Modo Ultra Rápido'),
        text: tk('Computador mais fraco? Ligue nas Configurações e o Harmony fica leve e liso: sem desfoque de vidro, sombras e animações na interface, Worlds e Visualizer a 30 quadros por segundo em resolução normal. O som continua igualzinho.'),
        action: { kind: 'route', label: tk('Ir para as Configurações'), to: '/settings' }
      },
      {
        emoji: '🧡',
        title: tk('Cara nova'),
        text: tk('O Harmony ganhou um ícone novo, que agora aparece também na barra lateral.')
      }
    ]
  },
  {
    version: '0.17.0',
    title: tk('Seu ano, seus mundos, suas lembranças'),
    date: '2026-10-07',
    items: [
      {
        emoji: '🎬',
        title: tk('Retrospectiva em vídeo'),
        text: tk('Seus minutos, artistas, músicas e horários do ano num vídeo vertical pronto para os stories, pulsando no ritmo da sua música nº 1.'),
        action: { kind: 'route', label: tk('Criar minha retrospectiva'), to: '/my-world?recap=1' }
      },
      {
        emoji: '🎚️',
        title: tk('Mundo Automático'),
        text: tk('O Harmony escolhe o mundo certo para cada música (rock no Vulcão, lo-fi na Cafeteria…) e troca suavemente entre as faixas. Nas Configurações dá para ligar também a Explosão no refrão.'),
        action: { kind: 'world', label: tk('Experimentar'), world: 'auto' }
      },
      {
        emoji: '📮',
        title: tk('Cápsulas do tempo'),
        text: tk('Guarde uma lembrança numa música e escolha quando ela abre. Quando a data chegar, seu eu do passado aparece na próxima vez que ela tocar. Use o ⏳ no player.'),
        action: { kind: 'route', label: tk('Ver no Meu Mundo'), to: '/my-world?section=capsules' }
      },
      {
        emoji: '🛠️',
        title: tk('Ajustes e correções'),
        text: tk('O menu da foto de perfil no Meu Mundo não fica mais cortado, as fotos ficam mais leves e agora dá para removê-las.')
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

/** The Android app's releases, newest first (shown on the phone instead of RELEASES). */
export const ANDROID_RELEASES: Release[] = [
  {
    version: '0.8.0',
    title: tk('A ponte entre o PC e o celular'),
    date: '2026-11-11',
    items: [
      {
        emoji: '💻',
        title: tk('Ponte com o PC'),
        text: tk('Em Configurações → Ponte com o PC, leia o QR code do Harmony do computador. Os dois aparelhos juntam playlists e favoritos (nada é apagado), e você escolhe trazer músicas do PC — todas ou só as de algumas playlists. As que só estão no celular vão para o PC.')
      }
    ]
  },
  {
    version: '0.7.0',
    title: tk('O Harmony na tela inicial'),
    date: '2026-11-11',
    items: [
      {
        emoji: '🏠',
        title: tk('Widget do Harmony'),
        text: tk('Coloque o Harmony na tela inicial: a capa, a música tocando e os botões de voltar, tocar e pular, na cor do seu tema. Segure um espaço vazio da tela inicial, toque em Widgets e procure o Harmony.')
      },
      {
        emoji: '▶️',
        title: tk('Funciona até com o app fechado'),
        text: tk('Com o Harmony fechado, o play do widget abre o app e continua a música de onde parou.')
      }
    ]
  },
  {
    version: '0.6.0',
    title: tk('Cuidando de você'),
    date: '2026-11-11',
    items: [
      {
        emoji: '⏰',
        title: tk('Despertador musical'),
        text: tk('Acorde com uma playlist sua: a música começa baixinho e sobe devagar. Escolha o horário e os dias no botão Despertar, em Tocando agora. Funciona com o app fechado.')
      },
      {
        emoji: '🎧',
        title: tk('Cuidado com os ouvidos'),
        text: tk('Depois de muito tempo com o volume alto no fone, um aviso gentil sugere baixar. E, se quiser, dá para pôr um volume máximo para o fone em Configurações.')
      },
      {
        emoji: '🔋',
        title: tk('Economia de bateria automática'),
        text: tk('Com 20% de bateria, o Harmony liga sozinho o Modo Ultra Rápido, e volta ao normal quando você carrega.')
      },
      {
        emoji: '📳',
        title: tk('Agitar para pular'),
        text: tk('Agite o celular duas vezes para ir à próxima música. Ligue em Configurações → No celular.')
      },
      {
        emoji: '💓',
        title: tk('Vibrar na batida'),
        text: tk('O celular pulsa junto com o grave da música enquanto o app está aberto. Ligue em Configurações → No celular.')
      },
      {
        emoji: '🎯',
        title: tk('O Modo Foco agora vibra'),
        text: tk('O aviso de pausa do Modo Foco não vibrava. Agora vibra.')
      }
    ]
  },
  {
    version: '0.5.0',
    title: tk('Feito para o dia a dia'),
    date: '2026-11-11',
    items: [
      {
        emoji: '⏯️',
        title: tk('Continue de onde parou'),
        text: tk('Ao abrir o Harmony, a última fila e o ponto exato da música voltam, prontos para dar play.')
      },
      {
        emoji: '🎧',
        title: tk('Fone desconectou? A música pausa'),
        text: tk('Se o fone sai ou o Bluetooth cai, o Harmony pausa em vez de tocar no alto-falante.')
      },
      {
        emoji: '👉',
        title: tk('Gestos no Tocando agora'),
        text: tk('Deslize a capa para os lados para trocar de música, e puxe a tela para baixo para fechar.')
      },
      {
        emoji: '🎯',
        title: tk('Modo Foco'),
        text: tk('Em Tocando agora, toque em Foco: música enquanto você estuda ou trabalha (25 ou 50 minutos) e uma pausa para respirar, com a música sumindo devagar e voltando depois.')
      },
      {
        emoji: '📤',
        title: tk('Compartilhe o que está ouvindo'),
        text: tk('O botão de compartilhar em Tocando agora cria um cartão para os stories com a capa, a música e até o trecho da letra que está tocando.')
      },
      {
        emoji: '🗑️',
        title: tk('Excluir playlist de volta'),
        text: tk('A opção Excluir no ⋯ de cada playlist ficava escondida atrás das abas. Agora aparece.')
      }
    ]
  },
  {
    version: '0.4.0',
    title: tk('Tudo no lugar'),
    date: '2026-10-29',
    items: [
      {
        emoji: '☑️',
        title: tk('Selecionar músicas do jeito certo'),
        text: tk('Segure o dedo numa música para começar a seleção (ou use ⋯ → Selecionar). Depois, cada toque marca ou desmarca uma música, sem tocar nada e sem perder as outras. A barra Tocando agora sai do caminho enquanto você seleciona.')
      },
      {
        emoji: '👆',
        title: tk('Arraste para avançar'),
        text: tk('Agora dá para arrastar o dedo na barra da música e ver o minuto exato antes de soltar.')
      },
      {
        emoji: '🖼️',
        title: tk('Playlists do seu tamanho'),
        text: tk('Escolha capas grandes, médias ou uma lista compacta (G, M, P no topo de Playlists). As opções de cada playlist ficam num botão ⋯ maior, o nome aparece inteiro, a seta de voltar ficou maior e a cópia de uma playlist leva a foto junto.'),
        action: { kind: 'route', label: tk('Ver as playlists'), to: '/playlists' }
      },
      {
        emoji: '🌋',
        title: tk('Mundos feitos para o celular'),
        text: tk('O Vulcão foi consertado (a lava e as rochas estavam fora do lugar) e os mundos se ajustam à tela em pé: o vulcão, a cabana do Inverno, o torii do Jardim Japonês e a mansão do Halloween ficam no centro.')
      },
      {
        emoji: '🎚️',
        title: tk('Equalizador sem estourar'),
        text: tk('Os presets que aumentam o som (como o Bass Boost) agora compensam o volume sozinhos, sem distorcer.')
      },
      {
        emoji: '🧩',
        title: tk('E mais ajustes'),
        text: tk('A fila e a letra voltam para Tocando agora, o modo Estante e o criador de capas ficaram centralizados, e o app se mantém em ordem mesmo com a fonte do celular bem grande.')
      }
    ]
  },
  {
    version: '0.3.0',
    title: tk('Boa noite, música'),
    date: '2026-10-17',
    items: [
      {
        emoji: '🌙',
        title: tk('Timer para dormir'),
        text: tk('Em Tocando agora, toque em Timer e escolha por quanto tempo a música ainda toca — ou deixe ir até o fim da música. No final ela vai sumindo devagar, pausa e o Harmony fecha sozinho.')
      },
      {
        emoji: '🎤',
        title: tk('Letras e capas da internet'),
        text: tk('O botão de letra em Tocando agora abre a letra sincronizada, e as músicas sem capa ganham a capa oficial enquanto tocam. Também dá para buscar pelo menu ⋯ de uma música ou em Artistas → Atualizar Metadados.')
      },
      {
        emoji: '🔎',
        title: tk('Busca mais esperta'),
        text: tk('Músicas com o artista no nome, como "Espresso Sabrina Carpenter", agora encontram letra e capa. E quando o site das letras está ocupado, o Harmony tenta de novo em vez de desistir.')
      },
      {
        emoji: '🎬',
        title: tk('Retrospectiva no celular'),
        text: tk('Criar a sua Retrospectiva no Meu Mundo agora cabe na tela do celular, e o vídeo vai para a Galeria, em Movies › Harmony.'),
        action: { kind: 'route', label: tk('Abrir o Meu Mundo'), to: '/my-world' }
      }
    ]
  },
  {
    version: '0.2.0',
    title: tk('Só as suas músicas'),
    date: '2026-10-16',
    items: [
      {
        emoji: '📁',
        title: tk('Escolha as pastas'),
        text: tk('O Harmony mostra só as músicas das pastas que você marcar — áudios do WhatsApp, gravações e toques ficam de fora. Dá para trocar em Configurações → Pastas de música.')
      },
      {
        emoji: '▶️',
        title: tk('Play sem susto'),
        text: tk('O app não fecha mais ao dar play numa música.')
      }
    ]
  },
  {
    version: '0.1.0',
    title: tk('Harmony no seu bolso'),
    date: '2026-10-16',
    items: [
      {
        emoji: '📱',
        title: tk('O Harmony chegou ao Android'),
        text: tk('As músicas do celular com a cara do Harmony: biblioteca, playlists, favoritos, busca, Meu Mundo, equalizador, temas e inglês.')
      },
      {
        emoji: '🔒',
        title: tk('Com a tela apagada'),
        text: tk('A música continua tocando, com os controles na notificação, na tela de bloqueio e no fone.')
      }
    ]
  }
]

/** The releases this app announces: the desktop's, or the phone's. */
export const PLATFORM_RELEASES: Release[] = IS_ANDROID ? ANDROID_RELEASES : RELEASES

/** Releases newer than `lastSeen`, up to the running version, newest first. */
export function releasesSince(lastSeen: string | null, current = APP_VERSION): Release[] {
  return PLATFORM_RELEASES.filter(
    (r) => compareVersions(r.version, current) <= 0 && (!lastSeen || compareVersions(r.version, lastSeen) > 0)
  )
}

/** Releases from before the "Novidades" screen, oldest last (see the note at the top). */
export const HISTORY: Release[] = [
  {
    version: '0.16.1',
    title: tk('Ajustes no Meu Mundo'),
    date: '2026-10-06',
    items: [
      { emoji: '🖼️', title: tk('Sua foto de perfil sem cortes'), text: tk('O seletor de avatar não fica mais cortado, e a opção "usar minha foto" voltou a aparecer. Agora dá para trocar ou remover a foto, e ela é ajustada sozinha para ficar leve.') },
      { emoji: '🔁', title: tk('Meu Mundo mais confiável'), text: tk('Se algo der errado ao carregar o seu mundo, aparece um botão para tentar de novo em vez de ficar carregando para sempre.') }
    ]
  },
  {
    version: '0.16.0',
    title: tk('O show começa ao abrir'),
    date: '2026-10-03',
    items: [
      { emoji: '🎬', title: tk('Animação de abertura'), text: tk('Um pequeno show de luz e som ao abrir o Harmony, com o seu nome e um "bom dia" ou "boa noite". Clique ou aperte qualquer tecla para pular.') },
      { emoji: '🌍', title: tk('Meu Mundo refeito'), text: tk('Uma página só sua: avatar, bio, cor e nível, mixes de humor, roleta musical, pódio de artistas, suas músicas do coração, relógio musical, DNA de gêneros, conquistas e diário.') },
      { emoji: '🎞️', title: tk('Modo Edit com vídeo'), text: tk('O modo Edit das letras virou um estúdio vertical estilo TikTok, com CD girando, letras palavra por palavra e exportação em vídeo MP4 com a música. Escolha formato, estilo, cores e efeitos.') },
      { emoji: '🔺', title: tk('Visualizer de festival'), text: tk('O palco Festival foi reconstruído como um mainstage de verdade, a Pyramid virou o palco Alive do Daft Punk, e todos os palcos ganharam um DJ animado que mexe na mesa e vibra nos drops.') },
      { emoji: '⚡', title: tk('Bem mais rápido'), text: tk('Bibliotecas enormes abrem em cerca de um segundo, e mexer no volume, na barra de progresso ou passar o mouse não trava mais o app.') }
    ]
  },
  {
    version: '0.15.1',
    title: tk('Seu fundo fica salvo'),
    date: '2026-07-14',
    items: [
      { emoji: '🖼️', title: tk('Meu fundo não some mais'), text: tk('A imagem ou o vídeo que você escolhe como fundo agora é guardado pelo Harmony e continua lá depois de fechar e abrir o app.') }
    ]
  },
  {
    version: '0.15.0',
    title: tk('Mundos vivos'),
    date: '2026-07-14',
    items: [
      { emoji: '🕳️', title: tk('Chegaram os Worlds'), text: tk('Temas que viram universos vivos atrás do app e reagem à música: Black Hole, Rain, Nature, Cyberpunk, Ocean, Winter, Coffee Shop, Japanese Garden, Synthwave, Space Station e Volcano.') },
      { emoji: '🎚️', title: tk('Do seu jeito'), text: tk('Ajuste a transparência e o desfoque dos painéis para ver mais ou menos do mundo por trás.') },
      { emoji: '🖼️', title: tk('Meu fundo'), text: tk('Use a sua própria imagem ou vídeo como fundo do Harmony. Imagens ganham um leve movimento que acompanha a música.') },
      { emoji: '☑️', title: tk('Seleção estilo Spotify'), text: tk('Selecione várias músicas com a caixinha, Shift para um intervalo, Ctrl para escolher uma a uma e Ctrl+A para todas. Depois toque, adicione a uma playlist ou remova de uma vez.') }
    ]
  },
  {
    version: '0.12.1',
    title: tk('Nosso primeiro apoiador'),
    date: '2026-07-13',
    items: [
      { emoji: '👑', title: tk('Obrigado, CP-405!'), text: tk('O primeiro apoiador oficial do Harmony ganhou um lugar de honra na página Apoie, com coroa e tudo.') },
      { emoji: '🏷️', title: tk('Gêneros pela internet'), text: tk('"Atualizar metadados" agora também descobre o gênero das músicas que não têm, deixando os filtros e o seu gênero favorito muito mais certeiros.') }
    ]
  },
  {
    version: '0.12.0',
    title: tk('Apoie o Harmony'),
    date: '2026-07-12',
    items: [
      { emoji: '❤️', title: tk('Página Apoie'), text: tk('Uma página nova contando como o Harmony nasceu, para onde ele vai e como apoiar, sempre opcional e sem pressão.') },
      { emoji: '📜', title: tk('Barra lateral que rola'), text: tk('Em janelas baixas a barra lateral rola, e o "Apoie o Harmony" fica sempre visível no rodapé.') }
    ]
  },
  {
    version: '0.11.9',
    title: tk('DJ Mode no ritmo certo'),
    date: '2026-07-10',
    items: [
      { emoji: '🎧', title: tk('Respiração corrigida'), text: tk('A capa do DJ Mode não pulsa mais rápido demais em alguns computadores com Windows.') }
    ]
  },
  {
    version: '0.11.8',
    title: tk('A grande atualização do encanto'),
    date: '2026-07-10',
    items: [
      { emoji: '✨', title: tk('Tudo mais gostoso de usar'), text: tk('Barra de progresso com balão de tempo, volume pela rodinha do mouse e pequenas animações em todo o app.') },
      { emoji: '🏷️', title: tk('Biblioteca inteligente'), text: tk('Filtros rápidos (recentes, mais tocadas, nunca tocadas, favoritas e por gênero) e capas coloridas para músicas sem arte.') },
      { emoji: '🎛️', title: tk('Equalizador novo'), text: tk('Agora numa página própria, com gráfico ao vivo, barras grandes e predefinições.') },
      { emoji: '🎵', title: tk('Meu Mundo Musical'), text: tk('Seu painel pessoal com foto, nome, artista e gênero favoritos, horas ouvidas, conquistas e um diário da sua história com a música.') },
      { emoji: '🎨', title: tk('Temas e DJ Mode'), text: tk('Temas com personalidade (Synthwave, Nature, Glass e Dark Pro), playlists com capa, emoji e cor, e o DJ Mode, uma tela imersiva só com a capa e os controles.') },
      { emoji: '🎤', title: tk('Artistas de verdade'), text: tk('Fotos dos artistas e um "feat." que não duplica mais: cada artista de uma parceria aparece na própria página.') }
    ]
  },
  {
    version: '0.10.2',
    title: tk('Linux sem dor de cabeça'),
    date: '2026-07-09',
    items: [
      { emoji: '🐧', title: tk('AppImage abre de primeira'), text: tk('O Harmony abre normalmente nas distribuições Linux mais novas, sem precisar de nenhum comando extra.') }
    ]
  },
  {
    version: '0.10.1',
    title: tk('Animações no compasso'),
    date: '2026-07-09',
    items: [
      { emoji: '💿', title: tk('Nada de tremedeira'), text: tk('O disco e as letras do modo Edit não giram mais rápido demais em monitores de alta taxa de atualização.') }
    ]
  },
  {
    version: '0.10.0',
    title: tk('Atualizações automáticas'),
    date: '2026-07-09',
    items: [
      { emoji: '🔄', title: tk('O Harmony se atualiza sozinho'), text: tk('As novas versões são baixadas em segundo plano, e você escolhe quando reiniciar. Suas músicas e configurações ficam sempre guardadas.') }
    ]
  },
  {
    version: '0.9.2',
    title: tk('Volume liso e dados seguros'),
    date: '2026-07-09',
    items: [
      { emoji: '🔊', title: tk('Volume sem travar'), text: tk('Arrastar o volume, o equalizador ou o crossfade não trava mais o app, e o volume muda suave, sem estalos.') },
      { emoji: '🛡️', title: tk('Seus dados protegidos'), text: tk('Biblioteca, playlists, favoritos e histórico ficam numa pasta separada, que nunca é apagada ao atualizar ou reinstalar.') }
    ]
  },
  {
    version: '0.9.1',
    title: tk('Primeiros ajustes'),
    date: '2026-07-09',
    items: [
      { emoji: '📝', title: tk('Playlists funcionando'), text: tk('Criar, renomear e apagar playlists voltou a funcionar, agora com janelas próprias do Harmony.') },
      { emoji: '🎼', title: tk('Letras no tempo certo'), text: tk('As letras não ficam mais adiantadas ou atrasadas e seguem o tempo real da música.') },
      { emoji: '🌆', title: tk('Synthwave mais leve'), text: tk('O palco Synthwave City do Visualizer pesa bem menos na placa de vídeo.') }
    ]
  },
  {
    version: '0.9.0',
    title: tk('Olá, Harmony!'),
    date: '2026-07-08',
    items: [
      { emoji: '🎵', title: tk('O primeiro lançamento'), text: tk('Um player de música offline e de código aberto: importe suas pastas e o Harmony organiza álbuns, artistas, playlists, favoritos e histórico, com capas e informações automáticas.') },
      { emoji: '🎛️', title: tk('Som de verdade'), text: tk('Equalizador de 10 bandas, crossfade e reprodução sem pausas entre as faixas.') },
      { emoji: '🎤', title: tk('Letras de três jeitos'), text: tk('Sincronizadas, em karaokê e no modo Edit, buscadas na internet ou de arquivos .lrc.') },
      { emoji: '🎆', title: tk('O Visualizer'), text: tk('Transforma qualquer música num show ao vivo com seis palcos: Festival, Pyramid, Cyber Arena, Nature Pulse, Synthwave City e Space Odyssey.') },
      { emoji: '🧩', title: tk('E mais'), text: tk('Seis temas, cor de destaque que acompanha a capa, mini player, busca e Discord Rich Presence.') }
    ]
  }
]

/** Every release up to the running version (announced and archived), newest first. */
export function allReleases(current = APP_VERSION): Release[] {
  return (IS_ANDROID ? ANDROID_RELEASES : [...RELEASES, ...HISTORY])
    .filter((r) => compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
