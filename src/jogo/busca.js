// Busca do motor: negamax alfa-beta (PVS) com aprofundamento iterativo, tabela de transposicao, ordenacao
// MVV-LVA + lance da tabela + killers + historia, lance nulo, reducao de lances tardios, extensao de xeque e
// quiescencia. Para por orcamento de nos ou por prazo; o relogio vem de fora (opcao `agora`), porque o
// nucleo nao le relogio nenhum (test/estilo.test.js). Usada pelo Web Worker (src/ia/) e pelos testes.
import { F_CAPTURA, F_PROMO, F_EP, PEAO, REI } from './xadrez.js';
import { avaliar, VALOR } from './avaliacao.js';

export const MATE = 30000;
const INF = 32000;
const MAX_PLY = 64;
const EXATO = 1;
const INFERIOR = 2;
const SUPERIOR = 3;

/** a nota e de mate? @param {number} n */
export const ehMate = (n) => Math.abs(n) > MATE - 200;

/**
 * @typedef {Object} OpcoesBusca
 * @property {number} [profundidade] profundidade maxima (padrao 64)
 * @property {number} [nos] orcamento de nos (padrao infinito)
 * @property {number} [prazo] instante limite (na escala de `agora`)
 * @property {() => number} [agora] relogio (ms); sem ele, so o orcamento de nos
 * @property {number} [ruido] ruido da avaliacao (centipeoes)
 * @property {number} [semente] semente do ruido
 * @property {boolean} [quiescencia] usa quiescencia (padrao true)
 * @property {number} [qMax] profundidade maxima da quiescencia (padrao 12)
 */

/**
 * @typedef {Object} ResultadoBusca
 * @property {number} lance melhor lance (0 = sem lance)
 * @property {number} nota nota do melhor lance (quem tem a vez)
 * @property {number} prof profundidade completa
 * @property {number} nos nos visitados
 * @property {number[]} pv variante principal
 */

