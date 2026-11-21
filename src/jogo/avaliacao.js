// Avaliacao estatica (centipeoes, do ponto de vista de quem tem a vez): material, tabelas de posicao
// (Simplified Evaluation Function, com rei de meio-jogo e de final misturados pela fase), par de bispos,
// peao passado, torre em coluna aberta e "empurrar o rei" no final ganho (os bots dao mate com rei e dama).
// Ruido opcional por posicao (bots fracos): deterministico pelo hash, igual em toda a busca.
import { PEAO, CAVALO, BISPO, TORRE, DAMA, REI } from './xadrez.js';

export const VALOR = [0, 100, 320, 330, 500, 900, 0];

// tabelas com a 8a fileira em cima (indice = (7 - fileira) * 8 + coluna, para as brancas)
const T_PEAO = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const T_CAVALO = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const T_BISPO = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const T_TORRE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const T_DAMA = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const T_REI_MEIO = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const T_REI_FIM = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];
const TABELAS = [null, T_PEAO, T_CAVALO, T_BISPO, T_TORRE, T_DAMA];
const FASE_PECA = [0, 0, 1, 1, 2, 4, 0];
const PASSADO = [0, 5, 10, 20, 35, 60, 100, 0];

/** indice na tabela para a casa sq (0x88) e a cor c @param {number} sq @param {number} c */
const idx = (sq, c) => (c === 0 ? (7 - (sq >> 4)) * 8 + (sq & 7) : (sq >> 4) * 8 + (sq & 7));

const colPeoes = [new Int8Array(8), new Int8Array(8)];

/**
 * @param {import('./xadrez.js').Posicao} p
 * @param {number} [ruido] amplitude do ruido (centipeoes)
 * @param {number} [semente]
 */
export function avaliar(p, ruido = 0, semente = 0) {
  const b = p.b;
  let mg = 0;
  let fase = 0;
  const mat = [0, 0];
  const bispos = [0, 0];
  colPeoes[0].fill(0);
  colPeoes[1].fill(0);
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = b[sq];
    if (!pc) continue;
    const t = pc & 7;
    if (t === REI) continue;
    const c = pc >> 3;
    const s = VALOR[t] + /** @type {number[]} */ (TABELAS[t])[idx(sq, c)];
    if (c === 0) mg += s; else mg -= s;
    mat[c] += VALOR[t];
    fase += FASE_PECA[t];
    if (t === BISPO) bispos[c]++;
    if (t === PEAO) {
      colPeoes[c][sq & 7]++;
    }
  }
  if (fase > 24) fase = 24;
  const fimK = (24 - fase) / 24;
  // reis
  for (let c = 0; c < 2; c++) {
    const i = idx(p.reis[c], c);
    const s = T_REI_MEIO[i] * (1 - fimK) + T_REI_FIM[i] * fimK;
    if (c === 0) mg += s; else mg -= s;
  }
  // par de bispos
  if (bispos[0] >= 2) mg += 30;
  if (bispos[1] >= 2) mg -= 30;
  // peoes: dobrados, passados
  let estr = 0;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = b[sq];
    const t = pc & 7;
    if (t !== PEAO && t !== TORRE) continue;
    const c = pc >> 3;
    const col = sq & 7;
    const f = sq >> 4;
    let v = 0;
    if (t === TORRE) {
      if (!colPeoes[c][col]) v += colPeoes[c ^ 1][col] ? 10 : 20;
    } else {
      let passado = true;
      for (let k = col - 1; k <= col + 1 && passado; k++) {
        if (k < 0 || k > 7) continue;
        if (temPeaoAFrente(b, c === 0 ? 9 : 1, k, f, c === 0 ? 1 : -1)) passado = false;
      }
      if (passado) v += PASSADO[c === 0 ? f : 7 - f] * (0.5 + fimK);
      if (colPeoes[c][col] > 1) v -= 10;
    }
    estr += c === 0 ? v : -v;
  }
  mg += estr;
  // final ganho: empurrar o rei perdedor para a borda e aproximar o rei vencedor
  if (fase <= 8) {
    const dif = mat[0] - mat[1];
    if (Math.abs(dif) >= 300) {
      const ganha = dif > 0 ? 0 : 1;
      const kp = p.reis[ganha ^ 1];
      const kg = p.reis[ganha];
      const cf = Math.max(3 - (kp >> 4), (kp >> 4) - 4) + Math.max(3 - (kp & 7), (kp & 7) - 4);
      const dist = Math.abs((kp >> 4) - (kg >> 4)) + Math.abs((kp & 7) - (kg & 7));
      const bonus = 10 * cf + 4 * (14 - dist);
      mg += ganha === 0 ? bonus : -bonus;
    }
  }
  let nota = p.lado === 0 ? mg : -mg;
  if (ruido) {
    let h = Math.imul(p.hlo ^ semente, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    nota += Math.round((((h >>> 0) / 4294967296) * 2 - 1) * ruido);
  }
  return Math.round(nota);
}

/**
 * Existe peao `pp` na coluna `col` a frente da fileira `f` no sentido `dir` (+1 sobe, -1 desce)?
 * @param {Int8Array} b @param {number} pp @param {number} col @param {number} f @param {number} dir
 */
function temPeaoAFrente(b, pp, col, f, dir) {
  for (let r = f + dir; r >= 0 && r <= 7; r += dir) if (b[r * 16 + col] === pp) return true;
  return false;
}

/** Valor de uma peca (para MVV-LVA e telas) @param {number} t */
export const valorTipo = (t) => (t === REI ? 2000 : VALOR[t]);
export { PEAO, CAVALO, BISPO, TORRE, DAMA, REI };
