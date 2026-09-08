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
// USO TIPICO
//   const cd = require('../utils/camadasDoDia');
//   const confrontos = cd.confrontosDaCorrida({
//     todos,                       // pc.todos do motorManha.precalcDaCorrida
//     pares,                       // avb_abertos.pares_json ja parseado
//     abertoEm,                    // avb_abertos.capturado_em
//     corrida, hora,               // pra montar o id estavel
//     finishingOrderJson,          // races.finishing_order_json (pro bateu)
//     parelhoAte                   // corte de pct vindo da config
//   });

// ── constantes da regua ──────────────────────────────────────────────────────
// TETO  = colagem no MERCADO (odds individuais da BW, sem margem). 1,0 = 50/50.
//         E' o filtro de verdade: e' ele que promove OPORTUNIDADE -> TOP.
// FAIXA = colagem da SP do PDF. So entra na formacao da watchlist da manha.
//         Informativa depois disso (a SP se mostrou nao-confiavel).
const TETO = 1.5;
const FAIXA = 1.8;

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
function montaConfronto(ctx, s, camada, noBoard, mk) {
  return {
    id: idConfronto(ctx.corrida, ctx.hora, s.pick_trap, s.outro_trap),
    par: 'T' + s.pick_trap + 'xT' + s.outro_trap,
    pick_trap: s.pick_trap, pick_nome: s.pick_nome || null,
    outro_trap: s.outro_trap, outro_nome: s.outro_nome || null,
    pct: s.pct, sp_ratio: s.ratio_sp,
    camada, no_board_top: !!noBoard,
    odd_bw: mk ? mk.odd : null,
    razao_mercado: mk ? mk.razao : null,
    market_pct: mk ? mk.market_pct : null,
    // APROXIMADO: vem do capturado_em do avb_abertos, que se move enquanto o
    // mercado enche de pares. Serve pra ORDENAR os tiles. NAO serve pra
    // deduplicar alarme — o gatilho e' a transicao de camada entre polls.
    promovido_em: (camada !== 'OPORTUNIDADE' && ctx.abertoEm) ? ctx.abertoEm : null,
    bateu: ctx.bateuPar(ctx.finishingOrderJson, Number(s.pick_trap), Number(s.outro_trap))
  };
}

// ── a regra ──────────────────────────────────────────────────────────────────
// Classifica TODOS os confrontos de UMA corrida.
//
//   OPORTUNIDADE = achado da manha (qualidade + pct + SP colada), aguardando a BW
//   TOP          = era OPORTUNIDADE e abriu COLADA na BW
//   HIGH         = colada na BW + qualidade (tier != null), fora da watchlist
//   GOOD         = colada na BW + pct, regua de qualidade afrouxada (tier null)
//
// Um confronto pode sair OPORTUNIDADE com odd_bw preenchido: e' "a BW abriu, mas
// abriu LARGA" (razao > teto). Nao apita — o mercado discordou da manha.
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

  const confrontos = [];
  const jaAdd = new Set();
  const chaveDe = (a, b) => Math.min(a, b) + 'x' + Math.max(a, b);

  // 1) WATCHLIST DA MANHA -> board. Sempre entram, mesmo sem a BW ter aberto:
  //    ficam OPORTUNIDADE ate abrir colada, ai viram TOP. Sao os unicos com
  //    no_board_top = true.
  const manha = todos.filter(s => s.tier != null && s.pct > parelhoAte && s.ratio_sp <= faixa);
  for (const s of manha) {
    const mk = mercadoDe(pares, s, teto);
    confrontos.push(montaConfronto(ctx, s, (mk && mk.colada) ? 'TOP' : 'OPORTUNIDADE', true, mk));
    jaAdd.add(chaveDe(s.pick_trap, s.outro_trap));
  }

  // 2) O QUE A BW REVELOU -> HIGH/GOOD. Parte dos pares que a BW abriu COLADOS e
  //    procura a opiniao do motor. Sem opiniao ou sem conviccao, ignora: nao da
  //    pra apostar no que o motor nao avaliou.
  for (const par of pares) {
    if (par.marketPct == null) continue;
    const ta = Number(par.aTrap), tb = Number(par.bTrap);
    const chave = chaveDe(ta, tb);
    if (jaAdd.has(chave)) continue;                       // ja entrou pela manha
    const mp = par.marketPct / 100, hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
    const razao = lo > 0 ? (hi / lo) : null;
    if (!(razao != null && razao <= teto)) continue;       // exige colada na BW
    const conf = todos.find(s => mesmoPar(Number(s.pick_trap), Number(s.outro_trap), ta, tb));
    if (!conf || conf.pct <= parelhoAte) continue;         // sem opiniao/conviccao
    confrontos.push(montaConfronto(ctx, conf, conf.tier != null ? 'HIGH' : 'GOOD', false, mercadoDe(pares, conf, teto)));
    jaAdd.add(chave);
  }

  return confrontos;
}

module.exports = {
  TETO, FAIXA,
  chaveCorrida, idConfronto, mesmoPar, pista, horaBr,
  mercadoDe, montaConfronto, confrontosDaCorrida
};
