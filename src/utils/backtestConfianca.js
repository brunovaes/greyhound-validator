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
const { probImplicita } = require('./spEngine');

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

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST DO FUNIL "CARGA VIP" (hipótese do Bruno)
// Funil, na ordem: odds quase iguais > mesma categoria entre os dois >
// melhor split (define o pick) > pick não é Fumador > pick mais rápido que o
// outro por > Δt nas 2 últimas. Mede quantas vezes o pick chegou na frente.
//
// Recalcula a odd das 2 últimas a partir do hist_all.sp (não depende do oddMedia
// gravado, que é recente) — então roda em todo o histórico. Leitura pura.
function _oddDecimal(spStr) {
  if (!spStr) return null;
  const p = probImplicita(String(spStr).replace(/[A-Za-z]+$/, ''));
  return (p && p > 0) ? 1 / p : null;
}
function _isTrialClasse(c) {
  const s = String(c || '').trim().toUpperCase();
  return s === 'T' || s === 'S' || s.startsWith('T ') || s.startsWith('S ');
}
function _ultimasCorridas(historico, n) {
  return (historico || []).filter(l => l && !_isTrialClasse(l.classe) && Number(l.caltm) > 0).slice(0, n);
}
function _avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

function rodarVIP(db, opts) {
  opts = opts || {};
  const spRatioMax = opts.spRatioMax > 0 ? opts.spRatioMax : 1.15; // "odds quase iguais"
  const dtMin = opts.dtMin > 0 ? opts.dtMin : 0.10;               // pick mais rápido por > dtMin (s)

  const rows = db.prepare(
    "SELECT s.created_at AS quando, r.scores_json, r.hist_all, r.finishing_order_json, r.corrida " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE r.scores_json IS NOT NULL AND r.hist_all IS NOT NULL AND r.finishing_order_json IS NOT NULL"
  ).all();

  const funil = { pares: 0, odds_coladas: 0, categoria_igual: 0, tem_split: 0, nao_fuma: 0, tempo_ok: 0 };
  const entradas = [];   // {acertou, ofuma, pfront} — pra medir baseline + ideias novas
  const dias = new Set();
  const exemplos = [];

  for (const row of rows) {
    let dogsScore = null, histAll = null, fo = null;
    try { dogsScore = JSON.parse(row.scores_json); } catch (e) { continue; }
    try { histAll = JSON.parse(row.hist_all); } catch (e) { continue; }
    try { fo = JSON.parse(row.finishing_order_json); } catch (e) { continue; }
    if (!Array.isArray(dogsScore) || !Array.isArray(histAll) || !Array.isArray(fo) || !fo.length) continue;

    const perfilPorTrap = {}, histPorTrap = {};
    for (const d of dogsScore) if (d && d.trap != null) perfilPorTrap[d.trap] = d.perfil || null;
    for (const h of histAll) if (h && h.trap != null) histPorTrap[h.trap] = h.historico || [];

    const info = {};
    for (const t of Object.keys(histPorTrap).map(Number).filter(t => Object.prototype.hasOwnProperty.call(perfilPorTrap, t))) {
      const u2 = _ultimasCorridas(histPorTrap[t], 2);
      if (u2.length < 2) continue; // precisa das 2 últimas corridas de verdade
      const odds = u2.map(l => _oddDecimal(l.sp)).filter(v => v != null);
      const splits = u2.map(l => Number(l.split)).filter(v => Number.isFinite(v) && v > 0);
      const tempos = u2.map(l => Number(l.caltm)).filter(v => Number.isFinite(v) && v > 0);
      info[t] = {
        trap: t, perfil: perfilPorTrap[t],
        oddMedia: odds.length ? _avg(odds) : null,
        splitAvg: splits.length ? _avg(splits) : null,
        caltmAvg: tempos.length ? _avg(tempos) : null,
        catRecent: u2[0] ? String(u2[0].classe || '').trim().toUpperCase() : null
      };
    }

    const lista = Object.values(info);
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const X = lista[i], Y = lista[j];
        funil.pares++;
        // 1. odds quase iguais
        if (!(X.oddMedia > 0 && Y.oddMedia > 0)) continue;
        const ratio = Math.max(X.oddMedia, Y.oddMedia) / Math.min(X.oddMedia, Y.oddMedia);
        if (ratio > spRatioMax) continue;
        funil.odds_coladas++;
        // 2. mesma categoria entre os dois (classe mais recente)
        if (!(X.catRecent && Y.catRecent && X.catRecent === Y.catRecent)) continue;
        funil.categoria_igual++;
        // 3. melhor split define o pick
        if (!(X.splitAvg > 0 && Y.splitAvg > 0)) continue;
        funil.tem_split++;
        const pick = X.splitAvg <= Y.splitAvg ? X : Y;
        const other = pick === X ? Y : X;
        // 4. pick não fuma
        if (pick.perfil === 'Fumador') continue;
        funil.nao_fuma++;
        // 5. pick mais rápido que o outro por > Δt nas 2 últimas
        if (!(pick.caltmAvg > 0 && other.caltmAvg > 0)) continue;
        if (!((other.caltmAvg - pick.caltmAvg) > dtMin)) continue;
        funil.tempo_ok++;
        // resultado real
        const res = bateuPar(fo, pick.trap, other.trap);
        if (res === null) continue;
        if (row.quando) dias.add(String(row.quando).slice(0, 10));
        entradas.push({
          acertou: res,
          ofuma: other.perfil === 'Fumador',    // ideia 1: o ADVERSÁRIO cai no fim
          pfront: pick.perfil === 'Frontrunner' // ideia 2: o pick corre na frente
        });
        if (exemplos.length < 25) exemplos.push({
          corrida: row.corrida, pick: pick.trap, other: other.trap,
          ratio_odd: +ratio.toFixed(3), dt_caltm: +(other.caltmAvg - pick.caltmAvg).toFixed(2),
          categoria: X.catRecent, acertou: res,
          outro_fuma: other.perfil === 'Fumador', pick_frontrunner: pick.perfil === 'Frontrunner'
        });
      }
    }
  }

  const nDias = dias.size || 1;
  const resumoDe = (arr) => {
    const n = arr.length, ac = arr.filter(e => e.acertou).length;
    return { entradas: n, acertos: ac, taxa_pct: n ? +(100 * ac / n).toFixed(1) : null, entradas_por_dia: +(n / nDias).toFixed(2) };
  };
  return {
    parametros: {
      sp_ratio_max: spRatioMax, delta_tempo_min_s: dtMin,
      categoria: 'mesma entre os dois (classe mais recente)',
      split: 'média das 2 últimas (menor = pick)', regra_fuma: 'pick != Fumador'
    },
    funil,
    dias_cobertos: nDias,
    // baseline = o funil atual. As três abaixo são as IDEIAS NOVAS, medidas
    // sobre as mesmas entradas — dá pra ver num tiro só se cada uma sobe o acerto.
    baseline: resumoDe(entradas),
    ideia1_outro_fuma: resumoDe(entradas.filter(e => e.ofuma)),
    ideia2_pick_frontrunner: resumoDe(entradas.filter(e => e.pfront)),
    ideias_1e2_juntas: resumoDe(entradas.filter(e => e.ofuma && e.pfront)),
    exemplos,
    legenda: 'baseline = o funil atual (odds coladas, mesma categoria, melhor split, não fuma, mais rápido por >Δt). '
      + 'ideia1_outro_fuma = só quando o ADVERSÁRIO é Fumador (apostar contra quem cai). '
      + 'ideia2_pick_frontrunner = só quando o pick corre na frente (Frontrunner). ideias_1e2_juntas = as duas juntas. '
      + 'Compare taxa_pct e entradas_por_dia de cada uma contra o baseline. Ajuste ?sp= e ?dt= na URL.'
  };
}

module.exports = { rodar, rodarVIP };
