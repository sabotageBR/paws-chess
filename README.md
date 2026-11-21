# Paws Chess

Xadrez completo de **gatos contra cães** em tabuleiro 2.5D, com capturas pastelão animadas, 10 bots com rosto e falas
(pt/en/es), escada com rating, partida livre, 2 jogadores e puzzle do dia. Um código só gera as builds de Poki,
CrazyGames (Full e Basic Launch), californiagames.io e Y8, pelo kit multiportal do estúdio (`../distribuicao/kit`).

```bash
npm run servir      # http://127.0.0.1:5480/
npm test            # 53 testes: perft, regras, IA, bots, puzzles, escada, estilo e portais
npm run empacotar   # 5 alvos: dist/paws-chess-<alvo>-<versao>.zip e ../distribuicao/paws-chess/<portal>/build/
npm run verificar
```

Design em `docs/GDD.md`, arte em `docs/autoria.md`, força dos bots em `docs/forca-bots.md`, orientação para o Claude
Code em `CLAUDE.md`. Pacotes dos portais (capas, vídeos, prints, fichas) em `../distribuicao/paws-chess/`.
