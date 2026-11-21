// Progresso: Elo, desbloqueio de bots e tabuleiros pela escada, gags em ordem e save antigo/quebrado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { progressoNovo, normalizar, registrarResultado, botDaEscada, liberados, proximaGag, elo, GAGS } from '../src/jogo/escada.js';

test('Elo: vitoria sobe, derrota desce, empate contra mais forte sobe', () => {
  assert.ok(elo(400, 400, 1) > 400);
  assert.ok(elo(400, 400, 0) < 400);
  assert.ok(elo(400, 800, 0.5) > 400);
});

test('vencer o bot da vez libera o proximo; tabuleiros saem nos bots 2, 4, 6 e 8', () => {
  let p = progressoNovo();
  assert.equal(botDaEscada(p), 0);
  assert.deepEqual(liberados(p).tabuleiros, ['madeira']);
  const tabs = [];
  for (let i = 0; i < 10; i++) {
    const r = registrarResultado(p, botDaEscada(p), 1);
    assert.ok(r.delta > 0, 'vitoria sempre sobe');
    if (i < 9) assert.equal(r.botNovo, i + 1);
    if (r.tabNovo) tabs.push(r.tabNovo);
    p = r.progresso;
  }
  assert.deepEqual(tabs, ['jardim', 'doceria', 'telhado', 'praia']);
  assert.equal(p.vitorias, 10);
  assert.equal(botDaEscada(p), 9);
  assert.ok(p.rating > 700, `rating ${p.rating}`);
});

test('derrota nao tira desbloqueio', () => {
  let p = registrarResultado(progressoNovo(), 0, 1).progresso;
  p = registrarResultado(p, 1, 0).progresso;
  assert.equal(botDaEscada(p), 1);
  assert.ok(liberados(p).bots[1]);
  assert.equal(p.derrotas, 1);
});

test('gags: as 4 primeiras em ordem, depois uma nova a cada 6 capturas, ate as 8', () => {
  let p = progressoNovo();
  const vistas = [];
  for (let i = 0; i < 60; i++) {
    const r = proximaGag(p);
    p = r.progresso;
    if (r.nova) vistas.push(r.gag);
    if (i < 4) assert.equal(r.gag, GAGS[i]);
  }
  assert.deepEqual([...new Set(['torta', ...vistas])], GAGS);
  assert.equal(p.gags, GAGS.length);
});

test('normalizar aguenta save quebrado e campos faltando', () => {
  assert.deepEqual(normalizar(null), progressoNovo());
  assert.deepEqual(normalizar('lixo'), progressoNovo());
  const n = normalizar({ rating: 777, vencidos: [true], tabuleiro: 'praia', gags: 99 });
  assert.equal(n.rating, 777);
  assert.equal(n.vencidos.length, 10);
  assert.equal(n.tabuleiro, 'madeira', 'tabuleiro travado volta para o inicial');
  assert.equal(n.gags, GAGS.length);
});
