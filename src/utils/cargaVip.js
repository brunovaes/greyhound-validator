'use strict';
// src/utils/cargaVip.js
//
// CARGA VIP — lista de "entradas fortes" das corridas de HOJE.
//
// Funil (validado em 32 dias de backtest): odds coladas (SP das 2 últimas com
// razão ≤ spRatioMax) + os dois na mesma categoria + o galgo de melhor split
// (o "pick") mais rápido que o outro por > Δt nas 2 últimas. Não é "certeza":
// é filtro de VALOR. Taxa histórica medida: ~62% (nível Valor, Δt≥0.10s) e
// ~69% (nível Premium, Δt≥0.50s). O perfil (fumador/frente) NÃO entra como
// filtro — só como SELO de bônus em observação (amostra ainda pequena).
//
// Leitura pura: lê races.hist_all (bends/sp/split/caltm/classe por linha) das
// corridas de hoje e devolve os pares que passam o funil. Não grava nada.
const { probImplicita } = require('./spEngine');

// Taxas medidas no backtest (32 dias) — etiqueta honesta na tela.
const TAXA_VALOR = 62;
const TAXA_PREMIUM = 69;
const DT_VALOR = 0.10;
const DT_PREMIUM = 0.50;

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

// Perfil recalculado dos bends (mesma regra do motor, calcularPerfil):
// avassalador/modoturbo = corre na frente; fumador = cai no fim.
function _perfilDeHist(historico) {
  const res = (historico || []).slice(0, 5).map(l => {
    const bends = l && l.bends;
    if (!bends || String(bends).length < 2) return null;
    const nums = String(bends).split('').map(Number).filter(n => !isNaN(n) && n > 0);
    if (nums.length < 2) return null;
    const diffs = [];
    for (let i = 1; i < nums.length; i++) diffs.push(nums[i] - nums[i - 1]);
    const primeiro = nums[0], ultimo = nums[nums.length - 1];
    const terminouMelhor = ultimo < primeiro, terminouPior = ultimo > primeiro;
    const nuncaMelhorou = diffs.every(d => d >= 0), nuncaPiorou = diffs.every(d => d <= 0);
    const qtdPrimeiro = nums.filter(n => n === 1).length;
    if (qtdPrimeiro >= 3) return 'avassalador';
    if (nuncaPiorou && terminouMelhor) return 'modoturbo';
    if (nuncaMelhorou && terminouPior) return 'fumador';
    if (terminouMelhor) return 'recuperador';
    return 'estavel';
  }).filter(Boolean);
  if (!res.length) return 'estavel';
  const c = {}; res.forEach(p => c[p] = (c[p] || 0) + 1);
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}
const _FRONT = ['avassalador', 'modoturbo'];

// Monta a Carga VIP das corridas de uma data (BRT 'YYYY-MM-DD').
function listar(db, opts) {
  opts = opts || {};
  const date = opts.date;
  const spRatioMax = opts.spRatioMax > 0 ? opts.spRatioMax : 1.15;

  // SEM filtro de nivel de propósito: o funil VIP é independente do AvB do motor,
  // e corrida 'skip' (margem insuficiente) é JUSTO onde as odds coladas moram —
  // além de que o backtest que mediu as taxas (62%/69%) não filtrava skip.
  const rows = db.prepare(
    "SELECT r.hora, r.corrida, r.dist, r.hist_all FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at,'-3 hours')=? AND r.hist_all IS NOT NULL ORDER BY r.hora"
  ).all(date);

  const entradas = [];
  for (const row of rows) {
    let histAll = null;
    try { histAll = JSON.parse(row.hist_all); } catch (e) { continue; }
    if (!Array.isArray(histAll)) continue;

    const info = [];
    for (const h of histAll) {
      if (!h || h.trap == null) continue;
      const u2 = _ultimasCorridas(h.historico || [], 2);
      if (u2.length < 2) continue;
      const odds = u2.map(l => _oddDecimal(l.sp)).filter(v => v != null);
      const splits = u2.map(l => Number(l.split)).filter(v => Number.isFinite(v) && v > 0);
      const tempos = u2.map(l => Number(l.caltm)).filter(v => Number.isFinite(v) && v > 0);
      info.push({
        trap: h.trap, nome: h.nome || '',
        perfil: _perfilDeHist(h.historico || []),
        oddMedia: odds.length ? _avg(odds) : null,
        splitAvg: splits.length ? _avg(splits) : null,
        caltmAvg: tempos.length ? _avg(tempos) : null,
        catRecent: u2[0] ? String(u2[0].classe || '').trim().toUpperCase() : null
      });
    }

    for (let i = 0; i < info.length; i++) {
      for (let j = i + 1; j < info.length; j++) {
        const X = info[i], Y = info[j];
        if (!(X.oddMedia > 0 && Y.oddMedia > 0)) continue;
        const ratio = Math.max(X.oddMedia, Y.oddMedia) / Math.min(X.oddMedia, Y.oddMedia);
        if (ratio > spRatioMax) continue;                                 // odds coladas
        if (!(X.catRecent && Y.catRecent && X.catRecent === Y.catRecent)) continue; // mesma categoria
        if (!(X.splitAvg > 0 && Y.splitAvg > 0)) continue;
        const pick = X.splitAvg <= Y.splitAvg ? X : Y;                    // melhor split = pick
        const other = pick === X ? Y : X;
        if (pick.perfil === 'fumador') continue;                         // pick não fuma
        if (!(pick.caltmAvg > 0 && other.caltmAvg > 0)) continue;
        const dt = other.caltmAvg - pick.caltmAvg;                        // pick mais rápido
        if (!(dt > DT_VALOR)) continue;
        const nivel = dt >= DT_PREMIUM ? 'Premium' : 'Valor';
        entradas.push({
          hora: row.hora, corrida: row.corrida, dist: row.dist,
          pick_trap: pick.trap, pick_nome: pick.nome,
          outro_trap: other.trap, outro_nome: other.nome,
          categoria: X.catRecent,
          ratio_odd: +ratio.toFixed(3),
          dt_caltm: +dt.toFixed(2),
          nivel: nivel,
          taxa_estimada_pct: nivel === 'Premium' ? TAXA_PREMIUM : TAXA_VALOR,
          // selos de bônus (EM OBSERVAÇÃO — amostra pequena, não filtram nada):
          selo_pick_frente: _FRONT.indexOf(pick.perfil) >= 0,
          selo_outro_fuma: other.perfil === 'fumador'
        });
      }
    }
  }

  // Mais forte primeiro: Premium antes de Valor, e dentro de cada um, maior Δt.
  entradas.sort((a, b) => (b.dt_caltm - a.dt_caltm));

  return {
    date, total: entradas.length,
    niveis: {
      Valor: { criterio: 'Δt ≥ ' + DT_VALOR + 's', taxa_historica_pct: TAXA_VALOR },
      Premium: { criterio: 'Δt ≥ ' + DT_PREMIUM + 's', taxa_historica_pct: TAXA_PREMIUM }
    },
    entradas,
    aviso: 'Filtro de VALOR, não certeza. Taxas medidas em 32 dias de histórico. '
      + 'Selos (frente/fuma) são bônus em observação (amostra pequena), não filtram. '
      + 'A odd real e a abertura do par no betwinner podem variar — confira antes de entrar.'
  };
}

module.exports = { listar, TAXA_VALOR, TAXA_PREMIUM, DT_VALOR, DT_PREMIUM };
