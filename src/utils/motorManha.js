'use strict';
// src/utils/motorManha.js
//
// MOTOR DA MANHÃ (v2) — roda as REGRAS DA REANÁLISE já de manhã, sobre as SPs do
// PDF, sem esperar o near-post. Pra cada corrida, pega os 3 pares de SP mais COLADA
// (os que vão abrir na BW) e avalia cada um com o reanaliseEngine.avaliarPar. Devolve
// 3 slots (principal + 2 secundários):
//   - pick > 60%  -> AvB firme (pick × outro, com a %).
//   - pick <= 60% -> "parelho": nota, com o % de cada galgo (a UI decide mostrar).
//
// Pareamento pela SP colada = média das 2 últimas SPs (hist_all.sp), razão <= spRatioMax
// (mesma regra de hoje). Avaliação = avaliarPar (categoria->tempo->split/bends->pódio +
// trap vazia/cio/trial + a regra do tempo-ruim-com-desculpa). Leitura pura, não grava.
const { probImplicita } = require('./spEngine');
const reanalise = require('./reanaliseEngine');
const { _limpaNome } = require('./cargaVip');

const PARELHO_ATE = 60;    // pct <= isto = parelho (nota); > isto = pick firme
const SP_RATIO_MAX = 1.15; // "SP colada" (o par que abre na BW)
const N_SLOTS = 3;         // principal + 2 secundários

function _oddDecimal(sp) {
  if (!sp) return null;
  const p = probImplicita(String(sp).replace(/[A-Za-z]+$/, ''));
  return (p && p > 0) ? 1 / p : null;
}
function _isTrial(c) { const s = String(c || '').trim().toUpperCase(); return s === 'T' || s === 'S' || s.startsWith('T ') || s.startsWith('S '); }
function _avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

// oddMedia (SP média das 2 últimas não-trial) por trap, a partir do hist_all.
function _oddMediaPorTrap(histAll) {
  const out = {};
  for (const g of (Array.isArray(histAll) ? histAll : [])) {
    if (!g || g.trap == null) continue;
    const u = (g.historico || []).filter(l => l && !_isTrial(l.classe) && Number(l.caltm) > 0).slice(0, 2);
    const odds = u.map(l => _oddDecimal(l.sp)).filter(v => v != null);
    if (odds.length) out[Number(g.trap)] = _avg(odds);
  }
  return out;
}

function _distNum(d) { return parseInt(String(d || '').replace(/[^0-9]/g, '')) || 0; }
function _pista(corrida) { return String(corrida || '').trim().split(/\s+/)[0] || '?'; }

// Alguns galgos vêm SEM nome na origem (só cor+cria, ex.: "bdw b Sire-Dam"). Quando o
// nome limpo começa com código de cor, não há nome de verdade → mascara pra "b{trap} (sem nome)".
const _CORES_INICIO = /^(?:lt|dk|lg)?(?:bk|bd|be|f|w|br|bkw|wbk|bdw|wbd|bew|wbe|bebd|bkbd)$/i;
function _nomeMascara(nomeCru, trap) {
  const n = (_limpaNome(nomeCru) || '').trim();
  const primeiro = n.split(/\s+/)[0] || '';
  if (!n || _CORES_INICIO.test(primeiro)) return 'b' + trap + ' (sem nome)';
  return n;
}

