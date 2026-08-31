'use strict';
// src/utils/cascataMotor.js
// PAINEL ADMIN — CASCATA DE CORTES (Bruno ago/2026).
//
// A ideia: cada corte do motor único é uma PENEIRA numa esteira. Um par de
// galgos (AvB) desce pela esteira e, em cada peneira, ou passa ou morre ali.
// Este módulo NÃO decide nada em produção — ele só SIMULA: pega TODOS os pares
// avaliáveis das corridas reais do dia e mostra o FUNIL (quantos sobram depois
// de cada peneira) + em qual peneira cada par caiu. É a ferramenta de calibragem.
//
// Cada peneira tem VALOR (o corte) e um LIGA/DESLIGA (`ativos`). Peneira desligada
// deixa todo mundo passar (não filtra) — é assim que o Bruno decide o modelo:
// hoje só SP-colada (1) + pct>60 (7) estão "ligadas" de verdade na seleção; as do
// meio (3–6) são informativas. Aqui ele pode religá-las e VER o efeito no volume,
// sem tocar produção. O APLICAR (fora daqui) é que grava no analysis_config.
//
// Puro: recebe os `todos` que o precalcDaCorrida já devolve (campos crus por par)
// e aplica as peneiras. Não fala com rede nem grava nada.

const mm = require('./motorManha');
const reanalise = require('./reanaliseEngine');

// Valores-padrão de cada corte = os defaults do analysis_config (régua TOP).
// A régua REGULAR troca só os números; a estrutura de peneiras é a mesma.
const CORTES_PADRAO = {
  sp_ratio_max: 1.15,   // teto da colagem (peneira 1) — razão SP dos dois <= isto
  categoria_on: true,   // exigir categoria igual/melhor (peneira 2)
  caltm_min_dif: 0.20,  // pick >= isto mais rápido, aj. categoria (peneira 3)
  split_min: 0.01,      // vantagem mínima de arranque (peneira 4)
  podio_min: 0.001,     // vantagem mínima de pódio (peneira 5)
  desaba_queda: 2,      // posições perdidas p/ contar desabamento (fumador, global)
  desaba_min: 2,        // reprova o pick com >= isto desabamentos nas últimas 5 (peneira 6)
  parelho_pct: 60       // corte final de chance: pct > isto (peneira 7)
};

const CORTES_REGULAR = {
  sp_ratio_max: 1.20, categoria_on: true, caltm_min_dif: 0.10,
  split_min: 0, podio_min: 0, desaba_queda: 2, desaba_min: 3, parelho_pct: 60
};

// Por padrão, mostra a ESTEIRA INTEIRA ligada (o Bruno vê o funil completo e
// desliga o que quiser). Produção hoje roda só {sp:true, categoria:true, pct:true}.
const ATIVOS_PADRAO = { sp: true, categoria: true, caltm: true, split: true, podio: true, fumador: true, pct: true };

// A ESTEIRA, em ordem. Cada peneira sabe: a chave do liga/desliga, um rótulo
// humano, o campo cru do par que ela lê, e a função que decide passa/morre.
// A ordem importa — é a ordem em que o funil é aplicado (e define "morreu na
// peneira X" = a PRIMEIRA que reprovou).
const PENEIRAS = [
  {
    id: 'sp', ativoKey: 'sp', rotulo: 'SP colada',
    campo: 'ratio_sp', unidade: 'razão',
    corteKey: 'sp_ratio_max', operador: '<=',
    descreve: c => `razão SP dos dois <= ${c.sp_ratio_max}`,
    passa: (p, c) => Number(p.ratio_sp) <= Number(c.sp_ratio_max)
  },
  {
    id: 'categoria', ativoKey: 'categoria', rotulo: 'Categoria',
    campo: 'categoria', unidade: 'nível',
    corteKey: 'categoria_on', operador: 'pick<=rival',
    descreve: () => 'pick de categoria igual ou melhor (nível <=)',
    passa: (p) => (p.cat_pick != null && p.cat_outro != null) ? (p.cat_pick <= p.cat_outro) : false
  },
  {
    id: 'caltm', ativoKey: 'caltm', rotulo: 'CalTm',
    campo: 'caltm_dif', unidade: 's',
    corteKey: 'caltm_min_dif', operador: '>=',
    descreve: c => `pick >= ${c.caltm_min_dif}s mais rápido (aj. categoria)`,
    passa: (p, c) => Number(p.caltm_dif) >= Number(c.caltm_min_dif)
  },
  {
    id: 'split', ativoKey: 'split', rotulo: 'Split',
    campo: 'split_dif', unidade: 's',
    corteKey: 'split_min', operador: '>=',
    descreve: c => `vantagem de arranque >= ${c.split_min}`,
    passa: (p, c) => Number(p.split_dif) >= Number(c.split_min)
  },
  {
    id: 'podio', ativoKey: 'podio', rotulo: 'Pódio',
    campo: 'podio_dif', unidade: 'taxa',
    corteKey: 'podio_min', operador: '>=',
    descreve: c => `vantagem de pódio >= ${c.podio_min}`,
    passa: (p, c) => Number(p.podio_dif) >= Number(c.podio_min)
  },
  {
    id: 'fumador', ativoKey: 'fumador', rotulo: 'Fumador (não desaba)',
    campo: 'desaba_count', unidade: 'corridas',
    corteKey: 'desaba_min', operador: '<',
    descreve: c => `pick desabou em < ${c.desaba_min} das últimas 5`,
    passa: (p, c) => Number(p.desaba_count) < Number(c.desaba_min)
  },
  {
    id: 'pct', ativoKey: 'pct', rotulo: 'Chance (pct)',
    campo: 'pct', unidade: '%',
    corteKey: 'parelho_pct', operador: '>',
    descreve: c => `chance do confronto > ${c.parelho_pct}%`,
    passa: (p, c) => Number(p.pct) > Number(c.parelho_pct)
  }
];

