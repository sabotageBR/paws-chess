#!/usr/bin/env node
// Gera o banco de puzzles (mate em 1 e mate em 2) jogando bots contra bots e conferindo cada candidato com
// o resolvedor exato (src/jogo/mate.js): primeiro lance UNICO, e mate em 2 sem mate em 1. Todas as posicoes
// sao espelhadas para as brancas (os gatos) jogarem. Saida: src/jogo/puzzles.js (o teste confere de novo).
// Uso: node tools/puzzles.mjs [--m1=140] [--m2=70] [--semente=1]
import { writeFileSync } from 'node:fs';
import { Posicao } from '../src/jogo/xadrez.js';
import { lancesDeMate } from '../src/jogo/mate.js';
import { criarMotor, MATE } from '../src/jogo/busca.js';
import { BOTS } from '../src/jogo/bots.js';
import { duelo } from './duelo.mjs';
import { criarRng } from '../src/core/rng.js';

const arg = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=')[1]);
const META1 = arg('m1', 140);
const META2 = arg('m2', 70);
let semente = arg('semente', 1);

/** espelha a posicao (troca as cores e vira o tabuleiro) para as brancas terem a vez @param {string} fen */
export function espelhar(fen) {
  const [pc, lado, roque, ep, meio, num] = fen.split(' ');
  const troca = (s) => s.replace(/[a-zA-Z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
  const pecas = troca(pc.split('/').reverse().join('/'));
  const r = roque === '-' ? '-' : troca(roque).split('').sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b)).join('');
  const e = ep === '-' ? '-' : ep[0] + (9 - Number(ep[1]));
  return `${pecas} ${lado === 'w' ? 'b' : 'w'} ${r} ${e} ${meio} ${num}`;
}

const motor = criarMotor(18);
const vistos = new Set();
/** @type {{ fen: string, n: number, sol: string }[]} */
const m1 = [];
/** @type {{ fen: string, n: number, sol: string }[]} */
const m2 = [];

/** material de cada lado @param {Posicao} p */
function material(p) {
  const v = [0, 100, 300, 300, 500, 900, 0];
  const m = [0, 0];
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = p.b[sq];
    if (pc) m[pc >> 3] += v[pc & 7];
  }
  return m;
}

let doJogo = 0;
/** @param {Posicao} pos */
function examinar(pos) {
  if (pos.num < 8 || doJogo >= 1) return;
  const chave = pos.fen().split(' ').slice(0, 2).join(' ');
  if (vistos.has(chave)) return;
  vistos.add(chave);
  const mat = material(pos);
  const total = mat[0] + mat[1];
  if (total < 1600) return; // finais muito vazios: mate facil demais
  const vantagem = mat[pos.lado] - mat[pos.lado ^ 1];
  if (vantagem > 1200) return; // ganho demais: nao e puzzle
  const q = Posicao.deFen(pos.fen());
  const r = motor.buscar(q, { profundidade: 4, nos: 60000 });
  if (r.nota < MATE - 4) return;
  const um = lancesDeMate(q, 1);
  if (um.length === 1 && m1.length < META1) {
    const fen = q.lado === 0 ? q.fen() : espelhar(q.fen());
    const e = Posicao.deFen(fen);
    const sol = lancesDeMate(e, 1);
    if (sol.length === 1) { m1.push({ fen, n: 1, sol: e.uci(sol[0]) }); doJogo++; }
    return;
  }
  if (um.length || m2.length >= META2) return;
  const dois = lancesDeMate(q, 2);
  if (dois.length !== 1) return;
  const fen = q.lado === 0 ? q.fen() : espelhar(q.fen());
  const e = Posicao.deFen(fen);
  const sol = lancesDeMate(e, 2);
  if (sol.length === 1 && !lancesDeMate(e, 1).length) { m2.push({ fen, n: 2, sol: e.uci(sol[0]) }); doJogo++; }
}

const pares = [[4, 2], [5, 3], [3, 1], [6, 4], [2, 2], [5, 5], [4, 4], [3, 3], [6, 3], [7, 5]];
let jogos = 0;
while ((m1.length < META1 || m2.length < META2) && jogos < 4000) {
  const [a, b] = pares[jogos % pares.length];
  const ba = BOTS[a];
  const bb = BOTS[b];
  doJogo = 0;
  duelo(semente % 2 ? ba : bb, semente % 2 ? bb : ba, { semente, maxLances: 160, escala: 0.3, aoLance: examinar });
  semente++;
  jogos++;
  if (jogos % 20 === 0) process.stdout.write(`${jogos} partidas: ${m1.length} mate em 1, ${m2.length} mate em 2\n`);
}

// embaralha (semente fixa) para os dias seguidos nao virem da mesma fase da partida
const rngE = criarRng(20261120);
for (const l of [m1, m2]) for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rngE() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
const linhas = (l) => l.map((p) => `  ['${p.fen}', '${p.sol}'],`).join('\n');
writeFileSync(new URL('../src/jogo/puzzles.js', import.meta.url), `// Banco de puzzles gerado por tools/puzzles.mjs (bots contra bots, conferido pelo resolvedor exato de
// src/jogo/mate.js; test/puzzles.test.js confere tudo de novo). Sempre as brancas (gatos) jogam.
// [fen, primeiro lance da solucao em UCI]. Nao editar a mao: rode o gerador.

/** @type {[string, string][]} mate em 1 (lance unico) */
export const MATE_EM_1 = [
${linhas(m1)}
];

/** @type {[string, string][]} mate em 2 (primeiro lance unico, sem mate em 1) */
export const MATE_EM_2 = [
${linhas(m2)}
];

/**
 * Os 3 puzzles do dia (2 mates em 1 e 1 mate em 2), pelo numero do dia desde 2026-01-01.
 * @param {number} dia
 * @returns {{ fen: string, sol: string, n: number }[]}
 */
export function puzzlesDoDia(dia) {
  const d = Math.max(0, Math.floor(dia));
  const a = MATE_EM_1[(d * 2) % MATE_EM_1.length];
  const b = MATE_EM_1[(d * 2 + 1) % MATE_EM_1.length];
  const c = MATE_EM_2[d % MATE_EM_2.length];
  return [{ fen: a[0], sol: a[1], n: 1 }, { fen: b[0], sol: b[1], n: 1 }, { fen: c[0], sol: c[1], n: 2 }];
}
`);
process.stdout.write(`gravado: ${m1.length} mate em 1, ${m2.length} mate em 2 (${jogos} partidas)\n`);
