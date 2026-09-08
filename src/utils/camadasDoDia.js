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
// A ODD TEM UM PAPEL SO, E E' NA MANHA. Ela responde "quais AvBs a BW tem chance
// de abrir?", porque a casa so abre frente-a-frente entre galgos de preco
// parecido. Nada alem disso. Depois que a BW abre, a odd sai da decisao.
//
// MOTOR DA MANHA — POOL de candidatos:
//   um par entra se tem conviccao (pct > parelhoAte) E as SPs dos dois galgos
//   estao proximas: DIFERENCA absoluta entre as odds decimais da ULTIMA corrida
//   valida de cada um, <= difSpMax (1,0 por padrao).
//   E' DIFERENCA, nao razao: 7/2 x 4/1 (4,50 e 5,00) dista 0,50 e entra; dois
//   azaroes em 7,00 e 9,00 distam 2,00 e ficam de fora, ainda que a razao entre
//   eles seja pequena. Enquanto a BW nao confirma, o par e' uma OPORTUNIDADE.
//
// MOTOR BW — CLASSIFICACAO, sem olhar preco:
//   todo par que a BW abriu e' avaliado pela REGUA DE QUALIDADE do motor:
//     tier 'TOP'     -> TOP    (categoria + CalTm >= 0,20 + ganha split + ganha podio)
//     tier 'REGULAR' -> HIGH   (regua mais frouxa: CalTm >= 0,10, aceita empate)
//     tier  null     -> GOOD   (nao passa em nenhuma; so conviccao)
//   NAO ha teto de colagem de mercado aqui (decisao do Bruno set/2026: "no motor
//   BW e' irrelevante ver odd"). A razao de mercado continua sendo CALCULADA e
//   exposta no payload — serve pra voce ler quanto o mercado equilibrou o par
//   na hora de entrar —, mas nao barra mais nada.
//   Par que NAO estava no pool da manha entra do mesmo jeito (a "pescada").
//
// LIMITES: no maximo 1 de cada camada por corrida e no maximo 3 linhas. Havendo
//   mais de um candidato pra mesma camada, ganha o de melhor SPLIT; empatou,
//   melhor TEMPO (CalTm); empatou de novo, maior pct.
//
// SAIDA DE CENA: a OPORTUNIDADE que a BW nao abriu some DEPOIS que a corrida
//   larga. Antes disso ela fica visivel, pra dar pra acompanhar o funil. Corrida
//   sem nenhuma das tres no fim sai inteira (o chamador descarta lista vazia).
//
// USO TIPICO
//   const cd = require('../utils/camadasDoDia');
//   const pc = mm.precalcDaCorrida(...);
//   const confrontos = cd.confrontosDaCorrida({
//     todos: pc.todos, lastSp: pc.lastSp,   // lastSp: odd decimal por trap
//     pares, abertoEm,                       // avb_abertos
//     corrida, hora, finishingOrderJson,
//     parelhoAte, difSpMax, tetoInfo,
//     bateuPar
//   });

// ── constantes (defaults; a config manda quando existe) ──────────────────────
// DIF_SP_MAX = distancia maxima entre as odds decimais dos dois galgos na
//   ultima corrida valida. Forma o POOL da manha. E' o UNICO lugar onde a odd
//   decide alguma coisa.
// TETO_INFO  = referencia de "colada" no mercado. Nao filtra mais nada; so
//   alimenta o campo `colada` que a tela usa pra sinalizar equilibrio.
const DIF_SP_MAX = 1.0;
const TETO_INFO = 1.5;

// ── normalizadores (o id de um confronto tem que ser ESTAVEL entre polls) ────
const _c = c => String(c || '').trim().toLowerCase();
const _h = h => {
  const m = String(h || '').match(/(\d{1,2}):(\d{2})/);
  return m ? (m[1].padStart(2, '0') + ':' + m[2]) : String(h || '').trim();
};

function chaveCorrida(corrida, hora) { return _c(corrida) + '|' + _h(hora); }

