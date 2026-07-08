# Contribuindo com o Harmony

Obrigado pelo interesse em contribuir! 🎵

## Como começar

1. Faça um **fork** do repositório e clone o seu fork.
2. Instale as dependências: `npm install` (isso também recompila o `better-sqlite3` para o Electron).
3. Rode em desenvolvimento: `npm run dev`.

## Antes de abrir um Pull Request

Rode a verificação completa localmente — o CI vai exigir que ela passe:

```bash
npm run typecheck   # checagem estrita de tipos (renderer + main)
npm run build       # build de produção com electron-vite
```

## Padrões do projeto

- **TypeScript estrito** em todo o código. Nada de `any` sem um comentário justificando.
- **Português nos comentários de interface e mensagens ao usuário**; nomes de código em inglês.
- **Arquitetura modular**: o `StageDirector` interpreta a música e não desenha nada; os _Show Packs_ apenas desenham. Mantenha essa separação.
- **Performance**: no loop de render, evite alocações por frame (reutilize objetos/pools), use `requestAnimationFrame` e não dispare re-renderizações do React.
- Um recurso por PR, com uma descrição clara do que muda e por quê.

## Estrutura

Veja a seção **Architecture** no [README](./README.md) para o mapa das pastas.

## Reportando bugs

Abra uma _issue_ descrevendo:
- o que aconteceu e o que era esperado;
- sistema operacional e versão;
- passos para reproduzir (e, se possível, a música/arquivo que causou o problema).

## Código de conduta

Seja gentil e respeitoso. Este é um espaço colaborativo e acolhedor.
