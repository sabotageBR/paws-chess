// Banco de puzzles: todo puzzle confere no resolvedor exato (mate em 1 com lance unico; mate em 2 com primeiro
// lance unico e sem mate em 1), as brancas (gatos) sempre jogam, e o puzzle do dia sai igual para o mesmo dia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Posicao } from '../src/jogo/xadrez.js';
import { lancesDeMate } from '../src/jogo/mate.js';
import { MATE_EM_1, MATE_EM_2, puzzlesDoDia } from '../src/jogo/puzzles.js';

test('banco com folga para meses de puzzle do dia, sem repetir posicao', () => {
  assert.ok(MATE_EM_1.length >= 120, `${MATE_EM_1.length} mates em 1`);
  assert.ok(MATE_EM_2.length >= 60, `${MATE_EM_2.length} mates em 2`);
  const fens = new Set([...MATE_EM_1, ...MATE_EM_2].map(([f]) => f.split(' ').slice(0, 2).join(' ')));
  assert.equal(fens.size, MATE_EM_1.length + MATE_EM_2.length);
});

test('mate em 1: brancas jogam, lance unico, e a solucao registrada e ele', () => {
  for (const [fen, sol] of MATE_EM_1) {
    const p = Posicao.deFen(fen);
    assert.equal(p.lado, 0, fen);
    assert.equal(p.situacao(), 'jogando', fen);
    const ms = lancesDeMate(p, 1);
    assert.equal(ms.length, 1, `${fen}: ${ms.length} mates`);
    assert.equal(p.uci(ms[0]), sol, fen);
  }
});

test('mate em 2: primeiro lance unico, sem mate em 1', () => {
  for (const [fen, sol] of MATE_EM_2) {
    const p = Posicao.deFen(fen);
    assert.equal(p.lado, 0, fen);
    assert.equal(lancesDeMate(p, 1).length, 0, `${fen} tem mate em 1`);
    const ms = lancesDeMate(p, 2);
    assert.equal(ms.length, 1, `${fen}: ${ms.length} primeiros lances`);
    assert.equal(p.uci(ms[0]), sol, fen);
  }
});

test('puzzle do dia: 2 mates em 1 e 1 mate em 2, deterministico por dia', () => {
  for (const dia of [0, 1, 323, 5000]) {
    const a = puzzlesDoDia(dia);
    assert.deepEqual(a.map((x) => x.n), [1, 1, 2]);
    assert.deepEqual(puzzlesDoDia(dia), a);
    assert.notEqual(a[0].fen, a[1].fen);
  }
  assert.notDeepEqual(puzzlesDoDia(10), puzzlesDoDia(11));
});