// Normaliza os cortes/ativos recebidos, caindo nos padrões quando vier faltando.
function _cortes(over) { return Object.assign({}, CORTES_PADRAO, over || {}); }
function _ativos(over) { return Object.assign({}, ATIVOS_PADRAO, over || {}); }

// Passa UM par pela esteira. Devolve onde ele parou.
//   { vivo, morreu_em, morreu_rotulo, passou:[ids], valor_no_corte:{...} }
// Peneira DESLIGADA é pulada (não mata). "morreu_em" = id da 1a peneira ligada
// que reprovou; null se chegou vivo até o fim.
function _passaPar(par, cortes, ativos) {
  const passou = [];
  for (const pen of PENEIRAS) {
    if (!ativos[pen.ativoKey]) continue;           // desligada: não filtra
    if (pen.passa(par, cortes)) { passou.push(pen.id); continue; }
    return { vivo: false, morreu_em: pen.id, morreu_rotulo: pen.rotulo, passou };
  }
  return { vivo: true, morreu_em: null, morreu_rotulo: null, passou };
}

// CASCATA de UMA corrida. `todos` = a saída de precalcDaCorrida (todos os pares).
// Devolve o funil (por peneira, quantos entram/sobram/morrem) + a lista de
// sobreviventes (ordenada por pct desc; o 1o é o "principal") + o destino de cada par.
function cascataCorrida(todos, cortes, ativos) {
  cortes = _cortes(cortes); ativos = _ativos(ativos);
  const pares = Array.isArray(todos) ? todos : [];
  // funil: começa com todos os pares avaliáveis e vai afunilando peneira a peneira.
  let vivos = pares.slice();
  const funil = [];
  for (const pen of PENEIRAS) {
    const entraram = vivos.length;
    if (!ativos[pen.ativoKey]) {
      funil.push({ id: pen.id, rotulo: pen.rotulo, ativa: false, corte: cortes[pen.corteKey],
        entraram, sobraram: entraram, mortos: 0, descricao: pen.descreve(cortes) + ' (DESLIGADA)' });
      continue;
    }
    const sobrev = vivos.filter(p => pen.passa(p, cortes));
    funil.push({ id: pen.id, rotulo: pen.rotulo, ativa: true, corte: cortes[pen.corteKey],
      entraram, sobraram: sobrev.length, mortos: entraram - sobrev.length, descricao: pen.descreve(cortes) });
    vivos = sobrev;
  }
  // destino de cada par (pra pintar a tabela: quem morreu onde)
  const porPar = pares.map(p => {
    const d = _passaPar(p, cortes, ativos);
    return {
      pick_trap: p.pick_trap, pick_nome: p.pick_nome, outro_trap: p.outro_trap, outro_nome: p.outro_nome,
      ratio_sp: p.ratio_sp, pct: p.pct, caltm_dif: p.caltm_dif, split_dif: p.split_dif,
      podio_dif: p.podio_dif, desaba_count: p.desaba_count, cat_pick: p.cat_pick, cat_outro: p.cat_outro,
      vivo: d.vivo, morreu_em: d.morreu_em, morreu_rotulo: d.morreu_rotulo
    };
  });
  const sobreviventes = porPar.filter(p => p.vivo).sort((a, b) => b.pct - a.pct);
  return {
    avaliados: pares.length,
    sobreviventes,
    principal: sobreviventes[0] || null,      // o de maior pct entre os que chegaram vivos
    entrou: sobreviventes.length > 0,          // a corrida "vale"? (>=1 sobrevivente)
    funil,
    por_par: porPar
  };
}

