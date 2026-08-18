'use strict';
// src/utils/estudoReverso.js
//
// ESTUDO REVERSO (Fase 1) — dado o pódio REAL, qual sinal separa o vencedor em
// pares de ODD COLADA (onde o AvB abre)? Global e por contexto (turno/pista),
// com n e VALIDAÇÃO treino/teste (acha o padrão na 1a metade dos dias, confere
// na 2a). Guarda contra overfitting: sinal que só vale numa metade = ruído.
//
// Leitura pura: usa races.hist_all (histórico parseado do PDF), finishing_order_json
// (pódio) e race_card (traps presentes). Não grava nada.
const { probImplicita } = require('./spEngine');
const { bateuPar } = require('./avbResultado');

// ── helpers de dado ──────────────────────────────────────────────────────────
function _oddDecimal(sp) { if (!sp) return null; const p = probImplicita(String(sp).replace(/[A-Za-z]+$/, '')); return (p && p > 0) ? 1 / p : null; }
function _isTrial(c) { const s = String(c || '').trim().toUpperCase(); return s === 'T' || s === 'S' || s.startsWith('T ') || s.startsWith('S '); }
function _ult(hist, n) { return (hist || []).filter(l => l && !_isTrial(l.classe) && Number(l.caltm) > 0).slice(0, n); }
function _avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function _std(a) { if (a.length < 2) return null; const m = _avg(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); }
function _nivelCat(c) { const s = String(c || '').trim().toUpperCase(); if (/^OR\d?$/.test(s)) return 1; const m = s.match(/^A(\d+)$/); return m ? parseInt(m[1]) : null; }
function _perfilRank(hist) { // 2 = corre na frente, 1 = meio, 0 = fumador
  const res = (hist || []).slice(0, 5).map(l => {
    const b = l && l.bends; if (!b || String(b).length < 2) return null;
    const nums = String(b).split('').map(Number).filter(n => !isNaN(n) && n > 0); if (nums.length < 2) return null;
    const diffs = []; for (let i = 1; i < nums.length; i++) diffs.push(nums[i] - nums[i - 1]);
    const pr = nums[0], ul = nums[nums.length - 1], q1 = nums.filter(n => n === 1).length;
    if (q1 >= 3) return 2; if (diffs.every(d => d <= 0) && ul < pr) return 2;
    if (diffs.every(d => d >= 0) && ul > pr) return 0; return 1;
  }).filter(v => v != null);
  return res.length ? Math.round(_avg(res)) : 1;
}
// hora do PDF -> UK 24h (h 1-9 = tarde/noite, +12). Depois: manhã <12, tarde 12-17, noite >=18.
function _turno(hora) {
  const p = String(hora || '').split(':'); if (p.length < 2) return null;
  let h = parseInt(p[0]); if (!(h >= 0)) return null; if (h >= 1 && h <= 9) h += 12;
  return h < 12 ? 'manha' : (h < 18 ? 'tarde' : 'noite');
}
function _pista(corrida) { return String(corrida || '').trim().split(/\s+/)[0] || '?'; }

// perfil computado de um galgo (do hist_all)
function _perfilGalgo(h) {
  const u = _ult(h.historico || [], 5);
  if (u.length < 2) return null;
  const u2 = u.slice(0, 2);
  return {
    trap: Number(h.trap),
    oddMedia: _avg(u2.map(l => _oddDecimal(l.sp)).filter(v => v != null)),
    caltm: _avg(u2.map(l => Number(l.caltm)).filter(v => v > 0)),
    split: _avg(u2.map(l => Number(l.split)).filter(v => v > 0)),
    posStd: _std(u.map(l => Number(l.pos)).filter(v => v > 0)),
    // pódio: % das últimas (até 5) em que chegou no top 3
    podio: (() => { const ps = u.map(l => Number(l.pos)).filter(v => v > 0); return ps.length ? _avg(ps.map(p => p <= 3 ? 1 : 0)) : null; })(),
    catNivel: _nivelCat(u2[0].classe),
    perfil: _perfilRank(h.historico || [])
  };
}