/** @param {number} [bitsTt] tamanho da tabela de transposicao (2^bits entradas) */
export function criarMotor(bitsTt = 18) {
  const N = 1 << bitsTt;
  const MASC = N - 1;
  const ttLo = new Int32Array(N);
  const ttHi = new Int32Array(N);
  const ttLance = new Int32Array(N);
  const ttNota = new Int32Array(N);
  const ttProf = new Int8Array(N);
  const ttTipo = new Int8Array(N);
  const historia = new Int32Array(2 * 128 * 128);
  const killers = new Int32Array(MAX_PLY * 2);
  /** @type {number[][]} */
  const listas = Array.from({ length: MAX_PLY + 16 }, () => []);
  const notas = Array.from({ length: MAX_PLY + 16 }, () => new Int32Array(256));

  /** @type {import('./xadrez.js').Posicao} */
  let pos;
  let nos = 0;
  let nosMax = Infinity;
  let prazo = Infinity;
  /** @type {(() => number)|null} */
  let agora = null;
  let parar = false;
  let ruido = 0;
  let semente = 0;
  let usaQ = true;
  let qMax = 12;

  function limpar() {
    ttLo.fill(0);
    ttHi.fill(0);
    ttTipo.fill(0);
    historia.fill(0);
    killers.fill(0);
  }

  function checar() {
    if (nos >= nosMax || (agora && agora() >= prazo)) parar = true;
  }

  /**
   * Pontua os lances para a ordenacao.
   * @param {number[]} ls @param {Int32Array} ns @param {number} ttL @param {number} ply
   */
  function pontuar(ls, ns, ttL, ply) {
    const b = pos.b;
    const k1 = killers[ply * 2];
    const k2 = killers[ply * 2 + 1];
    const base = pos.lado * 16384;
    for (let i = 0; i < ls.length; i++) {
      const m = ls[i];
      if (m === ttL) { ns[i] = 10000000; continue; }
      const fl = m >> 17;
      const de = m & 127;
      const para = (m >> 7) & 127;
      if (fl & (F_CAPTURA | F_PROMO)) {
        const vit = fl & F_EP ? PEAO : b[para] & 7;
        ns[i] = 1000000 + VALOR[vit] * 10 - (b[de] & 7) + (fl & F_PROMO ? VALOR[(m >> 14) & 7] * 10 : 0);
      } else if (m === k1) ns[i] = 900000;
      else if (m === k2) ns[i] = 800000;
      else ns[i] = historia[base + de * 128 + para];
    }
  }

  /** tira o melhor lance restante para a posicao i @param {number[]} ls @param {Int32Array} ns @param {number} i */
  function escolher(ls, ns, i) {
    let mi = i;
    for (let j = i + 1; j < ls.length; j++) if (ns[j] > ns[mi]) mi = j;
    if (mi !== i) {
      const tl = ls[i]; ls[i] = ls[mi]; ls[mi] = tl;
      const tn = ns[i]; ns[i] = ns[mi]; ns[mi] = tn;
    }
    return ls[i];
  }

  /** o lado tem pecas alem de peoes e rei (lance nulo seguro)? @param {number} lado */
  function temPecas(lado) {
    const b = pos.b;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq];
      if (pc && (pc >> 3) === lado) {
        const t = pc & 7;
        if (t !== PEAO && t !== REI) return true;
      }
    }
    return false;
  }

  /** @param {number} alfa @param {number} beta @param {number} ply @param {number} qd */
  function quies(alfa, beta, ply, qd) {
    if ((++nos & 1023) === 0) checar();
    if (parar) return 0;
    const pe = avaliar(pos, ruido, semente);
    if (ply >= MAX_PLY || !usaQ || qd >= qMax) return pe;
    if (pe >= beta) return pe;
    if (pe > alfa) alfa = pe;
    const ls = listas[ply];
    ls.length = 0;
    pos.gerar(ls, true);
    const ns = notas[ply];
    pontuar(ls, ns, 0, ply);
    const b = pos.b;
    for (let i = 0; i < ls.length; i++) {
      const m = escolher(ls, ns, i);
      const fl = m >> 17;
      if (!(fl & F_PROMO)) {
        const vit = fl & F_EP ? PEAO : b[(m >> 7) & 127] & 7;
        if (pe + VALOR[vit] + 200 < alfa) continue;
      }
      if (!pos.fazer(m)) continue;
      const n = -quies(-beta, -alfa, ply + 1, qd + 1);
      pos.desfazer();
      if (parar) return 0;
      if (n >= beta) return n;
      if (n > alfa) alfa = n;
    }
    return alfa;
  }

  /**
   * @param {number} prof @param {number} alfa @param {number} beta @param {number} ply @param {boolean} podeNulo
   * @returns {number}
   */
  function negamax(prof, alfa, beta, ply, podeNulo) {
    if ((++nos & 1023) === 0) checar();
    if (parar) return 0;
    if (ply > 0) {
      if (pos.meio >= 100 || pos.repeticoes() >= 2) return 0;
      // poda pela distancia do mate
      const a = Math.max(alfa, -MATE + ply);
      const bt = Math.min(beta, MATE - ply - 1);
      if (a >= bt) return a;
    }
    if (ply >= MAX_PLY) return avaliar(pos, ruido, semente);
    const emXeque = pos.emXeque();
    if (emXeque) prof++;
    if (prof <= 0) return quies(alfa, beta, ply, 0);

    const ti = pos.hlo & MASC;
    let ttL = 0;
    if (ttTipo[ti] && ttLo[ti] === pos.hlo && ttHi[ti] === pos.hhi) {
      ttL = ttLance[ti];
      if (ply > 0 && ttProf[ti] >= prof) {
        let n = ttNota[ti];
        if (n > MATE - 200) n -= ply;
        else if (n < -MATE + 200) n += ply;
        const tp = ttTipo[ti];
        if (tp === EXATO) return n;
        if (tp === INFERIOR && n >= beta) return n;
        if (tp === SUPERIOR && n <= alfa) return n;
      }
    }

    if (podeNulo && !emXeque && prof >= 3 && ply > 0 && beta < MATE - 200 && temPecas(pos.lado)
      && avaliar(pos, ruido, semente) >= beta) {
      pos.fazerNulo();
      const n = -negamax(prof - 3, -beta, -beta + 1, ply + 1, false);
      pos.desfazerNulo();
      if (parar) return 0;
      if (n >= beta) return beta;
    }

    const ls = listas[ply];
    ls.length = 0;
    pos.gerar(ls);
    const ns = notas[ply];
    pontuar(ls, ns, ttL, ply);
    const alfa0 = alfa;
    let melhor = -INF;
    let melhorL = 0;
    let legais = 0;
    for (let i = 0; i < ls.length; i++) {
      const m = escolher(ls, ns, i);
      if (!pos.fazer(m)) continue;
      legais++;
      let n;
      if (legais === 1) n = -negamax(prof - 1, -beta, -alfa, ply + 1, true);
      else {
        let r = 0;
        const quieto = !((m >> 17) & (F_CAPTURA | F_PROMO));
        if (prof >= 3 && legais > 4 && quieto && !emXeque && ns[i] < 800000 && !pos.emXeque()) r = legais > 12 ? 2 : 1;
        n = -negamax(prof - 1 - r, -alfa - 1, -alfa, ply + 1, true);
        if (!parar && n > alfa && r) n = -negamax(prof - 1, -alfa - 1, -alfa, ply + 1, true);
        if (!parar && n > alfa && n < beta) n = -negamax(prof - 1, -beta, -alfa, ply + 1, true);
      }
      pos.desfazer();
      if (parar) return 0;
      if (n > melhor) {
        melhor = n;
        melhorL = m;
        if (n > alfa) {
          alfa = n;
          if (n >= beta) {
            if (!((m >> 17) & (F_CAPTURA | F_PROMO))) {
              if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
              const hi = pos.lado * 16384 + (m & 127) * 128 + ((m >> 7) & 127);
              historia[hi] += prof * prof;
              if (historia[hi] > 700000) for (let k = 0; k < historia.length; k++) historia[k] >>= 1;
            }
            break;
          }
        }
      }
    }
    if (!legais) return emXeque ? -MATE + ply : 0;
    let guardar = melhor;
    if (guardar > MATE - 200) guardar += ply;
    else if (guardar < -MATE + 200) guardar -= ply;
    ttLo[ti] = pos.hlo;
    ttHi[ti] = pos.hhi;
    ttLance[ti] = melhorL;
    ttNota[ti] = guardar;
    ttProf[ti] = prof;
    ttTipo[ti] = melhor >= beta ? INFERIOR : melhor > alfa0 ? EXATO : SUPERIOR;
    return melhor;
  }

  /** variante principal pela tabela @param {number} max */
  function lerPv(max) {
    const pv = [];
    let n = 0;
    while (n < max) {
      const ti = pos.hlo & MASC;
      if (!ttTipo[ti] || ttLo[ti] !== pos.hlo || ttHi[ti] !== pos.hhi) break;
      const m = ttLance[ti];
      if (!m || !pos.legais().includes(m)) break;
      pos.fazer(m);
      pv.push(m);
      n++;
    }
    for (let i = 0; i < n; i++) pos.desfazer();
    return pv;
  }

  /**
   * Busca o melhor lance (a posicao volta igual).
   * @param {import('./xadrez.js').Posicao} p
   * @param {OpcoesBusca} [op]
   * @returns {ResultadoBusca}
   */
  function buscar(p, op = {}) {
    pos = p;
    nos = 0;
    parar = false;
    nosMax = op.nos ?? Infinity;
    agora = op.agora ?? null;
    prazo = op.prazo ?? Infinity;
    ruido = op.ruido ?? 0;
    semente = op.semente ?? 0;
    usaQ = op.quiescencia ?? true;
    qMax = op.qMax ?? 12;
    killers.fill(0);
    const maxProf = Math.min(op.profundidade ?? MAX_PLY - 4, MAX_PLY - 4);
    const raiz = pos.legais();
    if (!raiz.length) return { lance: 0, nota: pos.emXeque() ? -MATE : 0, prof: 0, nos: 0, pv: [] };
    let melhorL = raiz[0];
    let melhorN = -INF;
    let profFeita = 0;
    const ns = new Int32Array(raiz.length);
    for (let d = 1; d <= maxProf; d++) {
      // ordem: o melhor da iteracao anterior primeiro
      pontuar(raiz, ns, melhorL, 0);
      let alfa = -INF;
      const beta = INF;
      let itL = 0;
      let itN = -INF;
      for (let i = 0; i < raiz.length; i++) {
        const m = escolher(raiz, ns, i);
        pos.fazer(m);
        let n;
        if (i === 0) n = -negamax(d - 1, -beta, -alfa, 1, true);
        else {
          n = -negamax(d - 1, -alfa - 1, -alfa, 1, true);
          if (!parar && n > alfa) n = -negamax(d - 1, -beta, -alfa, 1, true);
        }
        pos.desfazer();
        if (parar) break;
        if (n > itN) { itN = n; itL = m; }
        if (n > alfa) alfa = n;
      }
      if (parar) {
        // iteracao incompleta: aproveita so se ja achou algo melhor que a anterior com o primeiro lance
        if (itL && itN > melhorN && d > 1) { melhorL = itL; melhorN = itN; }
        break;
      }
      melhorL = itL;
      melhorN = itN;
      profFeita = d;
      // grava a raiz na tabela para a PV
      const ti = pos.hlo & MASC;
      ttLo[ti] = pos.hlo; ttHi[ti] = pos.hhi; ttLance[ti] = melhorL; ttNota[ti] = melhorN; ttProf[ti] = d; ttTipo[ti] = EXATO;
      if (ehMate(melhorN) && MATE - Math.abs(melhorN) <= d) break;
      if (raiz.length === 1 && d >= 2) break;
      // nao comeca uma iteracao que nao vai caber no orcamento
      if (nos * 3 > nosMax) break;
      if (agora && prazo < Infinity && agora() + (agora() - inicioT) * 2 > prazo) break;
    }
    const pv = lerPv(Math.max(1, profFeita));
    if (!pv.length || pv[0] !== melhorL) { pv.length = 0; pv.push(melhorL); }
    return { lance: melhorL, nota: melhorN, prof: profFeita, nos, pv };
  }
  let inicioT = 0;

  /**
   * Busca com o relogio ja marcado (o `agora` e lido aqui, nunca no nucleo).
   * @param {import('./xadrez.js').Posicao} p @param {OpcoesBusca} [op]
   */
  function buscarComTempo(p, op = {}) {
    inicioT = op.agora ? op.agora() : 0;
    return buscar(p, op);
  }

  /**
   * Nota de cada lance legal com busca rasa (escolha dos bots fracos e dos vacilos).
   * @param {import('./xadrez.js').Posicao} p @param {number} prof @param {OpcoesBusca} [op]
   * @returns {{ lance: number, nota: number }[]}
   */
  function notasDosLances(p, prof, op = {}) {
    pos = p;
    nos = 0;
    parar = false;
    nosMax = Infinity;
    agora = null;
    prazo = Infinity;
    ruido = op.ruido ?? 0;
    semente = op.semente ?? 0;
    usaQ = op.quiescencia ?? true;
    qMax = op.qMax ?? 12;
    const out = [];
    for (const m of p.legais()) {
      p.fazer(m);
      const n = -negamax(prof - 1, -INF, INF, 1, true);
      p.desfazer();
      out.push({ lance: m, nota: n });
    }
    out.sort((a, b) => b.nota - a.nota);
    return out;
  }

  return { buscar: buscarComTempo, notasDosLances, limpar };
}
