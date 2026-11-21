// Web Worker da IA: recebe a partida (FEN inicial + lances em UCI, para a repeticao valer) e devolve o lance
// do bot ou a dica. O motor e o de src/jogo/ (puro); aqui fica o relogio (performance.now) do prazo.
import { Posicao } from '../jogo/xadrez.js';
import { criarMotor } from '../jogo/busca.js';
import { BOTS, escolherLance } from '../jogo/bots.js';
import { criarRng } from '../core/rng.js';
import { pensar } from './pensar.js';

const motor = criarMotor(18);
const agora = () => performance.now();

/** @param {MessageEvent} e */
self.onmessage = (e) => {
  const d = e.data || {};
  try {
    const r = pensar(d, { motor, agora, Posicao, BOTS, escolherLance, criarRng });
    self.postMessage({ id: d.id, ok: true, ...r });
  } catch (err) {
    self.postMessage({ id: d.id, ok: false, erro: String((err && err.message) || err) });
  }
};
