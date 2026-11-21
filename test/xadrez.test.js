// Motor de xadrez: perft (gerador de lances), hash incremental, regras de fim de partida, SAN e partida.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Posicao, perft, FEN_INICIAL } from '../src/jogo/xadrez.js';
import { criarPartida, jogar, desfazerLance } from '../src/jogo/partida.js';
import { criarRng } from '../src/core/rng.js';

const PERFT = [
  ['inicial', FEN_INICIAL, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['posicao 3 (en passant, xeque descoberto)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['posicao 4 (promocoes, roque)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['posicao 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
];

for (const [nome, fen, esperado] of PERFT) {
  test(`perft ${nome}: ${esperado.join(', ')}`, () => {
    const p = Posicao.deFen(fen);
    esperado.forEach((n, i) => assert.equal(perft(p, i + 1), n, `profundidade ${i + 1}`));
    assert.equal(p.fen(), fen, 'a posicao volta igual depois do perft');
  });
}

test('hash incremental igual ao recalculado em 40 partidas aleatorias (fazer e desfazer)', () => {
  const r = criarRng(11);
  for (let jogo = 0; jogo < 40; jogo++) {
    const p = Posicao.inicial();
    const pilha = [];
    for (let i = 0; i < 120; i++) {
      const ls = p.legais();
      if (!ls.length) break;
      p.fazer(ls[Math.floor(r() * ls.length)]);
      pilha.push([p.hlo, p.hhi]);
      const q = p.clonar();
      q.recalcularHash();
      assert.deepEqual([q.hlo, q.hhi], [p.hlo, p.hhi]);
    }
    while (pilha.length) {
      const [lo, hi] = /** @type {number[]} */ (pilha.pop());
      assert.deepEqual([p.hlo, p.hhi], [lo, hi]);
      p.desfazer();
    }
    assert.equal(p.fen(), FEN_INICIAL);
  }
});

test('xeque-mate e afogamento', () => {
  assert.equal(Posicao.deFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3').situacao(), 'mate');
  assert.equal(Posicao.deFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').situacao(), 'afogamento');
  assert.equal(Posicao.deFen('7k/8/4Q3/8/8/8/8/K7 b - - 0 1').situacao(), 'jogando');
});

test('material insuficiente', () => {
  assert.equal(Posicao.deFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1').situacao(), 'material');
  assert.equal(Posicao.deFen('8/8/4k3/8/8/3KN3/8/8 w - - 0 1').situacao(), 'material');
  assert.equal(Posicao.deFen('8/8/4k3/8/8/3KB3/8/8 w - - 0 1').situacao(), 'material');
  assert.equal(Posicao.deFen('8/8/3bk3/8/8/3KB3/8/8 w - - 0 1').situacao(), 'material', 'bispos na mesma cor');
  assert.equal(Posicao.deFen('8/8/2b1k3/8/8/3KB3/8/8 w - - 0 1').situacao(), 'jogando', 'bispos em cores diferentes');
  assert.equal(Posicao.deFen('8/8/4k3/8/8/3KNN2/8/8 w - - 0 1').situacao(), 'jogando');
  assert.equal(Posicao.deFen('8/8/4k3/8/8/3K4/4P3/8 w - - 0 1').situacao(), 'jogando');
});

test('regra dos 50 lances', () => {
  assert.equal(Posicao.deFen('8/8/4k3/8/8/3K4/4R3/8 w - - 99 80').situacao(), 'jogando');
  const p = Posicao.deFen('8/8/4k3/8/8/3K4/4R3/8 w - - 99 80');
  p.fazer(p.deUci('e2a2'));
  assert.equal(p.situacao(), 'cinquenta');
});

test('repeticao tripla (cavalos indo e voltando)', () => {
  const pa = criarPartida();
  const ida = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  for (const u of ida) jogar(pa, pa.pos.deUci(u));
  assert.equal(pa.fim, '');
  for (const u of ida) jogar(pa, pa.pos.deUci(u));
  assert.equal(pa.fim, 'repeticao');
});

test('roque, en passant e promocao pela partida (com desfazer)', () => {
  const pa = criarPartida('r3k2r/8/8/8/4Pp2/8/8/R3K2R b KQkq e3 0 1');
  const ep = jogar(pa, pa.pos.deUci('f4e3'));
  assert.ok(ep && ep.capturada === 1 && ep.casaCaptura === 0x34, 'en passant captura o peao de e4');
  const roque = jogar(pa, pa.pos.deUci('e1g1'));
  assert.ok(roque && roque.roque && roque.roque.de === 7 && roque.roque.para === 5);
  assert.equal(roque.san, 'O-O');
  desfazerLance(pa);
  desfazerLance(pa);
  assert.equal(pa.pos.fen(), 'r3k2r/8/8/8/4Pp2/8/8/R3K2R b KQkq e3 0 1');
  const pr = criarPartida('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const lances = pr.pos.legais().filter((m) => pr.pos.uci(m).startsWith('a7a8'));
  assert.equal(lances.length, 4, 'promocao com escolha (D, T, B, C)');
  const info = jogar(pr, pr.pos.deUci('a7a8n'));
  assert.ok(info && info.promocao === 2 && info.san === 'a8=N');
});

test('roque proibido atravessando casa atacada e com o rei em xeque', () => {
  const p = Posicao.deFen('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
  assert.equal(p.deUci('e1g1'), -1, 'a torre em f2 ataca f1: o rei nao atravessa');
  const q = Posicao.deFen('4k3/8/8/8/8/8/8/R3K2r w Q - 0 1');
  assert.equal(q.deUci('e1c1'), -1, 'rei em xeque nao roca');
  const r = Posicao.deFen('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
  assert.ok(r.deUci('e1c1') > 0);
});

test('SAN com desambiguacao e mate', () => {
  const p = Posicao.deFen('6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1');
  assert.equal(p.san(p.deUci('a1d1')), 'Rad1');
  assert.equal(p.san(p.deUci('e1d1')), 'Red1');
  assert.equal(p.san(p.deUci('e1e8')), 'Re8#');
});
