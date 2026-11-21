# Paws Chess — documento de design

**Gênero:** xadrez casual (a mecânica do gênero de "Chess Pro"; tudo o mais é nosso).
**Gancho:** xadrez de verdade, regras completas, com **gatos contra cães**: cada peça é um bichinho que pula
de casa em casa e cada captura é uma piada de pastelão (torta na cara, martelinho de borracha, espirro,
casca de banana). Dez bots com cara, nome e falas engraçadas, do gatinho que dorme no meio da partida ao
grão-mestre.
**Público:** de 8 a 80 anos; quem sabe jogar xadrez e quem está aprendendo. Desktop e celular, paisagem e retrato.

## Nome

"Paws Chess" pesquisado em 2026-11-20 (busca na web, Poki, CrazyGames, App Store e Google Play): **nenhum jogo
ou app com esse nome**. Parecidos e distintos: "Cat Chess" (iPhone), "Chess Cats" (iPhone, ensino), "Cat vs Dog
Merge" (CrazyGames, não é xadrez). Nenhum xadrez de gatos contra cães na Poki ou na CrazyGames. Nome mantido.

## Laço principal

1. Partida contra um bot (ou puzzle, ou 2 jogadores).
2. Tocar numa peça (casas possíveis acendem) e tocar no destino; ou arrastar. A peça pula até lá com
   squash-and-stretch. Na captura, a gag curta (0,9–1,4 s, pulável com um toque, desligável nas opções).
3. O bot responde com balão de fala em captura, xeque, vacilo e fim.
4. Fim de partida = **pausa natural**: festa curta (vitória) ou consolo, rating sobe/desce, próximo bot ou
   revanche. É o único ponto de intervalo comercial (a partir da 3ª partida ou ~4 min de jogo).

## Controles

- **Toque/mouse:** tocar na peça e no destino, ou arrastar. Cursor de mãozinha nas peças jogáveis.
- **Teclado:** setas movem o cursor, Enter/Espaço escolhe; Z desfaz; H dica; ESC ou P pausa.
- **Promoção:** quatro carinhas (rainha, torre, bispo, cavalo) num leque sobre a casa.

## Os 3 primeiros minutos (primeira carga)

| Tempo | O que acontece |
|---|---|
| 0 s | Sem menu nem splash. Tabuleiro de madeira, gatos embaixo. O **Gatinho Sonolento** boceja: "Bocejo... vai você primeiro". |
| 1–5 s | **Mão-guia** arrasta o peão do rei duas casas (e2→e4). O peão pula, a câmera dá um "tum". |
| 5–8 s | O bot (roteiro da 1ª partida) responde **d7–d5**: entrega o peão. Balão: "Ops, escorregou". |
| 8–15 s | Mão-guia mostra **exd5**: primeira captura com a **torta na cara** e o peão-cão voando para o banco. "Uau" garantido antes dos 15 s. |
| 15 s–3 min | O Gatinho Sonolento joga quase ao acaso, **nunca dá mate** (piedade) e vacila peças. Texto curto só na 1ª partida ("Toque numa peça", "Xeque!"). Ajuda automática: sem progresso por 20 s (ou a peça escolhida sem lance bom), a dica acende sozinha nas 3 primeiras partidas. |
| ~1:30 | **Novidade:** a 2ª captura usa outra gag (martelinho de borracha); cada tipo de peça que captura pela primeira vez tem sua própria gag. |
| ~2–4 min | Mate ao Gatinho Sonolento (ou ele "dorme" e abandona no lance 30). Festa curta, rating 400 → ~460, e **o 2º bot aparece** ("Filhote Bagunceiro te desafia!"). |

## Novidade a cada ~2 minutos