// Cada sinal vota: +1 = X favorecido, -1 = Y favorecido, 0 = empate/sem dado.
// (menor caltm/split/posStd/catNivel/odd = melhor; maior perfil = melhor)
function _votos(X, Y, vazioX, vazioY) {
  const cmp = (a, b, menorMelhor) => {
    if (a == null || b == null || a === b) return 0;
    return menorMelhor ? (a < b ? 1 : -1) : (a > b ? 1 : -1);
  };
  return {
    caltm: cmp(X.caltm, Y.caltm, true),
    podio: cmp(X.podio, Y.podio, false),          // maior taxa de pódio = melhor
    consistencia: cmp(X.posStd, Y.posStd, true),
    categoria: cmp(X.catNivel, Y.catNivel, true),
    sp_mercado: cmp(X.oddMedia, Y.oddMedia, true),
    split: cmp(X.split, Y.split, true),
    perfil: cmp(X.perfil, Y.perfil, false),
    boxe_menor: cmp(X.trap, Y.trap, true),
    // trap vazia ao lado: só vota quando um tem e o outro não
    trap_vazia: (vazioX && !vazioY) ? 1 : ((vazioY && !vazioX) ? -1 : 0)
  };
}
const SINAIS = ['caltm', 'podio', 'consistencia', 'categoria', 'sp_mercado', 'split', 'perfil', 'boxe_menor', 'trap_vazia'];

function rodar(db, opts) {
  opts = opts || {};
  const spRatioMax = opts.spRatioMax > 0 ? opts.spRatioMax : 1.15;

  const rows = db.prepare(
    "SELECT date(s.created_at,'-3 hours') AS dia, r.hora, r.corrida, r.dist, r.hist_all, r.finishing_order_json, r.race_card " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE r.hist_all IS NOT NULL AND r.finishing_order_json IS NOT NULL"
  ).all();

  const regs = [];           // um registro por par de odd colada com resultado
  let totRaces = 0;
  for (const row of rows) {
    let hist = null, fo = null, rc = null;
    try { hist = JSON.parse(row.hist_all); } catch (e) { continue; }
    try { fo = JSON.parse(row.finishing_order_json); } catch (e) { continue; }
    if (!Array.isArray(hist) || hist.length < 2 || !Array.isArray(fo) || !fo.length) continue;
    try { rc = JSON.parse(row.race_card); } catch (e) { rc = null; }
    totRaces++;

    // traps presentes -> traps vazias (assumindo grid de 6)
    const presentes = new Set();
    (Array.isArray(rc) ? rc : hist).forEach(g => { if (g && g.trap != null) presentes.add(Number(g.trap)); });
    const vazias = new Set(); for (let t = 1; t <= 6; t++) if (!presentes.has(t)) vazias.add(t);
    const temVaziaAoLado = t => vazias.has(t - 1) || vazias.has(t + 1);

    const galgos = hist.map(_perfilGalgo).filter(g => g && g.oddMedia > 0 && g.trap > 0);
    const turno = _turno(row.hora), pista = _pista(row.corrida);

    for (let i = 0; i < galgos.length; i++) {
      for (let j = i + 1; j < galgos.length; j++) {
        const X = galgos[i], Y = galgos[j];
        const ratio = Math.max(X.oddMedia, Y.oddMedia) / Math.min(X.oddMedia, Y.oddMedia);
        if (ratio > spRatioMax) continue;                        // só odd colada
        const res = bateuPar(fo, X.trap, Y.trap);                // X na frente de Y?
        if (res === null) continue;
        const winner = res ? 1 : -1;                             // +1 = X venceu, -1 = Y
        regs.push({ dia: row.dia, turno, pista, winner, votos: _votos(X, Y, temVaziaAoLado(X.trap), temVaziaAoLado(Y.trap)) });
      }
    }
  }

  // ── agregações ──────────────────────────────────────────────────────────────
  const taxaSinal = (arr, sinal) => {
    let n = 0, ok = 0;
    for (const r of arr) { const v = r.votos[sinal]; if (v === 0) continue; n++; if (v === r.winner) ok++; }
    return { n, acertos: ok, taxa_pct: n ? +(100 * ok / n).toFixed(1) : null };
  };
  const rankear = (arr) => SINAIS.map(s => Object.assign({ sinal: s }, taxaSinal(arr, s)))
    .filter(x => x.n > 0).sort((a, b) => (b.taxa_pct || 0) - (a.taxa_pct || 0));

  // treino/teste: metade dos dias (por data)
  const dias = Array.from(new Set(regs.map(r => r.dia))).sort();
  const corte = dias[Math.floor(dias.length / 2)] || null;
  const treino = regs.filter(r => corte && r.dia < corte);
  const teste = regs.filter(r => corte && r.dia >= corte);
  const globalComValidacao = SINAIS.map(s => {
    const g = taxaSinal(regs, s), tr = taxaSinal(treino, s), te = taxaSinal(teste, s);
    return { sinal: s, n: g.n, taxa_pct: g.taxa_pct, taxa_treino: tr.taxa_pct, taxa_teste: te.taxa_pct, n_treino: tr.n, n_teste: te.n };
  }).filter(x => x.n > 0).sort((a, b) => (b.taxa_pct || 0) - (a.taxa_pct || 0));

  // volume por contexto
  const contar = (keyFn) => { const m = {}; for (const r of regs) { const k = keyFn(r) || '?'; m[k] = (m[k] || 0) + 1; } return m; };
  const volPorTurno = contar(r => r.turno);
  const volPorPista = contar(r => r.pista);

  // ranking por turno e por pista (só onde n>=30 no contexto, senão é ruído)
  const porGrupo = (keyFn, minN) => {
    const grupos = {};
    for (const r of regs) { const k = keyFn(r) || '?'; (grupos[k] = grupos[k] || []).push(r); }
    const out = {};
    for (const k in grupos) if (grupos[k].length >= minN) out[k] = { n_pares: grupos[k].length, ranking: rankear(grupos[k]).slice(0, 4) };
    return out;
  };

  return {
    resumo: {
      corridas: totRaces, pares_odd_colada: regs.length, sp_ratio_max: spRatioMax,
      dias: dias.length, corte_treino_teste: corte,
      sinais_priorizados_bruno: ['caltm', 'consistencia', 'boxe/trap_vazia', 'categoria']
    },
    volume_por_turno: volPorTurno,
    volume_por_pista: volPorPista,
    ranking_global: globalComValidacao,     // com validação treino/teste
    ranking_por_turno: porGrupo(r => r.turno, 30),
    ranking_por_pista: porGrupo(r => r.pista, 40),
    legenda: 'taxa_pct = % em que o sinal apontou o galgo que REALMENTE chegou na frente, em pares de odd colada. '
      + '50% = sem poder preditivo (moeda). Compare cada sinal contra sp_mercado (o palpite do próprio mercado). '
      + 'VALIDAÇÃO: taxa_treino x taxa_teste — se um sinal é real, as duas batem; se descolam muito, é ruído/overfit. '
      + 'Contexto (turno/pista) só aparece com n suficiente (evita padrão de amostra pequena). '
      + 'trap_vazia: só conta pares em que UM galgo tem trap vazia ao lado e o outro não.'
  };
}

