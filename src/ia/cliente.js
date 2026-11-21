// Cliente da IA: manda os pedidos ao Web Worker (modulo) e devolve promessas. Sem worker (navegador antigo
// ou bloqueado), roda o mesmo `pensar` na thread principal com prazo menor, depois de um quadro.
import { pensar } from './pensar.js';

/**
 * @returns {{ pedir: (d: any) => Promise<any>, reiniciar: () => void }}
 */
export function criarIa() {
  /** @type {Worker|null} */
  let w = null;
  let id = 0;
  /** @type {Map<number, (r: any) => void>} */
  const espera = new Map();
  /** @type {any} */
  let local = null;

  function abrir() {
    try {
      w = new Worker(new URL('./trabalhador.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const r = e.data || {};
        const ok = espera.get(r.id);
        if (ok) { espera.delete(r.id); ok(r); }
      };
      w.onerror = () => {
        // worker quebrado: cai para o modo local e responde o que estava esperando
        w = null;
        for (const [, ok] of espera) ok({ ok: false, erro: 'worker' });
        espera.clear();
      };
    } catch {
      w = null;
    }
  }

  async function semWorker(d) {
    if (!local) {
      const [xadrez, busca, bots, rng] = await Promise.all([
        import('../jogo/xadrez.js'), import('../jogo/busca.js'), import('../jogo/bots.js'), import('../core/rng.js'),
      ]);
      local = { motor: busca.criarMotor(16), agora: () => performance.now(), Posicao: xadrez.Posicao,
        BOTS: bots.BOTS.map((b) => ({ ...b, nos: Math.min(b.nos || 200000, 200000), ms: 700 })),
        escolherLance: bots.escolherLance, criarRng: rng.criarRng };
    }
    await new Promise((r) => setTimeout(r, 30));
    try {
      return { ok: true, ...pensar({ ...d, ms: Math.min(d.ms || 400, 300) }, local) };
    } catch (err) {
      return { ok: false, erro: String(err) };
    }
  }

  abrir();
  return {
    pedir(d) {
      if (!w) return semWorker(d);
      const meu = ++id;
      return new Promise((ok) => {
        espera.set(meu, (r) => (r.ok || r.erro !== 'worker' ? ok(r) : semWorker(d).then(ok)));
        /** @type {Worker} */ (w).postMessage({ ...d, id: meu });
      });
    },
    /** cancela o que estava pensando (novo jogo, desfazer) */
    reiniciar() {
      if (w) { w.terminate(); w = null; }
      for (const [, ok] of espera) ok({ ok: false, cancelado: true });
      espera.clear();
      abrir();
    },
  };
}
