// Camera 2.5D do tabuleiro: perspectiva de verdade (camera atras dos gatos, olhando para baixo), sem rolar
// nem guinar, entao toda linha de mesma profundidade vira uma linha horizontal na tela com escala unica:
// o tabuleiro texturizado e desenhado em faixas finas (drawImage por faixa, sem distorcao), guardado num
// cache e redesenhado so quando muda o tamanho, o tema ou o lado.
// Mundo: 1 unidade = 1 casa; tabuleiro em x, z de -4 a 4 (z cresce para longe da camera); y para cima.

const BORDA = 0.55;
const ESPESSURA = 0.32;

/**
 * @typedef {Object} Camera
 * @property {(x: number, y: number, z: number) => { x: number, y: number, s: number }} projetar s = px por unidade
 * @property {(sx: number, sy: number) => { x: number, z: number }|null} noChao ponto da tela -> chao (y = 0)
 * @property {{ x: number, y: number, w: number, h: number }} caixa
 */

/**
 * @param {{ x: number, y: number, w: number, h: number }} area onde o tabuleiro deve caber (px CSS)
 * @param {number} [inclinacao] altura da camera (mais alto = mais de cima)
 * @returns {Camera}
 */
export function criarCamera(area, inclinacao = 1) {
  const C = { x: 0, y: 10.5 * inclinacao, z: -10.5 };
  const T = { x: 0, y: 0, z: 0.9 };
  let fx = T.x - C.x;
  let fy = T.y - C.y;
  let fz = T.z - C.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl; fy /= fl; fz /= fl;
  // direita = (1, 0, 0); cima = direita x frente
  const ux = 0;
  const uy = fz;
  const uz = -fy;
  let F = 1;
  let cx = 0;
  let cy = 0;
  /** @param {number} x @param {number} y @param {number} z */
  const bruto = (x, y, z) => {
    const vx = x - C.x;
    const vy = y - C.y;
    const vz = z - C.z;
    const zc = vx * fx + vy * fy + vz * fz;
    const xc = vx;
    const yc = vx * ux + vy * uy + vz * uz;
    return { x: xc / zc, y: -yc / zc, s: 1 / zc };
  };
  // encaixe: cantos com a borda e o topo das pecas da ultima fileira
  const pts = [];
  for (const x of [-4 - BORDA, 4 + BORDA]) {
    for (const z of [-4 - BORDA, 4 + BORDA]) pts.push(bruto(x, 0, z));
    pts.push(bruto(x, -ESPESSURA, -4 - BORDA));
    pts.push(bruto(x, 1.55, 3.5));
  }
  const x0 = Math.min(...pts.map((p) => p.x));
  const x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y));
  const y1 = Math.max(...pts.map((p) => p.y));
  F = Math.min(area.w / (x1 - x0), area.h / (y1 - y0));
  cx = area.x + area.w / 2 - ((x0 + x1) / 2) * F;
  cy = area.y + area.h / 2 - ((y0 + y1) / 2) * F;
  const caixa = { x: cx + x0 * F, y: cy + y0 * F, w: (x1 - x0) * F, h: (y1 - y0) * F };
  return {
    caixa,
    projetar(x, y, z) {
      const p = bruto(x, y, z);
      return { x: cx + p.x * F, y: cy + p.y * F, s: p.s * F };
    },
    noChao(sx, sy) {
      // raio da camera pelo ponto da tela: d = frente + direita * a + cima * b
      const a = (sx - cx) / F;
      const b = -(sy - cy) / F;
      const dx = fx + a;
      const dy = fy + b * uy;
      const dz = fz + b * uz;
      if (dy >= 0) return null;
      const t = -C.y / dy;
      return { x: C.x + dx * t, z: C.z + dz * t };
    },
  };
}

/** centro da casa no mundo @param {number} sq 0x88 @param {boolean} girado */
export function casaNoMundo(sq, girado) {
  const c = sq & 7;
  const f = sq >> 4;
  return girado ? { x: 3.5 - c, z: 3.5 - f } : { x: c - 3.5, z: f - 3.5 };
}

/** casa sob um ponto do chao (-1 fora) @param {number} x @param {number} z @param {boolean} girado */
export function casaDoMundo(x, z, girado) {
  let c = Math.floor(x + 4);
  let f = Math.floor(z + 4);
  if (c < 0 || c > 7 || f < 0 || f > 7) return -1;
  if (girado) { c = 7 - c; f = 7 - f; }
  return f * 16 + c;
}

/**
 * @typedef {Object} Tema
 * @property {string} id
 * @property {string} clara cor das casas claras (sobre a textura)
 * @property {string} escura
 * @property {string} moldura
 * @property {string} lado face da frente
 * @property {string} letras cor das coordenadas
 * @property {HTMLImageElement|null} [textura]
 */

