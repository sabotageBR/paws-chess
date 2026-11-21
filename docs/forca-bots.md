# Força medida dos bots

Gerado por `tools/calibrar.mjs` em 2026-11-20 (130 partidas bot contra bot, cores alternadas,
vizinhos i×i+1 com 10 partidas e i×i+2 com 5; escala de nós 1; sem prazo de tempo).
Elo relativo por mínimos quadrados sobre os placares, com o bot 1 ancorado em 400. É força **entre os bots**, não
Elo FIDE: serve para garantir a escada (cada bot mais forte que o anterior) e dar uma ordem de grandeza.

| # | bot | rating da escada | Elo medido | nível |
|---|---|---|---|---|
| 1 | sonolento | 400 | 400 | prof 1, ruido 260, vacilo 0.55 |
| 2 | bagunceiro | 600 | 807 | prof 1, ruido 190, vacilo 0.36 |
| 3 | pantufa | 800 | 1016 | prof 1, ruido 100, vacilo 0.22 |
| 4 | salsicha | 1000 | 1305 | prof 2, ruido 80, vacilo 0.13 |
| 5 | chef | 1200 | 1635 | prof 3, 40000 nos, ruido 45, vacilo 0.06 |
| 6 | barao | 1400 | 1891 | prof 4, 80000 nos, ruido 30, vacilo 0.03 |
| 7 | pug | 1600 | 2196 | prof 5, 150000 nos, ruido 18, vacilo 0.012 |
| 8 | lobo | 1800 | 2430 | prof 6, 300000 nos, ruido 10, vacilo 0 |
| 9 | esfinge | 2000 | 2748 | prof 8, 700000 nos, ruido 5, vacilo 0 |
| 10 | biscoito | 2200 | 2965 | prof 60, 2500000 nos, 2500 ms, ruido 2, vacilo 0 |

## Placares (pontos do bot da esquerda)

| par | pontos | como acabou |
|---|---|---|
| 8 x 10 | 0 / 5 | mate 5 |
| 9 x 10 | 2 / 10 | mate 8, repeticao 2 |
| 7 x 9 | 0 / 5 | mate 5 |
| 8 x 9 | 1 / 10 | mate 8, repeticao 1, material 1 |
| 6 x 8 | 0 / 5 | mate 5 |
| 7 x 8 | 1.5 / 10 | mate 7, repeticao 2, limite 1 |
| 5 x 7 | 0 / 5 | mate 4, limite 1 |
| 6 x 7 | 1 / 10 | mate 10 |
| 4 x 6 | 0 / 5 | mate 5 |
| 5 x 6 | 1 / 10 | mate 10 |
| 3 x 5 | 0 / 5 | mate 5 |
| 4 x 5 | 0 / 10 | mate 10 |
| 2 x 4 | 0 / 5 | mate 5 |
| 3 x 4 | 1 / 10 | mate 9, limite 1 |
| 1 x 3 | 0 / 5 | mate 5 |
| 2 x 3 | 1.5 / 10 | mate 9, afogamento 1 |
| 1 x 2 | 0 / 10 | abandono 6, mate 4 |
