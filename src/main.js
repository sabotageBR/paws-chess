// Paws Chess: montagem do jogo. O UNICO modulo que toca portal, DOM, audio e salvamento
// (test/estilo.test.js). Ciclo do portal como no kit (jogos/distribuicao/kit/src/main.js):
//
//  1. ganchos do portal ANTES do init (anuncio cala o audio e congela o laco; mudo e pausa do portal);
//  2. portal.init() primeiro, sem nada pesado antes; arte com gameLoadingProgress; laco so depois do init;
//  3. idioma do portal (Poki: vazio, vale o navegador); progresso da nuvem do portal quando existe;
//  4. gameLoadingFinished no primeiro quadro; gameplayStart SO em jogadorAgiu() (gesto real);
//  5. commercialBreak SO entre partidas (pausa natural) e so a partir da 3a partida ou ~4 min de jogo;
//  6. video premiado so por escolha, no cartao de fim (fora da partida), ao lado da opcao gratis do mesmo tamanho;
//  7. ESC ou P pausam; aba oculta pausa; o mudo do portal nao desfaz o do jogador;
//  8. portal.intervaloSoNoClique (Y8): o intersticial so sai logo depois de um clique num botao (o "Proximo
//     bot" / "Revanche" / "Proximo puzzle" do cartao de fim) e so a cada 180 s; portal.pausaNoBlur (Y8):
//     perder o foco abre a pausa.
import { portal, PLATAFORMA } from './core/plataforma.js';
import { criarArmazem } from './core/armazenamento.js';
import { criarAudio } from './core/audio.js';
import { criarHaptico } from './core/haptico.js';
import { criarLaco } from './core/laco.js';
import { criarEntrada } from './core/entrada.js';
import { lerDepuracao } from './core/depuracao.js';
import { criarTelemetria } from './core/telemetria.js';
import { escolherIdioma, definirIdioma, aplicarTextos, t, idioma } from './i18n/textos.js';
import { FALAS } from './i18n/falas.js';
import { criarMao, celebrar, botaoPremiado } from './ui/kit.js';
import { SONS } from './som/sons.js';
import { criarPartida, jogar, desfazerLance, capturadas } from './jogo/partida.js';
import { PEAO, lDe, lPara, lPromo, F_PROMO, F_CAPTURA } from './jogo/xadrez.js';
import { BOTS } from './jogo/bots.js';
import { daMate } from './jogo/mate.js';
import { puzzlesDoDia } from './jogo/puzzles.js';
import { progressoNovo, normalizar, registrarResultado, proximaGag, liberados, botDaEscada, TABULEIROS, GAGS } from './jogo/escada.js';
import { criarCamera, casaNoMundo, casaDoMundo, tabuleiroPlano, desenharTabuleiro, poligonoCasa } from './render/cena.js';
import { criarAtores } from './render/atores.js';
import { criarIa } from './ia/cliente.js';

/** Sem intervalo comercial antes da 3a partida da sessao ou de ~4 min de jogo. */
const PARTIDAS_ANTES_DO_INTERVALO = 2;
const TEMPO_ANTES_DO_INTERVALO = 240;
/** Ajuda automatica (dica gratis) quando o jogador nao joga por este tempo, nas 3 primeiras partidas. */
const AJUDA_APOS = 20;
const DICAS_POR_PARTIDA = 3;

const dbg = lerDepuracao(['bot', 'modo', 'tema']);
const armazem = criarArmazem({ prefixo: 'pawschess.' });
const audio = criarAudio();
const haptico = criarHaptico();
const tele = criarTelemetria(portal);
const ia = criarIa();

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const tela = /** @type {HTMLCanvasElement} */ ($('tela'));
const g = /** @type {CanvasRenderingContext2D} */ (tela.getContext('2d'));
const camada = $('camada');
const mao = criarMao(camada);

const TIPOS = ['', 'peao', 'cavalo', 'bispo', 'torre', 'dama', 'rei'];
const TEMAS = {
  madeira: { id: 'madeira', clara: '#f3d9a4', escura: '#b9773f', moldura: '#6b3f1f', lado: '#4a2a12', letras: '#f6e3bf' },
  jardim: { id: 'jardim', clara: '#c9ef8f', escura: '#5fae4a', moldura: '#7a5a33', lado: '#54391c', letras: '#fff3c9' },
  doceria: { id: 'doceria', clara: '#fff0d6', escura: '#a8643f', moldura: '#f29ec0', lado: '#c76e95', letras: '#fff7fb' },
  telhado: { id: 'telhado', clara: '#c9cfe0', escura: '#5d6684', moldura: '#8a3d32', lado: '#5d251e', letras: '#ffe6c8' },
  praia: { id: 'praia', clara: '#ffeec2', escura: '#e0b46f', moldura: '#3fb6c9', lado: '#2a7f8f', letras: '#ffffff' },
};

// ------------------------------------------------------------------ imagens
/** @type {Record<string, HTMLImageElement>} */
const imgPecas = {};
/** @type {Record<string, HTMLImageElement>} */
const imgGags = {};
/** @type {Record<string, HTMLImageElement>} */
const imgFundos = {};
/** @type {Record<string, HTMLImageElement>} */
const imgTexturas = {};
const caminhoPeca = (peca, pose = 'parado') => `src/arte/pecas/${peca >> 3 ? 'c' : 'g'}-${TIPOS[peca & 7]}-${pose}.webp`;
const caminhoBot = (i) => `src/arte/bots/${BOTS[i].id}.webp`;

/** @param {string} src @returns {Promise<HTMLImageElement>} */
function carregar(src) {
  return new Promise((ok) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => ok(im);
    im.onerror = () => ok(im);
    im.src = src;
  });
}

const atores = criarAtores({ pecas: imgPecas, gags: imgGags }, {
  som: (nome, p) => audio.tocarReceita(SONS[nome], p || {}, { chave: nome }),
  vibrar: (ms) => haptico.vibrar(ms),
});

// ------------------------------------------------------------------ estado
const E = {
  /** @type {'escada'|'livre'|'2j'|'puzzle'} */
  modo: 'escada',
  bot: 0,
  ladoJog: 0,
  partida: criarPartida(),
  girado: false,
  sel: -1,
  /** @type {number[]} */
  alvos: [],
  /** @type {{ sq: number, x0: number, y0: number, x: number, z: number, moveu: boolean }|null} */
  arrasto: null,
  /** @type {{ resposta: any, ate: number, geracao: number }|null} */
  pedido: null,
  geracao: 0,
  /** @type {{ resultado: number, motivo: string }|null} */
  fim: null,
  dicas: DICAS_POR_PARTIDA,
  /** @type {{ de: number, para: number }|null} */
  dica: null,
  /** @type {import('./jogo/partida.js').InfoLance|null} */
  ultimo: null,
  t: 0,
  semProgresso: 0,
  tempoJogo: 0,
  partidasSessao: 0,
  tutorial: 0,
  lancesBot: 0,
  notaBot: 0,
  falaIdx: 0,
  semente: 7,
  animando: false,
  pausado: false,
  pausaPortal: false,
  menu: false,
  /** @type {{ dia: number, idx: number, lista: { fen: string, sol: string, n: number }[], etapa: number, feito: boolean }|null} */
  puzzle: null,
  prog: progressoNovo(),
  cursor: -1,
  tela: '',
};

const congelado = () => E.pausado || E.pausaPortal || E.menu;
const vsBot = () => E.modo === 'escada' || E.modo === 'livre';
const vezDoJogador = () => !E.fim && !E.animando && !E.pedido
  && (E.modo === '2j' || (E.modo === 'puzzle' ? E.partida.pos.lado === 0 && !(E.puzzle && E.puzzle.feito) : E.partida.pos.lado === E.ladoJog));

function salvar() {
  armazem.gravar('progresso', E.prog);
}
function salvarPartida() {
  if (E.modo === 'puzzle' || E.fim) { armazem.gravar('partida', null); return; }
  armazem.gravar('partida', { modo: E.modo, bot: E.bot, ladoJog: E.ladoJog, fen: E.partida.fenInicial, lances: E.partida.feitos.map((f) => f.uci), dicas: E.dicas, tutorial: E.tutorial });
}

