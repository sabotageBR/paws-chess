// Sons do Paws Chess, sintetizados (src/som/receitas.js). Contrato: (v, t0, p) => duracao em s, sem sorteio.
// Pulinhos e pousos de brinquedo, as gags pastelao (splat, bonk, espirro, escorregao, galinha de borracha,
// agua, bolhas), xeque, festa, derrota e a interface.
import { tom, sopro } from './receitas.js';

/** @type {Record<string, (v: any, t0: number, p?: any) => number>} */
export const SONS = {
  pulo(v, t0) {
    return tom(v, t0, { f: 380, f2: 760, glide: 0.09, vol: 0.09, ataque: 0.004, queda: 0.1, tipo: 'triangle' }) - t0;
  },
  pouso(v, t0) {
    sopro(v, t0, { f: 400, f2: 180, q: 0.8, vol: 0.06, ataque: 0.001, queda: 0.06, filtro: 'lowpass' });
    return tom(v, t0, { f: 180, f2: 110, vol: 0.12, ataque: 0.002, queda: 0.08, tipo: 'sine' }) - t0;
  },
  selecionar(v, t0) {
    return tom(v, t0, { f: 660, f2: 880, glide: 0.05, vol: 0.07, ataque: 0.003, queda: 0.07, tipo: 'sine' }) - t0;
  },
  clique(v, t0) {
    return tom(v, t0, { f: 900, vol: 0.05, ataque: 0.002, queda: 0.04, tipo: 'triangle' }) - t0;
  },
  erro(v, t0) {
    return tom(v, t0, { f: 240, f2: 170, vol: 0.07, ataque: 0.004, queda: 0.14, tipo: 'square', filtro: { tipo: 'lowpass', f: 1400 } }) - t0;
  },
  preparo(v, t0) {
    return tom(v, t0, { f: 300, f2: 520, glide: 0.18, vol: 0.06, ataque: 0.02, queda: 0.1, tipo: 'sawtooth', filtro: { tipo: 'lowpass', f: 1200 } }) - t0;
  },
  voo(v, t0) {
    sopro(v, t0, { f: 900, f2: 2600, q: 2, vol: 0.07, ataque: 0.02, queda: 0.3 });
    // apito liso subindo (sem vibrato rapido: 18 Hz soava como "trrr" junto da captura)
    return tom(v, t0, { f: 700, f2: 1400, vol: 0.05, ataque: 0.01, queda: 0.3, tipo: 'sine' }) - t0;
  },
  poof(v, t0) {
    return sopro(v, t0, { f: 1500, f2: 400, q: 0.7, vol: 0.12, ataque: 0.003, queda: 0.22 }) - t0;
  },
  splat(v, t0) {
    sopro(v, t0, { f: 700, f2: 200, q: 1.2, vol: 0.22, ataque: 0.002, queda: 0.25, filtro: 'lowpass' });
    return tom(v, t0, { f: 160, f2: 70, vol: 0.18, ataque: 0.002, queda: 0.18, tipo: 'sine' }) - t0;
  },
  bonk(v, t0) {
    tom(v, t0, { f: 520, f2: 240, glide: 0.06, vol: 0.2, ataque: 0.001, queda: 0.16, tipo: 'square', filtro: { tipo: 'lowpass', f: 1800 } });
    // apito do martelinho de borracha, liso (o vibrato de 30 Hz zumbia como catraca)
    return tom(v, t0 + 0.02, { f: 1400, f2: 1900, glide: 0.12, vol: 0.08, ataque: 0.005, queda: 0.16, tipo: 'sine' }) - t0;
  },
  espirro(v, t0) {
    tom(v, t0, { f: 500, f2: 900, glide: 0.18, vol: 0.06, ataque: 0.05, segurar: 0.08, queda: 0.05, tipo: 'sine' });
    return sopro(v, t0 + 0.24, { f: 3200, f2: 800, q: 0.6, vol: 0.3, ataque: 0.003, queda: 0.3 }) - t0;
  },
  escorrega(v, t0) {
    return tom(v, t0, { f: 1200, f2: 300, glide: 0.35, vol: 0.12, ataque: 0.005, queda: 0.35, tipo: 'sine', vib: { f: 9, prof: 30 } }) - t0;
  },
  fofo(v, t0) {
    return sopro(v, t0, { f: 500, f2: 250, q: 0.5, vol: 0.2, ataque: 0.004, queda: 0.25, filtro: 'lowpass' }) - t0;
  },
  galinha(v, t0) {
    return tom(v, t0, { curva: [[0, 900], [0.06, 1600], [0.16, 1100], [0.3, 1500]], vol: 0.12, ataque: 0.004, segurar: 0.22, queda: 0.08, tipo: 'sawtooth', filtro: { tipo: 'bandpass', f: 1500, q: 3 } }) - t0;
  },
  agua(v, t0) {
    return sopro(v, t0, { f: 2400, f2: 600, q: 1.5, vol: 0.18, ataque: 0.01, segurar: 0.15, queda: 0.3 }) - t0;
  },
  bolhas(v, t0) {
    // uma bolha so, glide liso (4 blips a cada 70 ms soavam como catraca)
    return tom(v, t0, { f: 500, f2: 1300, glide: 0.22, vol: 0.07, ataque: 0.012, queda: 0.24, tipo: 'sine' }) - t0;
  },
  ploc(v, t0) {
    return tom(v, t0, { f: 1800, f2: 600, glide: 0.04, vol: 0.12, ataque: 0.001, queda: 0.06, tipo: 'sine' }) - t0;
  },
  promocao(v, t0) {
    // acorde unico (o arpejo de 60 em 60 ms soava como contagem de moedas)
    let fim = t0;
    [659, 784, 988, 1319].forEach((f) => { fim = tom(v, t0, { f, vol: 0.04, ataque: 0.02, queda: 0.5, tipo: 'triangle' }); });
    return fim - t0;
  },
  xeque(v, t0) {
    tom(v, t0, { f: 880, vol: 0.1, ataque: 0.003, queda: 0.12, tipo: 'square', filtro: { tipo: 'lowpass', f: 2400 } });
    return tom(v, t0 + 0.12, { f: 660, vol: 0.1, ataque: 0.003, queda: 0.2, tipo: 'square', filtro: { tipo: 'lowpass', f: 2400 } }) - t0;
  },
  fala(v, t0, p) {
    // "hm?" do bot: uma silaba lisa com altura pela especie (as 4 silabas de 75 em 75 ms
    // soavam como tique-tique junto da captura e do xeque)
    const base = p && p.cao ? 210 : 420;
    return tom(v, t0, { curva: [[0, base], [0.08, base * 1.25], [0.18, base * 1.05]], vol: 0.05, ataque: 0.02, segurar: 0.08, queda: 0.1, tipo: 'triangle', filtro: { tipo: 'lowpass', f: 1600 } }) - t0;
  },
  vitoria(v, t0) {
    let fim = t0;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { fim = tom(v, t0 + i * 0.1, { f, vol: 0.1, ataque: 0.005, queda: i === 5 ? 0.5 : 0.18, tipo: 'triangle' }); });
    return fim - t0;
  },
  derrota(v, t0) {
    let fim = t0;
    [392, 370, 349, 262].forEach((f, i) => { fim = tom(v, t0 + i * 0.22, { f, vol: 0.08, ataque: 0.01, queda: i === 3 ? 0.6 : 0.2, tipo: 'triangle', vib: i === 3 ? { f: 6, prof: 8 } : undefined }); });
    return fim - t0;
  },
  empate(v, t0) {
    tom(v, t0, { f: 523, vol: 0.08, ataque: 0.005, queda: 0.25, tipo: 'triangle' });
    return tom(v, t0 + 0.18, { f: 523, vol: 0.08, ataque: 0.005, queda: 0.35, tipo: 'triangle' }) - t0;
  },
  desbloqueio(v, t0) {
    // dois acordes calmos (o arpejo de 80 em 80 ms soava como contagem de pontos)
    let fim = t0;
    [784, 1175].forEach((f) => { tom(v, t0, { f, vol: 0.06, ataque: 0.01, queda: 0.35, tipo: 'sine' }); });
    [988, 1568].forEach((f) => { fim = tom(v, t0 + 0.2, { f, vol: 0.06, ataque: 0.01, queda: 0.5, tipo: 'sine' }); });
    sopro(v, t0, { f: 6000, f2: 9000, q: 3, vol: 0.03, ataque: 0.05, queda: 0.5 });
    return fim - t0;
  },
};
