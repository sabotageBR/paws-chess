// Motor de xadrez puro (tabuleiro 0x88): posicao, FEN, geracao de lances, fazer/desfazer, xeque, fim de
// partida (mate, afogamento, 50 lances, repeticao tripla, material insuficiente) e perft.
// Sem DOM, sem relogio, sem Math.random (test/estilo.test.js). As chaves Zobrist saem do RNG com semente.
//
// Casas: sq = fileira * 16 + coluna (a1 = 0, h1 = 7, a8 = 112, h8 = 119); sq & 0x88 != 0 = fora.
// Pecas: 0 vazio; brancas 1..6 (peao, cavalo, bispo, torre, dama, rei); pretas 9..14 (8 + tipo).
// Lance (inteiro): de | para << 7 | promocao << 14 | bandeiras << 17.
import { criarRng } from '../core/rng.js';

export const BRANCO = 0;
export const PRETO = 1;
export const PEAO = 1;
export const CAVALO = 2;
export const BISPO = 3;
export const TORRE = 4;
export const DAMA = 5;
export const REI = 6;

export const F_CAPTURA = 1;
export const F_EP = 2;
export const F_ROQUE = 4;
export const F_DUPLO = 8;
export const F_PROMO = 16;

export const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const D_CAVALO = [33, 31, 18, 14, -33, -31, -18, -14];
const D_BISPO = [17, 15, -17, -15];
const D_TORRE = [16, 1, -16, -1];
const D_REI = [17, 15, -17, -15, 16, 1, -16, -1];

/** @param {number} de @param {number} para @param {number} promo @param {number} fl */
export const lance = (de, para, promo, fl) => de | (para << 7) | (promo << 14) | (fl << 17);
/** @param {number} m */
export const lDe = (m) => m & 127;
/** @param {number} m */
export const lPara = (m) => (m >> 7) & 127;
/** @param {number} m */
export const lPromo = (m) => (m >> 14) & 7;
/** @param {number} m */
export const lFl = (m) => m >> 17;

/** @param {number} p */
export const cor = (p) => p >> 3;
/** @param {number} p */
export const tipo = (p) => p & 7;
/** @param {number} sq */
export const fileira = (sq) => sq >> 4;
/** @param {number} sq */
export const coluna = (sq) => sq & 7;
/** @param {number} c @param {number} f */
export const casa = (c, f) => f * 16 + c;

/** 'e4' -> sq @param {string} s */
export const casaDeNome = (s) => casa(s.charCodeAt(0) - 97, s.charCodeAt(1) - 49);
/** sq -> 'e4' @param {number} sq */
export const nomeDaCasa = (sq) => String.fromCharCode(97 + coluna(sq)) + String.fromCharCode(49 + fileira(sq));

// ------------------------------------------------------------------ Zobrist (2 x 32 bits)
const Z = (() => {
  const r = criarRng(0x5eed1e55);
  const u = () => (r() * 4294967296) | 0;
  const pecaLo = new Int32Array(16 * 128);
  const pecaHi = new Int32Array(16 * 128);
  for (let i = 0; i < pecaLo.length; i++) { pecaLo[i] = u(); pecaHi[i] = u(); }
  const roqueLo = new Int32Array(16);
  const roqueHi = new Int32Array(16);
  for (let i = 0; i < 16; i++) { roqueLo[i] = u(); roqueHi[i] = u(); }
  const epLo = new Int32Array(8);
  const epHi = new Int32Array(8);
  for (let i = 0; i < 8; i++) { epLo[i] = u(); epHi[i] = u(); }
  return { pecaLo, pecaHi, roqueLo, roqueHi, epLo, epHi, ladoLo: u(), ladoHi: u() };
})();

/** mascara de direitos de roque por casa tocada (de ou para) */
const MASCARA_ROQUE = (() => {
  const m = new Int8Array(128).fill(15);
  m[casaDeNome('e1')] = 15 & ~3;
  m[casaDeNome('h1')] = 15 & ~1;
  m[casaDeNome('a1')] = 15 & ~2;
  m[casaDeNome('e8')] = 15 & ~12;
  m[casaDeNome('h8')] = 15 & ~4;
  m[casaDeNome('a8')] = 15 & ~8;
  return m;
})();

const LETRAS = ' pnbrqk';