// ── MAPA por relevância: todas as combinações pista×turno×metragem×categoria ──
// (subconjuntos de 1 a 3 dimensões, pra não pulverizar a amostra) × sinal.
// Ranqueado pelo LIMITE INFERIOR do IC 95% (Wilson): a "relevância honesta" —
// premia edge alto COM amostra grande e derruba os 90%-de-8-corridas.
function _categoria(corrida) { const p = String(corrida || '').trim().split(/\s+/); return p.length > 1 ? p[p.length - 1].toUpperCase() : '?'; }
function _distVal(dist) { const d = parseInt(String(dist || '').replace(/[^0-9]/g, '')) || 0; return d ? d + 'm' : '?'; }
function _wilson(ok, n) { if (!n) return [0, 0]; const z = 1.96, p = ok / n, den = 1 + z * z / n; const c = (p + z * z / (2 * n)) / den; const h = (z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / den; return [c - h, c + h]; }

function mapa(db, opts) {
  opts = opts || {};
  const spRatioMax = opts.spRatioMax > 0 ? opts.spRatioMax : 1.15;
  const minN = opts.minN > 0 ? opts.minN : 40;   // piso de amostra por gaveta
  const topN = opts.topN > 0 ? opts.topN : 80;

  const rows = db.prepare(
    "SELECT r.hora, r.corrida, r.dist, r.hist_all, r.finishing_order_json, r.race_card " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE r.hist_all IS NOT NULL AND r.finishing_order_json IS NOT NULL"
  ).all();

  const regs = [];
  for (const row of rows) {
    let hist = null, fo = null, rc = null;
    try { hist = JSON.parse(row.hist_all); } catch (e) { continue; }
    try { fo = JSON.parse(row.finishing_order_json); } catch (e) { continue; }
    if (!Array.isArray(hist) || hist.length < 2 || !Array.isArray(fo) || !fo.length) continue;
    try { rc = JSON.parse(row.race_card); } catch (e) { rc = null; }
    const presentes = new Set();
    (Array.isArray(rc) ? rc : hist).forEach(g => { if (g && g.trap != null) presentes.add(Number(g.trap)); });
    const vaz = new Set(); for (let t = 1; t <= 6; t++) if (!presentes.has(t)) vaz.add(t);
    const temVazia = t => vaz.has(t - 1) || vaz.has(t + 1);
    const galgos = hist.map(_perfilGalgo).filter(g => g && g.oddMedia > 0 && g.trap > 0);
    const ctx = { turno: _turno(row.hora), pista: _pista(row.corrida), dist: _distVal(row.dist), cat: _categoria(row.corrida) };
    for (let i = 0; i < galgos.length; i++) for (let j = i + 1; j < galgos.length; j++) {
      const X = galgos[i], Y = galgos[j];
      if (Math.max(X.oddMedia, Y.oddMedia) / Math.min(X.oddMedia, Y.oddMedia) > spRatioMax) continue;
      const res = bateuPar(fo, X.trap, Y.trap); if (res === null) continue;
      regs.push({ turno: ctx.turno, pista: ctx.pista, dist: ctx.dist, cat: ctx.cat, winner: res ? 1 : -1, votos: _votos(X, Y, temVazia(X.trap), temVazia(Y.trap)) });
    }
  }

  const DIMS = [{ k: 'pista', g: r => r.pista }, { k: 'turno', g: r => r.turno }, { k: 'dist', g: r => r.dist }, { k: 'cat', g: r => r.cat }];
  // subconjuntos de 1 a 3 dimensões
  const subsets = [];
  for (let m = 1; m < (1 << DIMS.length); m++) { const s = []; for (let i = 0; i < DIMS.length; i++) if (m & (1 << i)) s.push(DIMS[i]); if (s.length <= 3) subsets.push(s); }

  const celulas = [];
  for (const sub of subsets) {
    const grupos = {};
    for (const r of regs) { const key = sub.map(d => d.k + '=' + (d.g(r) || '?')).join(' · '); (grupos[key] = grupos[key] || []).push(r); }
    for (const key in grupos) {
      const arr = grupos[key];
      if (arr.length < minN) continue;
      for (const sinal of SINAIS) {
        let n = 0, ok = 0;
        for (const r of arr) { const v = r.votos[sinal]; if (v === 0) continue; n++; if (v === r.winner) ok++; }
        if (n < minN) continue;
        const [lo, hi] = _wilson(ok, n);
        if (lo <= 0.5) continue;                 // só o que é CONFIANTEMENTE acima da moeda
        celulas.push({
          profundidade: sub.length, contexto: key, sinal,
          n, acertos: ok, taxa_pct: +(100 * ok / n).toFixed(1),
          ic_low_pct: +(100 * lo).toFixed(1), ic_high_pct: +(100 * hi).toFixed(1)
        });
      }
    }
  }
  celulas.sort((a, b) => b.ic_low_pct - a.ic_low_pct);

  return {
    parametros: { sp_ratio_max: spRatioMax, min_amostra: minN, ordenado_por: 'limite inferior do IC 95% (relevância honesta)' },
    total_pares: regs.length,
    celulas_relevantes: celulas.length,
    por_profundidade: { '1_dim': celulas.filter(c => c.profundidade === 1).length, '2_dim': celulas.filter(c => c.profundidade === 2).length, '3_dim': celulas.filter(c => c.profundidade === 3).length },
    mapa: celulas.slice(0, topN),
    legenda: 'Cada célula: um contexto (1 a 3 filtros) + o sinal que funciona nele. Só aparecem gavetas com n>=' + minN
      + ' E cujo edge é CONFIANTEMENTE > 50% (limite inferior do IC 95% acima da moeda). Ordenado por ic_low_pct = o '
      + 'PIOR caso honesto do edge — é por ele que se aposta, não pela taxa crua. Se combinação de 4 filtros não aparece, '
      + 'é porque não há corridas suficientes: o mapa está te protegendo do overfit, não escondendo ouro.'
  };
}

module.exports = { rodar, mapa };