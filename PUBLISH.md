# Publicando o Harmony no GitHub

Guia rápido para subir o projeto como repositório open source. Rode os comandos
na raiz da pasta `harmony`.

## 0. Antes de tudo: troque o usuário nos links

Os arquivos usam `Isaac-GhostLolp` como placeholder. Substitua pelo seu usuário real
do GitHub (ex.: se seu usuário for `isaac-dev`):

```bash
# Linux / macOS / Git Bash no Windows
grep -rl "Isaac-GhostLolp" . --exclude-dir=node_modules --exclude-dir=.git \
  | xargs sed -i 's/Isaac-GhostLolp/SEU_USUARIO/g'
```

Isso corrige os links em `README.md`, `package.json` e nos workflows.

## 1. Crie o repositório no GitHub

Vá em <https://github.com/new>, crie um repositório chamado **harmony**
(público, **sem** README/licença/gitignore — já temos todos aqui).

## 2. Inicialize o Git e faça o primeiro commit

```bash
git init
git add .   # inclui o package-lock.json — necessário para o CI (npm ci + cache)
git commit -m "Harmony v0.9.0 — offline music player with cinematic visualizer"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/harmony.git
git push -u origin main
```

Pronto — o código já está no GitHub e o **CI** (Windows + Linux) roda
automaticamente a cada push, verificando `typecheck` e `build`.

## 3. (Opcional) Publique instaladores automáticos

Quando quiser lançar uma versão com instaladores prontos para download:

```bash
git tag v0.9.0
git push origin v0.9.0
```

O workflow **Release** compila no Windows e no Linux e anexa os instaladores
(`.exe`, `.AppImage`, `.deb`) numa GitHub Release automaticamente. Nenhuma
configuração extra é necessária — ele usa o `GITHUB_TOKEN` embutido.

## 4. Gerar instaladores localmente (opcional)

```bash
npm run package
```

Os arquivos aparecem em `release/`. Observações:
- **No Windows**, gera o instalador `.exe` e a versão portátil.
- **No Linux**, gera `.AppImage` e `.deb`.
- O electron-builder empacota para o SO em que você está rodando; para gerar
  para os dois, use o workflow de Release (ou rode em cada sistema).

## 5. Dicas finais para a página do projeto

- Adicione uns **screenshots/GIFs** do Visualizer no topo do README — vende o projeto sozinho.
- Preencha a descrição e os _topics_ do repositório (ex.: `music-player`, `electron`, `visualizer`, `typescript`).
- Se quiser, ative **Discussions** para receber feedback da comunidade.