/**
 * Tabuleiro plano (casas + moldura + coordenadas), visto de cima. Linha de cima = longe da camera.
 * @param {Tema} tema @param {boolean} girado @param {number} lado px por casa
 */
export function tabuleiroPlano(tema, girado, lado = 96) {
  const borda = Math.round(BORDA * lado);
  const tam = lado * 8 + borda * 2;
  const cv = document.createElement('canvas');
  cv.width = tam;
  cv.height = tam;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  // moldura
  g.fillStyle = tema.moldura;
  g.fillRect(0, 0, tam, tam);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, 0, tam, borda * 0.35);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, tam - borda * 0.3, tam, borda * 0.3);
  // casas
  for (let f = 0; f < 8; f++) {
    for (let c = 0; c < 8; c++) {
      const clara = (f + c) % 2 === 1;
      const x = borda + c * lado;
      const y = borda + (7 - f) * lado;
      g.fillStyle = clara ? tema.clara : tema.escura;
      g.fillRect(x, y, lado, lado);
      if (tema.textura) {
        g.save();
        g.globalAlpha = clara ? 0.55 : 0.45;
        g.globalCompositeOperation = clara ? 'soft-light' : 'overlay';
        // cada casa pega um pedaco diferente da textura (nao parece repetido)
        const tw = tema.textura.naturalWidth;
        const th = tema.textura.naturalHeight;
        const sx = ((c * 37 + f * 61) % 5) * (tw / 6);
        const sy = ((c * 53 + f * 29) % 5) * (th / 6);
        g.drawImage(tema.textura, sx, sy, tw / 6, th / 6, x, y, lado, lado);
        g.restore();
      }
    }
  }
  // contorno interno
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = Math.max(2, lado * 0.04);
  g.strokeRect(borda, borda, lado * 8, lado * 8);
  // coordenadas na moldura (de quem esta embaixo)
  g.fillStyle = tema.letras;
  g.font = `700 ${Math.round(borda * 0.62)}px Fredoka, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const col = girado ? 7 - i : i;
    const fil = girado ? i : 7 - i;
    g.fillText('abcdefgh'[col], borda + i * lado + lado / 2, tam - borda / 2);
    g.fillText(String(fil + 1), borda / 2, borda + i * lado + lado / 2);
  }
  return cv;
}

/**
 * Desenha o tabuleiro plano em perspectiva (faixas horizontais) e a face da frente.
 * @param {CanvasRenderingContext2D} g @param {Camera} cam @param {HTMLCanvasElement} plano @param {Tema} tema
 */
export function desenharTabuleiro(g, cam, plano, tema) {
  const L = 4 + BORDA;
  // sombra no chao
  const s0 = cam.projetar(-L - 0.2, 0, -L - 0.4);
  const s1 = cam.projetar(L + 0.2, 0, -L - 0.4);
  const s2 = cam.projetar(L + 0.1, 0, L + 0.25);
  const s3 = cam.projetar(-L - 0.1, 0, L + 0.25);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.moveTo(s0.x, s0.y + 14); g.lineTo(s1.x, s1.y + 14); g.lineTo(s2.x, s2.y + 6); g.lineTo(s3.x, s3.y + 6);
  g.closePath();
  g.fill();
  // face da frente
  const a = cam.projetar(-L, 0, -L);
  const b = cam.projetar(L, 0, -L);
  const c = cam.projetar(L, -ESPESSURA, -L);
  const d = cam.projetar(-L, -ESPESSURA, -L);
  g.fillStyle = tema.lado;
  g.beginPath();
  g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(a.x, a.y, b.x - a.x, Math.max(1, (d.y - a.y) * 0.18));
  // faixas
  const N = 140;
  const tam = plano.width;
  for (let i = 0; i < N; i++) {
    const z0 = L - (i / N) * 2 * L;
    const z1 = L - ((i + 1) / N) * 2 * L;
    const p0 = cam.projetar(-L, 0, z0);
    const p1 = cam.projetar(-L, 0, z1);
    const zm = (z0 + z1) / 2;
    const pl = cam.projetar(-L, 0, zm);
    const pr = cam.projetar(L, 0, zm);
    g.drawImage(plano, 0, (i / N) * tam, tam, tam / N, pl.x, p0.y, pr.x - pl.x, Math.max(0.6, p1.y - p0.y + 0.6));
  }
}

/**
 * Poligono de uma casa (para realces) projetado; `enc` encolhe a casa (0 = inteira).
 * @param {Camera} cam @param {number} sq @param {boolean} girado @param {number} [enc]
 */
export function poligonoCasa(cam, sq, girado, enc = 0) {
  const { x, z } = casaNoMundo(sq, girado);
  const h = 0.5 - enc;
  return [
    cam.projetar(x - h, 0.005, z - h), cam.projetar(x + h, 0.005, z - h),
    cam.projetar(x + h, 0.005, z + h), cam.projetar(x - h, 0.005, z + h),
  ];
}
