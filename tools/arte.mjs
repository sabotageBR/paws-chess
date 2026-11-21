#!/usr/bin/env node
// Processa a arte bruta do Grok (arte/bruto/) para o jogo (src/arte/), com tools/sprite.mjs:
// pecas (2 times x 6 tipos x 5 poses), retratos dos 10 bots, adereços das gags, fundos e texturas dos 5
// tabuleiros. Confere a quantidade de objetos de cada folha. Uso: node tools/arte.mjs [--so=pecas,bots,...]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const so = (process.argv.find((a) => a.startsWith('--so=')) || '').slice(5).split(',').filter(Boolean);
const quer = (k) => !so.length || so.includes(k);
const TMP = join(RAIZ, '.tmp/cortes');

function sprite(...a) {
  const r = spawnSync('node', [join(RAIZ, 'tools/sprite.mjs'), ...a], { cwd: RAIZ, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sprite.mjs ${a.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout;
}
const dims = (arq) => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', arq], { encoding: 'utf8' }).stdout.trim().split(',').map(Number);

/** recorta uma folha em objetos (png em .tmp) e devolve os caminhos na ordem de leitura */
function cortar(bruto, nome, extra = []) {
  const pasta = join(TMP, nome);
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
  sprite('recortar', join(RAIZ, 'arte/bruto', bruto), `${pasta}/`, '--separar', `--nome=${nome}`, ...extra);
  return readdirSync(pasta).filter((f) => f.endsWith('.png')).sort().map((f) => join(pasta, f));
}

/** reduz para webp com fator de escala (mantem a escala relativa entre as folhas) */
function reduzir(png, destino, fator, q = 82) {
  const [w] = dims(png);
  mkdirSync(join(destino, '..'), { recursive: true });
  sprite('reduzir', png, destino, `--largura=${Math.max(8, Math.round(w * fator))}`, `--q=${q}`);
}

const TIPOS = ['rei', 'dama', 'torre', 'bispo', 'cavalo', 'peao'];
// gatos no fundo magenta (o Grok devolve carmim #C0145A): tolerancia menor, senao o laranja esverdeia
const CORTE = { g: ['--tol=0.09', '--suave=0.06'], c: ['--tol=0.14', '--suave=0.08'] };
const FATOR_PECA = 0.62;

if (quer('pecas')) {
  const folhas = {
    g: { parado: 'pecas-gatos.jpg', salto: 'pose-gatos-salto.jpg', ataque: 'pose-gatos-ataque.jpg', apanhando: 'pose-gatos-apanhando.jpg', vitoria: 'pose-gatos-vitoria.jpg' },
    c: { parado: 'pecas-caes.jpg', salto: 'pose-caes-salto.jpg', ataque: 'pose-caes-ataque.jpg', apanhando: 'pose-caes-apanhando.jpg', vitoria: 'pose-caes-vitoria.jpg' },
  };
  for (const [time, poses] of Object.entries(folhas)) {
    for (const [pose, bruto] of Object.entries(poses)) {
      if (!existsSync(join(RAIZ, 'arte/bruto', bruto))) { process.stdout.write(`FALTA ${bruto}\n`); continue; }
      // no salto as bases podem sair soltas: junta pedacos proximos e descarta as bases sozinhas
      let objs = cortar(bruto, `${time}-${pose}`, [...CORTE[time], ...(pose === 'salto' ? ['--juntar=10'] : [])]);
      if (objs.length > 6) {
        // bases soltas: largas e baixas (w > 2.2 h); fica com os 6 maiores que nao sao base
        const info = objs.map((o) => ({ o, d: dims(o) }));
        objs = info.filter((x) => x.d[0] < x.d[1] * 2.2).map((x) => x.o);
      }
      if (objs.length !== 6) { process.stdout.write(`ERRO ${bruto}: ${objs.length} objetos\n`); continue; }
      objs.forEach((o, i) => reduzir(o, join(RAIZ, `src/arte/pecas/${time}-${TIPOS[i]}-${pose}.webp`), FATOR_PECA));
      process.stdout.write(`ok ${time}-${pose}\n`);
    }
  }
}

if (quer('bots')) {
  const a = cortar('bots-1.jpg', 'bots1', ['--tol=0.14']);
  const b = cortar('bots-2.jpg', 'bots2', ['--tol=0.14']);
  const p = cortar('bot-pantufa.jpg', 'pantufa', ['--tol=0.14']);
  if (a.length !== 6 || b.length !== 4 || p.length !== 1) process.stdout.write(`ERRO bots: ${a.length} ${b.length} ${p.length}\n`);
  const ids = ['sonolento', 'bagunceiro', 'pantufa', 'salsicha', 'chef', 'barao', 'pug', 'lobo', 'esfinge', 'biscoito'];
  const fontes = [a[0], a[1], p[0], a[3], a[4], a[5], b[0], b[1], b[2], b[3]];
  ids.forEach((id, i) => {
    const [w, h] = dims(fontes[i]);
    const f = Math.min(1, 220 / Math.max(w, h));
    reduzir(fontes[i], join(RAIZ, `src/arte/bots/${id}.webp`), f, 84);
  });
  process.stdout.write('ok bots\n');
}

if (quer('gags')) {
  const g = cortar('gags.jpg', 'gags', ['--tol=0.09', '--suave=0.06', '--juntar=24']);
  const nomes = ['torta', 'martelo', 'banana', 'travesseiro', 'galinha', 'balde', 'pimenta', 'tontura', 'pow'];
  if (g.length !== 9) process.stdout.write(`ERRO gags: ${g.length}\n`);
  g.slice(0, 9).forEach((o, i) => { if (nomes[i] !== 'tontura') reduzir(o, join(RAIZ, `src/arte/gags/${nomes[i]}.webp`), 0.5); });
  process.stdout.write('ok gags\n');
}

if (quer('fundos')) {
  for (const t of ['madeira', 'jardim', 'doceria', 'telhado', 'praia']) {
    mkdirSync(join(RAIZ, 'src/arte/fundos'), { recursive: true });
    sprite('reduzir', join(RAIZ, `arte/bruto/fundo-${t}.jpg`), join(RAIZ, `src/arte/fundos/${t}.webp`), '--largura=1280', '--q=72');
    mkdirSync(join(RAIZ, 'src/arte/texturas'), { recursive: true });
    sprite('costurar', join(RAIZ, `arte/bruto/textura-${t}.jpg`), join(RAIZ, `src/arte/texturas/${t}.webp`), '--lado=384');
  }
  process.stdout.write('ok fundos e texturas\n');
}