export class Posicao {
  constructor() {
    this.b = new Int8Array(128);
    this.lado = BRANCO;
    /** bits: 1 = K branco, 2 = Q branco, 4 = k preto, 8 = q preto */
    this.roque = 0;
    this.ep = -1;
    this.meio = 0;
    this.num = 1;
    this.reis = [0, 0];
    this.hlo = 0;
    this.hhi = 0;
    /** pilha de desfazer: [lance, capturada, roque, ep, meio, hlo, hhi] por lance */
    this.pilha = /** @type {number[]} */ ([]);
    /** hashes (lo) de todas as posicoes da partida, para repeticao */
    this.histLo = /** @type {number[]} */ ([]);
    this.histHi = /** @type {number[]} */ ([]);
  }

  /** @param {string} fen */
  static deFen(fen) {
    const p = new Posicao();
    const [pecas, lado, roque, ep, meio, num] = fen.trim().split(/\s+/);
    let f = 7;
    let c = 0;
    for (const ch of pecas) {
      if (ch === '/') { f--; c = 0; continue; }
      if (ch >= '1' && ch <= '8') { c += Number(ch); continue; }
      const t = LETRAS.indexOf(ch.toLowerCase());
      if (t < 1) throw new Error(`FEN invalida: ${fen}`);
      const pc = (ch === ch.toLowerCase() ? 8 : 0) | t;
      p.b[casa(c, f)] = pc;
      if (t === REI) p.reis[cor(pc)] = casa(c, f);
      c++;
    }
    p.lado = lado === 'b' ? PRETO : BRANCO;
    p.roque = 0;
    if (roque && roque !== '-') {
      if (roque.includes('K')) p.roque |= 1;
      if (roque.includes('Q')) p.roque |= 2;
      if (roque.includes('k')) p.roque |= 4;
      if (roque.includes('q')) p.roque |= 8;
    }
    p.ep = ep && ep !== '-' ? casaDeNome(ep) : -1;
    if (p.ep >= 0 && !p.epPossivel(p.ep, p.lado)) p.ep = -1;
    p.meio = Number(meio) || 0;
    p.num = Number(num) || 1;
    p.recalcularHash();
    p.histLo = [p.hlo];
    p.histHi = [p.hhi];
    return p;
  }

  static inicial() { return Posicao.deFen(FEN_INICIAL); }

  clonar() {
    const p = new Posicao();
    p.b.set(this.b);
    p.lado = this.lado;
    p.roque = this.roque;
    p.ep = this.ep;
    p.meio = this.meio;
    p.num = this.num;
    p.reis = [this.reis[0], this.reis[1]];
    p.hlo = this.hlo;
    p.hhi = this.hhi;
    p.pilha = this.pilha.slice();
    p.histLo = this.histLo.slice();
    p.histHi = this.histHi.slice();
    return p;
  }

  fen() {
    let s = '';
    for (let f = 7; f >= 0; f--) {
      let vaz = 0;
      for (let c = 0; c < 8; c++) {
        const pc = this.b[casa(c, f)];
        if (!pc) { vaz++; continue; }
        if (vaz) { s += vaz; vaz = 0; }
        const l = LETRAS[tipo(pc)];
        s += cor(pc) ? l : l.toUpperCase();
      }
      if (vaz) s += vaz;
      if (f) s += '/';
    }
    let r = '';
    if (this.roque & 1) r += 'K';
    if (this.roque & 2) r += 'Q';
    if (this.roque & 4) r += 'k';
    if (this.roque & 8) r += 'q';
    return `${s} ${this.lado ? 'b' : 'w'} ${r || '-'} ${this.ep >= 0 ? nomeDaCasa(this.ep) : '-'} ${this.meio} ${this.num}`;
  }