// ------------------------------------------------------------------ portal: ganchos antes do init
const laco = criarLaco({ passo, desenhar });
portal.onAdStart = () => {
  audio.mudoParaAnuncio();
  laco.pausar(true);
};
portal.onAdEnd = () => {
  audio.voltarDoAnuncio();
  if (!congelado()) laco.pausar(false);
};
portal.onMudoPlataforma = (m) => audio.definirMudoPlataforma(m);
portal.onPausaPlataforma = (p) => {
  E.pausaPortal = p;
  if (p) portal.gameplayStop();
  laco.pausar(congelado() || portal.emAnuncio);
};
portal.onSemAnuncios = () => atualizarVideo();

/** Unico lugar com gameplayStart: gesto real do jogador, fora de pausa, de anuncio e do fim de partida. */
function jogadorAgiu() {
  if (congelado() || portal.emAnuncio || E.fim) return;
  portal.gameplayStart();
}

// ------------------------------------------------------------------ layout
let W = 0;
let H = 0;
let dpr = 1;
let retrato = false;
/** @type {import('./render/cena.js').Camera} */
let cam = criarCamera({ x: 0, y: 0, w: 100, h: 100 });
/** @type {HTMLCanvasElement|null} */
let cache = null;
let cacheChave = '';

function medir() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  tela.width = Math.round(W * dpr);
  tela.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  retrato = H > W * 1.05;
  const hb = $('hudBot');
  const hj = $('hudJog');
  const bt = $('botoes');
  const foto = Math.max(64, Math.min(112, Math.min(W, H) * 0.12));
  hb.classList.toggle('vertical', !retrato);
  let area;
  if (retrato) {
    Object.assign(hb.style, { left: '10px', top: '10px', right: '', bottom: '', flexDirection: 'row', alignItems: 'center' });
    Object.assign(hj.style, { left: '12px', bottom: '14px', top: '', right: '' });
    Object.assign(bt.style, { right: '12px', bottom: '12px', top: '', left: '', flexDirection: 'row', transform: '' });
    const topo = foto + 22;
    const baixo = 86;
    area = { x: 4, y: topo, w: W - 8, h: H - topo - baixo };
  } else {
    Object.assign(hb.style, { left: '14px', top: '14px', right: '', bottom: '', flexDirection: 'column', alignItems: 'flex-start' });
    Object.assign(hj.style, { left: '16px', bottom: '16px', top: '', right: '' });
    Object.assign(bt.style, { right: '14px', top: '50%', bottom: '', left: '', flexDirection: 'column', transform: 'translateY(-50%)' });
    const esq = Math.min(W * 0.24, 260);
    area = { x: esq, y: 6, w: W - esq - 92, h: H - 12 };
  }
  const balao = $('balao');
  if (retrato) Object.assign(balao.style, { left: `${foto + 8}px`, top: '-4px' });
  else Object.assign(balao.style, { left: '0px', top: `calc(100% + 8px)` });
  balao.classList.toggle('embaixo', !retrato);
  cam = criarCamera(area, retrato ? 1.7 : 1);
  cacheChave = '';
}

/** fundo (cena do tema) + tabuleiro em perspectiva num cache do tamanho da tela */
function prepararCache() {
  const tema = TEMAS[/** @type {keyof typeof TEMAS} */ (E.prog.tabuleiro)] || TEMAS.madeira;
  const ch = `${W}x${H}@${dpr}|${tema.id}|${E.girado}|${!!imgFundos[tema.id]}|${!!imgTexturas[tema.id]}`;
  if ((ch === cacheChave && cache) || !tela.width || !tela.height) return;
  cacheChave = ch;
  cache = cache || document.createElement('canvas');
  cache.width = tela.width;
  cache.height = tela.height;
  const c = /** @type {CanvasRenderingContext2D} */ (cache.getContext('2d'));
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fundo = imgFundos[tema.id];
  if (fundo && fundo.naturalWidth) {
    const k = Math.max(W / fundo.naturalWidth, H / fundo.naturalHeight);
    const fw = fundo.naturalWidth * k;
    const fh = fundo.naturalHeight * k;
    c.drawImage(fundo, (W - fw) / 2, (H - fh) / 2, fw, fh);
  } else {
    const gr = c.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#3a2670');
    gr.addColorStop(1, '#1b1236');
    c.fillStyle = gr;
    c.fillRect(0, 0, W, H);
  }
  // veu para o tabuleiro e o HUD lerem bem
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(20,10,40,0.18)');
  v.addColorStop(1, 'rgba(20,10,40,0.55)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  const plano = tabuleiroPlano({ ...tema, textura: imgTexturas[tema.id] || null }, E.girado, 110);
  desenharTabuleiro(c, cam, plano, tema);
}

// ------------------------------------------------------------------ laco
/** @param {number} dt */
function passo(dt) {
  if (congelado()) return;
  E.t += dt;
  if (portal.jogando) { tele.jogando(dt); E.tempoJogo += dt; }
  atores.passo(dt);
  const ocupado = atores.ocupado;
  if (E.animando && !ocupado) E.animando = false;
  // resposta do bot (com tempo minimo de "pensar")
  if (E.pedido && E.pedido.resposta && E.t >= E.pedido.ate && !E.animando) {
    const r = E.pedido.resposta;
    E.pedido = null;
    $('hudBot').classList.remove('pensando');
    if (r.geracao === E.geracao) aplicarRespostaBot(r);
  }
  if (vezDoJogador()) {
    E.semProgresso += dt;
    if (E.semProgresso > 12 && E.dicas > 0) $('btDica').classList.add('brilha');
    if (E.semProgresso > AJUDA_APOS && E.prog.partidas < 3 && !E.dica && vsBot() && !pedindoDica) {
      tele.ajuda(E.prog.partidas + 1);
      pedirDica(true);
    }
    if (dbg.auto && E.semProgresso > (dbg.ritmo || 0.3) && !pedindoDica) jogarSozinho();
  }
  atualizarMao();
}

let pedindoDica = false;

function desenhar() {
  prepararCache();
  const tr = atores.tremor;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (cache && cache.width > 0 && cache.height > 0) g.drawImage(cache, 0, 0, W, H);
  if (tr) g.translate(tr, 0);
  desenharRealces();
  const arr = E.arrasto && E.arrasto.moveu ? { sq: E.arrasto.sq, x: E.arrasto.x, z: E.arrasto.z } : null;
  atores.desenhar(g, cam, { selecionado: E.arrasto && E.arrasto.moveu ? -1 : E.sel, arrastando: arr });
  desenharSetaDica();
  if (dbg.filme) desenharHudFilme();
  primeiroQuadro();
}

/** @param {{ x: number, y: number }[]} pts */
function poligono(pts) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
}

