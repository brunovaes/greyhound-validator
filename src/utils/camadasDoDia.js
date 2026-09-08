'use strict';
// src/utils/camadasDoDia.js
//
// FONTE UNICA da regra de CAMADAS (OPORTUNIDADE / TOP / HIGH / GOOD).
//
// Por que existe: ate set/2026 essa regra vivia inteira dentro do handler do
// GET /api/painel-dia. Quando o Historico passou a listar uma linha por AvB, ele
// precisou da MESMA classificacao — e reescrever a regua num segundo lugar e' o
// jeito conhecido de criar dois numeros pra mesma coisa que divergem em silencio
// no dia em que alguem afina um corte. E' o mesmo motivo pelo qual o
// avbResultado.js foi criado pro "bateu". Aqui e' o unico lugar onde a camada
// de um confronto e' decidida; quem precisa da regra IMPORTA daqui.
//
// Este modulo e' PURO: nao abre banco, nao le config, nao faz rede. Recebe o que
// o chamador ja tem em maos (os confrontos do motor + os pares que a BW abriu) e
// devolve os confrontos classificados. Isso e' de proposito — e' o que torna a
// regra testavel sem subir servidor.
//
// ── O MODELO (Bruno, set/2026) ──────────────────────────────────────────────
//
// MOTOR DA MANHA — le os PDFs e monta o POOL de candidatos:
//   um par entra no pool se tem conviccao (pct > parelhoAte) E as SPs dos dois
//   galgos estao coladas (razao <= faixa, medida na ULTIMA corrida valida de
//   cada um). O pool e' a resposta pra "quais AvBs tem chance de a BW abrir".
//   Enquanto a BW nao confirma, o par e' uma OPORTUNIDADE.
//
// MOTOR BW — perto da largada, para cada par que a BW abre COLADO
// (razao de mercado <= teto), a REGUA DE QUALIDADE decide a camada:
//   tier 'TOP'     -> TOP    (categoria + CalTm >= 0,20 + ganha split + ganha podio)
//   tier 'REGULAR' -> HIGH   (regua mais frouxa: CalTm >= 0,10, aceita empate)
//   tier  null     -> GOOD   (nao passa em nenhuma; so conviccao + colagem)
//   Um par que NAO estava no pool da manha entra do mesmo jeito (a "pescada"):
//   quem confirma e' o mercado, nao o PDF.
//
// LIMITES: no maximo 1 de cada camada por corrida e no maximo 3 linhas. Havendo
//   mais de um candidato pra mesma camada, ganha o de melhor SPLIT; empatou,
//   melhor TEMPO (CalTm); empatou de novo, maior pct.
//
// SAIDA DE CENA: a OPORTUNIDADE que a BW nao confirmou (nao abriu, ou abriu
//   larga) some DEPOIS que a corrida larga. Antes disso ela fica visivel, pra
//   dar pra acompanhar o funil. Corrida sem nenhuma das tres no fim sai inteira
//   (o chamador descarta corrida com lista vazia).
//
// USO TIPICO
//   const cd = require('../utils/camadasDoDia');
//   const confrontos = cd.confrontosDaCorrida({
//     todos,                       // pc.todos do motorManha.precalcDaCorrida
//     pares,                       // avb_abertos.pares_json ja parseado
//     abertoEm,                    // avb_abertos.capturado_em
//     corrida, hora,               // pra montar o id estavel
//     finishingOrderJson,          // races.finishing_order_json
//     parelhoAte, teto, faixa,     // cortes vindos da config
//     bateuPar                     // a funcao do avbResultado.js
//   });

// ── constantes da regua (defaults; a config manda quando existe) ─────────────
// TETO  = colagem no MERCADO (odds individuais da BW, sem margem). 1,0 = 50/50.
//         E' o filtro de verdade: e' ele que confirma um par.
// FAIXA = colagem da SP do PDF (ultima corrida valida de cada galgo). Forma o
//         POOL da manha. Bruno set/2026: os dois passaram a valer 1,5 — antes a
//         FAIXA era 1,8 aqui e 1,15 no motor, dois numeros pra mesma pergunta.
const TETO = 1.5;
const FAIXA = 1.5;

