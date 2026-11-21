// Partida para a interface: aplica lances e devolve o que a animacao precisa (peca, captura, casa da
// captura no en passant, torre do roque, promocao, xeque e fim), com historico para desfazer.
import { Posicao, FEN_INICIAL, F_CAPTURA, F_EP, F_ROQUE, F_PROMO, lDe, lPara, lPromo } from './xadrez.js';

/**
 * @typedef {Object} InfoLance
 * @property {number} lance
 * @property {string} uci
 * @property {string} san
 * @property {number} de
 * @property {number} para
 * @property {number} peca peca que andou (antes da promocao)
 * @property {number} capturada peca capturada (0 = nenhuma)
 * @property {number} casaCaptura casa da peca capturada (en passant: diferente de `para`)
 * @property {{ de: number, para: number }|null} roque torre do roque
 * @property {number} promocao tipo promovido (0 = nenhum)
 * @property {boolean} xeque
 * @property {string} situacao depois do lance
 * @property {number} lado quem jogou
 */

/** @param {string} [fen] */
export function criarPartida(fen = FEN_INICIAL) {
  return { pos: Posicao.deFen(fen), fenInicial: fen, /** @type {InfoLance[]} */ feitos: [], /** @type {string} */ fim: '' };
}

/** @typedef {ReturnType<typeof criarPartida>} Partida */

/**
 * Joga um lance legal. Devolve as informacoes da animacao (null se o lance nao for legal).
 * @param {Partida} pa @param {number} m
 * @returns {InfoLance|null}
 */
export function jogar(pa, m) {
  const p = pa.pos;
  if (!p.legais().includes(m)) return null;
  const de = lDe(m);
  const para = lPara(m);
  const fl = m >> 17;
  const lado = p.lado;
  const san = p.san(m);
  const peca = p.b[de];
  let casaCaptura = -1;
  let capturada = 0;
  if (fl & F_EP) { casaCaptura = para + (lado === 0 ? -16 : 16); capturada = p.b[casaCaptura]; } else if (fl & F_CAPTURA) { casaCaptura = para; capturada = p.b[para]; }
  const roque = fl & F_ROQUE ? (para > de ? { de: de + 3, para: de + 1 } : { de: de - 4, para: de - 1 }) : null;
  p.fazer(m);
  const situacao = p.situacao();
  /** @type {InfoLance} */
  const info = {
    lance: m, uci: p.uci(m), san, de, para, peca, capturada, casaCaptura, roque,
    promocao: fl & F_PROMO ? lPromo(m) : 0, xeque: p.emXeque(), situacao, lado,
  };
  pa.feitos.push(info);
  pa.fim = situacao === 'jogando' ? '' : situacao;
  return info;
}

/** Desfaz o ultimo lance (devolve o que foi desfeito). @param {Partida} pa */
export function desfazerLance(pa) {
  const info = pa.feitos.pop();
  if (!info) return null;
  pa.pos.desfazer();
  pa.fim = '';
  return info;
}

/** Material de cada lado (para o placar das pecas comidas). @param {Partida} pa */
export function capturadas(pa) {
  /** @type {[number[], number[]]} pecas que cada lado PERDEU (tipos) */
  const perdidas = [[], []];
  for (const f of pa.feitos) if (f.capturada) perdidas[f.capturada >> 3].push(f.capturada & 7);
  return perdidas;
}