// CASCATA do DIA inteiro. Lê as corridas reais do banco (mesmo recorte do listar),
// roda precalcDaCorrida em cada uma pra ter os `todos`, e aplica a esteira. Devolve
// o funil AGREGADO (soma das corridas) + um resumo por corrida. Read-only.
//   opts: { date, cortes:{...}, ativos:{...} }
function cascata(db, opts) {
  opts = opts || {};
  const date = opts.date;
  const cortes = _cortes(opts.cortes);
  const ativos = _ativos(opts.ativos);
  // PESO DE RECENCIA (opcional): quando ligado, recalcula o CalTm de cada galgo dando mais
  // peso à corrida mais recente — o que muda os números (CALTM/CHANCE) e, portanto, o funil.
  const rec = opts.recencia || {};
  const precalcOpts = {};
  if (rec.ativa) { precalcOpts.recenciaAtiva = true; if (rec.n > 0) precalcOpts.recenciaN = Number(rec.n); if (rec.decay > 0) precalcOpts.recenciaDecay = Number(rec.decay); }
  let rows = db.prepare(
    "SELECT r.hora, r.corrida, r.dist, r.hist_full, r.hist_all, r.race_card, r.data_card " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at,'-3 hours')=? AND r.hist_full IS NOT NULL ORDER BY r.hora"
  ).all(date);
  // FILTRO DE PISTA (Bruno ago/2026): pre-filtro de CORRIDA (nao de par). `pistas` = so essas
  // (whitelist); se vazio, `pistasOff` = todas menos essas (blacklist). Vazio nos dois = todas.
  // A pista e' o 1o token do codigo da corrida ("Clnml A5" -> "clnml"), casado sem caixa.
  const _pistaDe = corrida => String(corrida || '').split(' ')[0].toLowerCase();
  const _inc = (Array.isArray(opts.pistas) ? opts.pistas : []).map(s => String(s).trim().toLowerCase()).filter(Boolean);
  const _exc = (Array.isArray(opts.pistasOff) ? opts.pistasOff : []).map(s => String(s).trim().toLowerCase()).filter(Boolean);
  if (_inc.length) rows = rows.filter(r => _inc.includes(_pistaDe(r.corrida)));
  else if (_exc.length) rows = rows.filter(r => !_exc.includes(_pistaDe(r.corrida)));

  // funil agregado: mesma estrutura de peneiras, somando entraram/sobraram/mortos.
  const agregado = PENEIRAS.map(pen => ({ id: pen.id, rotulo: pen.rotulo, ativa: !!ativos[pen.ativoKey],
    corte: cortes[pen.corteKey], entraram: 0, sobraram: 0, mortos: 0, descricao: pen.descreve(cortes) + (ativos[pen.ativoKey] ? '' : ' (DESLIGADA)') }));
  const corridas = [];
  let corridasComPar = 0, totalAvaliados = 0, totalSobreviventes = 0;

  for (const row of rows) {
    let histFull = null, histAll = null, raceCard = null;
    try { histFull = JSON.parse(row.hist_full); } catch (e) { continue; }
    try { histAll = JSON.parse(row.hist_all); } catch (e) {}
    try { raceCard = JSON.parse(row.race_card); } catch (e) {}
    if (!Array.isArray(histFull) || histFull.length < 2 || !Array.isArray(histAll)) continue;
    const ctxBase = { dataCorrida: row.data_card || date, trackCorrida: _pista(row.corrida), distCorrida: row.dist || null };
    let todos = [];
    try { todos = mm.precalcDaCorrida(histFull, histAll, raceCard, ctxBase, precalcOpts).todos || []; } catch (e) { continue; }
    const c = cascataCorrida(todos, cortes, ativos);
    // acumula no funil agregado
    c.funil.forEach((f, i) => { agregado[i].entraram += f.entraram; agregado[i].sobraram += f.sobraram; agregado[i].mortos += f.mortos; });
    totalAvaliados += c.avaliados; totalSobreviventes += c.sobreviventes.length;
    if (c.entrou) corridasComPar++;
    corridas.push({
      hora: row.hora, corrida: row.corrida, dist: row.dist,
      avaliados: c.avaliados, sobreviventes: c.sobreviventes.length, entrou: c.entrou,
      principal: c.principal ? { pick_trap: c.principal.pick_trap, pick_nome: c.principal.pick_nome,
        outro_trap: c.principal.outro_trap, outro_nome: c.principal.outro_nome, pct: c.principal.pct,
        ratio_sp: c.principal.ratio_sp } : null,
      por_par: c.por_par
    });
  }

  return {
    date, cortes, ativos,
    recencia: { ativa: !!rec.ativa, n: precalcOpts.recenciaN || 3, decay: precalcOpts.recenciaDecay || 0.5 },
    pistas: _inc, pistas_off: _exc,
    total_corridas: rows.length,
    corridas_no_dia: corridas.length,      // as que tinham histórico avaliável
    corridas_que_valem: corridasComPar,    // as que sobrou >=1 par vivo (o "volume" final)
    total_avaliados: totalAvaliados,
    total_sobreviventes: totalSobreviventes,
    funil: agregado,
    corridas,
    legenda: 'CASCATA DE CORTES (simulação). Cada par desce pelas 7 peneiras na ordem; ' +
      'peneira DESLIGADA não filtra. "corridas_que_valem" = quantas sobraram com >=1 par vivo ' +
      '(o volume do dia com esses cortes). Nada foi gravado — é só simulação.'
  };
}