// ── normalizadores (o id de um confronto tem que ser ESTAVEL entre polls) ────
const _c = c => String(c || '').trim().toLowerCase();
const _h = h => {
  const m = String(h || '').match(/(\d{1,2}):(\d{2})/);
  return m ? (m[1].padStart(2, '0') + ':' + m[2]) : String(h || '').trim();
};

// Chave da CORRIDA: casa a linha de races com a de avb_abertos.
function chaveCorrida(corrida, hora) { return _c(corrida) + '|' + _h(hora); }

// Chave do CONFRONTO. min/max de proposito: o par 2x3 e o 3x2 sao o MESMO
// confronto, entao inverter o AvB na tela nao pode quebrar o casamento com o
// ENTREI nem re-disparar o alarme.
function idConfronto(corrida, hora, t1, t2) {
  return chaveCorrida(corrida, hora) + '|' + Math.min(t1, t2) + 'x' + Math.max(t1, t2);
}

function mesmoPar(t1a, t1b, t2a, t2b) {
  return (t1a === t2a && t1b === t2b) || (t1a === t2b && t1b === t2a);
}

// Pista = primeira palavra do nome da corrida ("Sheff A2" -> "Sheff").
function pista(corrida) { return String(corrida || '').trim().split(/\s+/)[0] || '?'; }

