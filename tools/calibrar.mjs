#!/usr/bin/env node
// Calibra os 10 bots jogando entre si (vizinhos i x i+1 e i x i+2, cores alternadas, varias sementes) em
// threads paralelas, estima o Elo relativo (minimos quadrados sobre os placares, bot 1 ancorado em 400) e
// grava docs/forca-bots.md. Uso: node tools/calibrar.mjs [--jogos=10] [--threads=6] [--escala=1]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOTS } from '../src/jogo/bots.js';
import { duelo } from './duelo.mjs';

const arg = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=')[1]);

if (!isMainThread) {
  const { a, b, semente, escala } = workerData;
  const aBrancas = semente % 2 === 0;
  const r = aBrancas ? duelo(BOTS[a], BOTS[b], { semente, escala }) : duelo(BOTS[b], BOTS[a], { semente, escala });
  parentPort?.postMessage({ a, b, p: aBrancas ? r.resultado : 1 - r.resultado, motivo: r.motivo, lances: r.lances });
} else {
  const JOGOS = arg('jogos', 10);
  const THREADS = arg('threads', 6);
  const ESCALA = arg('escala', 1);
  const tarefas = [];
  for (let i = 0; i < BOTS.length - 1; i++) {
    for (const d of [1, 2]) {
      if (i + d >= BOTS.length) continue;
      const n = d === 1 ? JOGOS : Math.ceil(JOGOS / 2);
      for (let j = 0; j < n; j++) tarefas.push({ a: i, b: i + d, semente: 100 * i + 10 * d + j, escala: ESCALA });
    }
  }
  // as partidas dos bots fortes demoram mais: comeca por elas
  tarefas.sort((x, y) => y.b - x.b);
  const placar = new Map();
  let feitas = 0;
  const t0 = Date.now();
  const rodar = (t) => new Promise((ok, falha) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: t });
    w.once('message', ok);
    w.once('error', falha);
  });
  let k = 0;
  await Promise.all(Array.from({ length: THREADS }, async () => {
    while (k < tarefas.length) {
      const t = tarefas[k++];
      const r = /** @type {any} */ (await rodar(t));
      const ch = `${r.a}-${r.b}`;
      const s = placar.get(ch) || { pontos: 0, jogos: 0, motivos: {} };
      s.pontos += r.p;
      s.jogos++;
      s.motivos[r.motivo] = (s.motivos[r.motivo] || 0) + 1;
      placar.set(ch, s);
      feitas++;
      if (feitas % 10 === 0) process.stdout.write(`${feitas}/${tarefas.length} partidas (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    }
  }));
  // Elo por minimos quadrados: para cada par, diferenca observada d = 400 log10(s / (1 - s))
  const n = BOTS.length;
  const elo = BOTS.map((_, i) => 400 + i * 200);
  const pares = [...placar.entries()].map(([ch, s]) => {
    const [a, b] = ch.split('-').map(Number);
    const sc = Math.min(0.95, Math.max(0.05, s.pontos / s.jogos));
    return { a, b, d: 400 * Math.log10(sc / (1 - sc)), s };
  });
  for (let it = 0; it < 2000; it++) {
    const g = new Array(n).fill(0);
    for (const p of pares) {
      const err = elo[p.a] - elo[p.b] - p.d;
      g[p.a] += err;
      g[p.b] -= err;
    }
    for (let i = 1; i < n; i++) elo[i] -= 0.05 * g[i];
    const ajuste = elo[0] - 400;
    for (let i = 0; i < n; i++) elo[i] -= ajuste;
  }
  const linhas = pares.map((p) => `| ${p.a + 1} x ${p.b + 1} | ${p.s.pontos} / ${p.s.jogos} | ${Object.entries(p.s.motivos).map(([m, q]) => `${m} ${q}`).join(', ')} |`);
  const tabela = BOTS.map((b, i) => `| ${i + 1} | ${b.id} | ${b.rating} | ${Math.round(elo[i])} | prof ${b.prof}${b.nos ? `, ${b.nos} nos` : ''}${b.ms ? `, ${b.ms} ms` : ''}, ruido ${b.ruido}, vacilo ${b.vacilo} |`);
  const md = `# Força medida dos bots

Gerado por \`tools/calibrar.mjs\` em ${new Date().toISOString().slice(0, 10)} (${tarefas.length} partidas bot contra bot, cores alternadas,
vizinhos i×i+1 com ${JOGOS} partidas e i×i+2 com ${Math.ceil(JOGOS / 2)}; escala de nós ${ESCALA}; sem prazo de tempo).
Elo relativo por mínimos quadrados sobre os placares, com o bot 1 ancorado em 400. É força **entre os bots**, não
Elo FIDE: serve para garantir a escada (cada bot mais forte que o anterior) e dar uma ordem de grandeza.

| # | bot | rating da escada | Elo medido | nível |
|---|---|---|---|---|
${tabela.join('\n')}

## Placares (pontos do bot da esquerda)

| par | pontos | como acabou |
|---|---|---|
${linhas.join('\n')}
`;
  writeFileSync(new URL('../docs/forca-bots.md', import.meta.url), md);
  process.stdout.write(`${md}\n`);
}
