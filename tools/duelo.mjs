// Partida bot contra bot (testes, calibracao e gerador de puzzles). Deterministica pela semente.
import { Posicao, FEN_INICIAL } from '../src/jogo/xadrez.js';
import { criarMotor } from '../src/jogo/busca.js';
import { escolherLance } from '../src/jogo/bots.js';
import { avaliar } from '../src/jogo/avaliacao.js';
import { criarRng } from '../src/core/rng.js';

/**
 * @param {import('../src/jogo/bots.js').Bot} brancas
 * @param {import('../src/jogo/bots.js').Bot} pretas
 * @param {{ semente?: number, maxLances?: number, fen?: string, aoLance?: (pos: Posicao) => void, escala?: number }} [o]
 *   escala: multiplica o orcamento de nos dos bots (testes rapidos)
 * @returns {{ resultado: number, motivo: string, lances: number }} resultado: 1 brancas, 0.5 empate, 0 pretas
 */
export function duelo(brancas, pretas, o = {}) {
  const pos = Posicao.deFen(o.fen || FEN_INICIAL);
  const motores = [criarMotor(16), criarMotor(16)];
  const rng = criarRng(o.semente ?? 1);
  const escala = o.escala ?? 1;
  const bots = [brancas, pretas].map((b) => ({ ...b, nos: b.nos ? Math.max(500, Math.round(b.nos * escala)) : b.nos, ms: undefined }));
  const max = o.maxLances ?? 200;
  for (let ply = 0; ply < max; ply++) {
    const sit = pos.situacao();
    if (sit === 'mate') return { resultado: pos.lado === 0 ? 0 : 1, motivo: 'mate', lances: ply };
    if (sit !== 'jogando') return { resultado: 0.5, motivo: sit, lances: ply };
    const bot = bots[pos.lado];
    const r = escolherLance(pos, bot, motores[pos.lado], rng, { semente: (o.semente ?? 1) * 7 + pos.lado });
    if (!r) break;
    if (r.abandona) return { resultado: pos.lado === 0 ? 0 : 1, motivo: 'abandono', lances: ply };
    pos.fazer(r.lance);
    if (o.aoLance) o.aoLance(pos);
  }
  // limite: decide pelo material/avaliacao (vantagem clara) ou empate
  const ev = avaliar(pos) * (pos.lado === 0 ? 1 : -1);
  if (ev > 250) return { resultado: 1, motivo: 'limite', lances: max };
  if (ev < -250) return { resultado: 0, motivo: 'limite', lances: max };
  return { resultado: 0.5, motivo: 'limite', lances: max };
}

/**
 * Mini-match com cores alternadas. Devolve os pontos do bot A.
 * @param {import('../src/jogo/bots.js').Bot} a @param {import('../src/jogo/bots.js').Bot} b
 * @param {number} jogos @param {{ semente?: number, escala?: number, maxLances?: number }} [o]
 */
export function match(a, b, jogos, o = {}) {
  let pontos = 0;
  const detalhes = [];
  for (let j = 0; j < jogos; j++) {
    const semente = (o.semente ?? 1) * 1000 + j;
    const aBrancas = j % 2 === 0;
    const r = aBrancas ? duelo(a, b, { ...o, semente }) : duelo(b, a, { ...o, semente });
    const p = aBrancas ? r.resultado : 1 - r.resultado;
    pontos += p;
    detalhes.push({ p, motivo: r.motivo, lances: r.lances });
  }
  return { pontos, jogos, detalhes };
}