// min/max de proposito: o par 2x3 e o 3x2 sao o MESMO confronto, entao inverter
// o AvB na tela nao pode quebrar o casamento com o ENTREI nem re-disparar alarme.
function idConfronto(corrida, hora, t1, t2) {
  return chaveCorrida(corrida, hora) + '|' + Math.min(t1, t2) + 'x' + Math.max(t1, t2);
}

function mesmoPar(t1a, t1b, t2a, t2b) {
  return (t1a === t2a && t1b === t2b) || (t1a === t2b && t1b === t2a);
}

function pista(corrida) { return String(corrida || '').trim().split(/\s+/)[0] || '?'; }

// UK -> Brasilia. A hora do PDF vem sem AM/PM: 1..9 e' tarde (soma 12), o resto
// ja e' 24h. Depois -4h (BST). Mesma conta da gravacao de races.hora_br.
function horaBr(hora) {
  const m = String(hora || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(hora || '');
  let hr = parseInt(m[1]);
  if (hr >= 1 && hr <= 9) hr += 12;
  hr = hr - 4;
  if (hr < 0) hr += 24;
  return hr + ':' + m[2];
}

// A corrida ja largou? Gatilho pra tirar de cena a OPORTUNIDADE que nao virou
// nada. Usa a chegada gravada porque e' o unico sinal confiavel do payload — se
// o robo de resultados ainda nao passou, a linha fica mais um pouco e some na
// leitura seguinte. Errar mostrando demais e' melhor do que sumir com o que vale.
function jaCorreu(finishingOrderJson) {
  let o = finishingOrderJson;
  try { o = (typeof o === 'string') ? JSON.parse(o) : o; } catch (e) { return false; }
  return Array.isArray(o) && o.length > 0;
}

// DISTANCIA DE SP entre os dois galgos de um confronto, em odd decimal.
// null quando falta a SP de algum dos dois (galgo sem corrida valida recente):
// sem os dois lados nao da pra medir, e chutar colocaria no pool um par que
// ninguem conferiu. Fora do pool ele ainda pode entrar pela BW, se ela abrir.
function distanciaSp(lastSp, trapA, trapB) {
  if (!lastSp) return null;
  const a = Number(lastSp[Number(trapA)]);
  const b = Number(lastSp[Number(trapB)]);
  if (!(a > 0) || !(b > 0)) return null;
  return +Math.abs(a - b).toFixed(3);
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

// ── mercado (INFORMATIVO) ────────────────────────────────────────────────────
// Le a colagem de um confronto nos pares que a BW abriu.
//   razao = maior_prob / menor_prob, sem a margem da casa. 1,0 = 50/50.
// `colada` e' so um rotulo de leitura: desde set/2026 ele NAO decide se o par
// entra. Quem decide e' a regua. Devolve null quando a BW nao abriu o par.
function mercadoDe(pares, s, tetoInfo) {
  const t = (tetoInfo > 0) ? tetoInfo : TETO_INFO;
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
function montaConfronto(ctx, s, camada, daManha, mk, spDif) {
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
    // ADITIVOS: as medidas que decidiram, pra auditar sem abrir o banco.
    // sp_dif e' a medida que forma o pool; colada_mercado virou informativo.
    da_manha: !!daManha,
    tier_motor: s.tier || null,
    split_dif: (s.split_dif != null ? s.split_dif : null),
    caltm_dif: (s.caltm_dif != null ? s.caltm_dif : null),
    sp_dif: (spDif != null ? spDif : null),
    colada_mercado: mk ? !!mk.colada : null
  };
}

// ── a regra ──────────────────────────────────────────────────────────────────
function confrontosDaCorrida(opts) {
  const o = opts || {};
  const todos = Array.isArray(o.todos) ? o.todos : [];
  const pares = Array.isArray(o.pares) ? o.pares : [];
  const lastSp = o.lastSp || null;
  const difSpMax = (o.difSpMax > 0) ? o.difSpMax : DIF_SP_MAX;
  const tetoInfo = (o.tetoInfo > 0) ? o.tetoInfo : TETO_INFO;
  const parelhoAte = (o.parelhoAte > 0) ? o.parelhoAte : 0;
  const ctx = {
    corrida: o.corrida, hora: o.hora,
    abertoEm: o.abertoEm || null,
    finishingOrderJson: o.finishingOrderJson,
    bateuPar: (typeof o.bateuPar === 'function') ? o.bateuPar : function () { return null; }
  };
  const chaveDe = (a, b) => Math.min(a, b) + 'x' + Math.max(a, b);

  // distancia de SP por confronto, calculada uma vez so
  const difDe = {};
  for (const s of todos) {
    difDe[chaveDe(s.pick_trap, s.outro_trap)] = distanciaSp(lastSp, s.pick_trap, s.outro_trap);
  }

  // ── 1) POOL DA MANHA ──────────────────────────────────────────────────────
  // Conviccao + SPs proximas. NAO exige regua de qualidade: um par de regua
  // frouxa tambem pode abrir na BW e virar GOOD, entao ele tem que caber no
  // pool. Quem separa TOP/HIGH/GOOD e' a regua, la embaixo.
  const daManha = new Set();
  for (const s of todos) {
    if (!(s.pct > parelhoAte)) continue;
    const k = chaveDe(s.pick_trap, s.outro_trap);
    const d = difDe[k];
    if (d == null || d > difSpMax) continue;
    daManha.add(k);
  }

  // ── 2) O QUE A BW ABRIU ───────────────────────────────────────────────────
  // Sem teto de mercado: todo par aberto entra na avaliacao. A REGUA decide a
  // camada; o pct decide se ha conviccao suficiente pra valer a tela.
  // Um slot por camada, disputa por split -> tempo -> pct.
  const slots = { TOP: null, HIGH: null, GOOD: null };
  // `avaliados` guarda TODO par que a BW abriu e o motor aprovou, inclusive quem
  // PERDEU a disputa do slot. Eles nao voltam como OPORTUNIDADE la embaixo: o
  // mercado ja abriu pra eles, entao nao estao aguardando nada.
  const avaliados = new Set();
  for (const par of pares) {
    if (par.marketPct == null) continue;
    const ta = Number(par.aTrap), tb = Number(par.bTrap);
    const s = todos.find(x => mesmoPar(Number(x.pick_trap), Number(x.outro_trap), ta, tb));
    if (!s || !(s.pct > parelhoAte)) continue;        // sem opiniao/conviccao do motor
    avaliados.add(chaveDe(ta, tb));
    const camada = camadaPorRegua(s.tier);
    if (slots[camada] == null || melhorQue(s, slots[camada])) slots[camada] = s;
  }

  const confrontos = [];
  for (const camada of ['TOP', 'HIGH', 'GOOD']) {
    const s = slots[camada];
    if (!s) continue;
    const k = chaveDe(s.pick_trap, s.outro_trap);
    confrontos.push(montaConfronto(ctx, s, camada, daManha.has(k), mercadoDe(pares, s, tetoInfo), difDe[k]));
  }

  // ── 3) OPORTUNIDADE ───────────────────────────────────────────────────────
  // Enquanto a corrida nao largou, mostra UM achado da manha que a BW ainda nao
  // abriu — e' o que da pra acompanhar o funil durante o dia. Depois da largada
  // ela some: o registro do dia so guarda o que o mercado abriu. So entra se
  // sobrou vaga dentro do teto de 3.
  if (!jaCorreu(ctx.finishingOrderJson) && confrontos.length < 3) {
    let melhor = null;
    for (const s of todos) {
      const k = chaveDe(s.pick_trap, s.outro_trap);
      if (!daManha.has(k) || avaliados.has(k)) continue;
      if (melhor == null || melhorQue(s, melhor)) melhor = s;
    }
    if (melhor) {
      const k = chaveDe(melhor.pick_trap, melhor.outro_trap);
      confrontos.push(montaConfronto(ctx, melhor, 'OPORTUNIDADE', true, mercadoDe(pares, melhor, tetoInfo), difDe[k]));
    }
  }

  return confrontos;
}

module.exports = {
  DIF_SP_MAX, TETO_INFO,
  chaveCorrida, idConfronto, mesmoPar, pista, horaBr,
  jaCorreu, melhorQue, camadaPorRegua, distanciaSp,
  mercadoDe, montaConfronto, confrontosDaCorrida
};
