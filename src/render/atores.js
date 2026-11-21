// Atores do tabuleiro: cada peca vira um bichinho com pose (parado, salto, ataque, apanhando, vitoria),
// pulinho com squash-and-stretch, respiracao parada e as gags pastelao das capturas (torta, martelinho,
// espirro, casca de banana, travesseiro, galinha de borracha, balde d'agua, bolha de sabao).
// Tudo em coordenadas do mundo (1 = 1 casa), desenhado pela camera de cena.js, de tras para a frente.
import { casaNoMundo } from './cena.js';

/** px do sprite (reduzido) por casa: o rei gato ocupa ~0,9 casa de base */
const PX_POR_CASA = 150;
const TIPOS = ['', 'peao', 'cavalo', 'bispo', 'torre', 'dama', 'rei'];

/**
 * @typedef {Object} Ator
 * @property {number} id
 * @property {number} peca codigo da peca (cor << 3 | tipo)
 * @property {number} sq casa (0x88) ou -1 fora do tabuleiro
 * @property {number} x @property {number} y @property {number} z
 * @property {number} sx @property {number} sy @property {number} rot @property {number} alfa
 * @property {number} vira 1 ou -1 (espelha)
 * @property {string} pose
 * @property {number} fase fase da respiracao
 * @property {((dt: number) => boolean)|null} anim devolve true quando acaba
 * @property {boolean} saindo
 */

/**
 * @param {{ pecas: Record<string, HTMLImageElement>, gags: Record<string, HTMLImageElement> }} img
 * @param {{ som: (nome: string, p?: any) => void, vibrar: (ms: number) => void }} saida
 */