// UK -> Brasilia. A hora do PDF vem sem AM/PM: 1..9 e' tarde (soma 12), o resto
// ja e' 24h. Depois -4h (BST). Mesma conta usada na gravacao de races.hora_br,
// pra tela e banco nunca discordarem.
function horaBr(hora) {
  const m = String(hora || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(hora || '');
  let hr = parseInt(m[1]);
  if (hr >= 1 && hr <= 9) hr += 12;
  hr = hr - 4;
  if (hr < 0) hr += 24;
  return hr + ':' + m[2];
}

// A corrida ja largou? E' o gatilho pra tirar de cena a OPORTUNIDADE que nao
// virou nada. Usa a chegada gravada porque e' o unico sinal confiavel que o
// payload tem — se o robo de resultados ainda nao passou, a linha fica mais um
// pouco na tela e some sozinha na leitura seguinte. Errar pro lado de mostrar
// demais e' melhor do que sumir com uma linha que ainda vale.
function jaCorreu(finishingOrderJson) {
  let o = finishingOrderJson;
  try { o = (typeof o === 'string') ? JSON.parse(o) : o; } catch (e) { return false; }
  return Array.isArray(o) && o.length > 0;
}

// ── desempate: SPLIT, depois TEMPO, depois pct (maior ganha em todos) ────────
// Decisao do Bruno (set/2026). O split manda porque arrancar na frente e' o que
// mais decide um frente-a-frente; o CalTm desempata; o pct so entra se os dois
// primeiros empatarem. Campo ausente vale -Infinity pra nunca ganhar por acaso
// de um par que tem a medida.
function _n(v) { return (v == null || v === '' || isNaN(Number(v))) ? -Infinity : Number(v); }
function melhorQue(a, b) {
  if (_n(a.split_dif) !== _n(b.split_dif)) return _n(a.split_dif) > _n(b.split_dif);
  if (_n(a.caltm_dif) !== _n(b.caltm_dif)) return _n(a.caltm_dif) > _n(b.caltm_dif);
  return _n(a.pct) > _n(b.pct);
}

// A regua de qualidade do motor vira a camada. O `tier` ja vem calculado por
// confronto no motorManha (passaRegua contra a regua TOP e depois a REGULAR).
function camadaPorRegua(tier) {
  if (tier === 'TOP') return 'TOP';
  if (tier === 'REGULAR') return 'HIGH';
  return 'GOOD';
}

// ── mercado ──────────────────────────────────────────────────────────────────
// Le a colagem REAL de um confronto nos pares que a BW abriu.
//   razao = maior_prob / menor_prob, sem a margem da casa. 1,0 = 50/50.
//   colada = razao <= teto.
// Devolve null quando a BW ainda nao abriu aquele par (nao e' erro: e' "aguarda").
function mercadoDe(pares, s, teto) {
  const t = (teto > 0) ? teto : TETO;
  if (!pares || !pares.length) return null;
  const par = pares.find(x => mesmoPar(Number(x.aTrap), Number(x.bTrap), Number(s.pick_trap), Number(s.outro_trap)));
  if (!par || par.marketPct == null) return null;
  // marketPct e' sempre "A vence B" na orientacao da BW; se o pick do motor e' o
  // B do par, inverte — senao a razao sai certa e a odd sai do galgo errado.
  const mp = (Number(par.aTrap) === Number(s.pick_trap) ? par.marketPct : 100 - par.marketPct) / 100;
  const hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
  const razao = lo > 0 ? +(hi / lo).toFixed(3) : null;
  const oddPick = (Number(par.aTrap) === Number(s.pick_trap)) ? par.oddAvenceB : par.oddBvenceA;
  return {
    colada: razao != null && razao <= t,
    razao,
    market_pct: +(mp * 100).toFixed(1),
    odd: (oddPick != null ? +Number(oddPick).toFixed(2) : null)
  };
}

// ── montagem de um confronto do contrato ─────────────────────────────────────
// `bateuPar` entra por parametro em vez de require aqui em cima porque este
// modulo e' puro de proposito; o chamador passa a MESMA funcao que o resto do
// sistema usa, entao continua existindo uma implementacao so do "bateu".
function montaConfronto(ctx, s, camada, daManha, mk) {
  return {
    id: idConfronto(ctx.corrida, ctx.hora, s.pick_trap, s.outro_trap),
    par: 'T' + s.pick_trap + 'xT' + s.outro_trap,
    pick_trap: s.pick_trap, pick_nome: s.pick_nome || null,
    outro_trap: s.outro_trap, outro_nome: s.outro_nome || null,
    pct: s.pct, sp_ratio: s.ratio_sp,
    camada, no_board_top: !!daManha,
    odd_bw: mk ? mk.odd : null,
    razao_mercado: mk ? mk.razao : null,
    market_pct: mk ? mk.market_pct : null,
    // APROXIMADO: vem do capturado_em do avb_abertos, que se move enquanto o
    // mercado enche de pares. Serve pra ORDENAR os tiles. NAO serve pra
    // deduplicar alarme — o gatilho e' a transicao de camada entre polls.
    promovido_em: (camada !== 'OPORTUNIDADE' && ctx.abertoEm) ? ctx.abertoEm : null,
    bateu: ctx.bateuPar(ctx.finishingOrderJson, Number(s.pick_trap), Number(s.outro_trap)),
    // ADITIVOS (set/2026): as medidas que decidiram o desempate e a regua crua.
    // Existem pra a tela poder mostrar por que este par ficou e o outro saiu, e
    // pra auditar a classificacao sem abrir o banco. Nenhum consumidor antigo
    // le estes campos — sao puro acrescimo ao contrato.
    da_manha: !!daManha,
    tier_motor: s.tier || null,
    split_dif: (s.split_dif != null ? s.split_dif : null),
    caltm_dif: (s.caltm_dif != null ? s.caltm_dif : null)
  };
}

// ── a regra ──────────────────────────────────────────────────────────────────
function confrontosDaCorrida(opts) {
  const o = opts || {};
  const todos = Array.isArray(o.todos) ? o.todos : [];
  const pares = Array.isArray(o.pares) ? o.pares : [];
  const teto = (o.teto > 0) ? o.teto : TETO;
  const faixa = (o.faixa > 0) ? o.faixa : FAIXA;
  const parelhoAte = (o.parelhoAte > 0) ? o.parelhoAte : 0;
  const ctx = {
    corrida: o.corrida, hora: o.hora,
    abertoEm: o.abertoEm || null,
    finishingOrderJson: o.finishingOrderJson,
    bateuPar: (typeof o.bateuPar === 'function') ? o.bateuPar : function () { return null; }
  };
  const chaveDe = (a, b) => Math.min(a, b) + 'x' + Math.max(a, b);

  // ── 1) POOL DA MANHA ──────────────────────────────────────────────────────
  // Conviccao + SPs coladas. NAO exige regua de qualidade: um par de regua
  // frouxa tambem pode abrir na BW e virar GOOD, entao ele tem que caber no
  // pool. Quem separa TOP/HIGH/GOOD e' a regua, la embaixo, e so depois que o
  // mercado confirma.
  const daManha = new Set();
  for (const s of todos) {
    if (!(s.pct > parelhoAte)) continue;
    if (!(s.ratio_sp <= faixa)) continue;
    daManha.add(chaveDe(s.pick_trap, s.outro_trap));
  }

  // ── 2) CONFIRMADOS PELA BW ────────────────────────────────────────────────
  // Um slot por camada. Disputa resolvida por split -> tempo -> pct.
  const slots = { TOP: null, HIGH: null, GOOD: null };
  // `confirmados` guarda TODO par que a BW validou (colado + com opiniao do
  // motor), inclusive quem PERDEU a disputa do slot. Eles nao podem voltar como
  // OPORTUNIDADE la embaixo: o mercado ja se pronunciou sobre eles, entao nao
  // estao aguardando nada. Sem esta lista, o perdedor da disputa reaparecia
  // como linha cinza na mesma corrida — errado e confuso de ler.
  const confirmados = new Set();
  for (const par of pares) {
    if (par.marketPct == null) continue;
    const ta = Number(par.aTrap), tb = Number(par.bTrap);
    const mp = par.marketPct / 100, hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
    const razao = lo > 0 ? (hi / lo) : null;
    if (!(razao != null && razao <= teto)) continue;      // exige COLADA na BW
    const s = todos.find(x => mesmoPar(Number(x.pick_trap), Number(x.outro_trap), ta, tb));
    if (!s || !(s.pct > parelhoAte)) continue;            // sem opiniao/conviccao
    confirmados.add(chaveDe(ta, tb));
    const camada = camadaPorRegua(s.tier);
    if (slots[camada] == null || melhorQue(s, slots[camada])) slots[camada] = s;
  }

  const confrontos = [];
  for (const camada of ['TOP', 'HIGH', 'GOOD']) {
    const s = slots[camada];
    if (!s) continue;
    const k = chaveDe(s.pick_trap, s.outro_trap);
    confrontos.push(montaConfronto(ctx, s, camada, daManha.has(k), mercadoDe(pares, s, teto)));
  }

  // ── 3) OPORTUNIDADE ───────────────────────────────────────────────────────
  // Enquanto a corrida nao largou, mostra UM achado da manha ainda nao
  // confirmado — e' o que da pra acompanhar o funil durante o dia. Depois da
  // largada ela some: o registro do dia so guarda o que o mercado confirmou.
  // So entra se sobrou vaga dentro do teto de 3 (corrida com as tres camadas
  // cheias ja tem o que mostrar; a linha cinza ali so ocuparia espaco).
  if (!jaCorreu(ctx.finishingOrderJson) && confrontos.length < 3) {
    let melhor = null;
    for (const s of todos) {
      const k = chaveDe(s.pick_trap, s.outro_trap);
      if (!daManha.has(k) || confirmados.has(k)) continue;
      if (melhor == null || melhorQue(s, melhor)) melhor = s;
    }
    if (melhor) confrontos.push(montaConfronto(ctx, melhor, 'OPORTUNIDADE', true, mercadoDe(pares, melhor, teto)));
  }

  return confrontos;
}

module.exports = {
  TETO, FAIXA,
  chaveCorrida, idConfronto, mesmoPar, pista, horaBr,
  jaCorreu, melhorQue, camadaPorRegua,
  mercadoDe, montaConfronto, confrontosDaCorrida
};
