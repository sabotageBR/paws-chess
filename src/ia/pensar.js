// O que a IA faz com um pedido (igual no Web Worker e no modo de reserva sem worker):
//   { tipo: 'bot', fen, lances, bot, semente, roteiro } -> { lance, nota, vacilou, abandona }
//   { tipo: 'dica', fen, lances, ms }                    -> { lance, nota }
//   { tipo: 'nota', fen, lances, ms }                    -> { nota } (do ponto de vista de quem tem a vez)

/**
 * @param {any} d pedido
 * @param {{ motor: any, agora: () => number, Posicao: any, BOTS: any[], escolherLance: Function, criarRng: Function }} k
 */
export function pensar(d, k) {
  const pos = k.Posicao.deFen(d.fen);
  for (const u of d.lances || []) {
    const m = pos.deUci(u);
    if (m < 0) throw new Error(`lance invalido ${u}`);
    pos.fazer(m);
  }
  if (d.tipo === 'bot') {
    const bot = k.BOTS[d.bot];
    const rng = k.criarRng((d.semente >>> 0) ^ (pos.histLo.length * 2654435761));
    const r = k.escolherLance(pos, bot, k.motor, rng, { semente: d.semente, agora: k.agora, roteiro: d.roteiro || null });
    if (!r) return { lance: '' };
    return { lance: pos.uci(r.lance), nota: r.nota, vacilou: r.vacilou, abandona: r.abandona };
  }
  const t0 = k.agora();
  const r = k.motor.buscar(pos, { agora: k.agora, prazo: t0 + (d.ms || 400), nos: d.nos || 3000000 });
  return { lance: r.lance ? pos.uci(r.lance) : '', nota: r.nota };
}
