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
const SINAIS = ['caltm', 'consistencia', 'categoria', 'sp_mercado', 'split', 'perfil', 'boxe_menor', 'trap_vazia'];

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

module.exports = { rodar };
