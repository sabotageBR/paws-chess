// Progresso do jogador: escada dos 10 bots com rating (Elo simples), desbloqueio de bots, tabuleiros e
// gags de captura, e os carimbos do puzzle do dia. Tudo puro (o main.js salva e le).
import { BOTS } from './bots.js';

/** Tabuleiros tematicos: liberados ao vencer o bot de indice `bot` (0 = desde o inicio). */
export const TABULEIROS = [
  { id: 'madeira', bot: -1 },
  { id: 'jardim', bot: 1 },
  { id: 'doceria', bot: 3 },
  { id: 'telhado', bot: 5 },
  { id: 'praia', bot: 7 },
];

/** Gags de captura, na ordem em que aparecem. */
export const GAGS = ['torta', 'martelo', 'espirro', 'banana', 'travesseiro', 'galinha', 'balde', 'bolha'];

/**
 * @typedef {Object} Progresso
 * @property {number} v
 * @property {number} rating
 * @property {boolean[]} vencidos bot i ja vencido
 * @property {number} partidas
 * @property {number} vitorias
 * @property {number} empates
 * @property {number} derrotas
 * @property {number} capturas
 * @property {number} gags quantas gags ja descobertas
 * @property {string} tabuleiro tabuleiro escolhido
 * @property {string[]} tabVistos tabuleiros ja apresentados (festa de desbloqueio uma vez so)
 * @property {Record<string, boolean[]>} puzzles dia -> resolvidos
 * @property {number} dicasExtra dicas extras para a proxima partida (premiado)
 * @property {boolean} lado2j tabuleiro gira no modo 2 jogadores
 * @property {boolean} gagsLigadas
 */

/** @returns {Progresso} */
export function progressoNovo() {
  return {
    v: 1, rating: 400, vencidos: BOTS.map(() => false), partidas: 0, vitorias: 0, empates: 0, derrotas: 0,
    capturas: 0, gags: 1, tabuleiro: 'madeira', tabVistos: ['madeira'], puzzles: {}, dicasExtra: 0,
    lado2j: true, gagsLigadas: true,
  };
}

/** Normaliza o que veio do armazenamento (versoes antigas, campos faltando). @param {any} p @returns {Progresso} */
export function normalizar(p) {
  const n = progressoNovo();
  if (!p || typeof p !== 'object') return n;
  for (const k of Object.keys(n)) if (p[k] !== undefined && typeof p[k] === typeof /** @type {any} */ (n)[k]) /** @type {any} */ (n)[k] = p[k];
  n.vencidos = BOTS.map((_, i) => !!(Array.isArray(p.vencidos) && p.vencidos[i]));
  if (!Array.isArray(n.tabVistos)) n.tabVistos = ['madeira'];
  if (!liberados(n).tabuleiros.includes(n.tabuleiro)) n.tabuleiro = 'madeira';
  n.gags = Math.max(1, Math.min(GAGS.length, n.gags | 0));
  return n;
}

/** Elo: expectativa e novo rating. @param {number} r @param {number} rb @param {number} s 1, 0.5 ou 0 @param {number} [k] */
export function elo(r, rb, s, k = 40) {
  const e = 1 / (1 + 10 ** ((rb - r) / 400));
  return Math.max(100, Math.round(r + k * (s - e)));
}

/** Indice do bot da vez na escada (o primeiro nao vencido; depois do ultimo, o ultimo). @param {Progresso} p */
export function botDaEscada(p) {
  const i = p.vencidos.indexOf(false);
  return i < 0 ? BOTS.length - 1 : i;
}

/** O que esta liberado. @param {Progresso} p */
export function liberados(p) {
  const prox = botDaEscada(p);
  const bots = BOTS.map((_, i) => i <= prox || p.vencidos[i]);
  const tabuleiros = TABULEIROS.filter((t) => t.bot < 0 || p.vencidos[t.bot]).map((t) => t.id);
  return { bots, tabuleiros };
}

/**
 * Aplica o fim de uma partida contra bot. Devolve o progresso novo e as novidades para festejar.
 * @param {Progresso} p @param {number} botIdx @param {number} s 1 vitoria, 0.5 empate, 0 derrota
 */
export function registrarResultado(p, botIdx, s) {
  const n = /** @type {Progresso} */ (JSON.parse(JSON.stringify(p)));
  const antes = liberados(p);
  n.partidas++;
  if (s === 1) n.vitorias++; else if (s === 0) n.derrotas++; else n.empates++;
  const ratingAntes = n.rating;
  n.rating = elo(n.rating, BOTS[botIdx].rating, s);
  // vitoria nunca tira ponto, mesmo contra um bot bem abaixo
  if (s === 1 && n.rating < ratingAntes + 5) n.rating = ratingAntes + 5;
  if (s === 1) n.vencidos[botIdx] = true;
  const depois = liberados(n);
  const botNovo = depois.bots.findIndex((l, i) => l && !antes.bots[i]);
  const tabNovo = depois.tabuleiros.find((t) => !antes.tabuleiros.includes(t)) || '';
  if (tabNovo) n.tabuleiro = tabNovo;
  return { progresso: n, delta: n.rating - ratingAntes, botNovo, tabNovo };
}

/**
 * Gag da proxima captura: as 4 primeiras saem em ordem; depois uma nova a cada 6 capturas, e as ja
 * descobertas se alternam.
 * @param {Progresso} p @returns {{ gag: string, nova: boolean, progresso: Progresso }}
 */
export function proximaGag(p) {
  const n = { ...p, capturas: p.capturas + 1 };
  let nova = false;
  if (n.capturas <= 4) {
    if (n.capturas > n.gags) { n.gags = n.capturas; nova = true; }
    return { gag: GAGS[n.capturas - 1], nova, progresso: n };
  }
  if (n.gags < GAGS.length && (n.capturas - 4) % 6 === 0) {
    n.gags++;
    return { gag: GAGS[n.gags - 1], nova: true, progresso: n };
  }
  return { gag: GAGS[(n.capturas * 5) % n.gags], nova: false, progresso: n };
}