// Monta os slots (principal + 2 secundários) de UMA corrida.
// histFull: [{trap,nome,brtClasse,ssnDate,historico}]  histAll: [{trap,historico:[{sp,...}]}]
// raceCard: [{trap,nome}] (p/ traps vazias)  ctxBase: {dataCorrida,trackCorrida,distCorrida}
function slotsDaCorrida(histFull, histAll, raceCard, ctxBase, opts) {
  opts = opts || {};
  const spRatioMax = opts.spRatioMax > 0 ? opts.spRatioMax : SP_RATIO_MAX;
  const parelhoAte = opts.parelhoAte > 0 ? opts.parelhoAte : PARELHO_ATE;

  const dogsByTrap = {};
  for (const g of (Array.isArray(histFull) ? histFull : [])) if (g && g.trap != null) dogsByTrap[Number(g.trap)] = g;

  // traps vazias (grid 6) p/ o modificador de trap vazia da reanálise
  const presentes = new Set();
  (Array.isArray(raceCard) ? raceCard : histFull).forEach(g => { if (g && g.trap != null) presentes.add(Number(g.trap)); });
  const vaz = new Set(); for (let t = 1; t <= 6; t++) if (!presentes.has(t)) vaz.add(t);
  const trapsVazias = Array.from(vaz);
  // QUAIS traps vazias estao ao lado (nao so "tem/nao tem") — pra a nota dizer o numero.
  const vaziasAoLado = t => [t - 1, t + 1].filter(x => x >= 1 && x <= 6 && vaz.has(x));
  const ctx = { trapsVazias, dataCorrida: ctxBase.dataCorrida || null, trackCorrida: ctxBase.trackCorrida || null, distCorrida: ctxBase.distCorrida || null, config: {} };

  const oddMedia = _oddMediaPorTrap(histAll);
  // ITEM 6 — retirada: so pareia trap que TEM galgo E esta PRESENTE no card (galgo
  // retirado sai do pareamento; o proximo par colado assume o slot automaticamente).
  const traps = Object.keys(dogsByTrap).map(Number).filter(t => oddMedia[t] > 0 && presentes.has(t));

  // todos os pares de SP colada, ordenados do mais colado (menor razão) pro menos
  const pares = [];
  for (let i = 0; i < traps.length; i++) for (let j = i + 1; j < traps.length; j++) {
    const a = traps[i], b = traps[j];
    const ratio = Math.max(oddMedia[a], oddMedia[b]) / Math.min(oddMedia[a], oddMedia[b]);
    if (ratio > spRatioMax) continue;
    pares.push({ a, b, ratio });
  }
  pares.sort((x, y) => x.ratio - y.ratio);

  const nomeTrap = t => { const g = dogsByTrap[t]; return g ? _nomeMascara(g.nome, t) : ('b' + t + ' (sem nome)'); };

  const slots = [];
  const rotulos = ['principal', 'secundario_1', 'secundario_2'];
  for (const par of pares) {
    if (slots.length >= N_SLOTS) break;
    const av = reanalise.avaliarPar(dogsByTrap[par.a], dogsByTrap[par.b], ctx);
    if (!av || av.descartar) continue;                    // sem histórico p/ avaliar → pula pro próximo par
    const pct = av.avaliacao;                             // % do favorito (av.aTrap) vencer
    slots.push({
      slot: rotulos[slots.length],
      ratio_sp: +par.ratio.toFixed(3),
      pick_trap: av.aTrap, pick_nome: nomeTrap(av.aTrap),
      outro_trap: av.bTrap, outro_nome: nomeTrap(av.bTrap),
      pct: pct,
      pct_pick: pct, pct_outro: 100 - pct,
      parelho: pct <= parelhoAte,                         // <= 60% = nota "corrida parelha"
      // ITEM 5 — nota de trap vazia ao lado, indicando QUAL trap (atualiza tardio: le o
      // card fresco a cada chamada). pick_vazia_traps = ex.: [3] (box 3 vazio ao lado do pick).
      pick_vazia_lado: vaziasAoLado(av.aTrap).length > 0,
      pick_vazia_traps: vaziasAoLado(av.aTrap),
      outro_vazia_lado: vaziasAoLado(av.bTrap).length > 0,
      outro_vazia_traps: vaziasAoLado(av.bTrap),
      obs: av.obs || null,
      flags: av.flags || null
    });
  }
  return slots;
}

