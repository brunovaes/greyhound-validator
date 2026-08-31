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

// SP da ULTIMA corrida (mais recente) por trap — 1 linha, nao a media. Usado pra montar o POOL
// (Bruno ago/2026: "pegar o SP mais igual dos galgos somente pela ultima corrida").
function _lastSpPorTrap(histAll) {
  const out = {};
  for (const g of (Array.isArray(histAll) ? histAll : [])) {
    if (!g || g.trap == null) continue;
    const u = (g.historico || []).filter(l => l && !_isTrial(l.classe) && Number(l.caltm) > 0).slice(0, 1);
    const od = u.length ? _oddDecimal(u[0].sp) : null;
    if (od != null && od > 0) out[Number(g.trap)] = od;
  }
  return out;
}

function _distNum(d) { return parseInt(String(d || '').replace(/[^0-9]/g, '')) || 0; }
function _pista(corrida) { return String(corrida || '').trim().split(/\s+/)[0] || '?'; }

// FILTRO DE PISTA de PRODUCAO (Bruno ago/2026): a corrida passa se a pista esta no escopo
// configurado. opts.pistasInc = whitelist (so essas); se nao houver inc, opts.pistasExc =
// blacklist (todas menos essas). Sem nenhum dos dois = todas passam (comportamento de hoje).
// A pista e' o 1o token do codigo ("Clnml A5" -> "clnml"), casado sem caixa.
function _pistaPassa(track, opts) {
  const t = String(track || '').trim().toLowerCase();
  const inc = Array.isArray(opts && opts.pistasInc) ? opts.pistasInc : null;
  const exc = Array.isArray(opts && opts.pistasExc) ? opts.pistasExc : null;
  if (inc && inc.length) return inc.includes(t);
  if (exc && exc.length) return !exc.includes(t);
  return true;
}

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
function _analisaCorrida(histFull, histAll, raceCard, ctxBase, opts) {
  opts = opts || {};
  const D = reanalise.DEFAULTS;
  // DUAS REGUAS (Bruno ago/2026): o mesmo motor classifica cada par em TOP (nata) ou REGULAR.
  const reguaTop = {
    sp_ratio_max: opts.spRatioMax > 0 ? opts.spRatioMax : SP_RATIO_MAX,
    caltm_min_dif: opts.caltmMinDif > 0 ? opts.caltmMinDif : D.caltmMinDif,
    split_min: opts.splitMin != null ? opts.splitMin : D.splitMin,
    podio_min: opts.podioMin != null ? opts.podioMin : D.podioMin,
    desaba_min: opts.desabaMin > 0 ? opts.desabaMin : D.desabaMin
  };
  const reguaReg = {
    sp_ratio_max: opts.regSpRatioMax > 0 ? opts.regSpRatioMax : 1.20,
    caltm_min_dif: opts.regCaltmMinDif != null ? opts.regCaltmMinDif : 0.10,
    split_min: opts.regSplitMin != null ? opts.regSplitMin : 0,
    podio_min: opts.regPodioMin != null ? opts.regPodioMin : 0,
    desaba_min: opts.regDesabaMin > 0 ? opts.regDesabaMin : 3
  };
  const desabaQueda = opts.desabaQueda > 0 ? opts.desabaQueda : D.desabaQueda;

  const dogsByTrap = {};
  for (const g of (Array.isArray(histFull) ? histFull : [])) if (g && g.trap != null) dogsByTrap[Number(g.trap)] = g;

  // traps vazias (grid 6) p/ o modificador de trap vazia da reanálise
  const presentes = new Set();
  (Array.isArray(raceCard) ? raceCard : histFull).forEach(g => { if (g && g.trap != null) presentes.add(Number(g.trap)); });
  const vaz = new Set(); for (let t = 1; t <= 6; t++) if (!presentes.has(t)) vaz.add(t);
  const trapsVazias = Array.from(vaz);
  // QUAIS traps vazias estao ao lado (nao so "tem/nao tem") — pra a nota dizer o numero.
  const vaziasAoLado = t => [t - 1, t + 1].filter(x => x >= 1 && x <= 6 && vaz.has(x));
  // config passada ao avaliarPar = a regua TOP (o av.eixos reflete o TOP; a classificacao
  // real vem do passaRegua com as medidas cruas). desabaQueda e' global aos dois tiers.
  const ctx = { trapsVazias, dataCorrida: ctxBase.dataCorrida || null, trackCorrida: ctxBase.trackCorrida || null, distCorrida: ctxBase.distCorrida || null,
    config: { caltmMinDif: reguaTop.caltm_min_dif, splitMin: reguaTop.split_min, podioMin: reguaTop.podio_min, desabaQueda, desabaMin: reguaTop.desaba_min,
      recenciaAtiva: !!opts.recenciaAtiva, recenciaN: opts.recenciaN, recenciaDecay: opts.recenciaDecay } };

  const oddMedia = _oddMediaPorTrap(histAll);       // media das 2 ultimas — mantida so como referencia
  const lastSp = _lastSpPorTrap(histAll);           // SO a ultima corrida (mais recente) — define a colagem
  // ITEM 6 — retirada: so pareia trap que TEM galgo (SP na ultima corrida) E esta PRESENTE no card.
  const traps = Object.keys(dogsByTrap).map(Number).filter(t => lastSp[t] > 0 && presentes.has(t));

  // COLAGEM (Bruno ago/2026): um AvB e' candidato quando os DOIS caes tem SP COLADA ENTRE SI
  // (razao <= sp_ratio do Config), pela SP da ULTIMA corrida — NAO precisa ser o favorito nem o
  // topo. Dois caes em ~8 de SP, colados, com um nitidamente melhor (tempo/categoria) valem AvB.
  // rankDe = posicao por SP (so informativo). O teto de razao e' o filtro de "corrida que vale".
  const ordenados = traps.slice().sort((a, b) => lastSp[a] - lastSp[b]);
  const rankDe = {}; ordenados.forEach((t, i) => { rankDe[t] = i + 1; });
  const spColada = reguaTop.sp_ratio_max > 0 ? reguaTop.sp_ratio_max : SP_RATIO_MAX;
  const parelhoAte = opts.parelhoAte > 0 ? opts.parelhoAte : PARELHO_ATE;   // corte de chance (default 60)

  const nomeTrap = t => { const g = dogsByTrap[t]; return g ? _nomeMascara(g.nome, t) : ('b' + t + ' (sem nome)'); };
  const montaSlot = (av, ratio, tier, colada) => ({
    ratio_sp: +Number(ratio).toFixed(3),
    pick_trap: av.aTrap, pick_nome: nomeTrap(av.aTrap),
    outro_trap: av.bTrap, outro_nome: nomeTrap(av.bTrap),
    pct: av.avaliacao, pct_pick: av.avaliacao, pct_outro: 100 - av.avaliacao,
    tier: tier, top: tier === 'TOP',
    rank_pick: rankDe[av.aTrap] || null, rank_outro: rankDe[av.bTrap] || null,
    bw_provavel: !!colada,                              // par de SP colada (razao <= teto) — em qualquer lugar
    eixos: av.eixos,                                    // {categoria,caltm,split,podio} contra a regua TOP
    caltm_dif: av.caltm_dif, split_dif: av.split_dif, podio_dif: av.podio_dif, desaba_count: av.desaba_count,
    cat_pick: av.cat_pick, cat_outro: av.cat_outro,
    pick_vazia_lado: vaziasAoLado(av.aTrap).length > 0, pick_vazia_traps: vaziasAoLado(av.aTrap),
    outro_vazia_lado: vaziasAoLado(av.bTrap).length > 0, outro_vazia_traps: vaziasAoLado(av.bTrap),
    obs: av.obs || null, flags: av.flags || null
  });

  // TODOS os confrontos possiveis (a "tabela oculta"). O pct do avaliarPar ja embute
  // categoria/tempo/split/podio pelos pesos do Config; tier aqui e' so informativo (nao decide).
  // O fumador (nao-segura) NAO reprova mais (Bruno ago/2026: "pode tirar"). colada = SP dos dois
  // caes dentro do teto de razao (o par que "vale" — em qualquer parte do grid, nao so no topo).
  const todos = [];
  for (let i = 0; i < traps.length; i++) for (let j = i + 1; j < traps.length; j++) {
    const av = reanalise.avaliarPar(dogsByTrap[traps[i]], dogsByTrap[traps[j]], ctx);
    if (!av || av.descartar) continue;                    // sem histórico p/ avaliar
    const ratio = Math.max(lastSp[traps[i]], lastSp[traps[j]]) / Math.min(lastSp[traps[i]], lastSp[traps[j]]);
    const colada = ratio <= spColada;
    const tierQ = reanalise.passaRegua(av.medidas, null, reguaTop) ? 'TOP'
      : reanalise.passaRegua(av.medidas, null, reguaReg) ? 'REGULAR' : null;
    todos.push(montaSlot(av, ratio, tierQ, colada));
  }

  // INDICACAO (Bruno ago/2026): entre os AvBs COLADOS (razao <= teto, em qualquer lugar), os que
  // passam de `parelhoAte` (60% por padrao) qualificam. O de MAIOR pct vira PRINCIPAL; os outros,
  // SECUNDARIOS. Corrida so entra na lista se tiver >=1 candidato — e' o filtro de "corrida que
  // vale" (avaliar a corrida como um todo). Sem fumador, sem gate extra. Principal = "VIP" no Historico.
  // PENEIRAS ATIVAS (Painel ADMIN cascata, Bruno ago/2026): SP-colada (bw_provavel) e pct sao a
  // espinha dorsal — sempre valem. As do meio so filtram se o Bruno as LIGOU no APLICAR
  // (opts.cascAtivos). Default (nenhuma ligada) = passaMeio sempre true = comportamento de hoje.
  // Usam as MEDIDAS CRUAS ja no slot, contra a regua TOP (a mais firme) — mesma leitura da tela.
  const gA = opts.cascAtivos || {};
  const passaMeio = s => {
    if (gA.categoria && !(s.cat_pick != null && s.cat_outro != null && s.cat_pick <= s.cat_outro)) return false;
    if (gA.caltm && !(s.caltm_dif >= reguaTop.caltm_min_dif)) return false;
    if (gA.split && !(s.split_dif >= reguaTop.split_min)) return false;
    if (gA.podio && !(s.podio_dif >= reguaTop.podio_min)) return false;
    if (gA.fumador && !(s.desaba_count < reguaTop.desaba_min)) return false;
    return true;
  };
  const candidatos = todos.filter(s => s.bw_provavel && s.pct > parelhoAte && passaMeio(s))
    .sort((x, y) => y.pct - x.pct);
  const rotulos = ['principal', 'secundario_1', 'secundario_2'];
  const slots = candidatos.slice(0, N_SLOTS).map((s, i) => Object.assign({}, s, { slot: rotulos[i], tier: i === 0 ? 'TOP' : 'REGULAR' }));
  return { slots, todos, rankDe, oddMedia, lastSp };
}

