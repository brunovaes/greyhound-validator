'use strict';
// src/utils/spEngine.js
// Motor de pontuacao de SP (Starting Price) — especificacao fechada com o
// Bruno em 13/07/2026. O SP mede a confianca do MERCADO no galgo antes da
// largada (nao a qualidade do animal em si) — complementa CalTm/Bends/
// Remarks/BRT, que medem desempenho, com um sinal totalmente diferente:
// reputacao/expectativa coletiva.
//
// 3 indices, combinados no IRM (Indice de Respeito do Mercado):
//   Confianca   (peso 50%) = media ponderada por recencia das odds -> score 0-10
//   Estabilidade (peso 30%) = coeficiente de variacao das probabilidades (nao das notas!) -> 0-10
//   Favoritismo (peso 20%) = frequencia de F/JF (favorito/favorito dividido) nas ultimas 5
// IRM final (0-10) * 10 = score do criterio SP (0-100), no mesmo padrao dos outros.

// Tabela calibrada manualmente pelo Bruno — nao segue formula matematica
// simples (testado: nem raiz, nem log batem bem), entao mantemos tabela +
// interpolacao pela probabilidade implicita em vez de forcar uma formula
// generica que se afastaria dos pontos que ele calibrou.
const TABELA_SP = [
  ['4/6', 10.0], ['4/5', 9.8], ['1/1', 9.5], ['6/5', 9.2], ['5/4', 9.0],
  ['6/4', 8.8], ['7/4', 8.5], ['2/1', 8.0], ['5/2', 7.5], ['3/1', 7.0],
  ['7/2', 6.5], ['4/1', 6.0], ['5/1', 5.5], ['6/1', 5.0], ['8/1', 4.0],
  ['10/1', 3.5], ['12/1', 3.0], ['16/1', 2.0], ['20/1', 1.0],
];

function probImplicita(fracaoStr) {
  const m = (fracaoStr || '').match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1]), den = parseInt(m[2]);
  if (!den && !num) return null;
  return den / (num + den);
}

const PONTOS_SP = TABELA_SP
  .map(([frac, score]) => ({ p: probImplicita(frac), score }))
  .sort((a, b) => a.p - b.p);

// Converte uma fracao de odd (com ou sem sufixo F/J) numa nota 0-10 —
// interpolacao linear pela probabilidade implicita entre os pontos da tabela.
function scoreSP(fracaoRaw) {
  const fracaoLimpa = (fracaoRaw || '').replace(/[A-Za-z]+$/, '');
  const pAlvo = probImplicita(fracaoLimpa);
  if (pAlvo === null) return null;

  if (pAlvo <= PONTOS_SP[0].p) return Math.max(0, PONTOS_SP[0].score - (PONTOS_SP[0].p - pAlvo) * 15);
  const ultimo = PONTOS_SP[PONTOS_SP.length - 1];
  if (pAlvo >= ultimo.p) return Math.min(10, ultimo.score + (pAlvo - ultimo.p) * 15);

  for (let i = 0; i < PONTOS_SP.length - 1; i++) {
    if (pAlvo >= PONTOS_SP[i].p && pAlvo <= PONTOS_SP[i + 1].p) {
      const frac = (pAlvo - PONTOS_SP[i].p) / (PONTOS_SP[i + 1].p - PONTOS_SP[i].p);
      return PONTOS_SP[i].score + frac * (PONTOS_SP[i + 1].score - PONTOS_SP[i].score);
    }
  }
  return null;
}

function ehFavorito(fracaoRaw) {
  return /[FJ]$/.test((fracaoRaw || '').trim());
}

const PESOS_RECENCIA = [1.50, 1.30, 1.10, 0.90, 0.70]; // mais recente primeiro
const TETO_CV = 0.5; // confirmado com o Bruno 13/07 — CV >= 0.5 zera a Estabilidade

// ── Calculo principal — recebe as linhas validas (mais recente primeiro),
// usa ate as 5 mais recentes que tenham SP legivel.
function calcularSP(linhasValidas) {
  const comSP = (linhasValidas || [])
    .filter(l => l.sp && probImplicita(l.sp.replace(/[A-Za-z]+$/, '')) !== null)
    .slice(0, 5);

  if (comSP.length < 3) return 50; // sem dado suficiente pra confiar, neutro

  // Confianca — media ponderada por recencia das notas 0-10
  const pesos = PESOS_RECENCIA.slice(0, comSP.length);
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  const confiancaRaw = comSP.reduce((acc, l, i) => acc + scoreSP(l.sp) * pesos[i], 0) / somaPesos;

  // Estabilidade — coeficiente de variacao das PROBABILIDADES (nao das notas —
  // testado com o Bruno, CV na nota nao distingue "sempre fraco" de "indeciso")
  const probs = comSP.map(l => probImplicita(l.sp.replace(/[A-Za-z]+$/, '')));
  const mediaProb = probs.reduce((a, b) => a + b, 0) / probs.length;
  const desvioProb = Math.sqrt(probs.reduce((acc, p) => acc + Math.pow(p - mediaProb, 2), 0) / probs.length);
  const cv = mediaProb > 0 ? desvioProb / mediaProb : 1;
  const estabilidadeRaw = Math.max(0, 10 - (cv / TETO_CV) * 10);

  // Favoritismo — frequencia de F/JF entre as linhas consideradas
  const qtdFavorito = comSP.filter(l => ehFavorito(l.sp)).length;
  const favoritismoRaw = (qtdFavorito / comSP.length) * 10;

  const irm = (confiancaRaw * 0.50) + (estabilidadeRaw * 0.30) + (favoritismoRaw * 0.20);

  return Math.max(0, Math.min(100, Math.round(irm * 10)));
}

module.exports = { probImplicita, scoreSP, ehFavorito, calcularSP, TABELA_SP, TETO_CV, PESOS_RECENCIA };