  recalcularHash() {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const pc = this.b[sq];
      if (pc) { lo ^= Z.pecaLo[pc * 128 + sq]; hi ^= Z.pecaHi[pc * 128 + sq]; }
    }
    lo ^= Z.roqueLo[this.roque];
    hi ^= Z.roqueHi[this.roque];
    if (this.ep >= 0) { lo ^= Z.epLo[coluna(this.ep)]; hi ^= Z.epHi[coluna(this.ep)]; }
    if (this.lado) { lo ^= Z.ladoLo; hi ^= Z.ladoHi; }
    this.hlo = lo;
    this.hhi = hi;
  }

  /** ha peao do lado `quem` que pode capturar en passant na casa `ep`? @param {number} ep @param {number} quem */
  epPossivel(ep, quem) {
    const alvo = ep + (quem === BRANCO ? -16 : 16);
    const pp = (quem << 3) | PEAO;
    for (const d of [-1, 1]) {
      const s = alvo + d;
      if (!(s & 0x88) && this.b[s] === pp) return true;
    }
    return false;
  }

  /**
   * A casa `sq` e atacada por alguma peca da cor `por`?
   * @param {number} sq @param {number} por
   */
  atacada(sq, por) {
    const b = this.b;
    const o = por << 3;
    // peoes
    if (por === BRANCO) {
      let s = sq - 15;
      if (!(s & 0x88) && b[s] === 1) return true;
      s = sq - 17;
      if (!(s & 0x88) && b[s] === 1) return true;
    } else {
      let s = sq + 15;
      if (!(s & 0x88) && b[s] === 9) return true;
      s = sq + 17;
      if (!(s & 0x88) && b[s] === 9) return true;
    }
    const cav = o | CAVALO;
    for (let i = 0; i < 8; i++) {
      const s = sq + D_CAVALO[i];
      if (!(s & 0x88) && b[s] === cav) return true;
    }
    const rei = o | REI;
    for (let i = 0; i < 8; i++) {
      const s = sq + D_REI[i];
      if (!(s & 0x88) && b[s] === rei) return true;
    }
    const bis = o | BISPO;
    const tor = o | TORRE;
    const dam = o | DAMA;
    for (let i = 0; i < 4; i++) {
      const d = D_BISPO[i];
      let s = sq + d;
      while (!(s & 0x88)) {
        const pc = b[s];
        if (pc) { if (pc === bis || pc === dam) return true; break; }
        s += d;
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = D_TORRE[i];
      let s = sq + d;
      while (!(s & 0x88)) {
        const pc = b[s];
        if (pc) { if (pc === tor || pc === dam) return true; break; }
        s += d;
      }
    }
    return false;
  }

  emXeque() { return this.atacada(this.reis[this.lado], this.lado ^ 1); }

  /**
   * Lances pseudo-legais (o rei pode ficar em xeque; o roque ja confere as casas atacadas).
   * @param {number[]} out lista que recebe os lances (nao e limpa aqui)
   * @param {boolean} [soCapturas] so capturas e promocoes (quiescencia)
   */
  gerar(out, soCapturas = false) {
    const b = this.b;
    const lado = this.lado;
    const inimigo = lado ^ 1;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq];
      if (!pc || (pc >> 3) !== lado) continue;
      const t = pc & 7;
      if (t === PEAO) {
        const fr = lado === BRANCO ? 16 : -16;
        const fUlt = lado === BRANCO ? 6 : 1;
        const fIni = lado === BRANCO ? 1 : 6;
        const f = sq >> 4;
        const s1 = sq + fr;
        if (!(s1 & 0x88) && !b[s1]) {
          if (f === fUlt) {
            for (let pr = DAMA; pr >= CAVALO; pr--) out.push(lance(sq, s1, pr, F_PROMO));
          } else if (!soCapturas) {
            out.push(lance(sq, s1, 0, 0));
            const s2 = s1 + fr;
            if (f === fIni && !b[s2]) out.push(lance(sq, s2, 0, F_DUPLO));
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          const s = s1 + k;
          if (s & 0x88) continue;
          const alvo = b[s];
          if (alvo && (alvo >> 3) === inimigo) {
            if (f === fUlt) for (let pr = DAMA; pr >= CAVALO; pr--) out.push(lance(sq, s, pr, F_PROMO | F_CAPTURA));
            else out.push(lance(sq, s, 0, F_CAPTURA));
          } else if (s === this.ep) {
            out.push(lance(sq, s, 0, F_EP | F_CAPTURA));
          }
        }
        continue;
      }
      if (t === CAVALO || t === REI) {
        const ds = t === CAVALO ? D_CAVALO : D_REI;
        for (let i = 0; i < 8; i++) {
          const s = sq + ds[i];
          if (s & 0x88) continue;
          const alvo = b[s];
          if (!alvo) { if (!soCapturas) out.push(lance(sq, s, 0, 0)); }
          else if ((alvo >> 3) === inimigo) out.push(lance(sq, s, 0, F_CAPTURA));
        }
        if (t === REI && !soCapturas) this.gerarRoques(out, sq);
        continue;
      }
      const ds = t === BISPO ? D_BISPO : t === TORRE ? D_TORRE : D_REI;
      const n = ds.length;
      for (let i = 0; i < n; i++) {
        const d = ds[i];
        let s = sq + d;
        while (!(s & 0x88)) {
          const alvo = b[s];
          if (!alvo) { if (!soCapturas) out.push(lance(sq, s, 0, 0)); }
          else { if ((alvo >> 3) === inimigo) out.push(lance(sq, s, 0, F_CAPTURA)); break; }
          s += d;
        }
      }
    }
    return out;
  }

  /** @param {number[]} out @param {number} sq */
  gerarRoques(out, sq) {
    const b = this.b;
    const lado = this.lado;
    const inimigo = lado ^ 1;
    const base = lado === BRANCO ? 4 : 116;
    if (sq !== base) return;
    const kBit = lado === BRANCO ? 1 : 4;
    const qBit = lado === BRANCO ? 2 : 8;
    if (!(this.roque & (kBit | qBit))) return;
    if (this.atacada(sq, inimigo)) return;
    const torre = (lado << 3) | TORRE;
    if ((this.roque & kBit) && !b[sq + 1] && !b[sq + 2] && b[sq + 3] === torre
      && !this.atacada(sq + 1, inimigo) && !this.atacada(sq + 2, inimigo)) out.push(lance(sq, sq + 2, 0, F_ROQUE));
    if ((this.roque & qBit) && !b[sq - 1] && !b[sq - 2] && !b[sq - 3] && b[sq - 4] === torre
      && !this.atacada(sq - 1, inimigo) && !this.atacada(sq - 2, inimigo)) out.push(lance(sq, sq - 2, 0, F_ROQUE));
  }

  /**
   * Faz o lance. Devolve false (e desfaz) se deixar o proprio rei em xeque.
   * @param {number} m
   */
  fazer(m) {
    const b = this.b;
    const de = m & 127;
    const para = (m >> 7) & 127;
    const fl = m >> 17;
    const pc = b[de];
    const lado = this.lado;
    let lo = this.hlo;
    let hi = this.hhi;
    let cap = 0;
    this.pilha.push(m, 0, this.roque, this.ep, this.meio, lo, hi);
    const ip = this.pilha.length - 6;
    if (this.ep >= 0) { lo ^= Z.epLo[this.ep & 7]; hi ^= Z.epHi[this.ep & 7]; }
    lo ^= Z.roqueLo[this.roque];
    hi ^= Z.roqueHi[this.roque];
    if (fl & F_EP) {
      const sc = para + (lado === BRANCO ? -16 : 16);
      cap = b[sc];
      b[sc] = 0;
      lo ^= Z.pecaLo[cap * 128 + sc];
      hi ^= Z.pecaHi[cap * 128 + sc];
    } else if (fl & F_CAPTURA) {
      cap = b[para];
      lo ^= Z.pecaLo[cap * 128 + para];
      hi ^= Z.pecaHi[cap * 128 + para];
    }
    this.pilha[ip] = cap;
    b[para] = pc;
    b[de] = 0;
    lo ^= Z.pecaLo[pc * 128 + de] ^ Z.pecaLo[pc * 128 + para];
    hi ^= Z.pecaHi[pc * 128 + de] ^ Z.pecaHi[pc * 128 + para];
    if (fl & F_PROMO) {
      const np = (lado << 3) | ((m >> 14) & 7);
      b[para] = np;
      lo ^= Z.pecaLo[pc * 128 + para] ^ Z.pecaLo[np * 128 + para];
      hi ^= Z.pecaHi[pc * 128 + para] ^ Z.pecaHi[np * 128 + para];
    }
    if (fl & F_ROQUE) {
      const tor = (lado << 3) | TORRE;
      const tDe = para > de ? de + 3 : de - 4;
      const tPara = para > de ? de + 1 : de - 1;
      b[tDe] = 0;
      b[tPara] = tor;
      lo ^= Z.pecaLo[tor * 128 + tDe] ^ Z.pecaLo[tor * 128 + tPara];
      hi ^= Z.pecaHi[tor * 128 + tDe] ^ Z.pecaHi[tor * 128 + tPara];
    }
    if ((pc & 7) === REI) this.reis[lado] = para;
    this.roque &= MASCARA_ROQUE[de] & MASCARA_ROQUE[para];
    lo ^= Z.roqueLo[this.roque];
    hi ^= Z.roqueHi[this.roque];
    this.ep = -1;
    if (fl & F_DUPLO) {
      const e = (de + para) >> 1;
      if (this.epPossivel(e, lado ^ 1)) {
        this.ep = e;
        lo ^= Z.epLo[e & 7];
        hi ^= Z.epHi[e & 7];
      }
    }
    this.meio = (pc & 7) === PEAO || cap ? 0 : this.meio + 1;
    if (lado === PRETO) this.num++;
    this.lado = lado ^ 1;
    lo ^= Z.ladoLo;
    hi ^= Z.ladoHi;
    this.hlo = lo;
    this.hhi = hi;
    this.histLo.push(lo);
    this.histHi.push(hi);
    if (this.atacada(this.reis[lado], lado ^ 1)) {
      this.desfazer();
      return false;
    }
    return true;
  }

  desfazer() {
    const pl = this.pilha;
    const hi = pl.pop();
    const lo = pl.pop();
    const meio = pl.pop();
    const ep = pl.pop();
    const roque = pl.pop();
    const cap = pl.pop();
    const m = pl.pop();
    const b = this.b;
    const de = m & 127;
    const para = (m >> 7) & 127;
    const fl = m >> 17;
    const lado = this.lado ^ 1;
    this.histLo.pop();
    this.histHi.pop();
    let pc = b[para];
    if (fl & F_PROMO) pc = (lado << 3) | PEAO;
    b[de] = pc;
    b[para] = 0;
    if (fl & F_EP) b[para + (lado === BRANCO ? -16 : 16)] = cap;
    else if (cap) b[para] = cap;
    if (fl & F_ROQUE) {
      const tor = (lado << 3) | TORRE;
      const tDe = para > de ? de + 3 : de - 4;
      const tPara = para > de ? de + 1 : de - 1;
      b[tPara] = 0;
      b[tDe] = tor;
    }
    if ((pc & 7) === REI) this.reis[lado] = de;
    this.lado = lado;
    this.roque = roque;
    this.ep = ep;
    this.meio = meio;
    if (lado === PRETO) this.num--;
    this.hlo = lo;
    this.hhi = hi;
    return m;
  }

  /** lance nulo (passa a vez) para a busca; nunca com o rei em xeque */
  fazerNulo() {
    this.pilha.push(0, 0, this.roque, this.ep, this.meio, this.hlo, this.hhi);
    let lo = this.hlo;
    let hi = this.hhi;
    if (this.ep >= 0) { lo ^= Z.epLo[this.ep & 7]; hi ^= Z.epHi[this.ep & 7]; }
    this.ep = -1;
    this.meio++;
    this.lado ^= 1;
    lo ^= Z.ladoLo;
    hi ^= Z.ladoHi;
    this.hlo = lo;
    this.hhi = hi;
    this.histLo.push(lo);
    this.histHi.push(hi);
  }

  desfazerNulo() {
    const pl = this.pilha;
    this.hhi = pl.pop();
    this.hlo = pl.pop();
    this.meio = pl.pop();
    this.ep = pl.pop();
    this.roque = pl.pop();
    pl.pop();
    pl.pop();
    this.lado ^= 1;
    this.histLo.pop();
    this.histHi.pop();
  }

  /** lista dos lances legais */
  legais() {
    const ps = this.gerar([]);
    const out = [];
    for (const m of ps) if (this.fazer(m)) { this.desfazer(); out.push(m); }
    return out;
  }

  /** algum lance legal? (para no primeiro) */
  temLegal() {
    const ps = this.gerar([]);
    for (const m of ps) if (this.fazer(m)) { this.desfazer(); return true; }
    return false;
  }

  /** quantas vezes a posicao atual ja apareceu (desde o ultimo lance irreversivel) */
  repeticoes() {
    const n = this.histLo.length - 1;
    let k = 1;
    for (let i = n - 2; i >= 0 && i >= n - this.meio; i -= 2) {
      if (this.histLo[i] === this.hlo && this.histHi[i] === this.hhi) k++;
    }
    return k;
  }

  /** material insuficiente para qualquer mate (K x K, K+N x K, K+B x K, K+B x K+B em casas da mesma cor) */
  materialInsuficiente() {
    let menores = 0;
    let bispoCor = -1;
    let bisposMesmaCor = true;
    let bispos = 0;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const t = this.b[sq] & 7;
      if (!t || t === REI) continue;
      if (t === PEAO || t === TORRE || t === DAMA) return false;
      menores++;
      if (t === BISPO) {
        bispos++;
        const c = ((sq >> 4) + (sq & 7)) & 1;
        if (bispoCor < 0) bispoCor = c;
        else if (c !== bispoCor) bisposMesmaCor = false;
      }
    }
    if (menores <= 1) return true;
    return bispos === menores && bisposMesmaCor;
  }

  /**
   * Situacao da partida para quem tem a vez.
   * @returns {'jogando'|'mate'|'afogamento'|'cinquenta'|'repeticao'|'material'}
   */
  situacao() {
    if (!this.temLegal()) return this.emXeque() ? 'mate' : 'afogamento';
    if (this.materialInsuficiente()) return 'material';
    if (this.meio >= 100) return 'cinquenta';
    if (this.repeticoes() >= 3) return 'repeticao';
    return 'jogando';
  }

  /** @param {number} m */
  uci(m) {
    const pr = (m >> 14) & 7;
    return nomeDaCasa(m & 127) + nomeDaCasa((m >> 7) & 127) + (pr ? ' pnbrqk'[pr] : '');
  }

  /** lance legal a partir do texto UCI ('e2e4', 'e7e8q'); -1 se nao houver @param {string} s */
  deUci(s) {
    const de = casaDeNome(s.slice(0, 2));
    const para = casaDeNome(s.slice(2, 4));
    const pr = s.length > 4 ? ' pnbrqk'.indexOf(s[4]) : 0;
    for (const m of this.legais()) {
      if ((m & 127) === de && ((m >> 7) & 127) === para && ((m >> 14) & 7) === pr) return m;
    }
    return -1;
  }

  /** Notacao algebrica curta (SAN), para o historico e os testes. @param {number} m lance legal */
  san(m) {
    const de = m & 127;
    const para = (m >> 7) & 127;
    const fl = m >> 17;
    const t = this.b[de] & 7;
    let s;
    if (fl & F_ROQUE) s = para > de ? 'O-O' : 'O-O-O';
    else {
      const cap = (fl & F_CAPTURA) !== 0;
      if (t === PEAO) {
        s = (cap ? String.fromCharCode(97 + (de & 7)) + 'x' : '') + nomeDaCasa(para);
        if (fl & F_PROMO) s += '=' + 'PNBRQK'[((m >> 14) & 7) - 1];
      } else {
        let amb = '';
        const outros = this.legais().filter((o) => o !== m && ((o >> 7) & 127) === para && (this.b[o & 127] & 7) === t);
        if (outros.length) {
          const mesmaCol = outros.some((o) => ((o & 127) & 7) === (de & 7));
          const mesmaFil = outros.some((o) => ((o & 127) >> 4) === (de >> 4));
          if (!mesmaCol) amb = String.fromCharCode(97 + (de & 7));
          else if (!mesmaFil) amb = String.fromCharCode(49 + (de >> 4));
          else amb = nomeDaCasa(de);
        }
        s = 'PNBRQK'[t - 1] + amb + (cap ? 'x' : '') + nomeDaCasa(para);
      }
    }
    if (this.fazer(m)) {
      if (this.emXeque()) s += this.temLegal() ? '+' : '#';
      this.desfazer();
    }
    return s;
  }
}

/**
 * Perft: numero de folhas na profundidade d (teste do gerador).
 * @param {Posicao} p @param {number} d
 * @returns {number}
 */
export function perft(p, d) {
  if (d === 0) return 1;
  const ls = p.gerar([]);
  let n = 0;
  for (let i = 0; i < ls.length; i++) {
    if (!p.fazer(ls[i])) continue;
    n += d === 1 ? 1 : perft(p, d - 1);
    p.desfazer();
  }
  return n;
}
