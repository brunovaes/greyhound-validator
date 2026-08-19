'use strict';
// src/utils/motorNota.js
//
// MOTOR DE NOTA — Carga VIP v2 (classificador AvB por CONTEXTO).
//
// A ideia da Carga VIP é ser VIP: só entra par de odd colada cujo CONTEXTO
// (pista/turno/metragem/categoria) tem um sinal que SOBREVIVEU à validação fora
// da amostra (estudoReverso.validar) E que faz sentido. Os contextos-miragem
// (fortes no treino, desmancharam no teste) e os que não fazem sentido ficam
// DE FORA — não são silenciados, aparecem em `descartados` pra auditoria.
//
// O cérebro NÃO tem taxa chumbada: ele é construído com os NÚMEROS VIVOS da
// validação do dia. Só a CURADORIA (quais contextos são VIP) é fixa aqui.
//
// Leitura pura: usa races.hist_all + finishing_order_json + race_card. Não grava.
const { probImplicita } = require('./spEngine');
const { bateuPar } = require('./avbResultado');
const _cv = require('./cargaVip');              // mesma limpeza de nome do v1 (fonte única)
// blindado: se por algum motivo o export não estiver disponível, cai no nome cru
// (nunca zera os nomes por causa de um require desalinhado no deploy)
const _limpaNome = (typeof _cv._limpaNome === 'function') ? _cv._limpaNome : (n => (n == null ? '' : String(n)));
const ER = require('./estudoReverso');
const { _perfilGalgo, _votos, _turno, _pista, _categoria, _distVal } = ER;

// ── CURADORIA VIP ─────────────────────────────────────────────────────────────
// Assinatura = `<contexto exato do validar>|<sinal>`. Só os contextos validados
// que FAZEM SENTIDO. A taxa/IC vêm vivos do validar; aqui só marcamos tier + id.
// (contexto segue a ordem de dims do validar: pista · turno · dist · cat)
const WHITELIST = {
  'pista=Yarmouth|caltm':            { tier: 'ELITE', apelido: 'Yarmouth + CalTm' },
  'turno=tarde · dist=500m|caltm':   { tier: 'VIP',   apelido: 'Tarde + 500m + CalTm' },
  'turno=tarde · cat=A7|podio':      { tier: 'VIP',   apelido: 'Tarde + A7 + Pódio' },
  'pista=Clonmel|caltm':             { tier: 'VIP',   apelido: 'Clonmel + CalTm' },
  'dist=480m · cat=A5|caltm':        { tier: 'VIP',   apelido: '480m + A5 + CalTm' },
  'turno=manha · dist=480m|caltm':   { tier: 'VIP',   apelido: 'Manhã + 480m + CalTm' }
};
// Base histórica (CalTm global) — medida n=1138, teste ~58.8%. NÃO é VIP: é o
// espinha-dorsal, entra só como fallback marcado (tier BASE) pra referência.
const BASE = { sinal: 'caltm', tier: 'BASE', apelido: 'CalTm (base histórica)', taxa: 58, ic_low: 56 };

const TIER_RANK = { ELITE: 0, VIP: 1, BASE: 2 };
const NOTA_LETRA = t => (t === 'ELITE' ? 'A+' : (t === 'VIP' ? 'A' : 'B'));

// Qualidade, não volume:
// (1) CORTE_TAXA — o contexto só entra no cérebro se a taxa do TESTE (viva) >= isso.
// (2) MIN_MARGEM — dentro do contexto, o sinal precisa DECIDIR com folga (não raspando).
//     caltm em segundos; podio em fração de pódio nas últimas 5 (0.20 = 1 corrida a mais).
const CORTE_TAXA = 63;
const MIN_MARGEM = { caltm: 0.15, podio: 0.20, split: 0.15, consistencia: 0, categoria: 0, sp_mercado: 0, perfil: 0, boxe_menor: 0, trap_vazia: 0 };
function _margem(sinal, X, Y) {
  if (sinal === 'caltm') return Math.abs((X.caltm || 0) - (Y.caltm || 0));
  if (sinal === 'podio') return Math.abs((X.podio || 0) - (Y.podio || 0));
  if (sinal === 'split') return Math.abs((X.split || 0) - (Y.split || 0));
  return Infinity; // sinal sem margem definida não é gateado por folga
}