- **Gags de captura:** 8 gags (torta, martelinho, espirro, casca de banana, travesseiro de penas, galinha de
  borracha, balde d'água, bolha de sabão). As 4 primeiras saem na ordem na 1ª partida; as outras vão sendo
  "descobertas" ao longo das partidas (coleção de gags na tela de opções).
- **Bots novos:** cada vitória na escada libera o próximo bot (cara nova, falas novas).
- **Tabuleiros temáticos:** madeira (início), jardim (vence o bot 2), doceria (bot 4), telhado à noite (bot 6),
  praia (bot 8). A troca do tabuleiro é automática na partida seguinte ao desbloqueio, com festa curta.
- **Poses:** comemoração das peças no xeque-mate (dança) aparece na 1ª vitória.

## Meta longa

- **Escada dos 10 bots** com rating (Elo simples contra o rating do bot). Retratos travados aparecem em silhueta.
- **5 tabuleiros** liberados pela escada; **8 gags** colecionadas.
- **Puzzle do dia** (gancho diário sem FOMO): 3 puzzles por dia (mate em 1, mate em 1, mate em 2) gerados e
  conferidos pelo motor; os dias passados ficam jogáveis; sequência é só um carimbo, sem castigo.

## Modos

- **Escada:** vencer os bots em ordem. Perder não tira nada além de rating; revanche na hora.
- **Partida livre:** qualquer bot liberado, lado (gatos/brancas ou cães/pretas), qualquer tabuleiro liberado.
- **2 jogadores:** no mesmo aparelho; o tabuleiro pode girar a cada lance (opção).
- **Puzzle do dia.**
- **Dica** (3 por partida, a seta e a mão mostram o lance do motor) e **desfazer** (contra bot, ilimitado).

## Anúncios

- `commercialBreak` só entre partidas (fim de partida → próxima, fim de puzzle → próximo) e só a partir da
  **3ª partida** ou **~4 min** de jogo. Nunca no meio da partida, nunca em botão de navegação do menu.
- **Premiado** só por escolha, na tela de fim de partida (fora do jogo ativo): "🎬 Próxima com +3 dicas" ao
  lado de "Próxima partida" (grátis, mesmo tamanho). Some quando o portal não tem vídeo (Basic Launch).

## Os 10 bots

Força medida em `docs/forca-bots.md` (bots contra bots, `tools/calibrar.mjs`). O jogador comanda os gatos na
escada; o bot comanda os cães (o Gatinho Sonolento trocou de lado "porque os cães prometeram uma almofada").

| # | Nome (pt / en / es) | Personalidade | Nível (motor) | Rating da escada | Elo medido |
|---|---|---|---|---|---|
| 1 | Gatinho Sonolento / Sleepy Kitten / Gatito Dormilón | dorme, boceja, entrega peças; nunca dá mate, dorme (abandona) se estiver perdido no lance 30 | 1 ply sem quiescência, ruído 260, 55% de vacilo | 400 | 400 |
| 2 | Filhote Bagunceiro / Messy Puppy / Cachorrito Travieso | afobado, adora capturar | 1 ply + quiescência 1, ruído 190, 36% | 600 | 807 |
| 3 | Vovó Pantufa / Granny Slippers / Abuela Pantufla | calma, conta histórias | 1 ply + quiescência 4, ruído 100, 22% | 800 | 1016 |
| 4 | Salsicha Veloz / Speedy Sausage / Salchicha Veloz | joga rápido demais | 2 ply, ruído 80, 13% | 1000 | 1305 |
| 5 | Chef Miau / Chef Meow / Chef Miau | tudo vira receita | 3 ply (40 mil nós), ruído 45, 6% | 1200 | 1635 |
| 6 | Barão Bigodes / Baron Whiskers / Barón Bigotes | buldogue pomposo | 4 ply (80 mil), ruído 30, 3% | 1400 | 1891 |
| 7 | Professora Pug / Professor Pug / Profesora Pug | explica tudo | 5 ply (150 mil), ruído 18, 1,2% | 1600 | 2196 |
| 8 | Lobo da Lua / Moon Wolf / Lobo Lunar | husky dramático | 6 ply (300 mil), ruído 10 | 1800 | 2430 |
| 9 | Duquesa Esfinge / Duchess Sphinx / Duquesa Esfinge | gata sem pelo, elegante e venenosa | 8 ply (700 mil), ruído 5 | 2000 | 2748 |
| 10 | Grão-Mestre Biscoito / Grandmaster Biscuit / Gran Maestro Galleta | cão pastor velho e sábio | aprofundamento até 2,5 milhões de nós ou 2,5 s, ruído 2 | 2200 | 2965 |

O vacilo troca o melhor lance por um que perde entre 60 cp e a perda máxima do bot; o ruído é por posição (hash),
igual em toda a busca. Elo medido = relativo, bot contra bot, bot 1 ancorado em 400 (`docs/forca-bots.md`).

Falas (todas em `src/i18n/falas.js`, pt/en/es): início, captura feita, peça perdida, xeque dado, xeque
levado, vacilo do jogador, vacilo próprio, vitória, derrota, empate. Exemplos do Gatinho: "Zzz... hã? Já é
minha vez?", "Essa peça? Pode levar, tava pesada". Do Grão-Mestre: "Interessante. Errado, mas interessante."

## Bíblia de arte

- **Traço:** desenho animado 2D limpo, contorno escuro e uniforme (marrom quase preto), cores chapadas com
  sombra em dois tons (cel), luz suave do alto à esquerda. Proporção de brinquedo: cabeça grande, corpo pequeno.
  Nada de pelo realista, pincelada pintada, brilho de "render 3D" ou texto.
- **Paleta:** gatos = creme e laranja-gengibre com acessórios **turquesa** (#2ec4b6); cães = marrom-chocolate e
  cinza-grafite com acessórios **vermelho-tomate** (#e63946). Ouro (#ffc93c) nas coroas. Fundo da interface roxo
  noite (#2b1d4e). Os dois times têm de se separar só pela cor, em 40 px.
- **Leitura da peça:** o adereço diz a peça — rei = coroa com cruz e capa; rainha = tiara pontuda e colar;
  torre = gato dentro de caixa de papelão com ameias / cão dentro de casinha com ameias; bispo = mitra alta com
  fenda; cavalo = cavalinho de pau (cabeça de cavalo de brinquedo); peão = filhote com capacete redondinho.
- **Bloco de estilo** (vai no fim de todo prompt do Grok, igual):

> STYLE: clean 2D cartoon game art for a family board game, bold uniform dark brown outlines, flat saturated
> colors with simple two-tone cel shading, soft light from the upper left, chunky toy-like proportions with big
> heads and small bodies, cute expressive faces, no realistic fur, no painterly texture, no 3D render look, no
> text, no letters, no numbers, no logo, no watermark, no signature.