// Pódio COERENTE (item 3+c): base = top3 do Motor 1 (ex.: "5-3-6"); se o AvB principal
// (pick firme, não parelho) contradiz a ordem, inverte os dois no pódio (o 5-1-6 com
// AvB 6v5 vira 6-1-5). Nunca sai pódio que briga com o AvB.
function _podioCoerente(top3Str, principal) {
  const podio = String(top3Str || '').split('-').map(n => parseInt(n)).filter(n => n > 0);
  let ajustado = false;
  if (principal && !principal.parelho && principal.pick_trap && principal.outro_trap) {
    const ip = podio.indexOf(principal.pick_trap), io = podio.indexOf(principal.outro_trap);
    if (ip >= 0 && io >= 0 && io < ip) { const t = podio[ip]; podio[ip] = podio[io]; podio[io] = t; ajustado = true; }
  }
  return { podio, ajustado };
}

// Lista os slots de todas as corridas do dia (preview de admin).
function listar(db, opts) {
  opts = opts || {};
  const date = opts.date;
  // corte de parelho: ?opts vence; senao a config do Painel (avb_parelho_pct); senao 60.
  if (!(opts.parelhoAte > 0)) {
    try { const c = db.prepare("SELECT avb_parelho_pct FROM analysis_config WHERE user_id=1").get(); if (c && c.avb_parelho_pct > 0) opts = Object.assign({}, opts, { parelhoAte: c.avb_parelho_pct }); } catch (e) {}
  }
  const rows = db.prepare(
    "SELECT r.hora, r.corrida, r.dist, r.hist_full, r.hist_all, r.race_card, r.data_card, r.nivel, r.top3 " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at,'-3 hours')=? AND r.hist_full IS NOT NULL ORDER BY r.hora"
  ).all(date);

  const corridas = [];
  for (const row of rows) {
    let histFull = null, histAll = null, raceCard = null;
    try { histFull = JSON.parse(row.hist_full); } catch (e) { continue; }
    try { histAll = JSON.parse(row.hist_all); } catch (e) {}
    try { raceCard = JSON.parse(row.race_card); } catch (e) {}
    if (!Array.isArray(histFull) || histFull.length < 2 || !Array.isArray(histAll)) continue;
    const ctxBase = { dataCorrida: row.data_card || date, trackCorrida: _pista(row.corrida), distCorrida: row.dist || null };
    const slots = slotsDaCorrida(histFull, histAll, raceCard, ctxBase, opts);
    const pod = _podioCoerente(row.top3, slots[0] || null);
    // galgos que a reanálise CONSIDEROU (pra ninguém sumir do pódio na revisão do skip)
    const considerados = Array.from(new Set(slots.flatMap(s => [s.pick_trap, s.outro_trap]))).sort((a, b) => a - b);
    corridas.push({
      hora: row.hora, corrida: row.corrida, dist: row.dist, nivel: row.nivel,
      principal: slots[0] || null,
      secundarios: slots.slice(1),
      slots,
      podio: pod.podio, podio_base_top3: row.top3 || null, podio_ajustado_pelo_avb: pod.ajustado,
      galgos_considerados: considerados
    });
  }

  return {
    date, total_corridas: corridas.length,
    parametros: { sp_ratio_max: opts.spRatioMax > 0 ? opts.spRatioMax : SP_RATIO_MAX, parelho_ate_pct: opts.parelhoAte > 0 ? opts.parelhoAte : PARELHO_ATE, n_slots: N_SLOTS },
    corridas,
    legenda: 'Motor da manhã = regras da reanálise sobre as SPs do PDF. 3 pares de SP mais colada por corrida '
      + '(principal + 2 secundários). pct = % do pick (favorito) vencer o outro. parelho=true quando pct <= '
      + PARELHO_ATE + '% (mostrar nota com os dois %). pct_pick/pct_outro = os dois percentuais. '
      + 'Perto da largada a reanálise atualiza isto com o card fresco (trap vazia, retirada).'
  };
}

module.exports = { listar, slotsDaCorrida, PARELHO_ATE, SP_RATIO_MAX };