// Valor do sinal num galgo + se "menor é melhor" — pra ranquear o pódio pela MESMA
// condição que decidiu o AvB (o pódio nasce do mesmo critério, por construção).
const _MENOR_MELHOR = { caltm: 1, split: 1, consistencia: 1, categoria: 1, sp_mercado: 1, boxe_menor: 1 };
function _valSinal(g, sinal) {
  switch (sinal) {
    case 'caltm': return g.caltm;
    case 'podio': return g.podio;
    case 'split': return g.split;
    case 'consistencia': return g.posStd;
    case 'categoria': return g.catNivel;
    case 'sp_mercado': return g.oddMedia;
    case 'perfil': return g.perfil;
    case 'boxe_menor': return g.trap;
    default: return null;
  }
}
// Pódio do VIP: campo inteiro ordenado pelo sinal que decidiu o AvB. topN=3 (o pódio).
function _podioPorSinal(galgos, sinal, nomesPorTrap, topN) {
  const menor = _MENOR_MELHOR[sinal] === 1;
  const arr = galgos.filter(g => _valSinal(g, sinal) != null).map(g => ({ trap: g.trap, v: _valSinal(g, sinal) }));
  arr.sort((a, b) => menor ? (a.v - b.v) : (b.v - a.v));
  return arr.slice(0, topN || 3).map((x, i) => ({
    pos: i + 1, trap: x.trap, nome: (nomesPorTrap && nomesPorTrap[String(x.trap)]) || ''
  }));
}

// Cache do cérebro: validar() varre TODO o histórico (caro). Como o /vip-do-vip é
// chamado a cada refresh (1 min) por usuário — inclusive pela tela Analisar — a
// reconstrução do cérebro fica em cache curto. O placar do dia NÃO usa esse cache
// (é recalculado a cada chamada em classificar), então continua ao vivo.
let _cerebroCache = null;                 // { key, at, data }
const _CEREBRO_TTL_MS = 5 * 60 * 1000;    // 5 min

// ── construir o cérebro do dia (validado ao vivo + curado) ───────────────────
function construirCerebro(db, opts) {
  opts = opts || {};
  const spRatioMax = opts.spRatioMax > 0 ? opts.spRatioMax : 1.15;
  const corteTaxa = opts.minTaxa > 0 ? opts.minTaxa : CORTE_TAXA;

  const cacheKey = spRatioMax + '|' + (opts.minHalf || 25) + '|' + corteTaxa;
  if (!opts.noCache && _cerebroCache && _cerebroCache.key === cacheKey
      && (Date.now() - _cerebroCache.at) < _CEREBRO_TTL_MS) {
    return _cerebroCache.data;             // cérebro quente: evita varrer o histórico de novo
  }

  const v = ER.validar(db, { spRatioMax: opts.spRatioMax, minHalf: opts.minHalf });

  const porAssinatura = {};
  for (const c of (v.validados || [])) porAssinatura[c.contexto + '|' + c.sinal] = c;

  const cerebro = [];           // regras VIP ativas (números vivos)
  const naoValidouHoje = [];    // whitelist que HOJE não bateu o critério (falta dado / caiu / fraca)
  for (const assinatura in WHITELIST) {
    const meta = WHITELIST[assinatura];
    const barra = assinatura.lastIndexOf('|');
    const contexto = assinatura.slice(0, barra), sinal = assinatura.slice(barra + 1);
    const dados = porAssinatura[assinatura];
    if (!dados) { naoValidouHoje.push({ contexto, sinal, tier: meta.tier, apelido: meta.apelido, motivo: 'sem amostra suficiente hoje' }); continue; }
    // corte de qualidade: o elite (A+) passa sempre; os VIP precisam >= corteTaxa
    if (meta.tier !== 'ELITE' && dados.taxa_teste < corteTaxa) {
      naoValidouHoje.push({ contexto, sinal, tier: meta.tier, apelido: meta.apelido, taxa_teste: dados.taxa_teste, motivo: 'abaixo do corte de qualidade (' + corteTaxa + '%)' });
      continue;
    }
    cerebro.push({
      id: assinatura, apelido: meta.apelido, tier: meta.tier,
      match: _parseContexto(contexto), sinal,
      taxa: dados.taxa_teste, ic_low: dados.teste_ic_low,
      n_treino: dados.n_treino, n_teste: dados.n_teste, taxa_treino: dados.taxa_treino,
      dims: Object.keys(_parseContexto(contexto)).length
    });
  }
  // BASE no fim (fallback global)
  cerebro.push({ id: 'base·caltm', apelido: BASE.apelido, tier: 'BASE', match: {}, sinal: BASE.sinal, taxa: BASE.taxa, ic_low: BASE.ic_low, dims: 0 });

  // prioridade: ELITE > VIP > BASE; dentro do tier, mais específico e maior IC ganha
  cerebro.sort((a, b) =>
    (TIER_RANK[a.tier] - TIER_RANK[b.tier]) || (b.dims - a.dims) || ((b.ic_low || 0) - (a.ic_low || 0)));

  // o que a validação jogou fora (miragens) — auditoria do "descartamos"
  const descartados = (v.miragens || []).map(m => ({
    contexto: m.contexto, sinal: m.sinal,
    taxa_treino: m.taxa_treino, taxa_teste: m.taxa_teste,
    motivo: 'miragem: forte no treino, caiu no teste'
  }));

  const resultado = { cerebro, naoValidouHoje, descartados, corte_taxa: corteTaxa, parametros: v.parametros, total_pares_estudo: v.total_pares, dias: v.dias };
  _cerebroCache = { key: cacheKey, at: Date.now(), data: resultado };
  return resultado;
}