export function criarAtores(img, saida) {
  /** @type {Ator[]} */
  let atores = [];
  let proxId = 1;
  let girado = false;
  let t = 0;
  /** eventos agendados (pular executa todos) @type {{ em: number, fn: () => void }[]} */
  let agenda = [];
  /** @type {any[]} */
  let props = [];
  /** @type {any[]} */
  let part = [];
  /** @type {(() => void)[]} */
  let aoAcabar = [];
  let tremerTela = 0;

  const chave = (peca, pose) => `${peca >> 3 ? 'c' : 'g'}-${TIPOS[peca & 7]}-${pose}`;
  const sprite = (peca, pose) => img.pecas[chave(peca, pose)] || img.pecas[chave(peca, 'parado')];

  /** @param {number} peca @param {number} sq */
  function novoAtor(peca, sq) {
    const w = casaNoMundo(sq, girado);
    return /** @type {Ator} */ ({
      id: proxId++, peca, sq, x: w.x, y: 0, z: w.z, sx: 1, sy: 1, rot: 0, alfa: 1, vira: 1, pose: 'parado',
      fase: (sq * 0.73) % 6.28, anim: null, saindo: false,
    });
  }

  /** @param {number} ms @param {() => void} fn */
  const depois = (ms, fn) => agenda.push({ em: t + ms / 1000, fn });

  // ------------------------------------------------------------------ animacoes basicas
  /**
   * Pulo de uma casa a outra (squash, voo esticado, aterrissagem).
   * @param {Ator} a @param {{ x: number, z: number }} alvo @param {number} [alturaExtra]
   */
  function pular(a, alvo, alturaExtra = 0) {
    const x0 = a.x;
    const z0 = a.z;
    const dist = Math.hypot(alvo.x - x0, alvo.z - z0);
    const dur = Math.min(0.62, 0.3 + dist * 0.045);
    const alt = 0.55 + dist * 0.12 + alturaExtra;
    let u = 0;
    if (Math.abs(alvo.x - x0) > 0.05) a.vira = alvo.x < x0 ? -1 : 1;
    return new Promise((ok) => {
      a.anim = (dt) => {
        u = Math.min(1, u + dt / dur);
        if (u < 0.16) {
          const k = u / 0.16;
          a.sy = 1 - 0.2 * k;
          a.sx = 1 + 0.12 * k;
          a.pose = 'parado';
        } else if (u < 0.86) {
          const v = (u - 0.16) / 0.7;
          const e = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
          a.x = x0 + (alvo.x - x0) * e;
          a.z = z0 + (alvo.z - z0) * e;
          a.y = alt * Math.sin(Math.PI * v);
          a.sy = 1.1 - 0.1 * Math.abs(v - 0.5) * 2;
          a.sx = 0.94;
          a.pose = 'salto';
        } else {
          const k = (u - 0.86) / 0.14;
          a.x = alvo.x;
          a.z = alvo.z;
          a.y = 0;
          a.pose = 'parado';
          a.sy = 0.84 + 0.16 * k;
          a.sx = 1.1 - 0.1 * k;
        }
        if (u >= 1) {
          a.sx = 1;
          a.sy = 1;
          a.y = 0;
          a.pose = 'parado';
          ok(undefined);
          return true;
        }
        return false;
      };
    });
  }

  /** a vitima sai voando para fora do tabuleiro, girando @param {Ator} a @param {number} lado -1/1 */
  function voarFora(a, lado) {
    a.saindo = true;
    const x0 = a.x;
    const z0 = a.z;
    let u = 0;
    a.pose = 'apanhando';
    return new Promise((ok) => {
      a.anim = (dt) => {
        u = Math.min(1, u + dt / 0.62);
        a.x = x0 + lado * 5 * u;
        a.z = z0 + 1.5 * u;
        a.y = 3.2 * Math.sin(Math.PI * u * 0.85);
        a.rot = lado * u * 7;
        a.alfa = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        const k = 1 - 0.4 * u;
        a.sx = k;
        a.sy = k;
        if (u >= 1) {
          atores = atores.filter((o) => o !== a);
          ok(undefined);
          return true;
        }
        return false;
      };
    });
  }

  /** tremidinha (xeque, preparacao) @param {Ator} a @param {number} dur */
  function tremer(a, dur, forca = 0.06) {
    let u = 0;
    const x0 = a.x;
    a.anim = (dt) => {
      u += dt;
      a.x = x0 + Math.sin(u * 60) * forca * (1 - u / dur);
      if (u >= dur) { a.x = x0; return true; }
      return false;
    };
  }

  // ------------------------------------------------------------------ particulas e aderecos
  /** @param {number} x @param {number} y @param {number} z @param {number} n @param {any} o */
  function espirrar(x, y, z, n, o) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.6;
      const vel = (o.vel || 2.5) * (0.5 + ((i * 7919) % 100) / 200);
      part.push({
        x, y, z, vx: Math.cos(ang) * vel, vy: (o.vy ?? 2) + ((i * 31) % 10) / 6, vz: Math.sin(ang) * vel * 0.6,
        g: o.g ?? 7, cor: o.cores[i % o.cores.length], tam: o.tam || 0.08, vida: o.vida || 0.7, v0: o.vida || 0.7, forma: o.forma || 'bola',
      });
    }
  }

  /** @param {string} nome @param {any} o */
  function adereco(nome, o) {
    const p = { img: img.gags[nome] || null, nome, x: 0, y: 0, z: 0, rot: 0, esc: 1, alfa: 1, vida: 9, desenho: null, ...o };
    props.push(p);
    return p;
  }

  /** anel de estrelinhas sobre a cabeca @param {Ator} a @param {number} dur */
  function estrelas(a, dur) {
    adereco('estrelas', { desenho: 'estrelas', x: a.x, y: 1.25, z: a.z, vida: dur });
  }

  // ------------------------------------------------------------------ gags
  /**
   * Roteiro de cada gag. Recebe atacante e vitima; agenda eventos; devolve a duracao (ms) ate a vitima voar.
   * @type {Record<string, (at: Ator, vi: Ator) => number>}
   */
  const GAGS = {
    torta(at, vi) {
      const p = adereco('torta', { x: at.x, y: 0.9, z: at.z, esc: 0.55, vida: 1.2 });
      let u = 0;
      p.upd = (dt) => {
        if (u >= 1) { p.esc += dt * 0.5; p.alfa = Math.max(0, p.alfa - dt * 2.2); return; }
        u = Math.min(1, u + dt / 0.32);
        p.x = at.x + (vi.x - at.x) * u;
        p.z = at.z + (vi.z - at.z) * u - 0.05;
        p.y = 0.9 + Math.sin(Math.PI * u) * 0.7;
        p.rot += dt * 9;
        if (u >= 1) {
          p.rot = 0;
          p.y = 0.85;
          saida.som('splat');
          espirrar(vi.x, 0.9, vi.z, 22, { cores: ['#fff8e6', '#ffe9a8', '#f4d58d'], vel: 2.4, vy: 2.2, tam: 0.09 });
          vi.pose = 'apanhando';
        }
      };
      return 520;
    },
    martelo(at, vi) {
      const p = adereco('martelo', { x: vi.x - 0.35, y: 1.7, z: vi.z, esc: 0.62, rot: -1.6, vida: 1.0 });
      let u = 0;
      p.upd = (dt) => {
        u += dt;
        if (u < 0.22) p.rot = -1.6 + Math.sin(u * 20) * 0.08;
        else if (u < 0.36) p.rot = -1.6 + ((u - 0.22) / 0.14) * 2.0;
        else { p.rot = 0.4; p.alfa = Math.max(0, p.alfa - dt * 2.5); }
      };
      depois(360, () => {
        saida.som('bonk');
        saida.vibrar(20);
        vi.pose = 'apanhando';
        vi.sy = 0.62;
        vi.sx = 1.25;
        adereco('pow', { x: vi.x, y: 1.1, z: vi.z - 0.1, esc: 0.5, vida: 0.35, upd(dt) { this.esc += dt * 1.2; this.alfa = Math.max(0, this.alfa - dt * 3); } });
        estrelas(vi, 0.9);
        tremerTela = 0.18;
      });
      return 640;
    },
    espirro(at, vi) {
      const p = adereco('pimenta', { x: vi.x + 0.1, y: 1.75, z: vi.z, esc: 0.45, rot: 2.6, vida: 0.9 });
      let u = 0;
      p.upd = (dt) => {
        u += dt;
        p.rot = 2.6 + Math.sin(u * 30) * 0.35;
        if (u < 0.4 && Math.floor(u * 30) !== Math.floor((u - dt) * 30)) {
          part.push({ x: p.x + Math.sin(u * 50) * 0.08, y: 1.5, z: p.z, vx: 0, vy: -0.5, vz: 0, g: 4, cor: '#3b2f2f', tam: 0.03, vida: 0.5, v0: 0.5, forma: 'bola' });
        }
        if (u > 0.45) p.alfa = Math.max(0, p.alfa - dt * 3);
      };
      depois(250, () => { vi.sy = 1.12; vi.sx = 0.92; });
      depois(560, () => {
        saida.som('espirro');
        vi.pose = 'apanhando';
        vi.sy = 0.8;
        vi.sx = 1.15;
        espirrar(vi.x, 0.95, vi.z - 0.1, 26, { cores: ['#ffffff', '#e8f6ff', '#d6ecff'], vel: 3.2, vy: 0.8, g: 1.5, tam: 0.13, vida: 0.8, forma: 'nuvem' });
      });
      return 720;
    },
    banana(at, vi) {
      const p = adereco('banana', { x: at.x, y: 0.05, z: at.z - 0.1, esc: 0.4, vida: 1.2 });
      let u = 0;
      p.upd = (dt) => {
        u = Math.min(1, u + dt / 0.38);
        p.x = at.x + (vi.x - at.x) * u;
        p.z = at.z + (vi.z - at.z) * u - 0.1;
        p.rot = u * 6.28;
        if (u >= 1) p.alfa = Math.max(0, p.alfa - dt * 2);
      };
      depois(380, () => {
        saida.som('escorrega');
        vi.pose = 'apanhando';
        let k = 0;
        const lado = at.x <= vi.x ? 1 : -1;
        vi.anim = (dt) => { k = Math.min(1, k + dt / 0.22); vi.rot = lado * k * 1.4; vi.y = Math.sin(Math.PI * k) * 0.5; return k >= 1; };
      });
      return 620;
    },
    travesseiro(at, vi) {
      const p = adereco('travesseiro', { x: vi.x - 0.45, y: 1.2, z: vi.z - 0.05, esc: 0.42, rot: -1.2, vida: 0.9 });
      let u = 0;
      p.upd = (dt) => {
        u += dt;
        p.rot = u < 0.3 ? -1.2 + (u / 0.3) * 1.6 : 0.4;
        if (u > 0.4) p.alfa = Math.max(0, p.alfa - dt * 3);
      };
      depois(300, () => {
        saida.som('fofo');
        vi.pose = 'apanhando';
        espirrar(vi.x, 1.0, vi.z, 18, { cores: ['#ffffff', '#f3efe6'], vel: 1.6, vy: 1.6, g: 0.9, tam: 0.07, vida: 1.1, forma: 'pena' });
      });
      return 600;
    },
    galinha(at, vi) {
      const p = adereco('galinha', { x: vi.x - 0.3, y: 1.6, z: vi.z, esc: 0.5, rot: -1.0, vida: 0.9 });
      let u = 0;
      p.upd = (dt) => {
        u += dt;
        p.rot = u < 0.28 ? -1.0 + Math.sin(u * 22) * 0.15 : u < 0.4 ? -1.0 + ((u - 0.28) / 0.12) * 1.5 : 0.5;
        if (u > 0.5) p.alfa = Math.max(0, p.alfa - dt * 3);
      };
      depois(400, () => {
        saida.som('galinha');
        vi.pose = 'apanhando';
        vi.sy = 0.7;
        vi.sx = 1.2;
        estrelas(vi, 0.7);
      });
      return 640;
    },
    balde(at, vi) {
      const p = adereco('balde', { x: vi.x + 0.25, y: 1.8, z: vi.z, esc: 0.45, rot: 0, vida: 1.0 });
      let u = 0;
      p.upd = (dt) => {
        u += dt;
        p.rot = Math.min(2.4, u * 6);
        if (u > 0.18 && u < 0.55) {
          for (let i = 0; i < 3; i++) part.push({ x: vi.x + (Math.sin(u * 97 + i) * 0.25), y: 1.55, z: vi.z, vx: Math.sin(u * 13 + i) * 0.4, vy: -1, vz: 0, g: 9, cor: i % 2 ? '#5fc8ff' : '#a8e4ff', tam: 0.07, vida: 0.45, v0: 0.45, forma: 'gota' });
        }
        if (u > 0.6) p.alfa = Math.max(0, p.alfa - dt * 3);
      };
      depois(260, () => { saida.som('agua'); vi.pose = 'apanhando'; vi.sy = 0.9; });
      return 700;
    },
    bolha(at, vi) {
      const p = adereco('bolha', { desenho: 'bolha', x: vi.x, y: 0.55, z: vi.z, esc: 0.1, vida: 1.4 });
      let u = 0;
      p.upd = (dt) => {
        u += dt;
        p.esc = Math.min(1, 0.1 + u * 3);
        if (u > 0.45) { p.y += dt * 2.2; vi.y = p.y - 0.55; vi.rot = Math.sin(u * 6) * 0.3; }
        if (u > 1.0 && !p.estourou) { p.estourou = true; p.alfa = 0; saida.som('ploc'); espirrar(p.x, p.y, p.z, 14, { cores: ['#bfefff', '#ffd6f5', '#ffffff'], vel: 2, vy: 0.5, g: 0, tam: 0.05, vida: 0.4 }); }
      };
      depois(200, () => { saida.som('bolhas'); vi.pose = 'apanhando'; });
      return 1000;
    },
  };

  // ------------------------------------------------------------------ API
  return {
    /** reconstroi os atores a partir da posicao (sem animacao) @param {import('../jogo/xadrez.js').Posicao} pos @param {boolean} gir */
    sincronizar(pos, gir) {
      girado = gir;
      atores = [];
      agenda = [];
      props = [];
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        if (pos.b[sq]) atores.push(novoAtor(pos.b[sq], sq));
      }
    },
    /** @param {number} sq */
    atorEm(sq) { return atores.find((a) => a.sq === sq && !a.saindo) || null; },
    get ocupado() { return atores.some((a) => a.anim) || agenda.length > 0; },

    /**
     * Anima um lance ja jogado na logica.
     * @param {import('../jogo/partida.js').InfoLance} info
     * @param {{ gag?: string|null }} [o] gag da captura (null = captura simples)
     * @returns {Promise<void>}
     */
    async mover(info, o = {}) {
      const at = this.atorEm(info.de);
      if (!at) return;
      const alvo = casaNoMundo(info.para, girado);
      const vi = info.capturada ? this.atorEm(info.casaCaptura) : null;
      at.sq = info.para;
      const extra = (info.peca & 7) === 2 ? 0.45 : 0;
      if (vi && o.gag && GAGS[o.gag]) {
        vi.sq = -1;
        vi.saindo = true;
        at.pose = 'ataque';
        at.vira = vi.x < at.x ? -1 : 1;
        tremer(at, 0.22, 0.04);
        saida.som('preparo');
        const ms = GAGS[o.gag](at, vi);
        const lado = vi.x < 0 ? -1 : 1;
        await new Promise((ok) => depois(ms, () => {
          saida.som('voo');
          voarFora(vi, lado);
          at.pose = 'parado';
          pular(at, alvo, extra).then(() => { saida.som('pouso'); ok(undefined); });
        }));
      } else {
        saida.som('pulo');
        if (vi) { vi.sq = -1; vi.saindo = true; }
        const pulo = pular(at, alvo, extra);
        if (vi) {
          await new Promise((ok) => depois(240, () => {
            saida.som('poof');
            espirrar(vi.x, 0.5, vi.z, 12, { cores: ['#ffffff', '#ddd6ff'], vel: 1.8, vy: 1, g: 1, tam: 0.12, vida: 0.5, forma: 'nuvem' });
            voarFora(vi, vi.x < 0 ? -1 : 1);
            ok(undefined);
          }));
        }
        await pulo;
        saida.som('pouso');
      }
      if (info.roque) {
        const torre = this.atorEm(info.roque.de);
        if (torre) {
          torre.sq = info.roque.para;
          saida.som('pulo');
          await pular(torre, casaNoMundo(info.roque.para, girado), 0.3);
          saida.som('pouso');
        }
      }
      if (info.promocao) {
        at.peca = (info.lado << 3) | info.promocao;
        saida.som('promocao');
        espirrar(at.x, 0.8, at.z, 24, { cores: ['#ffd23f', '#fff1a8', '#ffffff'], vel: 2.2, vy: 2.5, tam: 0.07, vida: 0.8, forma: 'estrela' });
        at.sy = 1.3;
        at.sx = 0.8;
        let k = 0;
        at.anim = (dt) => { k = Math.min(1, k + dt / 0.3); at.sy = 1.3 - 0.3 * k; at.sx = 0.8 + 0.2 * k; return k >= 1; };
      }
      at.vira = 1;
    },

    /** pula todas as animacoes para o fim (toque do jogador) */
    pularTudo() {
      for (let i = 0; i < 40 && (agenda.length || atores.some((a) => a.anim)); i++) {
        const ag = agenda;
        agenda = [];
        for (const e of ag) e.fn();
        for (const a of [...atores]) {
          for (let k = 0; k < 200 && a.anim; k++) if (a.anim(0.05)) a.anim = null;
        }
      }
      props = [];
      part = [];
    },

    /** xeque: o rei treme e sua frio @param {number} sq */
    xeque(sq) {
      const a = this.atorEm(sq);
      if (!a || a.anim) return;
      tremer(a, 0.5, 0.07);
      espirrar(a.x, 1.2, a.z, 6, { cores: ['#7fd0ff'], vel: 1, vy: 1.5, g: 5, tam: 0.05, vida: 0.5, forma: 'gota' });
    },

    /**
     * Fim de partida: o time vencedor dança, o rei perdedor cai (mate). cor -1 = empate.
     * @param {number} cor @param {boolean} mate
     */
    festa(cor, mate) {
      for (const a of atores) {
        if (a.saindo) continue;
        const c = a.peca >> 3;
        if (cor < 0) { a.pose = 'parado'; continue; }
        if (c === cor) {
          a.pose = 'vitoria';
          let u = (a.fase % 1) * -0.6;
          a.anim = (dt) => { u += dt; if (u > 0) a.y = Math.abs(Math.sin(u * 7)) * 0.25; if (u > 2.6) { a.y = 0; return true; } return false; };
        } else if (mate && (a.peca & 7) === 6) {
          a.pose = 'apanhando';
          let k = 0;
          a.anim = (dt) => { k = Math.min(1, k + dt / 0.5); a.rot = -k * 1.45; return k >= 1; };
          estrelas(a, 2.5);
        } else a.pose = 'apanhando';
      }
    },

    /** volta todos para a pose parada (nova partida/desfazer) */
    descansar() { for (const a of atores) { a.pose = 'parado'; a.rot = 0; a.y = 0; } },

    /** @param {number} dt */
    passo(dt) {
      t += dt;
      const ag = agenda.filter((e) => e.em <= t);
      if (ag.length) {
        agenda = agenda.filter((e) => e.em > t);
        for (const e of ag) e.fn();
      }
      for (const a of atores) if (a.anim && a.anim(dt)) a.anim = null;
      for (const p of props) { p.vida -= dt; if (p.upd) p.upd.call(p, dt); }
      props = props.filter((p) => p.vida > 0 && p.alfa > 0.01);
      for (const p of part) {
        p.vida -= dt;
        p.vy -= p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      }
      part = part.filter((p) => p.vida > 0);
      if (tremerTela > 0) tremerTela = Math.max(0, tremerTela - dt);
      if (!atores.some((a) => a.anim) && !agenda.length && aoAcabar.length) {
        const fs = aoAcabar;
        aoAcabar = [];
        for (const f of fs) f();
      }
    },

    /** deslocamento da tela (tremor do martelo) */
    get tremor() { return tremerTela > 0 ? Math.sin(t * 90) * tremerTela * 30 : 0; },

    /**
     * @param {CanvasRenderingContext2D} g @param {import('./cena.js').Camera} cam
     * @param {{ selecionado?: number, arrastando?: { sq: number, x: number, z: number }|null, respirar?: boolean }} o
     */
    desenhar(g, cam, o = {}) {
      const lista = atores.map((a) => {
        let x = a.x;
        let z = a.z;
        let y = a.y;
        if (o.arrastando && o.arrastando.sq === a.sq && !a.anim) { x = o.arrastando.x; z = o.arrastando.z; y = 0.35; }
        else if (o.selecionado === a.sq && !a.anim) y += 0.12 + Math.abs(Math.sin(t * 5)) * 0.08;
        return { a, x, y, z };
      });
      lista.sort((p, q) => q.z - p.z || p.x - q.x);
      // sombras primeiro
      for (const { a, x, z, y } of lista) {
        const p = cam.projetar(x, 0, z - 0.12);
        const r = 0.36 * p.s * (1 - Math.min(0.5, y * 0.25));
        g.globalAlpha = 0.32 * a.alfa;
        g.fillStyle = '#000';
        g.beginPath();
        g.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      for (const { a, x, y, z } of lista) {
        const im = sprite(a.peca, a.pose);
        if (!im || !im.complete || !im.naturalWidth) continue;
        const p = cam.projetar(x, y, z - 0.16);
        let sx = a.sx;
        let sy = a.sy;
        if (o.respirar !== false && !a.anim && a.pose === 'parado') {
          const b = Math.sin(t * 2.3 + a.fase);
          sy *= 1 + 0.018 * b;
          sx *= 1 - 0.01 * b;
        }
        const w = (im.naturalWidth / PX_POR_CASA) * p.s;
        const h = (im.naturalHeight / PX_POR_CASA) * p.s;
        g.save();
        g.globalAlpha = a.alfa;
        g.translate(p.x, p.y);
        if (a.rot) g.rotate(a.rot);
        g.scale(sx * a.vira, sy);
        // salto dos caes vem sem base: desenha a base do time por baixo
        if (a.pose === 'salto' && a.peca >> 3) {
          g.fillStyle = '#b8322c';
          g.beginPath();
          g.ellipse(0, -0.05 * p.s, 0.36 * p.s, 0.12 * p.s, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#e04a3f';
          g.beginPath();
          g.ellipse(0, -0.1 * p.s, 0.36 * p.s, 0.12 * p.s, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.drawImage(im, -w / 2, -h, w, h);
        g.restore();
      }
      // aderecos e particulas por cima
      for (const pr of props) {
        const p = cam.projetar(pr.x, pr.y, pr.z);
        g.save();
        g.globalAlpha = Math.max(0, Math.min(1, pr.alfa));
        g.translate(p.x, p.y);
        if (pr.desenho === 'estrelas') {
          for (let i = 0; i < 5; i++) {
            const ang = t * 5 + (i / 5) * Math.PI * 2;
            estrela(g, Math.cos(ang) * 0.32 * p.s, Math.sin(ang) * 0.1 * p.s, 0.08 * p.s, '#ffd23f');
          }
        } else if (pr.desenho === 'bolha') {
          const r = 0.55 * p.s * pr.esc;
          const gr = g.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.55)');
          gr.addColorStop(0.7, 'rgba(180,230,255,0.18)');
          gr.addColorStop(1, 'rgba(255,190,240,0.5)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(0, -r * 0.6, r, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 2;
          g.stroke();
        } else if (pr.img && pr.img.naturalWidth) {
          if (pr.rot) g.rotate(pr.rot);
          const w = (pr.img.naturalWidth / PX_POR_CASA) * p.s * pr.esc * 2;
          const h = (pr.img.naturalHeight / PX_POR_CASA) * p.s * pr.esc * 2;
          g.drawImage(pr.img, -w / 2, -h / 2, w, h);
        }
        g.restore();
      }
      for (const pa of part) {
        const p = cam.projetar(pa.x, pa.y, pa.z);
        const r = Math.max(1, pa.tam * p.s);
        g.globalAlpha = Math.max(0, Math.min(1, pa.vida / pa.v0 * 1.5));
        g.fillStyle = pa.cor;
        if (pa.forma === 'estrela') estrela(g, p.x, p.y, r * 1.4, pa.cor);
        else if (pa.forma === 'pena') { g.beginPath(); g.ellipse(p.x, p.y, r * 1.6, r * 0.6, pa.vida * 4, 0, Math.PI * 2); g.fill(); }
        else if (pa.forma === 'gota') { g.beginPath(); g.ellipse(p.x, p.y, r * 0.7, r * 1.2, 0, 0, Math.PI * 2); g.fill(); }
        else { g.beginPath(); g.arc(p.x, p.y, pa.forma === 'nuvem' ? r * (2 - pa.vida / pa.v0) : r, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
    },

    /** chama fn quando todas as animacoes acabarem @param {() => void} fn */
    quandoParar(fn) { aoAcabar.push(fn); },
  };
}

/** @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} r @param {string} cor */
function estrela(g, x, y, r, cor) {
  g.fillStyle = cor;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
