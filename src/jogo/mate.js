// Resolvedor exato de mate em N (forca bruta sobre todos os lances e todas as defesas). Usado para gerar e
// conferir os puzzles (tools/puzzles.mjs e test/puzzles.test.js) e para aceitar qualquer mate como resposta.

/**
 * Depois do lance do atacante (vez do defensor): o defensor esta mateado agora, ou toda defesa deixa um
 * mate em ate n lances do atacante.
 * @param {import('./xadrez.js').Posicao} pos @param {number} n
 * @returns {boolean}
 */
function forcaMateDepois(pos, n) {
  const respostas = pos.legais();
  if (!respostas.length) return pos.emXeque();
  if (n <= 0) return false;
  for (const r of respostas) {
    pos.fazer(r);
    let achou = false;
    for (const m of pos.legais()) {
      pos.fazer(m);
      achou = forcaMateDepois(pos, n - 1);
      pos.desfazer();
      if (achou) break;
    }
    pos.desfazer();
    if (!achou) return false;
  }
  return true;
}

/**
 * Lances de quem tem a vez que forcam mate em ate n lances (n = 1: mate imediato).
 * @param {import('./xadrez.js').Posicao} pos @param {number} n
 * @returns {number[]}
 */
export function lancesDeMate(pos, n) {
  const out = [];
  for (const m of pos.legais()) {
    pos.fazer(m);
    const ok = forcaMateDepois(pos, n - 1);
    pos.desfazer();
    if (ok) out.push(m);
  }
  return out;
}

/** o lance da mate imediato? @param {import('./xadrez.js').Posicao} pos @param {number} m */
export function daMate(pos, m) {
  if (!pos.fazer(m)) return false;
  const r = pos.emXeque() && !pos.temLegal();
  pos.desfazer();
  return r;
}

/**
 * Menor N (ate max) com mate forcado, ou 0.
 * @param {import('./xadrez.js').Posicao} pos @param {number} max
 */
export function mateMinimo(pos, max) {
  for (let n = 1; n <= max; n++) if (lancesDeMate(pos, n).length) return n;
  return 0;
}