// Devolve so os SLOTS (indicacao: principal + secundarios), como antes. Consumidores que
// so precisam da indicacao seguem iguais.
function slotsDaCorrida(histFull, histAll, raceCard, ctxBase, opts) {
  return _analisaCorrida(histFull, histAll, raceCard, ctxBase, opts).slots;
}

// TABELA COMPLETA de uma corrida (a "oculta"): TODOS os confrontos ja analisados, cada um
// com tier de qualidade, rank de SP e bw_provavel. `slots` = a indicacao derivada. Serve pra
// pre-calcular a manha inteira e cruzar com a BW na hora, sem recalcular nada.
function precalcDaCorrida(histFull, histAll, raceCard, ctxBase, opts) {
  return _analisaCorrida(histFull, histAll, raceCard, ctxBase, opts);
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
    const c = db.prepare("SELECT sp_ratio_max, caltm_min_dif, split_min, podio_min, desaba_queda, desaba_min, reg_sp_ratio_max, reg_caltm_min_dif, reg_split_min, reg_podio_min, reg_desaba_min, avb_parelho_pct, casc_ativo_categoria, casc_ativo_caltm, casc_ativo_split, casc_ativo_podio, casc_ativo_fumador, recencia_ativa, recencia_n, recencia_decay, pistas_filtro FROM analysis_config WHERE user_id=1").get();
    if (c) {
      const m = {};
      // regua TOP
      if (!(opts.spRatioMax > 0) && c.sp_ratio_max > 0) m.spRatioMax = c.sp_ratio_max;
      if (!(opts.caltmMinDif > 0) && c.caltm_min_dif > 0) m.caltmMinDif = c.caltm_min_dif;
      if (opts.splitMin == null && c.split_min != null) m.splitMin = c.split_min;
      if (opts.podioMin == null && c.podio_min != null) m.podioMin = c.podio_min;
      if (!(opts.desabaQueda > 0) && c.desaba_queda > 0) m.desabaQueda = c.desaba_queda;
      if (!(opts.desabaMin > 0) && c.desaba_min > 0) m.desabaMin = c.desaba_min;
      // regua REGULAR
      if (!(opts.regSpRatioMax > 0) && c.reg_sp_ratio_max > 0) m.regSpRatioMax = c.reg_sp_ratio_max;
      if (opts.regCaltmMinDif == null && c.reg_caltm_min_dif != null) m.regCaltmMinDif = c.reg_caltm_min_dif;
      if (opts.regSplitMin == null && c.reg_split_min != null) m.regSplitMin = c.reg_split_min;
      if (opts.regPodioMin == null && c.reg_podio_min != null) m.regPodioMin = c.reg_podio_min;
      if (!(opts.regDesabaMin > 0) && c.reg_desaba_min > 0) m.regDesabaMin = c.reg_desaba_min;
      // corte final de chance (Painel ADMIN): pct > isto. Se a coluna existir, vira o parelhoAte.
      if (!(opts.parelhoAte > 0) && c.avb_parelho_pct > 0) m.parelhoAte = c.avb_parelho_pct;
      // PENEIRAS ATIVAS (cascata): default 0 = desligada = comportamento de hoje. So entram no
      // opts as que o Bruno LIGOU no APLICAR — o _analisaCorrida filtra candidatos por elas.
      if (opts.cascAtivos == null) {
        m.cascAtivos = {
          categoria: c.casc_ativo_categoria === 1, caltm: c.casc_ativo_caltm === 1,
          split: c.casc_ativo_split === 1, podio: c.casc_ativo_podio === 1, fumador: c.casc_ativo_fumador === 1
        };
      }
      // PESO DE RECENCIA no CalTm (default 0 = desligado = comportamento de hoje).
      if (opts.recenciaAtiva == null && c.recencia_ativa === 1) {
        m.recenciaAtiva = true;
        if (c.recencia_n > 0) m.recenciaN = c.recencia_n;
        if (c.recencia_decay > 0) m.recenciaDecay = c.recencia_decay;
      }
      // FILTRO DE PISTA (default NULL = todas = comportamento de hoje). Vira opts.pistasInc
      // (whitelist) / opts.pistasExc (blacklist), ja em minuscula. So aplica se o chamador
      // nao passou o proprio filtro (ex.: preview do funil manda o dele).
      if (opts.pistasInc == null && opts.pistasExc == null && c.pistas_filtro) {
        try {
          const pf = JSON.parse(c.pistas_filtro) || {};
          const norm = a => (Array.isArray(a) ? a : []).map(s => String(s).trim().toLowerCase()).filter(Boolean);
          const inc = norm(pf.inc), exc = norm(pf.exc);
          if (inc.length) m.pistasInc = inc;
          else if (exc.length) m.pistasExc = exc;
        } catch (e) {}
      }
      opts = Object.assign({}, opts, m);
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
    tier: slots[0] ? slots[0].tier : null,             // TOP | REGULAR | null(fora): pro filtro da tela
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
    if (!_pistaPassa(_pista(row.corrida), opts)) continue;   // filtro de pista (Painel ADMIN)
    const c = _corridaDeRow(row, date, opts);
    if (c) corridas.push(c);
  }

  return {
    date, total_corridas: corridas.length,
    parametros: {
      top: { sp_ratio_max: opts.spRatioMax > 0 ? opts.spRatioMax : SP_RATIO_MAX, caltm_min_dif: opts.caltmMinDif > 0 ? opts.caltmMinDif : reanalise.DEFAULTS.caltmMinDif, split_min: opts.splitMin != null ? opts.splitMin : reanalise.DEFAULTS.splitMin, podio_min: opts.podioMin != null ? opts.podioMin : reanalise.DEFAULTS.podioMin, desaba_min: opts.desabaMin > 0 ? opts.desabaMin : reanalise.DEFAULTS.desabaMin },
      regular: { sp_ratio_max: opts.regSpRatioMax > 0 ? opts.regSpRatioMax : 1.20, caltm_min_dif: opts.regCaltmMinDif != null ? opts.regCaltmMinDif : 0.10, split_min: opts.regSplitMin != null ? opts.regSplitMin : 0, podio_min: opts.regPodioMin != null ? opts.regPodioMin : 0, desaba_min: opts.regDesabaMin > 0 ? opts.regDesabaMin : 3 },
      desaba_queda: opts.desabaQueda > 0 ? opts.desabaQueda : reanalise.DEFAULTS.desabaQueda,
      n_slots: N_SLOTS,
      pistas: { inc: Array.isArray(opts.pistasInc) ? opts.pistasInc : [], exc: Array.isArray(opts.pistasExc) ? opts.pistasExc : [] }
    },
    corridas,
    legenda: 'MOTOR ÚNICO, DUAS RÉGUAS. Cada corrida vira TOP (nata) se um par de SP colada passa na régua TOP '
      + '(categoria igual/melhor, CalTm>=corte, split, pódio, e não-segura); senão vira REGULAR se passa na régua '
      + 'mais frouxa; senão fica fora. tier=TOP|REGULAR|null por corrida (e por slot). Cada slot traz as margens '
      + 'cruas (caltm_dif/split_dif/podio_dif/desaba_count) pra calibragem. O pódio segue os 4 eixos SEM SP '
      + '(podio_fonte:"4-eixos"). Trap vazia só avisa (não descarta). Perto da largada atualiza com o card fresco.'
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
// Réguas TOP/REGULAR a partir de opts (config) — usadas pela validação do BW.
function _reguaTop(opts) {
  const D = reanalise.DEFAULTS;
  return { sp_ratio_max: opts.spRatioMax > 0 ? opts.spRatioMax : SP_RATIO_MAX, caltm_min_dif: opts.caltmMinDif > 0 ? opts.caltmMinDif : D.caltmMinDif, split_min: opts.splitMin != null ? opts.splitMin : D.splitMin, podio_min: opts.podioMin != null ? opts.podioMin : D.podioMin, desaba_min: opts.desabaMin > 0 ? opts.desabaMin : D.desabaMin };
}
function _reguaReg(opts) {
  return { sp_ratio_max: opts.regSpRatioMax > 0 ? opts.regSpRatioMax : 1.20, caltm_min_dif: opts.regCaltmMinDif != null ? opts.regCaltmMinDif : 0.10, split_min: opts.regSplitMin != null ? opts.regSplitMin : 0, podio_min: opts.regPodioMin != null ? opts.regPodioMin : 0, desaba_min: opts.regDesabaMin > 0 ? opts.regDesabaMin : 3 };
}

// VALIDAÇÃO DO BW near-post (Bruno ago/2026): o principal (congelado da manhã) FICA sempre.
// Aqui a gente só confere contra os pares que a BetWinner ABRIU (tabela avb_abertos):
//   - o par do principal abriu? -> devolve a ODD dele (a tela atualiza o principal com a odd).
//   - NÃO abriu? -> monta até 2 SECUNDÁRIOS entre os pares JÁ PRONTOS da BW que passam nas
//     mesmas regras do tier (SP não entra — já vêm prontos), cada um com a sua odd.
// Nunca troca o principal. monitorada=false quando a corrida ainda não foi vista na BW.
function _bwDaCorrida(db, row, corridaObj, opts, date) {
  const principal = corridaObj.principal;
  const tier = corridaObj.tier || 'TOP';
  const reguaTop = _reguaTop(opts), reguaReg = _reguaReg(opts);
  const reguaTier = (tier === 'REGULAR') ? reguaReg : reguaTop;
  const desabaQueda = opts.desabaQueda > 0 ? opts.desabaQueda : reanalise.DEFAULTS.desabaQueda;
  let paresAbertos = null;
  try {
    const a = db.prepare("SELECT pares_json FROM avb_abertos WHERE data=? AND corrida=? AND hora=? LIMIT 1").get(date, row.corrida, row.hora);
    if (a) { try { paresAbertos = JSON.parse(a.pares_json); } catch (e) {} }
  } catch (e) {}
  if (!Array.isArray(paresAbertos) || !paresAbertos.length) return { monitorada: false, abriu: null, odd: null, secundarios: [] };

  const dogsByTrap = {};
  try { const hf = JSON.parse(row.hist_full); if (Array.isArray(hf)) for (const g of hf) if (g && g.trap != null) dogsByTrap[Number(g.trap)] = g; } catch (e) {}
  const nomeTrap = t => { const g = dogsByTrap[t]; return g ? _nomeMascara(g.nome, t) : ('b' + t + ' (sem nome)'); };
  const ctx = { dataCorrida: row.data_card || date, trackCorrida: _pista(row.corrida), distCorrida: row.dist || null,
    config: { caltmMinDif: reguaTop.caltm_min_dif, splitMin: reguaTop.split_min, podioMin: reguaTop.podio_min, desabaQueda, desabaMin: reguaTop.desaba_min,
      recenciaAtiva: !!opts.recenciaAtiva, recenciaN: opts.recenciaN, recenciaDecay: opts.recenciaDecay } };
  const mesmoPar = (p, t1, t2) => (Number(p.aTrap) === t1 && Number(p.bTrap) === t2) || (Number(p.aTrap) === t2 && Number(p.bTrap) === t1);

  // 1) o principal abriu? qual odd?
  const parP = paresAbertos.find(p => mesmoPar(p, principal.pick_trap, principal.outro_trap));
  let abriu = !!parP, oddP = null;
  if (parP) { const od = Number(Number(parP.aTrap) === principal.pick_trap ? parP.oddAvenceB : parP.oddBvenceA); oddP = (Number.isFinite(od) && od > 0) ? od : null; }

  // 2) secundários (Bruno ago/2026): SEMPRE as 2 MELHORES que a BW ABRIU (mesmo se o principal
  // abriu) — inclusive pares "sem relação com a OD do PDF", já que a análise já está pronta no
  // banco. Exclui o par do principal. Corte: pct > parelhoAte (60%). Ordena por pct, pega os 2.
  const parelhoAte = opts.parelhoAte > 0 ? opts.parelhoAte : PARELHO_ATE;
  const alertaForteMin = opts.alertaForteMin > 0 ? opts.alertaForteMin : 75;   // corte do "grito" PC+mobile
  // pares que a manha JA previu (principal + secundarios da lista) — pra saber o que e' NOVO.
  const chavePar = (a, b) => Math.min(a, b) + 'x' + Math.max(a, b);
  const previstos = new Set((corridaObj.slots || []).map(s => chavePar(s.pick_trap, s.outro_trap)));
  const cand = [];
  for (const p of paresAbertos) {
    if (mesmoPar(p, principal.pick_trap, principal.outro_trap)) continue;
    const dA = dogsByTrap[Number(p.aTrap)], dB = dogsByTrap[Number(p.bTrap)];
    if (!dA || !dB) continue;
    const av = reanalise.avaliarPar(dA, dB, ctx);
    if (!av || av.descartar) continue;
    if (av.avaliacao <= parelhoAte) continue;             // só AvB firme (>60%)
    const od = Number(Number(p.aTrap) === av.aTrap ? p.oddAvenceB : p.oddBvenceA);
    // NOVA = a BW abriu, passa dos 60%, mas NAO estava na lista da manha (surpresa/oportunidade).
    // alerta_forte = surpresa com pct >= 75 (o "grito" diferenciado no PC e no mobile).
    const nova = !previstos.has(chavePar(av.aTrap, av.bTrap));
    cand.push({
      pick_trap: av.aTrap, pick_nome: nomeTrap(av.aTrap),
      outro_trap: av.bTrap, outro_nome: nomeTrap(av.bTrap),
      pct: av.avaliacao, tier: 'REGULAR',
      odd: (Number.isFinite(od) && od > 0) ? od : null,
      caltm_dif: av.caltm_dif, eixos: av.eixos, obs: av.obs || null,
      nova: nova, alerta_forte: nova && av.avaliacao >= alertaForteMin
    });
  }
  cand.sort((a, b) => b.pct - a.pct);
  const secundarios = cand.slice(0, 2);
  // SURPRESAS = todos os AvBs NOVOS que a BW abriu (nao so os 2 mostrados) — pra o aviso na tela.
  // alerta_forte = existe surpresa >= 75% -> dispara o alerta diferenciado (PC + mobile).
  const surpresas = cand.filter(s => s.nova);
  return { monitorada: true, abriu, odd: oddP, secundarios, surpresas, tem_surpresa: surpresas.length > 0, alerta_forte: surpresas.some(s => s.alerta_forte) };
}

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
  // validação do BW near-post: principal fica; só confere abertura/odd + secundários prontos da BW.
  const bw = (c && c.principal) ? _bwDaCorrida(db, row, c, opts, date) : null;
  return {
    date, hora, corrida, encontrada: !!c, match: c ? match : null,
    corrida_casada: row.corrida,   // o r.corrida que bateu (código cru do banco)
    corrida_obj: c,                // null quando a corrida existe mas não tem histórico avaliável
    bw,                            // { monitorada, abriu, odd, secundarios[] } — principal nunca troca
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
    if (!_pistaPassa(_pista(row.corrida), opts)) continue;   // filtro de pista (Painel ADMIN)
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
      tier: principal.tier,                                      // TOP | REGULAR
      principal,
      // TODOS os pares aprovados (mesmo tier), principal 1o, depois secundarios — ex.: "4x2,1x5".
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

module.exports = { listar, umaCorrida, slotsDaCorrida, precalcDaCorrida, paraPersistir, _aplicaConfigMotor, PARELHO_ATE, SP_RATIO_MAX };