// pista a partir do código da corrida ("Kinsly A6" -> "Kinsly"). Igual ao motorManha.
function _pista(corrida) { const s = String(corrida || '').trim(); return s ? s.split(/\s+/)[0] : null; }

// ── EXEMPLOS SINTÉTICOS POR CORTE ────────────────────────────────────────────
// Pra cada peneira, um confronto DIDÁTICO que PASSA e um que MORRE naquele valor,
// com números REAIS (rodados pelo avaliarPar, não inventados). Isola só a dimensão
// da peneira — as outras ficam neutras — pra o Bruno ver o efeito de UM corte por vez.
// Duas exceções não passam pelo avaliarPar: SP-colada (a razão é do mercado, não do
// motor) e o corte final de pct (que é o próprio placar do avaliarPar).

// Fabrica um galgo válido pro avaliarPar. cal/spl/pos são arrays (mais recente 1o).
// bends = a posição repetida (galgo "correu como chegou") — sem desabamento — a menos
// que bendsUlt seja passado (pra forjar o fumador: lidera na última curva e cai).
function _dog(trap, nome, cal, spl, pos, classe, bendsUlt) {
  classe = classe || 'A3';
  const hist = cal.map((c, i) => ({
    classe, caltm: c, split: spl[i], pos: pos[i],
    bends: (bendsUlt != null ? String(bendsUlt) : String(pos[i])).repeat(4).slice(0, 4),
    remarks: '', dist: '480m', pista: 'Test'
  }));
  return { trap, nome, historico: hist };
}
const _CTX_EX = { trapsVazias: [], dataCorrida: '2026-08-30', trackCorrida: 'Test', distCorrida: '480m' };

function _av(dPick, dRival) {
  const av = reanalise.avaliarPar(dPick, dRival, _CTX_EX);
  if (!av || av.descartar) return null;
  return av;
}

// monta o par de exemplo {passa|falha} lendo o número real que saiu do avaliarPar.
function _cena(rotulo, av, campo, corte, operador, extra) {
  const valor = (av && av.medidas && av.medidas[campo] != null) ? av.medidas[campo] : (av ? av[campo] : null);
  return Object.assign({
    legenda: rotulo,
    pick: av ? `T${av.aTrap} ${av.aNome}` : null,
    rival: av ? `T${av.bTrap} ${av.bNome}` : null,
    pct: av ? av.avaliacao : null,
    valor_medido: valor, corte, operador
  }, extra || {});
}