function _parseContexto(ctx) {
  const out = {};
  String(ctx || '').split('·').forEach(p => {
    const s = p.trim(); const eq = s.indexOf('=');
    if (eq > 0) out[s.slice(0, eq).trim()] = s.slice(eq + 1).trim();
  });
  return out;
}

// ── classificar as corridas de HOJE com o cérebro ────────────────────────────
function _oddDecimal(sp) { if (!sp) return null; const p = probImplicita(String(sp).replace(/[A-Za-z]+$/, '')); return (p && p > 0) ? 1 / p : null; }

function classificar(db, opts) {
  opts = opts || {};
  const date = opts.date;
  const spRatioMax = opts.spRatioMax > 0 ? opts.spRatioMax : 1.15;
  const soVip = opts.soVip !== false;   // por padrão, VIP é VIP: BASE não entra na lista

  const { cerebro, naoValidouHoje, descartados } = construirCerebro(db, opts);

  const umPorCorrida = opts.umPorCorrida !== false;   // padrão: 1 AvB por corrida (não entra em 2)
  const aplicaVazia = opts.trapVazia !== false;       // padrão: regra da trap vazia ligada

  const rows = db.prepare(
    "SELECT r.hora, r.corrida, r.dist, r.nivel, r.hist_all, r.finishing_order_json, r.race_card, " +
    "r.final_check_at, r.final_check_status, r.flag_atrasada " +
    "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at,'-3 hours')=? AND r.hist_all IS NOT NULL ORDER BY r.hora"
  ).all(date);

  // Pares que o betwinner ABRIU, por corrida (captador avb_abertos) — mesmo contrato
  // da Carga VIP. Corrida SEM linha aqui = não monitorada → abriu fica null (≠ false).
  const abertosPorCorrida = {};
  try {
    const abrs = db.prepare("SELECT corrida, hora, pares_json FROM avb_abertos WHERE data=?").all(date);
    for (const a of abrs) {
      let pares = null; try { pares = JSON.parse(a.pares_json); } catch (e) {}
      if (Array.isArray(pares)) abertosPorCorrida[String(a.corrida || '') + '|' + String(a.hora || '')] = pares;
    }
  } catch (e) {}

  let entradas = [];
  for (const row of rows) {
    let hist = null, chegada = null, rc = null;
    try { hist = JSON.parse(row.hist_all); } catch (e) { continue; }
    if (!Array.isArray(hist) || hist.length < 2) continue;
    try { const a = JSON.parse(row.finishing_order_json); if (Array.isArray(a) && a.length) chegada = a; } catch (e) {}
    let nomesPorTrap = null;
    try { rc = JSON.parse(row.race_card); if (Array.isArray(rc) && rc.length) { nomesPorTrap = {}; for (const g of rc) if (g && g.trap != null) nomesPorTrap[String(g.trap)] = _limpaNome(g.nome); } } catch (e) {}

    // traps vazias (grid 6) p/ o sinal trap_vazia
    const presentes = new Set();
    (Array.isArray(rc) ? rc : hist).forEach(g => { if (g && g.trap != null) presentes.add(Number(g.trap)); });
    const vaz = new Set(); for (let t = 1; t <= 6; t++) if (!presentes.has(t)) vaz.add(t);
    const temVazia = t => vaz.has(t - 1) || vaz.has(t + 1);

    const galgos = hist.map(_perfilGalgo).filter(g => g && g.oddMedia > 0 && g.trap > 0);
    const ctx = { turno: _turno(row.hora), pista: _pista(row.corrida), dist: _distVal(row.dist), cat: _categoria(row.corrida) };

    // regras cujo contexto casa com ESTA corrida (todas de uma vez; escolha por par)
    const regrasDaCorrida = cerebro.filter(reg => Object.keys(reg.match).every(k => reg.match[k] === ctx[k]));

    for (let i = 0; i < galgos.length; i++) {
      for (let j = i + 1; j < galgos.length; j++) {
        const X = galgos[i], Y = galgos[j];
        const ratio = Math.max(X.oddMedia, Y.oddMedia) / Math.min(X.oddMedia, Y.oddMedia);
        if (ratio > spRatioMax) continue;                              // só odd colada
        const votos = _votos(X, Y, temVazia(X.trap), temVazia(Y.trap));

        // primeira regra (já em ordem de prioridade) cujo sinal DECIDE este par COM FOLGA
        let regra = null, voto = 0, margem = 0;
        for (const reg of regrasDaCorrida) {
          const vt = votos[reg.sinal]; if (vt === 0) continue;         // sinal não separa
          const mg = _margem(reg.sinal, X, Y);
          const minMg = (opts.margens && opts.margens[reg.sinal] != null) ? opts.margens[reg.sinal] : MIN_MARGEM[reg.sinal];
          if (mg < minMg) continue;                                    // separa, mas raspando → não é VIP
          regra = reg; voto = vt; margem = mg; break;
        }
        if (!regra) continue;                                          // nenhum sinal do cérebro decide o par com folga
        if (soVip && regra.tier === 'BASE') continue;                  // VIP é VIP

        const pick = voto > 0 ? X : Y;
        const outro = voto > 0 ? Y : X;
        const vazioPick = temVazia(pick.trap);   // pick tem box vazio ao lado?
        const vazioOutro = temVazia(outro.trap); // rival tem box vazio ao lado?
        // O par pick×outro abriu no betwinner? A que odd? (mesmo contrato da Carga VIP)
        const paresAbertos = abertosPorCorrida[String(row.corrida || '') + '|' + String(row.hora || '')];
        let abriu = null, oddAbertura = null;
        if (paresAbertos) {                                  // corrida foi monitorada
          const par = paresAbertos.find(p =>
            (Number(p.aTrap) === pick.trap && Number(p.bTrap) === outro.trap) ||
            (Number(p.aTrap) === outro.trap && Number(p.bTrap) === pick.trap));
          if (par) {
            abriu = true;
            const od = Number(Number(par.aTrap) === pick.trap ? par.oddAvenceB : par.oddBvenceA);
            oddAbertura = Number.isFinite(od) && od > 0 ? od : null;
          } else {
            abriu = false;                                   // monitorada, mas esse par não abriu
          }
        }
        entradas.push({
          hora: row.hora, corrida: row.corrida, dist: row.dist,
          pick_trap: pick.trap, pick_nome: (nomesPorTrap && nomesPorTrap[String(pick.trap)]) || '',
          outro_trap: outro.trap, outro_nome: (nomesPorTrap && nomesPorTrap[String(outro.trap)]) || '',
          categoria: ctx.cat, turno: ctx.turno, pista: ctx.pista,
          ratio_odd: +ratio.toFixed(3),
          // ── trap vazia: vantagem do pick mantém; vantagem do rival descarta a corrida ──
          pick_vazia_lado: vazioPick,
          outro_vazia_lado: vazioOutro,
          selo_vazia_pick: vazioPick && !vazioOutro,     // box vazio a favor do NOSSO pick
          trap_vazia_conferida: !!row.final_check_at,    // veio de card já checado perto da largada?
          // ── a NOTA (o coração do v2) ──
          nota: NOTA_LETRA(regra.tier),                 // A+ / A / B
          tier: regra.tier,                              // ELITE / VIP / BASE
          contexto_aplicado: regra.apelido,             // qual gaveta validada decidiu
          sinal: regra.sinal,                            // qual sinal separou
          taxa_validada_pct: regra.taxa,                 // % do TESTE (fora da amostra), ao vivo
          taxa_nivel_pct: regra.taxa,                    // apelido compat. c/ a tela v1 (mesmo número)
          ic_low_pct: regra.ic_low,                      // pior caso honesto do edge
          margem_sinal: +margem.toFixed(2),              // folga do sinal (caltm em s, podio em fração)
          // ── pódio derivado da MESMA condição do AvB (1 verdade: pódio + AvB coerentes) ──
          podio_vip: _podioPorSinal(galgos, regra.sinal, nomesPorTrap, 3),
          // ── placar (a Carga VIP é o quadro de teste ao vivo) ──
          chegada: chegada,                              // [{pos,trap}] ou null
          bateu: bateuPar(chegada, pick.trap, outro.trap), // true|false|null
          nomes_por_trap: nomesPorTrap,
          // ── o par abriu no BW e a que odd (captador avb_abertos) ──
          abriu: abriu,                                  // true|false|null (null = não monitorada)
          odd_abertura: oddAbertura,                     // odd capturada do par ou null
          // ── status card / near-post (trap vazia é checada perto da corrida) ──
          verificado: !!row.final_check_at,
          verificado_em: row.final_check_at || null,
          verificacao_status: row.final_check_status || null,
          atrasada: !!row.flag_atrasada,
          skip: String(row.nivel || '') === 'skip'
        });
      }
    }
  }

  // Um AvB por corrida: dentre os pares da mesma corrida, fica o de MAIOR percentual
  // validado; empatou no percentual, fica o de margem mais decisiva. (Bruno não entra
  // em dois AvBs na mesma corrida.)
  let descartados_mesma_corrida = 0;
  if (umPorCorrida) {
    const melhor = {};
    for (const e of entradas) {
      const k = e.hora + '|' + e.corrida;
      const cur = melhor[k];
      const ganha = !cur
        || e.taxa_validada_pct > cur.taxa_validada_pct
        || (e.taxa_validada_pct === cur.taxa_validada_pct && e.margem_sinal > cur.margem_sinal);
      if (ganha) melhor[k] = e; else descartados_mesma_corrida++;
    }
    entradas = Object.values(melhor);
  }

  // Regra da TRAP VAZIA (aplicada sobre o AvB que ficou de cada corrida):
  // - pick tem box vazio ao lado (e o rival não) → MANTÉM (vantagem a favor).
  // - rival tem box vazio ao lado (e o pick não) → DESCARTA a corrida (risco do rival passar).
  // - os dois têm, ou nenhum tem → neutro, mantém.
  let descartados_trap_vazia = 0;
  if (aplicaVazia) {
    const antes = entradas.length;
    entradas = entradas.filter(e => !(e.outro_vazia_lado && !e.pick_vazia_lado));
    descartados_trap_vazia = antes - entradas.length;
  }

  // ELITE primeiro, depois VIP, depois BASE; dentro do tier, maior taxa validada
  const rank = { 'A+': 0, 'A': 1, 'B': 2 };
  entradas.sort((a, b) => (rank[a.nota] - rank[b.nota]) || (b.taxa_validada_pct - a.taxa_validada_pct) || (b.margem_sinal - a.margem_sinal) || String(a.hora).localeCompare(String(b.hora)));

  const conta = t => entradas.filter(e => e.tier === t).length;
  return {
    date, total: entradas.length,
    um_por_corrida: umPorCorrida, pares_descartados_mesma_corrida: descartados_mesma_corrida,
    trap_vazia_regra: aplicaVazia, corridas_descartadas_trap_vazia: descartados_trap_vazia,
    qualidade: { corte_taxa_pct: opts.minTaxa > 0 ? opts.minTaxa : CORTE_TAXA, margem_minima: (opts.margens && Object.keys(opts.margens).length) ? opts.margens : MIN_MARGEM },
    por_tier: { ELITE: conta('ELITE'), VIP: conta('VIP'), BASE: conta('BASE') },
    cerebro_ativo: cerebro.filter(r => r.tier !== 'BASE').map(r => ({ apelido: r.apelido, tier: r.tier, sinal: r.sinal, taxa_teste: r.taxa, ic_low: r.ic_low, n_teste: r.n_teste })),
    cerebro_nao_validou_hoje: naoValidouHoje,      // whitelist que hoje não tem dado/caiu
    descartados: descartados.slice(0, 12),         // miragens que a validação jogou fora
    entradas,
    legenda: 'QUALIDADE, NÃO VOLUME: só entra par cujo CONTEXTO validado tem taxa de teste >= corte '
      + '(elite A+ passa sempre) E cujo sinal DECIDE com folga (margem mínima). Edge raspando fica de fora. '
      + 'NOTA = tier: A+ = ELITE (Yarmouth+CalTm, ~72% fora da amostra); A = VIP (~65-66%); B = BASE (só com soVip=false). '
      + 'taxa_validada_pct = taxa do TESTE (metade que o padrão NÃO viu), número vivo. ic_low_pct = pior caso honesto. '
      + 'margem_sinal = folga do sinal no par (caltm em s, podio em fração). bateu = o pick chegou na frente (placar real). '
      + 'TRAP VAZIA: box vazio ao lado do PICK mantém (vantagem a favor, selo_vazia_pick); ao lado do RIVAL descarta a corrida '
      + '(corridas_descartadas_trap_vazia). trap_vazia_conferida = se o card já passou pela checagem perto da largada. '
      + 'Whitelist que hoje não passou (fraca/sem dado) → cerebro_nao_validou_hoje. Miragens → descartados.'
  };
}

module.exports = { construirCerebro, classificar, WHITELIST };
