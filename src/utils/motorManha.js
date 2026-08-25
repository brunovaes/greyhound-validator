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
const { _limpaNome, _perfilDeHist } = require('./cargaVip');
const { NOMES_PISTAS } = require('./nomesPistas');

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
  // corte de CalTm do gate da nata (aj. categoria). Vem da config; senao o default do engine.
  const caltmMinDif = opts.caltmMinDif > 0 ? opts.caltmMinDif : reanalise.DEFAULTS.caltmMinDif;
  // regra do "nao-segura" (fumador): vem da config; senao os defaults do engine.
  const desabaQueda = opts.desabaQueda > 0 ? opts.desabaQueda : reanalise.DEFAULTS.desabaQueda;
  const desabaMin = opts.desabaMin > 0 ? opts.desabaMin : reanalise.DEFAULTS.desabaMin;

  const dogsByTrap = {};
  for (const g of (Array.isArray(histFull) ? histFull : [])) if (g && g.trap != null) dogsByTrap[Number(g.trap)] = g;

  // traps vazias (grid 6) p/ o modificador de trap vazia da reanálise
  const presentes = new Set();
  (Array.isArray(raceCard) ? raceCard : histFull).forEach(g => { if (g && g.trap != null) presentes.add(Number(g.trap)); });
  const vaz = new Set(); for (let t = 1; t <= 6; t++) if (!presentes.has(t)) vaz.add(t);
  const trapsVazias = Array.from(vaz);
  // QUAIS traps vazias estao ao lado (nao so "tem/nao tem") — pra a nota dizer o numero.
  const vaziasAoLado = t => [t - 1, t + 1].filter(x => x >= 1 && x <= 6 && vaz.has(x));
  const ctx = { trapsVazias, dataCorrida: ctxBase.dataCorrida || null, trackCorrida: ctxBase.trackCorrida || null, distCorrida: ctxBase.distCorrida || null, config: { caltmMinDif, desabaQueda, desabaMin } };

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
    // ── GATE "nata das natas": só entra o par onde o favorito GANHA NOS 4 EIXOS
    //    (categoria, CalTm >= corte, split, pódio). Não passou → não é top, não aparece.
    //    (SP colado já foi garantido no pareamento acima.) Sem meio-termo, sem parelho.
    if (!av.top) continue;
    const pct = av.avaliacao;                             // % do favorito (av.aTrap) vencer
    slots.push({
      slot: rotulos[slots.length],
      ratio_sp: +par.ratio.toFixed(3),
      pick_trap: av.aTrap, pick_nome: nomeTrap(av.aTrap),
      outro_trap: av.bTrap, outro_nome: nomeTrap(av.bTrap),
      pct: pct,
      pct_pick: pct, pct_outro: 100 - pct,
      top: true,                                          // passou nos 4 eixos (a nata)
      eixos: av.eixos,                                    // {categoria,caltm,split,podio} — todos true aqui
      caltm_dif: av.caltm_dif,                            // vantagem de CalTm do pick (aj. categoria)
      cat_pick: av.cat_pick, cat_outro: av.cat_outro,     // niveis de categoria (menor = mais forte)
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

// Pódio pela MESMA lógica dos 4 eixos, SEM SP (Bruno ago/2026): ranqueia o grid inteiro
// pelo reanalise.rankPodio (CalTm aj. categoria + split + bends + pódio recente). Como o
// pick (favorito que ganhou os 4 eixos) tem score melhor que o outro por construção, ele
// sai naturalmente à frente — mas mantenho uma passada de coerência de segurança: se por
// algum motivo o outro vier na frente, troca os dois. Devolve {podio, ajustado}.
function _podioQuatroEixos(histFull, ctxBase, opts, principal) {
  const dogsByTrap = {};
  for (const g of (Array.isArray(histFull) ? histFull : [])) if (g && g.trap != null) dogsByTrap[Number(g.trap)] = g;
  const caltmMinDif = opts && opts.caltmMinDif > 0 ? opts.caltmMinDif : reanalise.DEFAULTS.caltmMinDif;
  const ctx = { trackCorrida: ctxBase.trackCorrida || null, distCorrida: ctxBase.distCorrida || null, config: { caltmMinDif } };
  let podio = reanalise.rankPodio(dogsByTrap, ctx, 3);
  let ajustado = false;
  if (principal && principal.pick_trap && principal.outro_trap) {
    const ip = podio.indexOf(principal.pick_trap), io = podio.indexOf(principal.outro_trap);
    if (io >= 0 && ip >= 0 && io < ip) { podio[ip] = principal.outro_trap; podio[io] = principal.pick_trap; ajustado = true; }
    else if (io >= 0 && ip < 0) { podio.splice(io, 0, principal.pick_trap); podio = podio.slice(0, 3); ajustado = true; }
  }
  return { podio, ajustado };
}
// invariante: o pódio NÃO contradiz o AvB (pick à frente do outro, ou outro ausente).
function _podioOk(podio, principal) {
  if (!principal || !principal.pick_trap || !principal.outro_trap) return true;
  const ip = podio.indexOf(principal.pick_trap), io = podio.indexOf(principal.outro_trap);
  if (io < 0) return true;                                // outro ausente = ok
  return ip >= 0 && ip < io;                              // pick presente e à frente
}

// Config do motor único (Bruno ago/2026): SP colado e corte de CalTm vêm de analysis_config
// (a tela de Config, do UI). ?opts sempre vence. Defensivo: se as colunas ainda não existem,
// cai nos defaults (SP_RATIO_MAX 1.15 / engine caltmMinDif 0.20).
function _aplicaConfigMotor(db, opts) {
  try {
    const c = db.prepare("SELECT sp_ratio_max, caltm_min_dif, desaba_queda, desaba_min FROM analysis_config WHERE user_id=1").get();
    if (c) {
      if (!(opts.spRatioMax > 0) && c.sp_ratio_max > 0) opts = Object.assign({}, opts, { spRatioMax: c.sp_ratio_max });
      if (!(opts.caltmMinDif > 0) && c.caltm_min_dif > 0) opts = Object.assign({}, opts, { caltmMinDif: c.caltm_min_dif });
      if (!(opts.desabaQueda > 0) && c.desaba_queda > 0) opts = Object.assign({}, opts, { desabaQueda: c.desaba_queda });
      if (!(opts.desabaMin > 0) && c.desaba_min > 0) opts = Object.assign({}, opts, { desabaMin: c.desaba_min });
    }
  } catch (e) {}
  return opts;
}

// Monta o objeto de UMA corrida a partir da row do banco (mesma forma pra listar e
// umaCorrida). Devolve null quando a row nao tem histórico avaliável (pula).
function _corridaDeRow(row, date, opts) {
  let histFull = null, histAll = null, raceCard = null;
  try { histFull = JSON.parse(row.hist_full); } catch (e) { return null; }
  try { histAll = JSON.parse(row.hist_all); } catch (e) {}
  try { raceCard = JSON.parse(row.race_card); } catch (e) {}
  if (!Array.isArray(histFull) || histFull.length < 2 || !Array.isArray(histAll)) return null;
  const ctxBase = { dataCorrida: row.data_card || date, trackCorrida: _pista(row.corrida), distCorrida: row.dist || null };
  const slots = slotsDaCorrida(histFull, histAll, raceCard, ctxBase, opts);
  const pod = _podioQuatroEixos(histFull, ctxBase, opts, slots[0] || null);
  // galgos que a reanálise CONSIDEROU (pra ninguém sumir do pódio na revisão do skip)
  const considerados = Array.from(new Set(slots.flatMap(s => [s.pick_trap, s.outro_trap]))).sort((a, b) => a - b);
  return {
    hora: row.hora, corrida: row.corrida, dist: row.dist, nivel: row.nivel,
    principal: slots[0] || null,
    secundarios: slots.slice(1),
    slots,
    podio: pod.podio, podio_fonte: '4-eixos', podio_base_top3: row.top3 || null, podio_ajustado_pelo_avb: pod.ajustado,
    podio_ok: _podioOk(pod.podio, slots[0] || null),   // invariante: pódio não contradiz o AvB
    galgos_considerados: considerados
  };
}

const _SELECT_CORRIDA = "r.hora, r.corrida, r.dist, r.hist_full, r.hist_all, r.race_card, r.data_card, r.nivel, r.top3";

// Lista os slots de todas as corridas do dia (LISTA lateral / preview de admin).
function listar(db, opts) {
  opts = opts || {};
  const date = opts.date;
  opts = _aplicaConfigMotor(db, opts);
  const rows = db.prepare(
    "SELECT " + _SELECT_CORRIDA + " " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at,'-3 hours')=? AND r.hist_full IS NOT NULL ORDER BY r.hora"
  ).all(date);

  const corridas = [];
  for (const row of rows) {
    const c = _corridaDeRow(row, date, opts);
    if (c) corridas.push(c);
  }

  return {
    date, total_corridas: corridas.length,
    parametros: {
      sp_ratio_max: opts.spRatioMax > 0 ? opts.spRatioMax : SP_RATIO_MAX,
      caltm_min_dif: opts.caltmMinDif > 0 ? opts.caltmMinDif : reanalise.DEFAULTS.caltmMinDif,
      n_slots: N_SLOTS
    },
    corridas,
    legenda: 'MOTOR ÚNICO (a nata das natas): só entra como pick o par de SP colada (razão <= sp_ratio_max) '
      + 'cujo favorito GANHA NOS 4 EIXOS — categoria (igual ou melhor), CalTm (>= caltm_min_dif, aj. categoria), '
      + 'split (arranca melhor) e pódio (melhor pódio recente). top=true e eixos={categoria,caltm,split,podio}. '
      + 'Não passou nos 4 → não aparece (sem meio-termo, sem parelho). O pódio é ranqueado pela MESMA lógica dos '
      + '4 eixos, mas SEM exigir SP (podio_fonte:"4-eixos"). Perto da largada atualiza com o card fresco (trap vazia, retirada).'
  };
}

// O banco guarda o CÓDIGO curto da pista ("Kinsly A6"), mas as telas mostram o
// nome COMPLETO ("Kinsley A6") — traduzido só na exibição pelo nomesPistas.js. Se a
// chave chegar com o nome completo, o casamento por igualdade e o LIKE '%pista%' falham
// (a diferença é no MEIO da palavra: Kinsley≠Kinsly). Aqui traduzimos nome→código antes
// de casar. NOMES_PISTAS = { codigo: nomeCompleto }; alguns nomes têm 2 palavras
// ("Central Park", "Star Pelaw"), então casamos o nome como PREFIXO e preservamos o
// resto (" A6"). Se já vier como código, passa direto.
function _paraCodigoCorrida(corridaParam) {
  const s = String(corridaParam || '').trim();
  if (!s) return s;
  const primeiro = s.split(/\s+/)[0] || '';
  if (NOMES_PISTAS[primeiro]) return s;                  // já é código (ex.: "Kinsly A6")
  const low = s.toLowerCase();
  for (const code in NOMES_PISTAS) {
    const full = String(NOMES_PISTAS[code]);
    const f = full.toLowerCase();
    if (low === f) return code;                          // só o nome, sem classe
    if (low.startsWith(f + ' ')) return code + s.slice(full.length);  // "Kinsley A6" -> "Kinsly A6"
  }
  return s;                                              // não reconheceu — devolve original
}

// UMA corrida só — pro PAINEL DE DISPUTA (uma corrida por vez). Chave = hora + corrida,
// a MESMA que a Carga VIP / VIP do VIP / resultados já usam (o que a tela tem em mãos
// direto do objeto da corrida). Roda o slotsDaCorrida só dessa corrida, não o dia inteiro
// (custo ~1/N do listar). Devolve o MESMO objeto de uma entrada de corridas[] do listar,
// dentro de { date, hora, corrida, encontrada, match, corrida_casada, corrida_obj }.
//
// Casamento NÃO-silencioso (o que já mordeu). Ordem:
//   1) EXATO com a chave crua               -> match:'exato'
//   2) EXATO traduzindo nome-completo->código (nomesPistas) -> match:'traduzido'
//   3) hora + corrida LIKE '%<código>%'      -> match:'aproximado'
// Nada casou -> encontrada:false com erro explícito (grita, não vem vazio calado).
// corrida_casada = o valor de r.corrida que de fato bateu (pra a tela conferir).
function umaCorrida(db, opts) {
  opts = opts || {};
  const date = opts.date;
  const hora = String(opts.hora || '').trim();
  const corrida = String(opts.corrida || '').trim();
  opts = _aplicaConfigMotor(db, opts);
  if (!hora || !corrida) {
    return { date, hora, corrida, encontrada: false, match: null, corrida_casada: null, erro: 'hora e corrida são obrigatórios', corrida_obj: null };
  }
  const base = "SELECT " + _SELECT_CORRIDA + " FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at,'-3 hours')=? AND r.hist_full IS NOT NULL AND r.hora=? ";
  const cod = _paraCodigoCorrida(corrida);

  let row = null, match = null;
  // 1) exato com a chave crua
  row = db.prepare(base + "AND r.corrida=? LIMIT 1").get(date, hora, corrida);
  if (row) match = 'exato';
  // 2) exato com o nome-completo traduzido pra código (Kinsley A6 -> Kinsly A6)
  if (!row && cod !== corrida) {
    row = db.prepare(base + "AND r.corrida=? LIMIT 1").get(date, hora, cod);
    if (row) match = 'traduzido';
  }
  // 3) fallback LIKE no token de código (drift de classe/espaço)
  if (!row) {
    const codTok = cod.split(/\s+/)[0] || cod;
    row = db.prepare(base + "AND r.corrida LIKE ? LIMIT 1").get(date, hora, '%' + codTok + '%');
    if (row) match = 'aproximado';
  }
  if (!row) {
    return { date, hora, corrida, encontrada: false, match: null, corrida_casada: null, erro: 'corrida não encontrada (hora+corrida não casou, nem por nome completo)', corrida_obj: null };
  }
  const c = _corridaDeRow(row, date, opts);
  return {
    date, hora, corrida, encontrada: !!c, match: c ? match : null,
    corrida_casada: row.corrida,   // o r.corrida que bateu (código cru do banco)
    corrida_obj: c,                // null quando a corrida existe mas não tem histórico avaliável
    parametros: { sp_ratio_max: opts.spRatioMax > 0 ? opts.spRatioMax : SP_RATIO_MAX, caltm_min_dif: opts.caltmMinDif > 0 ? opts.caltmMinDif : reanalise.DEFAULTS.caltmMinDif, n_slots: N_SLOTS }
  };
}

// Registros PRONTOS PRA GRAVAR (persistência). Só corridas COM principal. Traz o
// principal, o pódio coerente, e hist/perfil dos dois traps (do hist_all — mesmo
// formato do hist_fav). `largou` = já passou pela checagem final / tem resultado
// (o marcador congela isso). Puro: não grava, só monta.
function paraPersistir(db, opts) {
  opts = opts || {};
  const date = opts.date;
  opts = _aplicaConfigMotor(db, opts);
  const rows = db.prepare(
    "SELECT r.id, r.hora, r.corrida, r.dist, r.hist_full, r.hist_all, r.race_card, r.data_card, r.top3, r.final_check_at, r.finishing_order_json " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at,'-3 hours')=? AND r.hist_full IS NOT NULL ORDER BY r.hora"
  ).all(date);

  const out = [];
  for (const row of rows) {
    let histFull = null, histAll = null, raceCard = null;
    try { histFull = JSON.parse(row.hist_full); } catch (e) { continue; }
    try { histAll = JSON.parse(row.hist_all); } catch (e) {}
    try { raceCard = JSON.parse(row.race_card); } catch (e) {}
    if (!Array.isArray(histFull) || histFull.length < 2 || !Array.isArray(histAll)) continue;
    const ctxBase = { dataCorrida: row.data_card || date, trackCorrida: _pista(row.corrida), distCorrida: row.dist || null };
    const slots = slotsDaCorrida(histFull, histAll, raceCard, ctxBase, opts);
    const principal = slots[0] || null;
    if (!principal) continue;                                  // só corrida COM principal (decisão do Bruno)
    const pod = _podioQuatroEixos(histFull, ctxBase, opts, principal);
    const histByTrap = {}; for (const g of histAll) if (g && g.trap != null) histByTrap[Number(g.trap)] = g;
    const gP = histByTrap[principal.pick_trap], gO = histByTrap[principal.outro_trap];
    out.push({
      id: row.id, hora: row.hora, corrida: row.corrida,
      largou: !!(row.final_check_at || row.finishing_order_json),
      principal,
      // TODOS os pares aprovados (nata), principal 1o, depois secundarios — ex.: "4x2,1x5".
      // Pro Historico cruzar com avb_escolhido e saber se o Bruno ficou na nata e em qual slot.
      bw_pares: slots.map(s => s.pick_trap + 'x' + s.outro_trap).join(','),
      podio_str: pod.podio.join('-'),
      hist_fav: gP ? (gP.historico || null) : null,
      hist_und: gO ? (gO.historico || null) : null,
      perfil_fav: gP ? _perfilDeHist(gP.historico || []) : null,
      perfil_und: gO ? _perfilDeHist(gO.historico || []) : null
    });
  }
  return out;
}

module.exports = { listar, umaCorrida, slotsDaCorrida, paraPersistir, PARELHO_ATE, SP_RATIO_MAX };