function exemploCorte(gateId, valor) {
  const c = Object.assign({}, CORTES_PADRAO);
  if (valor != null && !Number.isNaN(Number(valor))) {
    // mapeia o valor recebido pro corte certo
    const map = { sp: 'sp_ratio_max', caltm: 'caltm_min_dif', split: 'split_min', podio: 'podio_min', fumador: 'desaba_min', pct: 'parelho_pct' };
    if (map[gateId]) c[map[gateId]] = Number(valor);
  }

  if (gateId === 'sp') {
    // colagem é razão de mercado — não passa pelo avaliarPar.
    const teto = c.sp_ratio_max;
    const passaR = 1.10, falhaR = 1.67;
    return {
      corte: teto, operador: '<=', unidade: 'razão',
      explica: `A colagem olha só o mercado: razão = SP_maior / SP_menor. Par "vale" quando a razão <= ${teto}.`,
      passa: { legenda: `SP 3.00 vs 3.30 → razão ${passaR}`, valor_medido: passaR, corte: teto, operador: '<=', passou: passaR <= teto },
      falha: { legenda: `SP 3.00 vs 5.00 → razão ${falhaR}`, valor_medido: falhaR, corte: teto, operador: '<=', passou: falhaR <= teto }
    };
  }

  if (gateId === 'caltm') {
    // isola o TEMPO: mesma categoria, split/pódio neutros; só muda o caltm.
    const rivalBase = _dog(2, 'Rival', [29.65, 29.70], [3.55, 3.57], [2, 2]);
    const pickForte = _dog(1, 'PickForte', [29.30, 29.35], [3.55, 3.57], [2, 2]); // ~0.35s
    const pickFraco = _dog(1, 'PickFraco', [29.55, 29.60], [3.55, 3.57], [2, 2]); // ~0.10s
    const avP = _av(pickForte, rivalBase), avF = _av(pickFraco, rivalBase);
    return {
      corte: c.caltm_min_dif, operador: '>=', unidade: 's',
      explica: `caltm_dif = quantos segundos o pick é mais rápido, ajustado por categoria. Passa se >= ${c.caltm_min_dif}s.`,
      passa: _cena('Pick ~0,35s mais rápido', avP, 'caltm_dif', c.caltm_min_dif, '>=', { passou: avP && avP.medidas.caltm_dif >= c.caltm_min_dif }),
      falha: _cena('Pick só ~0,10s mais rápido', avF, 'caltm_dif', c.caltm_min_dif, '>=', { passou: avF && avF.medidas.caltm_dif >= c.caltm_min_dif })
    };
  }

  if (gateId === 'split') {
    // isola o ARRANQUE: mesmo tempo/pódio; só muda o split.
    const rival = _dog(2, 'Rival', [29.40, 29.45], [3.55, 3.57], [2, 2]);
    const pickArranca = _dog(1, 'PickArranca', [29.35, 29.40], [3.48, 3.50], [2, 2]); // split ~0.07 melhor
    const pickIgual = _dog(1, 'PickIgual', [29.35, 29.40], [3.55, 3.57], [2, 2]);     // split igual
    const avP = _av(pickArranca, rival), avF = _av(pickIgual, rival);
    return {
      corte: c.split_min, operador: '>=', unidade: 's',
      explica: `split_dif = vantagem de arranque do pick (positivo = arranca melhor). Passa se >= ${c.split_min}.`,
      passa: _cena('Pick arranca ~0,07 melhor', avP, 'split_dif', c.split_min, '>=', { passou: avP && avP.medidas.split_dif >= c.split_min }),
      falha: _cena('Pick com o mesmo arranque', avF, 'split_dif', c.split_min, '>=', { passou: avF && avF.medidas.split_dif >= c.split_min })
    };
  }

  if (gateId === 'podio') {
    // isola o PÓDIO: mesmo tempo/split; só muda a taxa de chegar no pódio.
    const rival = _dog(2, 'Rival', [29.40, 29.45], [3.55, 3.57], [4, 5]);       // fora do pódio
    const pickReg = _dog(1, 'PickRegular', [29.35, 29.40], [3.55, 3.57], [1, 2]); // sempre no pódio
    const pickIgual = _dog(1, 'PickIgual', [29.35, 29.40], [3.55, 3.57], [4, 5]); // também fora
    const avP = _av(pickReg, rival), avF = _av(pickIgual, rival);
    return {
      corte: c.podio_min, operador: '>=', unidade: 'taxa',
      explica: `podio_dif = vantagem na taxa de chegar no pódio (top 3). Passa se >= ${c.podio_min}.`,
      passa: _cena('Pick sempre no pódio, rival fora', avP, 'podio_dif', c.podio_min, '>=', { passou: avP && avP.medidas.podio_dif >= c.podio_min }),
      falha: _cena('Os dois fora do pódio', avF, 'podio_dif', c.podio_min, '>=', { passou: avF && avF.medidas.podio_dif >= c.podio_min })
    };
  }

  if (gateId === 'fumador') {
    // isola o FUMADOR: o pick lidera na última curva (bends '1111') mas CHEGA em 4o (desaba).
    const rival = _dog(2, 'Rival', [29.60, 29.65], [3.60, 3.62], [3, 3]);
    const pickSegura = _dog(1, 'PickSegura', [29.35, 29.40], [3.50, 3.52], [1, 1]);              // chega como corre
    const pickFuma = _dog(1, 'PickFuma', [29.35, 29.40], [3.50, 3.52], [4, 4], 'A3', 1);         // lidera curva (1) e chega 4o
    const avP = _av(pickSegura, rival), avF = _av(pickFuma, rival);
    return {
      corte: c.desaba_min, operador: '<', unidade: 'corridas',
      explica: `desaba_count = em quantas das últimas 5 o pick liderou a última curva e afundou na reta (queda >= ${c.desaba_queda}). Reprova com >= ${c.desaba_min}.`,
      passa: _cena('Pick chega como corre (não desaba)', avP, 'desaba_count', c.desaba_min, '<', { passou: avP && avP.medidas.desaba_count < c.desaba_min }),
      falha: _cena('Pick lidera a curva e chega em 4o', avF, 'desaba_count', c.desaba_min, '<', { passou: avF && avF.medidas.desaba_count < c.desaba_min })
    };
  }

  if (gateId === 'pct' || gateId === 'categoria') {
    // pct: o placar do confronto. categoria: nível igual/melhor.
    const rival = _dog(2, 'Rival', [29.70, 29.75], [3.60, 3.62], [3, 3], 'A3');
    const pickForte = _dog(1, 'PickForte', [29.30, 29.35], [3.48, 3.50], [1, 1], 'A3');   // domina -> pct alto
    const pickApertado = _dog(1, 'PickApertado', [29.62, 29.66], [3.58, 3.60], [2, 3], 'A3'); // quase empate
    const avP = _av(pickForte, rival), avF = _av(pickApertado, rival);
    if (gateId === 'pct') {
      return {
        corte: c.parelho_pct, operador: '>', unidade: '%',
        explica: `pct = a chance do confronto (resumo de tempo/split/pódio/categoria). Passa se > ${c.parelho_pct}%.`,
        passa: { legenda: 'Pick domina o confronto', pict: null, pct: avP ? avP.avaliacao : null, valor_medido: avP ? avP.avaliacao : null, corte: c.parelho_pct, operador: '>', passou: avP && avP.avaliacao > c.parelho_pct },
        falha: { legenda: 'Confronto quase empatado', pct: avF ? avF.avaliacao : null, valor_medido: avF ? avF.avaliacao : null, corte: c.parelho_pct, operador: '>', passou: avF && avF.avaliacao > c.parelho_pct }
      };
    }
    // categoria
    const rivalA5 = _dog(2, 'RivalA5', [29.70, 29.75], [3.60, 3.62], [3, 3], 'A5');
    const pickA3 = _dog(1, 'PickA3', [29.55, 29.60], [3.55, 3.57], [2, 2], 'A3');   // categoria melhor (3<5)
    // pick A7: bem mais rápido no tempo CRU (~1s) — segue sendo o favorito do confronto mesmo
    // após o ajuste de categoria (0,40s/nível), mas PERDE na peneira de categoria (7 > 5).
    const pickA7 = _dog(1, 'PickA7', [28.70, 28.75], [3.55, 3.57], [2, 2], 'A7');
    const avOk = _av(pickA3, rivalA5), avNo = _av(pickA7, rivalA5);
    return {
      corte: 'nível pick <= nível rival', operador: 'pick<=rival', unidade: 'nível',
      explica: 'Categoria: o pick tem que vir de categoria igual ou melhor (nível menor = mais forte; A1=1 ... A9=9).',
      passa: { legenda: 'Pick A3 x Rival A5 (melhor)', valor_medido: avOk ? `A${avOk.cat_pick} vs A${avOk.cat_outro}` : null, passou: avOk ? avOk.medidas.categoria_ok : null },
      falha: { legenda: 'Pick A7 x Rival A5 (pior)', valor_medido: avNo ? `A${avNo.cat_pick} vs A${avNo.cat_outro}` : null, passou: avNo ? avNo.medidas.categoria_ok : null }
    };
  }

  return { erro: 'corte desconhecido: ' + gateId, corte: null };
}

module.exports = { cascata, cascataCorrida, exemploCorte, PENEIRAS, CORTES_PADRAO, CORTES_REGULAR, ATIVOS_PADRAO, _passaPar };
