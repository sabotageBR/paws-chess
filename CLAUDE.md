# CLAUDE.md

Orientação para o Claude Code neste repositório.

## O que é

**Paws Chess** (`paws-chess`): xadrez completo (regras todas, motor próprio) de **gatos contra cães** em tabuleiro
2.5D, com capturas pastelão animadas (torta, martelinho, espirro, casca de banana...), 10 bots com rosto, nome e falas
engraçadas (pt/en/es), escada com rating, partida livre, 2 jogadores e puzzle do dia. Jogo original do estúdio (nome,
tema, personagens e arte próprios; do gênero só a mecânica do xadrez) para Poki, CrazyGames, californiagames.io e Y8, a
partir do kit multiportal (`../distribuicao/kit`, ver o README de lá). Catálogo no cofre: `../Nettools Games/Jogos/paws-chess.md`.
Design: `docs/GDD.md`. Arte: `docs/autoria.md`. Força dos bots: `docs/forca-bots.md`.

## Rodar e testar

- `npm run servir` → http://127.0.0.1:5480/ (a PlataformaSDK em modo autônomo, anúncios simulados).
  Parâmetros só em localhost: `?novo`, `?fase=N` (escada no bot N, tabuleiro do nível), `?semente=N`, `?auto` (a IA joga
  pelo jogador), `?filme=30`, `?semanuncio`, `?lang=pt|en|es`, `?limpo`, `?debug`, mais `?modo=puzzle|2j` e `?tema=madeira|jardim|doceria|telhado|praia`.
- `npm test` (~5 s): perft (5 posições, até 4 milhões de nós), regras de fim, hash, SAN, mate em 1/2, bots (lance legal,
  piedade do bot 1, abertura roteirizada, ordem de força), os 210 puzzles no resolvedor exato, escada, estilo e portais.
- `node tools/calibrar.mjs --jogos=10 --threads=6` (~10 min): bots contra bots → `docs/forca-bots.md`.
- `node tools/puzzles.mjs` (~6 min): regenera `src/jogo/puzzles.js` (bots contra bots + resolvedor exato).
- `node tools/arte.mjs [--so=pecas,bots,gags,fundos]`: recorta e converte a arte bruta para `src/arte/`.
- `npm run empacotar` (5 alvos: poki, crazygames, crazygames-basic, californiagames, y8; a Y8 sai `-sem-id` até os ids
  do painel irem em `package.json` → `kit.ids.y8`) e `npm run verificar`; prova do California: de `../distribuicao`,
  `node ferramentas/provar.mjs paws-chess` (e `--mobile --escala=2 --lang=en`).

## Arquitetura

- `src/main.js`: único módulo que toca portal, DOM, áudio e salvamento. Ciclo do portal como no kit. Partida,
  tutorial (mão-guia: e2–e4, depois capturar o peão que o bot entrega), dica, desfazer, falas, puzzles, menus.
- `src/jogo/`: lógica pura (ASCII, sem DOM, relógio nem `Math.random`): `xadrez.js` (0x88, Zobrist 2×32 bits,
  fazer/desfazer, fim de partida, SAN, perft), `avaliacao.js`, `busca.js` (negamax PVS, aprofundamento iterativo,
  TT, MVV-LVA, killers, história, lance nulo, LMR, quiescência; prazo por relógio injetado), `bots.js` (10 níveis:
  profundidade/nós + ruído na avaliação + vacilo), `mate.js` (resolvedor exato), `puzzles.js` (gerado), `escada.js`, `partida.js`.
- `src/ia/`: Web Worker (`trabalhador.js`) com o motor; `cliente.js` cai para a thread principal sem worker.
- `src/render/cena.js`: câmera em perspectiva sem guinada (tabuleiro em faixas, cache), `atores.js`: peças, poses, pulos, gags.
- `src/arte/`: WebP processado. `arte/bruto/`: originais do Grok (fora do build). `arte/pedidos/`: os lotes de prompts.

## Regras

- Código, comentários e docs em português; comentários ASCII em `src/jogo/`.
- Anúncio só entre partidas (fim de partida → próxima) e só a partir da 3ª partida ou ~4 min; nunca no meio da partida.
  Premiado só no cartão de fim, ao lado da opção grátis do mesmo tamanho. Na Y8 (`portal.intervaloSoNoClique`) o
  intersticial sai só no clique do cartão de fim e a cada 180 s; `portal.pausaNoBlur` abre a pausa no blur.
- Armazenamento só com o prefixo `pawschess.`; nunca `clear()`.
- Toda arte nova pelo `tools/grok.mjs` com o bloco de estilo do `docs/GDD.md` (`arte/pedidos/estilo.txt`); conferir a olho.
  Fundo magenta do Grok sai carmim: recortar gatos com `--tol=0.09 --suave=0.06` (o padrão esverdeia o laranja).
- Não fazer commit sem o usuário pedir.
- Registrar atividade no cofre: linha em `Atividades/AAAA-MM-DD.md` e histórico em `Jogos/paws-chess.md`.
