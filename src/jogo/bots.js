// Os 10 bots: nivel = profundidade/orcamento + ruido na avaliacao + chance de vacilo. Calibrados jogando
// bots contra bots (tools/calibrar.mjs, docs/forca-bots.md; test/bots.test.js confere a ordem).
// O jogador comanda os gatos na escada; o bot comanda os caes (mesmo o Gatinho Sonolento, que trocou de
// lado por uma almofada). Nomes e falas ficam em src/i18n/falas.js (pela `id`).
import { daMate } from './mate.js';

/**
 * @typedef {Object} Bot
 * @property {string} id
 * @property {number} rating rating nominal da escada
 * @property {'gato'|'cao'} especie
 * @property {number} prof profundidade maxima
 * @property {number} [nos] orcamento de nos
 * @property {number} [ms] prazo (ms) no aparelho do jogador
 * @property {number} ruido ruido da avaliacao (centipeoes)
 * @property {number} vacilo chance de vacilar num lance
 * @property {number} [perdaMax] o vacilo nunca perde mais que isto (centipeoes)
 * @property {boolean} [quiescencia]
 * @property {number} [qMax]
 * @property {boolean} [piedade] nunca da mate (o primeiro bot)
 * @property {boolean} [dorme] abandona (dorme) quando esta muito atras no fim da partida
 */

/** @type {Bot[]} */
export const BOTS = [
  { id: 'sonolento', rating: 400, especie: 'gato', prof: 1, ruido: 260, vacilo: 0.55, perdaMax: 2000, quiescencia: false, piedade: true, dorme: true },
  { id: 'bagunceiro', rating: 600, especie: 'cao', prof: 1, ruido: 190, vacilo: 0.36, perdaMax: 900, qMax: 1 },
  { id: 'pantufa', rating: 800, especie: 'cao', prof: 1, ruido: 100, vacilo: 0.22, perdaMax: 600, qMax: 4 },
  { id: 'salsicha', rating: 1000, especie: 'cao', prof: 2, ruido: 80, vacilo: 0.13, perdaMax: 450 },
  { id: 'chef', rating: 1200, especie: 'gato', prof: 3, ruido: 45, vacilo: 0.06, perdaMax: 350, nos: 40000 },
  { id: 'barao', rating: 1400, especie: 'cao', prof: 4, ruido: 30, vacilo: 0.03, perdaMax: 300, nos: 80000 },
  { id: 'pug', rating: 1600, especie: 'cao', prof: 5, ruido: 18, vacilo: 0.012, perdaMax: 250, nos: 150000 },
  { id: 'lobo', rating: 1800, especie: 'cao', prof: 6, ruido: 10, vacilo: 0, nos: 300000 },
  { id: 'esfinge', rating: 2000, especie: 'gato', prof: 8, ruido: 5, vacilo: 0, nos: 700000 },
  { id: 'biscoito', rating: 2200, especie: 'cao', prof: 60, ruido: 2, vacilo: 0, nos: 2500000, ms: 2500 },
];

/**
 * Escolhe o lance do bot (o Web Worker chama isto; os testes tambem).
 * @param {import('./xadrez.js').Posicao} pos
 * @param {Bot} bot
 * @param {ReturnType<typeof import('./busca.js').criarMotor>} motor
 * @param {() => number} rng
 * @param {{ semente?: number, agora?: () => number, roteiro?: 'peao'|'peca'|null }} [extra]
 * @returns {{ lance: number, nota: number, vacilou: boolean, abandona: boolean }|null}
 */
export function escolherLance(pos, bot, motor, rng, extra = {}) {
  const legais = pos.legais();
  if (!legais.length) return null;
  let candidatos = legais;
  if (bot.piedade) {
    const sem = legais.filter((m) => !daMate(pos, m));
    if (sem.length) candidatos = sem;
  }
  // abertura roteirizada da primeira partida: entrega um peao e depois uma peca
  if (extra.roteiro) {
    const e = lanceEntrega(pos, motor, extra.roteiro, candidatos);
    if (e) return { lance: e, nota: 0, vacilou: true, abandona: false };
  }
  if (candidatos.length > 1 && bot.vacilo && rng() < bot.vacilo) {
    const ns = motor.notasDosLances(pos, 1, { quiescencia: true, qMax: 4 }).filter((x) => candidatos.includes(x.lance));
    const melhor = ns[0].nota;
    const perdaMax = bot.perdaMax ?? 300;
    const ruins = ns.filter((x) => x.nota <= melhor - 60 && x.nota >= melhor - perdaMax);
    const pool = ruins.length ? ruins : ns.slice(1);
    const e = pool[Math.floor(rng() * pool.length)];
    return { lance: e.lance, nota: melhor, vacilou: true, abandona: false };
  }
  const agora = extra.agora;
  const r = motor.buscar(pos, {
    profundidade: bot.prof,
    nos: bot.nos,
    ruido: bot.ruido,
    semente: extra.semente ?? 0,
    quiescencia: bot.quiescencia !== false,
    qMax: bot.qMax,
    agora,
    prazo: agora && bot.ms ? agora() + bot.ms : undefined,
  });
  let lance = r.lance;
  if (!candidatos.includes(lance)) {
    const ns = motor.notasDosLances(pos, 1, { ruido: bot.ruido, semente: extra.semente ?? 0, quiescencia: false }).filter((x) => candidatos.includes(x.lance));
    lance = ns[0].lance;
  }
  const abandona = !!bot.dorme && pos.num >= 30 && r.nota <= -500;
  return { lance, nota: r.nota, vacilou: false, abandona };
}

/**
 * Lance que entrega material (abertura da primeira partida): 'peao' perde ~1 peao, 'peca' perde ~1 peca menor.
 * @param {import('./xadrez.js').Posicao} pos
 * @param {ReturnType<typeof import('./busca.js').criarMotor>} motor
 * @param {'peao'|'peca'} tipo
 * @param {number[]} candidatos
 */
export function lanceEntrega(pos, motor, tipo, candidatos) {
  // resposta classica a 1.e4 / 1.d4: o peao do centro fica pendurado
  const fen = pos.fen().split(' ').slice(0, 2).join(' ');
  if (tipo === 'peao') {
    if (fen === 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b') return pos.deUci('d7d5');
    if (fen === 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b') return pos.deUci('e7e5');
  }
  const alvo = tipo === 'peao' ? -100 : -320;
  const ns = motor.notasDosLances(pos, 2, { quiescencia: true, qMax: 6 }).filter((x) => candidatos.includes(x.lance));
  let melhor = null;
  let dist = Infinity;
  for (const x of ns) {
    const d = Math.abs(x.nota - alvo);
    if (x.nota < alvo + 60 && x.nota > alvo - 250 && d < dist) { dist = d; melhor = x.lance; }
  }
  return melhor;
}