function desenharRealces() {
  const pos = E.partida.pos;
  if (E.ultimo) {
    g.fillStyle = 'rgba(255, 214, 64, 0.35)';
    for (const sq of [E.ultimo.de, E.ultimo.para]) { poligono(poligonoCasa(cam, sq, E.girado)); g.fill(); }
  }
  // xeque: brilho vermelho sob o rei
  if (pos.emXeque() && !E.animando) {
    const sq = pos.reis[pos.lado];
    const w = casaNoMundo(sq, E.girado);
    const p = cam.projetar(w.x, 0, w.z);
    const r = 0.62 * p.s;
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, `rgba(255, 50, 50, ${0.75 + Math.sin(E.t * 8) * 0.15})`);
    gr.addColorStop(1, 'rgba(255, 50, 50, 0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(p.x, p.y, r, r * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (E.sel >= 0) {
    g.fillStyle = 'rgba(255, 201, 60, 0.55)';
    poligono(poligonoCasa(cam, E.sel, E.girado, 0.02));
    g.fill();
    for (const m of E.alvos) {
      const para = lPara(m);
      const w = casaNoMundo(para, E.girado);
      const p = cam.projetar(w.x, 0.01, w.z);
      const captura = (m >> 17) & F_CAPTURA;
      g.fillStyle = 'rgba(40, 20, 70, 0.45)';
      g.strokeStyle = 'rgba(255, 230, 120, 0.9)';
      g.lineWidth = Math.max(2, p.s * 0.06);
      g.beginPath();
      if (captura) {
        g.ellipse(p.x, p.y, p.s * 0.44, p.s * 0.3, 0, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.ellipse(p.x, p.y, p.s * 0.15, p.s * 0.1, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  if (E.arrasto && E.arrasto.moveu) {
    const sq = casaDoMundo(E.arrasto.x, E.arrasto.z, E.girado);
    if (sq >= 0 && E.alvos.some((m) => lPara(m) === sq)) {
      g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      g.lineWidth = 3;
      poligono(poligonoCasa(cam, sq, E.girado, 0.03));
      g.stroke();
    }
  }
  if (E.cursor >= 0) {
    g.strokeStyle = 'rgba(120, 220, 255, 0.95)';
    g.lineWidth = 3;
    poligono(poligonoCasa(cam, E.cursor, E.girado, 0.04));
    g.stroke();
  }
}

function desenharSetaDica() {
  if (!E.dica) return;
  const a = casaNoMundo(E.dica.de, E.girado);
  const b = casaNoMundo(E.dica.para, E.girado);
  const p0 = cam.projetar(a.x, 0.05, a.z);
  const p1 = cam.projetar(b.x, 0.05, b.z);
  const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const lw = Math.max(6, p1.s * 0.16);
  g.save();
  g.globalAlpha = 0.75 + Math.sin(E.t * 6) * 0.15;
  g.strokeStyle = '#ff9f1c';
  g.fillStyle = '#ff9f1c';
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(p0.x, p0.y);
  g.lineTo(p1.x - Math.cos(ang) * lw * 1.6, p1.y - Math.sin(ang) * lw * 1.6);
  g.stroke();
  g.beginPath();
  g.moveTo(p1.x, p1.y);
  g.lineTo(p1.x - Math.cos(ang - 0.5) * lw * 2.6, p1.y - Math.sin(ang - 0.5) * lw * 2.6);
  g.lineTo(p1.x - Math.cos(ang + 0.5) * lw * 2.6, p1.y - Math.sin(ang + 0.5) * lw * 2.6);
  g.closePath();
  g.fill();
  g.restore();
}

/** HUD desenhado no canvas so no ?filme (o video grava o canvas, nao o DOM) */
let fotoFilme = /** @type {HTMLImageElement|null} */ (null);
function desenharHudFilme() {
  if (!vsBot()) return;
  const r = Math.min(W, H) * 0.075;
  const x = retrato ? 16 + r : 22 + r;
  const y = 16 + r;
  if (!fotoFilme || !fotoFilme.src.includes(BOTS[E.bot].id)) { fotoFilme = new Image(); fotoFilme.src = caminhoBot(E.bot); }
  g.save();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x, y, r + 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2a65a';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.clip();
  if (fotoFilme.naturalWidth) g.drawImage(fotoFilme, x - r, y - r * 0.85, r * 2, r * 2);
  g.restore();
  g.fillStyle = '#fff';
  g.font = `700 ${Math.round(r * 0.36)}px Fredoka, sans-serif`;
  g.textAlign = 'left';
  g.fillText(nomeBot(E.bot), x + r + 10, y - r * 0.2);
  const b = $('balao');
  if (!b.hidden) {
    const txt = b.textContent || '';
    g.font = `700 ${Math.round(r * 0.3)}px Fredoka, sans-serif`;
    const tw = g.measureText(txt).width;
    const bx = x + r + 10;
    const by = y + r * 0.05;
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(bx - 8, by - r * 0.3, tw + 16, r * 0.62, 12);
    g.fill();
    g.fillStyle = '#2b1d4e';
    g.fillText(txt, bx, by + r * 0.12);
  }
}

let carregouJa = false;
function primeiroQuadro() {
  if (carregouJa) return;
  carregouJa = true;
  portal.gameLoadingFinished();
  $('carregando').classList.add('saindo');
  setTimeout(() => $('carregando').remove(), 400);
}

// ------------------------------------------------------------------ HUD
/** @param {number} i */
const nomeBot = (i) => FALAS[BOTS[i].id][idioma()].nome;

function atualizarHud() {
  const hb = $('hudBot');
  const foto = /** @type {HTMLImageElement} */ ($('botFoto'));
  const vez = E.partida.pos.lado;
  if (vsBot()) {
    foto.src = caminhoBot(E.bot);
    $('botNome').textContent = nomeBot(E.bot);
    $('botSub').textContent = t('rating', { n: BOTS[E.bot].rating });
    $('jogNome').textContent = E.ladoJog === 0 ? t('gatos') : t('caes');
    $('jogSub').textContent = t('rating', { n: E.prog.rating });
  } else if (E.modo === '2j') {
    foto.src = caminhoPeca(14);
    $('botNome').textContent = t('caes');
    $('botSub').textContent = vez === 1 ? t('vezCaes') : '';
    $('jogNome').textContent = t('gatos');
    $('jogSub').textContent = vez === 0 ? t('vezGatos') : '';
  } else if (E.puzzle) {
    foto.src = caminhoBot(6);
    $('botNome').textContent = t('puzzle');
    const pz = E.puzzle.lista[E.puzzle.idx];
    $('botSub').textContent = `${t(pz.n === 1 ? 'mate1' : 'mate2')} · ${t('puzzleN', { i: E.puzzle.idx + 1 })}`;
    $('jogNome').textContent = t('jogueGatos');
    $('jogSub').textContent = t('puzzlesFeitos', { n: puzzlesFeitosHoje() });
  }
  hb.hidden = false;
  // pecas comidas: em cima as que o adversario comeu, embaixo as que o jogador comeu
  const perdidas = capturadas(E.partida);
  const meu = E.modo === '2j' || E.modo === 'puzzle' ? 0 : E.ladoJog;
  const mostrar = (el, cor, tipos) => {
    const ordenado = [...tipos].sort((a, b) => b - a);
    el.innerHTML = '';
    for (const tp of ordenado) {
      const im = document.createElement('img');
      im.src = caminhoPeca((cor << 3) | tp);
      im.alt = '';
      el.appendChild(im);
    }
  };
  mostrar($('comidasBot'), meu, perdidas[meu]);
  mostrar($('comidasJog'), meu ^ 1, perdidas[meu ^ 1]);
  $('nDicas').textContent = String(E.dicas);
  /** @type {HTMLButtonElement} */ ($('btDica')).disabled = E.modo === '2j' || E.dicas <= 0;
  /** @type {HTMLButtonElement} */ ($('btDesfazer')).disabled = E.partida.feitos.length === 0;
  $('pontoMenu').hidden = puzzlesFeitosHoje() >= 3 || E.modo === 'puzzle';
}

let falaTimer = 0;
/** @param {keyof import('./i18n/falas.js').Falas} cat @param {boolean} [forcar] */
function falar(cat, forcar = false) {
  if (!vsBot()) return;
  const b = $('balao');
  if (!forcar && !b.hidden && cat !== 'vitoria' && cat !== 'derrota') return;
  const lista = /** @type {string[]} */ (FALAS[BOTS[E.bot].id][idioma()][cat]);
  if (!lista || !lista.length) return;
  dizer(lista[E.falaIdx++ % lista.length]);
  audio.tocarReceita(SONS.fala, { cao: BOTS[E.bot].especie === 'cao' }, { chave: 'fala' });
}
/** @param {string} texto @param {number} [ms] */
function dizer(texto, ms = 3200) {
  const b = $('balao');
  b.textContent = texto;
  b.hidden = false;
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  clearTimeout(falaTimer);
  falaTimer = window.setTimeout(() => { b.hidden = true; }, ms);
}

let avisoTimer = 0;
/** @param {string} texto @param {boolean} [fixo] */
function avisar(texto, fixo = false) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  a.classList.toggle('fixo', fixo);
  a.style.animation = 'none';
  void a.offsetWidth;
  a.style.animation = '';
  clearTimeout(avisoTimer);
  if (!fixo) avisoTimer = window.setTimeout(() => { a.hidden = true; }, 1600);
}
function calarAviso() { $('aviso').hidden = true; }

// ------------------------------------------------------------------ mao-guia (tutorial e dica)
function atualizarMao() {
  let de = -1;
  let para = -1;
  if (E.tutorial && vezDoJogador() && !E.arrasto) {
    const alvo = lanceDoTutorial();
    if (alvo) { de = lDe(alvo); para = lPara(alvo); }
  } else if (E.dica && vezDoJogador() && !E.arrasto && E.sel < 0) { de = E.dica.de; para = E.dica.para; }
  if (de < 0 || congelado()) { if (mao.visivel) mao.esconder(); return; }
  const a = casaNoMundo(de, E.girado);
  const b = casaNoMundo(para, E.girado);
  const p0 = cam.projetar(a.x, 0.45, a.z);
  const p1 = cam.projetar(b.x, 0.3, b.z);
  mao.mostrar(p0.x, p0.y, { ateX: p1.x, ateY: p1.y });
}

/** lance que a mao ensina no tutorial: 1) e2-e4; 2) capturar o que o bot entregou */
function lanceDoTutorial() {
  const pos = E.partida.pos;
  if (E.tutorial === 1) return pos.deUci('e2e4') > 0 ? pos.deUci('e2e4') : 0;
  if (E.tutorial === 2) {
    const ult = E.partida.feitos[E.partida.feitos.length - 1];
    const caps = pos.legais().filter((m) => (m >> 17) & F_CAPTURA);
    const naUltima = caps.filter((m) => ult && lPara(m) === ult.para);
    const pool = naUltima.length ? naUltima : caps;
    pool.sort((x, y) => (pos.b[lDe(x)] & 7) - (pos.b[lDe(y)] & 7));
    return pool[0] || 0;
  }
  return 0;
}

// ------------------------------------------------------------------ partida
/**
 * @param {{ modo?: 'escada'|'livre'|'2j'|'puzzle', bot?: number, ladoJog?: number, fen?: string, lances?: string[], dicas?: number, tutorial?: number }} [o]
 */
function novaPartida(o = {}) {
  E.geracao++;
  ia.reiniciar();
  E.modo = o.modo || 'escada';
  E.bot = o.bot ?? botDaEscada(E.prog);
  E.ladoJog = E.modo === 'livre' || E.modo === 'escada' ? (o.ladoJog ?? 0) : 0;
  E.partida = criarPartida(o.fen);
  for (const u of o.lances || []) jogar(E.partida, E.partida.pos.deUci(u));
  E.girado = E.modo === '2j' ? false : E.ladoJog === 1;
  if (E.modo === '2j' && E.prog.lado2j) E.girado = E.partida.pos.lado === 1;
  E.sel = -1;
  E.alvos = [];
  E.arrasto = null;
  E.pedido = null;
  E.fim = null;
  E.dica = null;
  E.ultimo = E.partida.feitos[E.partida.feitos.length - 1] || null;
  E.semProgresso = 0;
  E.lancesBot = Math.floor(E.partida.feitos.length / 2);
  E.notaBot = 0;
  E.animando = false;
  E.tutorial = o.tutorial ?? 0;
  if (o.dicas !== undefined) E.dicas = o.dicas;
  else {
    E.dicas = DICAS_POR_PARTIDA + (E.prog.dicasExtra || 0);
    if (E.prog.dicasExtra) { E.prog.dicasExtra = 0; salvar(); }
  }
  if (E.modo !== 'puzzle') E.puzzle = null;
  $('btDica').classList.remove('brilha');
  $('balao').hidden = true;
  $('hudBot').classList.remove('pensando', 'feliz');
  calarAviso();
  atores.sincronizar(E.partida.pos, E.girado);
  cacheChave = '';
  atualizarHud();
  if (vsBot() && !o.lances?.length) {
    tele.fase(E.prog.partidas + 1, 'start');
    setTimeout(() => falar('inicio', true), 450);
  }
  if (E.tutorial === 1) avisar(t('arraste'), true);
  salvarPartida();
  if (vsBot() && E.partida.pos.lado !== E.ladoJog && !E.partida.fim) pedirBot();
}

/** @param {number} m @returns {Promise<void>} */
async function fazerLance(m) {
  const pos = E.partida.pos;
  const lado = pos.lado;
  const info = jogar(E.partida, m);
  if (!info) return;
  E.sel = -1;
  E.alvos = [];
  E.dica = null;
  E.semProgresso = 0;
  E.ultimo = info;
  E.animando = true;
  $('btDica').classList.remove('brilha');
  mao.esconder();
  let gag = null;
  if (info.capturada) {
    if (E.prog.gagsLigadas) {
      const r = proximaGag(E.prog);
      E.prog = r.progresso;
      gag = r.gag;
      if (r.nova && E.prog.capturas > 1) setTimeout(() => avisar(`${t('novaGag')} ${t(`g_${gag}`)}`), 900);
      salvar();
    }
    haptico.vibrar(15);
  }
  const deBot = vsBot() && lado !== E.ladoJog;
  if (deBot) E.lancesBot++;
  // falas: o bot comeu, o bot perdeu, xeque dado ou levado
  if (vsBot()) {
    if (info.capturada) setTimeout(() => falar(deBot ? 'captura' : 'perdeu', true), gag ? 700 : 300);
    else if (info.xeque) setTimeout(() => falar(deBot ? 'xeque' : 'xequeLevado'), 300);
  }
  await atores.mover(info, { gag });
  if (info.xeque && !E.partida.fim) {
    audio.tocarReceita(SONS.xeque, {}, { chave: 'xeque' });
    atores.xeque(E.partida.pos.reis[E.partida.pos.lado]);
    avisar(t('xeque'));
  }
  if (E.modo === '2j' && E.prog.lado2j && !E.partida.fim) {
    E.girado = E.partida.pos.lado === 1;
    atores.sincronizar(E.partida.pos, E.girado);
  }
  atualizarHud();
  salvarPartida();
  if (E.modo === 'puzzle') { conferirPuzzle(info); return; }
  if (E.partida.fim) { acabar(E.partida.fim); return; }
  if (E.tutorial === 1 && !deBot) { E.tutorial = 2; calarAviso(); }
  else if (E.tutorial === 2 && !deBot) { E.tutorial = 0; calarAviso(); }
  else if (E.tutorial === 2 && deBot) avisar(t('capture'), true);
  if (vsBot() && E.partida.pos.lado !== E.ladoJog) pedirBot();
}

function pedirBot() {
  const ger = E.geracao;
  let roteiro = null;
  if (E.prog.partidas === 0 && E.bot === 0 && E.modo === 'escada') {
    if (E.lancesBot === 0) roteiro = 'peao';
    else if (E.lancesBot === 2) roteiro = 'peca';
  }
  const espera = dbg.auto ? 0.25 : (E.bot === 0 ? 1.1 : 0.7) + (E.lancesBot % 3) * 0.15;
  E.pedido = { resposta: null, ate: E.t + espera, geracao: ger };
  $('hudBot').classList.add('pensando');
  const pedido = {
    tipo: 'bot', fen: E.partida.fenInicial, lances: E.partida.feitos.map((f) => f.uci), bot: E.bot,
    semente: (E.semente * 7919 + E.prog.partidas * 104729) >>> 0, roteiro,
  };
  const p = E.pedido;
  ia.pedir(pedido).then((r) => {
    if (E.pedido !== p) return;
    p.resposta = { ...r, geracao: ger };
  });
}

/** @param {any} r */
function aplicarRespostaBot(r) {
  if (r.puzzle) {
    const mp = r.ok && r.lance ? E.partida.pos.deUci(r.lance) : -1;
    if (mp > 0 && E.modo === 'puzzle') fazerLance(mp);
    return;
  }
  if (E.fim || !vsBot()) return;
  if (!r.ok || !r.lance) {
    // falha da IA: tenta de novo
    if (!r.cancelado) pedirBot();
    return;
  }
  if (r.abandona) { acabar('abandono'); return; }
  const m = E.partida.pos.deUci(r.lance);
  if (m < 0) return;
  // vacilo do jogador: o bot ficou bem melhor do que esperava
  if (typeof r.nota === 'number' && !r.vacilou) {
    if (E.lancesBot > 2 && r.nota - E.notaBot >= 250 && !((m >> 17) & F_CAPTURA)) setTimeout(() => falar('vacilo'), 200);
    E.notaBot = r.nota;
  }
  fazerLance(m);
}

/** @param {string} motivo */
function acabar(motivo) {
  const pos = E.partida.pos;
  let vencedor = -1;
  if (motivo === 'mate') vencedor = pos.lado ^ 1;
  else if (motivo === 'abandono') vencedor = E.ladoJog;
  E.fim = { resultado: vencedor, motivo };
  E.sel = -1;
  E.alvos = [];
  E.dica = null;
  mao.esconder();
  calarAviso();
  portal.gameplayStop();
  armazem.gravar('partida', null);
  atores.festa(vencedor, motivo === 'mate');
  let titulo = t('empate');
  /** @type {'vitoria'|'derrota'|'empate'} */
  let som = 'empate';
  if (E.modo === '2j') {
    titulo = vencedor < 0 ? t('empate') : `${vencedor === 0 ? t('gatos') : t('caes')}: ${t('vitoria')}`;
    som = vencedor < 0 ? 'empate' : 'vitoria';
  } else if (vencedor === E.ladoJog) { titulo = t('vitoria'); som = 'vitoria'; } else if (vencedor >= 0) { titulo = t('derrota'); som = 'derrota'; }
  if (motivo === 'mate') avisar(t('xequeMate'));
  audio.tocarReceita(SONS[som], {}, { chave: 'fim' });
  let sub = t(motivo);
  /** @type {{ botNovo: number, tabNovo: string, delta: number }|null} */
  let novidades = null;
  if (vsBot()) {
    const s = vencedor === E.ladoJog ? 1 : vencedor < 0 ? 0.5 : 0;
    const r = registrarResultado(E.prog, E.bot, s);
    E.prog = r.progresso;
    salvar();
    novidades = r;
    sub += ` · ${t('rating', { n: E.prog.rating })} (${r.delta >= 0 ? '+' : ''}${r.delta})`;
    tele.fase(E.prog.partidas, s === 1 ? 'complete' : 'fail');
    setTimeout(() => falar(s === 1 ? 'derrota' : s === 0 ? 'vitoria' : 'empate', true), 500);
    if (s === 1) { $('hudBot').classList.remove('feliz'); } else { $('hudBot').classList.add('feliz'); }
    if (s === 1 && (r.botNovo >= 0 || E.bot === BOTS.length - 1)) portal.festa();
  }
  E.partidasSessao++;
  atualizarHud();
  const atraso = dbg.auto ? 900 : 2100;
  if (vencedor === E.ladoJog && vsBot()) celebrar(camada, titulo, { sub: novidades ? `${novidades.delta >= 0 ? '+' : ''}${novidades.delta}` : '', ms: 2000 });
  setTimeout(() => mostrarFim(titulo, sub, novidades), atraso);
}

/** @param {string} titulo @param {string} sub @param {{ botNovo: number, tabNovo: string }|null} nov */
function mostrarFim(titulo, sub, nov) {
  if (!E.fim) return;
  $('fimTitulo').textContent = titulo;
  $('fimSub').textContent = sub;
  const box = $('fimNovidade');
  box.hidden = true;
  box.innerHTML = '';
  if (nov && nov.botNovo >= 0) {
    box.hidden = false;
    const im = document.createElement('img');
    im.src = caminhoBot(nov.botNovo);
    im.alt = '';
    const s = document.createElement('span');
    s.textContent = t('novoBot', { nome: nomeBot(nov.botNovo) });
    box.append(im, s);
    audio.tocarReceita(SONS.desbloqueio, {}, { chave: 'desbloqueio', atraso: 0.2 });
  }
  if (nov && nov.tabNovo) {
    const s = document.createElement('span');
    s.textContent = ` ${t('novoTabuleiro')} ${t(`t_${nov.tabNovo}`)}`;
    box.hidden = false;
    box.appendChild(s);
  }
  const ganhou = E.fim.resultado === E.ladoJog;
  const prox = E.modo === 'escada' && ganhou && E.bot < BOTS.length - 1 ? t('proxima') : E.modo === 'puzzle' ? t('proximoPuzzle') : E.modo === '2j' ? t('novaPartida') : t('revanche');
  $('btProxima').textContent = prox;
  botaoPremiado(/** @type {HTMLButtonElement} */ ($('btBonus')), t('bonusDicas'));
  abrirTela('fim');
  atualizarVideo();
}

/** proxima partida a partir do cartao de fim (pausa natural: o unico ponto do intervalo comercial) */
async function proxima(comBonus = false) {
  fecharTela();
  if (!comBonus) await intervalo();
  if (E.modo === 'puzzle') { proximoPuzzle(); return; }
  if (E.modo === 'escada') novaPartida({ modo: 'escada', bot: botDaEscada(E.prog), ladoJog: 0 });
  else novaPartida({ modo: E.modo, bot: E.bot, ladoJog: E.ladoJog });
}

/** s de jogo no ultimo intervalo pedido (so para o portal que exige clique) */
let ultimoIntervalo = -Infinity;
/** pedido no clique do botao do cartao de fim (proxima): para a Y8 isso ja e o "clique antes do anuncio" */
async function intervalo() {
  if (dbg.semAnuncio || !portal.temAnuncios) return;
  if (E.partidasSessao < PARTIDAS_ANTES_DO_INTERVALO && E.tempoJogo < TEMPO_ANTES_DO_INTERVALO) return;
  // Y8: o portal so exibe um a cada ~3 min; fora disso nem pede
  if (portal.intervaloSoNoClique && tele.segundos - ultimoIntervalo < 180) return;
  ultimoIntervalo = tele.segundos;
  await portal.commercialBreak();
}

// ------------------------------------------------------------------ dica e desfazer
/** @param {boolean} gratis ajuda automatica (nao gasta dica) */
async function pedirDica(gratis = false) {
  if (!vezDoJogador() || pedindoDica) return;
  if (!gratis && E.dicas <= 0) { avisar(t('semDicas')); return; }
  if (E.modo === 'puzzle' && E.puzzle) {
    const pz = E.puzzle.lista[E.puzzle.idx];
    const m = E.puzzle.etapa === 0 ? E.partida.pos.deUci(pz.sol) : E.partida.pos.legais().find((x) => daMate(E.partida.pos, x)) || -1;
    if (m > 0) { E.dica = { de: lDe(m), para: lPara(m) }; if (!gratis) E.dicas--; atualizarHud(); }
    return;
  }
  pedindoDica = true;
  const ger = E.geracao;
  const r = await ia.pedir({ tipo: 'dica', fen: E.partida.fenInicial, lances: E.partida.feitos.map((f) => f.uci), ms: 450 });
  pedindoDica = false;
  if (ger !== E.geracao || !r.ok || !r.lance || !vezDoJogador()) return;
  const m = E.partida.pos.deUci(r.lance);
  if (m < 0) return;
  E.dica = { de: lDe(m), para: lPara(m) };
  if (!gratis) { E.dicas--; tele.evento('dica', 'usou'); }
  audio.tocarReceita(SONS.selecionar, {}, { chave: 'dica' });
  atualizarHud();
}

function desfazer() {
  if (E.fim && E.modo !== '2j' && E.modo !== 'puzzle') return;
  if (E.animando) atores.pularTudo();
  if (!E.partida.feitos.length) return;
  E.geracao++;
  ia.reiniciar();
  E.pedido = null;
  $('hudBot').classList.remove('pensando');
  if (E.fim) { E.fim = null; fecharTela(); }
  if (vsBot()) {
    desfazerLance(E.partida);
    if (E.partida.pos.lado !== E.ladoJog && E.partida.feitos.length) desfazerLance(E.partida);
    E.lancesBot = Math.floor(E.partida.feitos.length / 2);
  } else if (E.modo === 'puzzle') {
    while (E.partida.feitos.length) desfazerLance(E.partida);
    if (E.puzzle) E.puzzle.etapa = 0;
  } else desfazerLance(E.partida);
  E.sel = -1;
  E.alvos = [];
  E.dica = null;
  E.animando = false;
  E.ultimo = E.partida.feitos[E.partida.feitos.length - 1] || null;
  if (E.modo === '2j' && E.prog.lado2j) E.girado = E.partida.pos.lado === 1;
  atores.sincronizar(E.partida.pos, E.girado);
  cacheChave = '';
  audio.tocarReceita(SONS.poof, {}, { chave: 'desfazer' });
  atualizarHud();
  salvarPartida();
  if (vsBot() && E.partida.pos.lado !== E.ladoJog) pedirBot();
}

// ------------------------------------------------------------------ puzzles
const DIA0 = Date.UTC(2026, 0, 1);
function diaDeHoje() {
  const d = new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DIA0) / 86400000);
}
function puzzlesFeitosHoje() {
  const r = E.prog.puzzles[String(diaDeHoje())];
  return r ? r.filter(Boolean).length : 0;
}

/** @param {number} [dia] @param {number} [idx] */
function abrirPuzzle(dia = diaDeHoje(), idx) {
  const feitos = E.prog.puzzles[String(dia)] || [false, false, false];
  const i = idx ?? Math.max(0, feitos.indexOf(false));
  const lista = puzzlesDoDia(dia);
  E.puzzle = { dia, idx: i, lista, etapa: 0, feito: false };
  novaPartida({ modo: 'puzzle', fen: lista[i].fen, dicas: 1 });
  E.puzzle = { dia, idx: i, lista, etapa: 0, feito: false };
  atualizarHud();
  dizer(`${t(lista[i].n === 1 ? 'mate1' : 'mate2')}!`, 2600);
}

/** @param {import('./jogo/partida.js').InfoLance} info */
function conferirPuzzle(info) {
  const pz = E.puzzle;
  if (!pz) return;
  const atual = pz.lista[pz.idx];
  if (info.lado === 1) { atualizarHud(); return; }
  const mate = E.partida.fim === 'mate';
  if (mate) { resolverPuzzle(); return; }
  const certo = pz.etapa === 0 && atual.n === 2 && info.uci === atual.sol;
  if (certo) {
    pz.etapa = 1;
    dizer(t('certo'), 1500);
    // a defesa: a resposta mais teimosa (a do motor)
    const ger = E.geracao;
    E.pedido = { resposta: null, ate: E.t + 0.8, geracao: ger };
    const p = E.pedido;
    ia.pedir({ tipo: 'dica', fen: E.partida.fenInicial, lances: E.partida.feitos.map((f) => f.uci), ms: 300 }).then((r) => {
      if (E.pedido !== p) return;
      p.resposta = { ...r, geracao: ger, puzzle: true };
    });
    return;
  }
  // errou: balanca e volta
  audio.tocarReceita(SONS.erro, {}, { chave: 'erro' });
  dizer(t('quase'), 1800);
  setTimeout(() => {
    if (E.modo !== 'puzzle' || E.puzzle !== pz) return;
    while (E.partida.feitos.length) desfazerLance(E.partida);
    pz.etapa = 0;
    E.ultimo = null;
    atores.sincronizar(E.partida.pos, E.girado);
    atualizarHud();
  }, 900);
}

function resolverPuzzle() {
  const pz = E.puzzle;
  if (!pz) return;
  pz.feito = true;
  const k = String(pz.dia);
  const feitos = E.prog.puzzles[k] || [false, false, false];
  feitos[pz.idx] = true;
  E.prog.puzzles[k] = feitos;
  // so guarda os ultimos 60 dias
  const dias = Object.keys(E.prog.puzzles).map(Number).sort((a, b) => b - a);
  for (const d of dias.slice(60)) delete E.prog.puzzles[String(d)];
  salvar();
  atualizarHud();
  tele.evento('puzzle', `resolvido-${pz.lista[pz.idx].n}`);
  E.fim = { resultado: 0, motivo: 'puzzle' };
  portal.gameplayStop();
  atores.festa(0, true);
  audio.tocarReceita(SONS.vitoria, {}, { chave: 'fim' });
  celebrar(camada, t('resolvido'), { ms: 1800 });
  E.partidasSessao++;
  setTimeout(() => {
    const todos = (E.prog.puzzles[k] || []).filter(Boolean).length;
    mostrarFim(t('resolvido'), t('puzzlesFeitos', { n: todos }), null);
  }, 1900);
}

function proximoPuzzle() {
  const pz = E.puzzle;
  const dia = pz ? pz.dia : diaDeHoje();
  const feitos = E.prog.puzzles[String(dia)] || [];
  const prox = [0, 1, 2].find((i) => !feitos[i]);
  if (prox !== undefined) abrirPuzzle(dia, prox);
  else if (dia > 0) abrirPuzzle(dia - 1);
  else abrirPuzzle(dia, 0);
}

// ------------------------------------------------------------------ entrada no tabuleiro
/** casa sob o ponto (px CSS): primeiro o corpo das pecas do lado da vez, depois o chao */
function casaNoPonto(x, y, soPropria = false) {
  const pos = E.partida.pos;
  let melhor = -1;
  let melhorZ = Infinity;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = pos.b[sq];
    if (!pc || (soPropria && (pc >> 3) !== pos.lado)) continue;
    const w = casaNoMundo(sq, E.girado);
    const p = cam.projetar(w.x, 0, w.z - 0.16);
    const alto = (pc & 7) === PEAO ? 0.85 : 1.25;
    if (Math.abs(x - p.x) < p.s * 0.36 && y < p.y && y > p.y - p.s * alto && w.z < melhorZ) { melhor = sq; melhorZ = w.z; }
  }
  if (melhor >= 0) return melhor;
  const c = cam.noChao(x, y);
  return c ? casaDoMundo(c.x, c.z, E.girado) : -1;
}

/** @param {number} sq */
function selecionar(sq) {
  E.sel = sq;
  E.alvos = E.partida.pos.legais().filter((m) => lDe(m) === sq);
  audio.tocarReceita(SONS.selecionar, {}, { chave: 'sel' });
}

/** tenta jogar da selecao para sq; pede a promocao quando preciso @param {number} sq */
function tentar(sq) {
  const opcoes = E.alvos.filter((m) => lPara(m) === sq);
  if (!opcoes.length) return false;
  if (opcoes.length > 1 && ((opcoes[0] >> 17) & F_PROMO)) { escolherPromocao(opcoes); return true; }
  fazerLance(opcoes[0]);
  return true;
}

/** @param {number[]} opcoes */
function escolherPromocao(opcoes) {
  const box = $('promoOpcoes');
  box.innerHTML = '';
  const lado = E.partida.pos.lado;
  for (const m of [...opcoes].sort((a, b) => lPromo(b) - lPromo(a))) {
    const b = document.createElement('button');
    b.type = 'button';
    const im = document.createElement('img');
    im.src = caminhoPeca((lado << 3) | lPromo(m));
    im.alt = TIPOS[lPromo(m)];
    b.appendChild(im);
    b.addEventListener('click', () => { fecharTela(); fazerLance(m); });
    box.appendChild(b);
  }
  abrirTela('promocao');
}

/** @param {'baixo'|'mover'|'cima'} fase @param {number} x @param {number} y */
function noTabuleiro(fase, x, y) {
  if (fase === 'baixo') {
    if (E.animando) { atores.pularTudo(); return; }
    if (!vezDoJogador()) return;
    const pos = E.partida.pos;
    // 1) a casa do chao sob o dedo; 2) o corpo de uma peca (as altas cobrem a casa de tras)
    const chao = cam.noChao(x, y);
    const sqChao = chao ? casaDoMundo(chao.x, chao.z, E.girado) : -1;
    const ehMinha = (q) => q >= 0 && pos.b[q] && (pos.b[q] >> 3) === pos.lado;
    if (E.sel >= 0 && E.alvos.some((m) => lPara(m) === sqChao)) { tentar(sqChao); return; }
    let sq = sqChao;
    if (!ehMinha(sqChao)) {
      const corpo = casaNoPonto(x, y, false);
      if (E.sel >= 0 && E.alvos.some((m) => lPara(m) === corpo)) { tentar(corpo); return; }
      if (ehMinha(corpo)) sq = corpo;
    }
    if (sq < 0) { E.sel = -1; E.alvos = []; return; }
    const pc = pos.b[sq];
    if (pc && (pc >> 3) === pos.lado) {
      if (E.sel === sq) { E.arrasto = { sq, x0: x, y0: y, x: 0, z: 0, moveu: false }; return; }
      selecionar(sq);
      E.arrasto = { sq, x0: x, y0: y, x: 0, z: 0, moveu: false };
      return;
    }
    E.sel = -1;
    E.alvos = [];
    return;
  }
  if (!E.arrasto) return;
  if (fase === 'mover') {
    if (!E.arrasto.moveu && Math.hypot(x - E.arrasto.x0, y - E.arrasto.y0) < 10) return;
    const c = cam.noChao(x, y);
    if (!c) return;
    E.arrasto.moveu = true;
    E.arrasto.x = c.x;
    E.arrasto.z = c.z;
    return;
  }
  // cima
  const arr = E.arrasto;
  E.arrasto = null;
  if (!arr.moveu) return;
  const sq = casaDoMundo(arr.x, arr.z, E.girado);
  if (sq >= 0 && sq !== arr.sq && tentar(sq)) return;
  // largou fora: volta e fica selecionada
}

function jogarSozinho() {
  if (pedindoDica || !vezDoJogador()) return;
  pedindoDica = true;
  const ger = E.geracao;
  ia.pedir({ tipo: 'bot', fen: E.partida.fenInicial, lances: E.partida.feitos.map((f) => f.uci), bot: 4, semente: E.partida.feitos.length * 31 }).then((r) => {
    pedindoDica = false;
    if (ger !== E.geracao || !r.ok || !r.lance || !vezDoJogador()) return;
    const m = E.partida.pos.deUci(r.lance);
    if (m > 0) fazerLance(m);
  });
}

// ------------------------------------------------------------------ telas (menus)
/** @param {string} id */
function abrirTela(id) {
  for (const x of ['menu', 'modos', 'livre', 'fim', 'promocao']) $(x).hidden = x !== id;
  E.tela = id;
  const pausa = id === 'menu' || id === 'modos' || id === 'livre';
  if (pausa && !E.menu) {
    E.menu = true;
    portal.gameplayStop();
    laco.pausar(true);
  }
  atualizarVideo();
}
function fecharTela() {
  for (const x of ['menu', 'modos', 'livre', 'fim', 'promocao']) $(x).hidden = true;
  E.tela = '';
  if (E.menu) {
    E.menu = false;
    laco.pausar(congelado() || portal.emAnuncio);
  }
}

function abrirModos() {
  const prox = botDaEscada(E.prog);
  /** @type {HTMLImageElement} */ ($('mEscadaFoto')).src = caminhoBot(prox);
  $('mEscadaSub').textContent = t('vencidos', { n: E.prog.vencidos.filter(Boolean).length });
  const feitos = puzzlesFeitosHoje();
  $('mPuzzleSub').textContent = t('puzzlesFeitos', { n: feitos });
  const mp = $('mPuzzle');
  mp.querySelector('.selo')?.remove();
  if (feitos < 3) { const s = document.createElement('span'); s.className = 'selo'; s.textContent = `${3 - feitos}`; mp.appendChild(s); }
  // tabuleiros
  const lib = liberados(E.prog);
  const lt = $('listaTab');
  lt.innerHTML = '';
  for (const tb of TABULEIROS) {
    const b = document.createElement('button');
    b.type = 'button';
    const livre = lib.tabuleiros.includes(tb.id);
    b.className = `tab${E.prog.tabuleiro === tb.id ? ' ativo' : ''}${livre ? '' : ' travado'}`;
    const im = document.createElement('img');
    im.src = `src/arte/fundos/${tb.id}.webp`;
    im.alt = '';
    const s = document.createElement('span');
    s.textContent = livre ? t(`t_${tb.id}`) : `🔒 ${nomeBot(tb.bot)}`;
    b.append(im, s);
    if (livre) b.addEventListener('click', () => { E.prog.tabuleiro = tb.id; salvar(); carregarTema(tb.id); cacheChave = ''; abrirModos(); audio.tocarReceita(SONS.clique, {}, { chave: 'clique' }); });
    lt.appendChild(b);
  }
  // gags
  const lg = $('listaGags');
  lg.innerHTML = '';
  GAGS.forEach((gg, i) => {
    const d = document.createElement('div');
    const visto = i < E.prog.gags;
    d.className = `gag${visto ? '' : ' oculta'}`;
    const im = document.createElement('img');
    im.src = `src/arte/gags/${gg === 'espirro' ? 'pimenta' : gg === 'bolha' ? 'pow' : gg}.webp`;
    im.alt = '';
    const s = document.createElement('span');
    s.textContent = visto ? t(`g_${gg}`) : t('descobrir');
    d.append(im, s);
    lg.appendChild(d);
  });
  abrirTela('modos');
}

let escolhaLivre = 0;
let ladoLivre = 0;
function abrirLivre() {
  const lib = liberados(E.prog);
  if (!lib.bots[escolhaLivre]) escolhaLivre = 0;
  const lista = $('listaBots');
  lista.innerHTML = '';
  BOTS.forEach((b, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `bot${i === escolhaLivre ? ' ativo' : ''}${lib.bots[i] ? '' : ' travado'}${E.prog.vencidos[i] ? ' vencido' : ''}`;
    const im = document.createElement('img');
    im.src = caminhoBot(i);
    im.alt = '';
    const s = document.createElement('span');
    s.textContent = lib.bots[i] ? nomeBot(i) : t('bloqueado');
    const r = document.createElement('small');
    r.textContent = String(b.rating);
    el.append(im, s, r);
    if (lib.bots[i]) el.addEventListener('click', () => { escolhaLivre = i; abrirLivre(); audio.tocarReceita(SONS.clique, {}, { chave: 'clique' }); });
    lista.appendChild(el);
  });
  $('ladoGatos').classList.toggle('ativo', ladoLivre === 0);
  $('ladoCaes').classList.toggle('ativo', ladoLivre === 1);
  abrirTela('livre');
}

function atualizarVideo() {
  const bt = /** @type {HTMLButtonElement} */ ($('btBonus'));
  bt.hidden = !portal.temVideo || E.modo === 'puzzle' || E.modo === '2j';
}

async function pedirBonus() {
  const ok = await portal.rewardedBreak('small');
  if (ok) {
    E.prog.dicasExtra = 3;
    salvar();
    tele.evento('bonus', 'dicas');
    proxima(true);
  }
  atualizarVideo();
}

// ------------------------------------------------------------------ teclado
/** @param {string} codigo */
function tecla(codigo) {
  if (E.tela === 'fim' && (codigo === 'Enter' || codigo === 'Space')) { proxima(); return; }
  if (E.tela) return;
  if (!vezDoJogador()) { if (E.animando && (codigo === 'Enter' || codigo === 'Space')) atores.pularTudo(); return; }
  const pos = E.partida.pos;
  if (E.cursor < 0) E.cursor = E.sel >= 0 ? E.sel : pos.reis[pos.lado];
  const dir = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[codigo];
  if (dir) {
    const s = E.girado ? -1 : 1;
    const c = Math.max(0, Math.min(7, (E.cursor & 7) + dir[0] * s));
    const f = Math.max(0, Math.min(7, (E.cursor >> 4) + dir[1] * s));
    E.cursor = f * 16 + c;
    return;
  }
  if (codigo === 'Enter' || codigo === 'Space') {
    const sq = E.cursor;
    if (E.sel >= 0 && E.alvos.some((m) => lPara(m) === sq)) { tentar(sq); return; }
    const pc = pos.b[sq];
    if (pc && (pc >> 3) === pos.lado) selecionar(sq);
    else { E.sel = -1; E.alvos = []; }
    return;
  }
  if (codigo === 'KeyH') pedirDica();
  if (codigo === 'KeyZ' || codigo === 'Backspace') desfazer();
}

// ------------------------------------------------------------------ entrada
criarEntrada(window, {
  primeiroGesto: () => audio.iniciar(),
  ponteiro: (fase, x, y, e) => {
    if (fase === 'baixo') {
      tele.gesto(e.pointerType === 'mouse' ? 'mouse' : 'toque');
      jogadorAgiu();
      E.cursor = -1;
    }
    if (congelado() || E.tela) return;
    noTabuleiro(fase, x, y);
  },
  tecla: (codigo, baixo) => {
    if (!baixo) return;
    if (codigo === 'Escape' || codigo === 'KeyP') {
      if (E.tela === 'menu' || E.tela === 'modos' || E.tela === 'livre') { fecharTela(); jogadorAgiu(); } else if (!E.tela) abrirTela('menu');
      return;
    }
    jogadorAgiu();
    tecla(codigo);
  },
});
const clique = () => audio.tocarReceita(SONS.clique, {}, { chave: 'clique' });
$('btPausa').addEventListener('click', () => { clique(); abrirTela('menu'); });
$('btContinuar').addEventListener('click', () => { clique(); fecharTela(); jogadorAgiu(); });
$('btDica').addEventListener('click', () => { jogadorAgiu(); pedirDica(); });
$('btDesfazer').addEventListener('click', () => { jogadorAgiu(); desfazer(); });
$('btModos').addEventListener('click', () => { clique(); abrirModos(); });
$('btFecharModos').addEventListener('click', () => { clique(); fecharTela(); jogadorAgiu(); });
$('mEscada').addEventListener('click', () => { clique(); fecharTela(); novaPartida({ modo: 'escada', bot: botDaEscada(E.prog), ladoJog: 0 }); jogadorAgiu(); });
$('mLivre').addEventListener('click', () => { clique(); escolhaLivre = Math.min(escolhaLivre, botDaEscada(E.prog)); abrirLivre(); });
$('m2j').addEventListener('click', () => { clique(); fecharTela(); novaPartida({ modo: '2j' }); jogadorAgiu(); });
$('mPuzzle').addEventListener('click', () => { clique(); fecharTela(); abrirPuzzle(); jogadorAgiu(); });
$('ladoGatos').addEventListener('click', () => { ladoLivre = 0; abrirLivre(); });
$('ladoCaes').addEventListener('click', () => { ladoLivre = 1; abrirLivre(); });
$('btJogarLivre').addEventListener('click', () => { clique(); fecharTela(); novaPartida({ modo: 'livre', bot: escolhaLivre, ladoJog: ladoLivre }); jogadorAgiu(); });
$('btFecharLivre').addEventListener('click', () => { clique(); abrirModos(); });
$('btProxima').addEventListener('click', () => { clique(); proxima(); });
$('btBonus').addEventListener('click', () => pedirBonus());
$('btFimMenu').addEventListener('click', () => { clique(); abrirModos(); });
$('btSom').addEventListener('click', () => {
  audio.definirMudo(!audio.mudo);
  $('btSom').setAttribute('aria-pressed', String(!audio.mudo));
  armazem.gravar('mudo', audio.mudo);
});
$('btGags').addEventListener('click', () => {
  E.prog.gagsLigadas = !E.prog.gagsLigadas;
  $('btGags').setAttribute('aria-pressed', String(E.prog.gagsLigadas));
  salvar();
});
$('btGirar').addEventListener('click', () => {
  E.prog.lado2j = !E.prog.lado2j;
  $('btGirar').setAttribute('aria-pressed', String(E.prog.lado2j));
  salvar();
});
document.addEventListener('visibilitychange', () => {
  audio.pausarAba(document.hidden);
  if (document.hidden) {
    portal.gameplayStop();
    laco.pausar(true);
  } else laco.pausar(congelado() || portal.emAnuncio);
});
// Y8: pausar quando a janela perde o foco (requisito do portal); com outra tela aberta o jogo ja esta parado
window.addEventListener('blur', () => { if (portal.pausaNoBlur && carregouJa && !E.tela && !portal.emAnuncio) abrirTela('menu'); });
// o iframe do portal precisa de foco para o teclado (espaco nao rola a pagina do portal)
window.addEventListener('pointerdown', () => { try { window.focus(); } catch { /* ignora */ } });
window.addEventListener('resize', () => { medir(); atualizarHud(); });

// ------------------------------------------------------------------ carga
/** @param {string} tema */
async function carregarTema(tema) {
  const [f, tx] = await Promise.all([
    imgFundos[tema] ? Promise.resolve(imgFundos[tema]) : carregar(`src/arte/fundos/${tema}.webp`),
    imgTexturas[tema] ? Promise.resolve(imgTexturas[tema]) : carregar(`src/arte/texturas/${tema}.webp`),
  ]);
  imgFundos[tema] = f;
  imgTexturas[tema] = tx;
  cacheChave = '';
}

/** @param {(f: number) => void} progresso */
async function carregarArte(progresso) {
  const poses = ['parado', 'salto', 'ataque', 'apanhando', 'vitoria'];
  const tarefas = [];
  for (const cor of [0, 8]) for (let tp = 1; tp <= 6; tp++) for (const pose of poses) {
    tarefas.push(carregar(caminhoPeca(cor | tp, pose)).then((im) => { imgPecas[`${cor ? 'c' : 'g'}-${TIPOS[tp]}-${pose}`] = im; }));
  }
  for (const gg of ['torta', 'martelo', 'banana', 'travesseiro', 'galinha', 'balde', 'pimenta', 'pow']) {
    tarefas.push(carregar(`src/arte/gags/${gg}.webp`).then((im) => { imgGags[gg] = im; }));
  }
  tarefas.push(carregarTema(E.prog.tabuleiro || 'madeira'));
  let feitas = 0;
  await Promise.all(tarefas.map((p) => p.then(() => progresso(++feitas / tarefas.length))));
}

async function iniciar() {
  medir();
  const pedidoInit = portal.init();
  await pedidoInit;
  armazem.usarFonte(await portal.fonteDados(), ['progresso', 'mudo', 'partida']);
  E.prog = normalizar(dbg.novo ? null : armazem.ler('progresso', null));
  if (dbg.extras.tema && TEMAS[/** @type {keyof typeof TEMAS} */ (dbg.extras.tema)]) E.prog.tabuleiro = dbg.extras.tema;
  E.semente = dbg.semente || ((Date.now() / 1000) | 0) % 100000;
  const barra = /** @type {HTMLElement|null} */ (document.querySelector('#carregando .barra i'));
  await carregarArte((f) => {
    portal.gameLoadingProgress(f);
    if (barra) barra.style.width = `${f * 100}%`;
  });
  definirIdioma(escolherIdioma(dbg.lang || portal.idioma || navigator.language));
  document.documentElement.lang = { pt: 'pt-BR', en: 'en', es: 'es' }[idioma()];
  aplicarTextos(document);
  audio.definirMudo(armazem.ler('mudo', false) === true);
  $('btSom').setAttribute('aria-pressed', String(!audio.mudo));
  $('btGags').setAttribute('aria-pressed', String(E.prog.gagsLigadas));
  $('btGirar').setAttribute('aria-pressed', String(E.prog.lado2j));
  // primeira carga: direto numa partida (tutorial na primeira de todas); volta: retoma a partida salva
  const salva = dbg.novo ? null : armazem.ler('partida', null);
  if (dbg.extras.modo === 'puzzle') abrirPuzzle();
  else if (dbg.extras.modo === '2j') novaPartida({ modo: '2j' });
  else if (dbg.fase) {
    const b = Math.max(0, Math.min(BOTS.length - 1, dbg.fase - 1));
    for (let i = 0; i < b; i++) E.prog.vencidos[i] = true;
    if (!dbg.extras.tema) E.prog.tabuleiro = ['madeira', 'madeira', 'jardim', 'jardim', 'doceria', 'doceria', 'telhado', 'telhado', 'praia', 'praia'][b];
    E.prog.partidas = Math.max(E.prog.partidas, 3);
    await carregarTema(E.prog.tabuleiro);
    novaPartida({ modo: 'escada', bot: b, ladoJog: 0 });
  } else if (salva && salva.fen && Array.isArray(salva.lances) && salva.modo !== 'puzzle') {
    try {
      novaPartida({ modo: salva.modo, bot: salva.bot, ladoJog: salva.ladoJog, fen: salva.fen, lances: salva.lances, dicas: salva.dicas, tutorial: 0 });
    } catch {
      novaPartida({ modo: 'escada', bot: botDaEscada(E.prog), ladoJog: 0 });
    }
  } else {
    const primeira = E.prog.partidas === 0;
    novaPartida({ modo: 'escada', bot: botDaEscada(E.prog), ladoJog: 0, tutorial: primeira ? 1 : 0 });
  }
  // o resto dos tabuleiros carrega depois, sem pressa
  setTimeout(() => { for (const tb of TABULEIROS) carregarTema(tb.id); }, 1500);
  if (dbg.filme) {
    desenhar();
    return;
  }
  laco.iniciar();
}

// ------------------------------------------------------------------ ganchos de teste (so local)
if (dbg.ganchos) {
  /** @type {any} */ (window).__jogo = {
    E,
    portal,
    audio,
    atores,
    plataforma: PLATAFORMA,
    get lang() { return idioma(); },
    get jogou() { return portal.jogando; },
    get emAnuncio() { return portal.emAnuncio; },
    get menuAberto() { return E.menu; },
    get tela() { return E.tela; },
    get vez() { return vezDoJogador(); },
    /** centro (px CSS) de uma casa ('e2'), para cliques reais dos roteiros */
    casa(nome) {
      const sq = (nome.charCodeAt(1) - 49) * 16 + (nome.charCodeAt(0) - 97);
      const w = casaNoMundo(sq, E.girado);
      const p = cam.projetar(w.x, 0, w.z);
      return { x: p.x, y: p.y };
    },
    /** o lance que a mao-guia ou a dica mostra (uci) */
    lanceGuiado() {
      const m = E.tutorial ? lanceDoTutorial() : 0;
      return m ? E.partida.pos.uci(m) : '';
    },
    /** termina a partida atual com vitoria do jogador (provas e prints) */
    vencer() {
      if (E.fim) return;
      acabar('abandono');
    },
    novaPartida,
    abrirPuzzle,
    abrirModos,
    proxima,
    /** joga um lance (uci) como se fosse o jogador (prints e videos) */
    jogarUci(u) {
      const m = E.partida.pos.deUci(u);
      if (m > 0 && vezDoJogador()) { E.tutorial = E.tutorial === 1 ? 2 : E.tutorial; fazerLance(m); }
    },
    /** um quadro de video sem relogio real (?filme): avanca 1/fps e devolve o JPEG */
    quadro(fps = 30) {
      passo(1 / fps);
      desenhar();
      return tela.toDataURL('image/jpeg', 0.9);
    },
  };
}

iniciar();
