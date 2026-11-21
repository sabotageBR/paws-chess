// IA: acha mate em 1 e em 2, os 10 bots devolvem lance legal, o Gatinho Sonolento nunca da mate, a abertura
// roteirizada entrega material, e os niveis ficam ordenados por forca (mini-matches bot contra bot).
// A calibracao completa (Elo relativo de cada bot) fica em tools/calibrar.mjs -> docs/forca-bots.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Posicao } from '../src/jogo/xadrez.js';
import { criarMotor, MATE } from '../src/jogo/busca.js';
import { BOTS, escolherLance, lanceEntrega } from '../src/jogo/bots.js';
import { daMate } from '../src/jogo/mate.js';
import { MATE_EM_1, MATE_EM_2 } from '../src/jogo/puzzles.js';
import { criarRng } from '../src/core/rng.js';
import { match } from '../tools/duelo.mjs';

const motor = criarMotor(18);

test('a busca acha mate em 1 (20 puzzles) com nota de mate', () => {
  for (const [fen] of MATE_EM_1.slice(0, 20)) {
    const p = Posicao.deFen(fen);
    const r = motor.buscar(p, { profundidade: 4 });
    assert.ok(daMate(p, r.lance), `${fen}: ${p.uci(r.lance)} nao da mate`);
    assert.equal(r.nota, MATE - 1, fen);
  }
});

test('a busca acha mate em 2 (20 puzzles): o lance unico da solucao', () => {
  for (const [fen, sol] of MATE_EM_2.slice(0, 20)) {
    const p = Posicao.deFen(fen);
    const r = motor.buscar(p, { profundidade: 6 });
    assert.equal(p.uci(r.lance), sol, fen);
    assert.equal(r.nota, MATE - 3, fen);
  }
});

test('o grao-mestre (bot 10) tambem acha os mates', () => {
  const rng = criarRng(1);
  const bot = { ...BOTS[9], nos: 300000 };
  for (const [fen, sol] of [...MATE_EM_1.slice(20, 25), ...MATE_EM_2.slice(20, 25)]) {
    const p = Posicao.deFen(fen);
    const r = escolherLance(p, bot, motor, rng);
    assert.ok(r, fen);
    if (MATE_EM_1.some((x) => x[0] === fen)) assert.ok(daMate(p, r.lance), fen);
    else assert.equal(p.uci(r.lance), sol, fen);
  }
});

test('os 10 bots devolvem lance legal na abertura e no meio-jogo', () => {
  const rng = criarRng(5);
  for (const fen of ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7']) {
    for (const b of BOTS) {
      const p = Posicao.deFen(fen);
      const r = escolherLance(p, { ...b, nos: Math.min(b.nos || 1e9, 60000), ms: undefined }, motor, rng, { semente: 3 });
      assert.ok(r && p.legais().includes(r.lance), `${b.id} em ${fen}`);
      assert.equal(p.fen(), fen, 'a posicao volta igual');
    }
  }
});

test('o Gatinho Sonolento nunca da mate; o bot 3 da', () => {
  const fen = '6k1/8/8/8/8/8/r4PPP/6K1 b - - 0 1';
  for (let s = 1; s <= 30; s++) {
    const p = Posicao.deFen(fen);
    const r = escolherLance(p, BOTS[0], motor, criarRng(s), { semente: s });
    assert.ok(r && !daMate(p, r.lance), `semente ${s}: o bot 1 deu mate`);
  }
  let deu = 0;
  for (let s = 1; s <= 10; s++) {
    const p = Posicao.deFen(fen);
    const r = escolherLance(p, BOTS[4], motor, criarRng(s), { semente: s });
    if (r && daMate(p, r.lance)) deu++;
  }
  assert.ok(deu >= 8, `o bot 5 deu mate so ${deu} de 10 vezes`);
});

test('abertura da primeira partida: o bot 1 entrega o peao (1.e4 d5) e depois uma peca', () => {
  const p = Posicao.inicial();
  p.fazer(p.deUci('e2e4'));
  assert.equal(p.uci(lanceEntrega(p, motor, 'peao', p.legais()) || 0), 'd7d5');
  const q = Posicao.inicial();
  q.fazer(q.deUci('g1f3'));
  const m = lanceEntrega(q, motor, 'peao', q.legais());
  assert.ok(m, 'achou um lance que entrega um peao depois de 1.Cf3');
  const r = Posicao.deFen('rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
  const n = motor.notasDosLances(r, 2);
  const e = lanceEntrega(r, motor, 'peca', r.legais());
  assert.ok(e, 'achou um lance que entrega uma peca');
  const nota = /** @type {{ lance: number, nota: number }} */ (n.find((x) => x.lance === e)).nota;
  assert.ok(nota < n[0].nota - 150, `a entrega perde material (${nota} contra ${n[0].nota})`);
});

test('niveis ordenados por forca: cada bot vence o de dois niveis abaixo (mini-matches)', () => {
  for (const [a, b, jogos, escala] of [[2, 0, 4, 1], [4, 2, 4, 0.5], [6, 4, 2, 0.2], [8, 6, 2, 0.1]]) {
    const r = match(BOTS[a], BOTS[b], jogos, { semente: 9, escala, maxLances: 160 });
    assert.ok(r.pontos > jogos / 2, `bot ${a + 1} x bot ${b + 1}: ${r.pontos}/${jogos} ${JSON.stringify(r.detalhes)}`);
  }
});
