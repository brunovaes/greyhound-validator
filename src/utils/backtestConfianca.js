'use strict';
// src/utils/backtestConfianca.js
//
// BACKTEST do "AvB de alta confiança" (as entradas que beiram 100%).
//
// Pergunta que responde: no histórico, quando o GAP de score do motor entre dois
// galgos da MESMA corrida é grande, com que frequência o de MAIOR score chega na
// frente do de menor? E — o pulo do gato — isso continua valendo quando as ODDS
// são PRÓXIMAS (mercado ~parelho), que é onde o "Frente a frente" abre e onde
// mora o edge (mercado não vê a diferença que o nosso score vê)?
//
// É PURAMENTE LEITURA: varre races.scores_json (score + oddMedia por galgo) e
// races.finishing_order_json (chegada real). Não grava nada, não altera análise.
//
// Saída: taxa de acerto por faixa de gap (todos os pares e só os de odd próxima),
// a matriz proximidade-de-SP × gap, e a distribuição dos gaps (pra calibrar).
const { bateuPar } = require('./avbResultado');

function _num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

// Faixas de gap de score (escala ~0-100; thresholds do motor: skip=10, back=25).
const GAP_BUCKETS = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 40], [40, 1e9]];
// Proximidade de SP = razão entre a maior e a menor oddMedia do par (1.0 = idênticas).
const SP_BUCKETS = [[1, 1.15], [1.15, 1.3], [1.3, 1.6], [1.6, 1e9]];

function _rot(bk) { return bk[1] >= 1e9 ? (bk[0] + '+') : (bk[0] + '–' + bk[1]); }
function _bucketDe(val, buckets) { for (const b of buckets) { if (val >= b[0] && val < b[1]) return _rot(b); } return null; }

function rodar(db, opts) {
  opts = opts || {};
  const spCloseRatio = opts.spCloseRatio > 0 ? opts.spCloseRatio : 1.3; // "odds próximas"

  const rows = db.prepare(
    "SELECT scores_json, finishing_order_json FROM races " +
    "WHERE scores_json IS NOT NULL AND finishing_order_json IS NOT NULL"
  ).all();

  const porGap = {};          // todos os pares, por faixa de gap
  const porGapSPclose = {};   // só pares com odd próxima (ratio <= spCloseRatio)
  const matriz = {};          // [faixaSP][faixaGap] -> {ok,tot}
  const gaps = [];            // distribuição bruta dos gaps (pra calibrar as faixas)
  let totRaces = 0, totPares = 0, comOdd = 0;

  const inc = (obj, key, hit) => { const o = obj[key] || (obj[key] = { ok: 0, tot: 0 }); o.tot++; if (hit) o.ok++; };

  for (const row of rows) {
    let dogs = null, fo = null;
    try { dogs = JSON.parse(row.scores_json); } catch (e) { continue; }
    try { fo = JSON.parse(row.finishing_order_json); } catch (e) { continue; }
    if (!Array.isArray(dogs) || dogs.length < 2 || !Array.isArray(fo) || !fo.length) continue;
    totRaces++;

    const val = dogs
      .map(d => ({ trap: _num(d.trap), score: _num(d.score), odd: _num(d.oddMedia) }))
      .filter(d => d.trap != null && d.score != null);

    for (let i = 0; i < val.length; i++) {
      for (let j = i + 1; j < val.length; j++) {
        // A = maior score, B = menor score
        const A = val[i].score >= val[j].score ? val[i] : val[j];
        const B = val[i].score >= val[j].score ? val[j] : val[i];
        const res = bateuPar(fo, A.trap, B.trap); // A chegou na frente de B?
        if (res === null) continue;               // um dos dois fora da chegada

        const gap = Math.abs(A.score - B.score);
        const gapBk = _bucketDe(gap, GAP_BUCKETS);
        if (!gapBk) continue;
        totPares++;
        gaps.push(gap);
        inc(porGap, gapBk, res);

        // Proximidade de SP: só quando temos oddMedia dos DOIS galgos.
        if (A.odd > 0 && B.odd > 0) {
          comOdd++;
          const ratio = Math.max(A.odd, B.odd) / Math.min(A.odd, B.odd);
          if (ratio <= spCloseRatio) inc(porGapSPclose, gapBk, res);
          const spBk = _bucketDe(ratio, SP_BUCKETS);
          if (spBk) { const m = matriz[spBk] || (matriz[spBk] = {}); inc(m, gapBk, res); }
        }
      }
    }
  }

  // Ordena as faixas de gap na ordem natural das GAP_BUCKETS.
  const ordemGap = GAP_BUCKETS.map(_rot);
  const fmt = (obj) => ordemGap.filter(k => obj[k]).map(k => ({
    faixa_gap: k, n: obj[k].tot, acertos: obj[k].ok,
    taxa_pct: +(100 * obj[k].ok / obj[k].tot).toFixed(1)
  }));
  const fmtMat = {};
  for (const sp of SP_BUCKETS.map(_rot)) if (matriz[sp]) fmtMat[sp] = fmt(matriz[sp]);

  // Distribuição dos gaps, pra confirmar a escala e recalibrar as faixas se preciso.
  gaps.sort((a, b) => a - b);
  const pct = (p) => gaps.length ? +(gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))]).toFixed(1) : null;
  const distrib = gaps.length
    ? { min: gaps[0], p25: pct(0.25), mediana: pct(0.5), p75: pct(0.75), p90: pct(0.9), max: gaps[gaps.length - 1] }
    : null;

  return {
    resumo: {
      corridas_analisadas: totRaces,
      pares_avaliados: totPares,
      pares_com_odd: comOdd,
      sp_close_ratio: spCloseRatio,
      obs_odd: comOdd < totPares
        ? 'Nem todo par tem oddMedia (só corridas analisadas depois do campo entrar no ar). A visão por SP enche com o tempo; a "por_gap_todos" já vale pra tudo.'
        : 'Todos os pares têm oddMedia.'
    },
    distribuicao_gap: distrib,
    por_gap_todos: fmt(porGap),
    por_gap_sp_proxima: fmt(porGapSPclose),
    matriz_sp_x_gap: fmtMat,
    legenda: 'taxa_pct = % em que o galgo de MAIOR score chegou na frente do de menor. '
      + '"por_gap_sp_proxima" = só pares com odds próximas (ratio ≤ ' + spCloseRatio + '), que é onde o Frente a frente abre e onde está o edge. '
      + 'Procure a faixa de gap com taxa perto de 100% E n alto: é o corte candidato pra "praticamente impossível dar errado".'
  };
}

module.exports = { rodar };
