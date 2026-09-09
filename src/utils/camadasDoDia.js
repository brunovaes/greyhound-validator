'use strict';
// src/utils/camadasDoDia.js
//
// FONTE UNICA da regra de TIPOS (OPORTUNIDADE / TOP / HIGH / GOOD).
//
// Por que existe: ate set/2026 essa regra vivia inteira dentro do handler do
// GET /api/painel-dia. Quando o Historico passou a precisar da MESMA
// classificacao, reescrever a regua num segundo lugar seria o jeito conhecido de
// criar dois numeros pra mesma coisa que divergem em silencio no dia em que
// alguem afina um corte. E' o mesmo motivo pelo qual o avbResultado.js foi
// criado pro "bateu". Aqui e' o unico lugar onde o tipo de um confronto e'
// decidido; quem precisa da regra IMPORTA daqui.
//
// Este modulo e' PURO: nao abre banco, nao le config, nao faz rede. Recebe o que
// o chamador ja tem em maos (os confrontos do motor + os pares que a BW abriu) e
// devolve os confrontos classificados. Isso e' de proposito — e' o que torna a
// regra testavel sem subir servidor. Ate o relogio entra por parametro (`agora`),
// pelo mesmo motivo: teste que depende da hora em que roda passa de manha e
// falha a tarde.
//
// ── O DIA, COMO O BRUNO ESCREVEU (09/09/2026) ───────────────────────────────
//
// 1. MOTOR DA MANHA lista as oportunidades pela proximidade da coluna SP. Cada
//    par que passa fica em tela e no Historico com o tipo OPORTUNIDADE.
//
// 2. Cerca de 5 min antes da corrida, MOTOR DA BW roda. Ele avalia TODAS as
//    possibilidades cruzadas, priorizando o par que ja esta em tela:
//      - o par da manha ABRIU  -> o tipo dele vira TOP, HIGH ou GOOD pela regua
//      - o par da manha NAO abriu e outros abriram -> os que abriram ASSUMEM a
//        tela, e o registro da manha fica off ate 1 min depois da corrida
//    O motor da BW tem acesso livre: pode achar AvB ate em corrida que nao tinha
//    nenhuma oportunidade de manha (a "pescada").
//
// 3. No fim do dia NAO pode sobrar registro com tipo diferente de TOP, HIGH ou
//    GOOD. Uma OPORTUNIDADE que a BW nunca abriu simplesmente deixa de ser
//    calculada 1 minuto depois da largada — ela nunca foi gravada em lugar
//    nenhum, entao nao ha o que apagar.
//
// 4. A tela comporta 4 AvBs. Entram os 4 MAIS BEM AVALIADOS, e o tipo PODE se
//    repetir (dois TOP na mesma corrida e' normal). O Historico, esse, guarda UM
//    registro por corrida: o AvB em que ele entrou; se nao entrou em nenhum, o
//    mais bem avaliado dos 4.
//
// A ODD TEM UM PAPEL SO, E E' NA MANHA. Ela responde "quais AvBs a BW tem chance
// de abrir?", porque a casa so abre frente-a-frente entre galgos de preco
// parecido. Depois que a BW abre, a odd sai da decisao — quem classifica e' a
// regua de qualidade do motor.
//
// NAO EXISTE tipo SURPRESA nem SECUNDARIO. Eram baldes de um modelo antigo, em
// que o Bruno marcava na mao possiveis entradas novas. Foram aposentados.
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
// TETO_INFO  = referencia de "colada" no mercado. Nao filtra nada; so alimenta
//   o campo `colada`, que a tela usa pra sinalizar equilibrio.
// MAX_TELA   = quantos cabem na tela de disputa. Quatro e' o limite fisico do
//   arranjo em quadrado; o quinto nao teria onde aparecer.
// GRACA_MIN  = minutos DEPOIS da largada em que o AvB continua valendo. A BW
//   ainda aceita entrada nesse intervalo, e o robo de resultados costuma
//   demorar mais que isso pra gravar a chegada.
const DIF_SP_MAX = 1.0;
const TETO_INFO = 1.5;
const MAX_TELA = 4;
const GRACA_MIN = 1;

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

// Minutos daqui ate a largada, positivo antes e negativo depois. `agora` entra
// por parametro (ms) pra este modulo continuar puro e testavel.
//
// O servidor roda em UTC e o Bruno le em horario de Brasilia, entao a conta
// converte a hora UK do PDF pra BR e compara com o relogio tambem em BR
// (UTC-3). O mesmo -3 que o resto do sistema usa pra decidir a que dia uma
// sessao pertence.
function minutosParaLargada(hora, agora) {
  const hb = horaBr(hora);
  const m = String(hb).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const largada = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const d = (agora instanceof Date) ? agora : new Date(agora || Date.now());
  const br = new Date(d.getTime() - 3 * 3600 * 1000);
  const agoraMin = br.getUTCHours() * 60 + br.getUTCMinutes();
  let dif = largada - agoraMin;
  // Volta do dia: 23:50 x 00:05 dariam -1425 em vez de 15. Sem isto, a ultima
  // corrida da noite sumiria da tela logo depois da meia-noite UTC.
  if (dif > 720) dif -= 1440;
  if (dif < -720) dif += 1440;
  return dif;
}

// A corrida ja largou? Continua valendo a chegada gravada — e' o sinal
// definitivo. O relogio (minutosParaLargada) e' o sinal ANTECIPADO, pra tela nao
// depender do robo de resultados ter passado.
function jaCorreu(finishingOrderJson) {
  let o = finishingOrderJson;
  try { o = (typeof o === 'string') ? JSON.parse(o) : o; } catch (e) { return false; }
  return Array.isArray(o) && o.length > 0;
}

// SAIU DE CENA? Passou da largada + a graca de 1 minuto. Sem `agora` (chamador
// antigo, ou teste que nao quer relogio) devolve false: melhor mostrar demais do
// que sumir com o que vale.
function expirou(hora, agora, gracaMin) {
  if (agora == null) return false;
  const g = (gracaMin != null && gracaMin >= 0) ? gracaMin : GRACA_MIN;
  const m = minutosParaLargada(hora, agora);
  return m != null && m < -g;
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
// Decisao do Bruno (set/2026, reconfirmada em 09/09). O split manda porque
// arrancar na frente e' o que mais decide um frente-a-frente; o CalTm desempata;
// o pct so entra se os dois primeiros empatarem. Campo ausente vale -Infinity
// pra nunca ganhar por acaso de um par que tem a medida.
function _n(v) { return (v == null || v === '' || isNaN(Number(v))) ? -Infinity : Number(v); }
function melhorQue(a, b) {
  if (_n(a.split_dif) !== _n(b.split_dif)) return _n(a.split_dif) > _n(b.split_dif);
  if (_n(a.caltm_dif) !== _n(b.caltm_dif)) return _n(a.caltm_dif) > _n(b.caltm_dif);
  return _n(a.pct) > _n(b.pct);
}

// A regua de qualidade do motor vira o tipo. O `tier` ja vem calculado por
// confronto no motorManha (passaRegua contra a regua TOP e depois a REGULAR).
function camadaPorRegua(tier) {
  if (tier === 'TOP') return 'TOP';
  if (tier === 'REGULAR') return 'HIGH';
  return 'GOOD';
}

// Forca do tipo, pra ordenar. OPORTUNIDADE fica atras de todos: ela nao e'
// resultado de nada ainda, e nunca disputa a vaga do Historico com quem a BW
// confirmou.
const ORDEM_TIPO = ['TOP', 'HIGH', 'GOOD', 'OPORTUNIDADE'];
function forcaTipo(t) {
  const i = ORDEM_TIPO.indexOf(String(t || '').trim().toUpperCase());
  return i < 0 ? 99 : i;
}

// ORDEM DE MERITO, a regra do "mais bem avaliado": tipo primeiro (TOP > HIGH >
// GOOD), e dentro do mesmo tipo o desempate de sempre. E' com ela que se decide
// quem ocupa as 4 vagas da tela e qual AvB representa a corrida no Historico
// quando nao houve aposta.
function ordenaPorMerito(lista) {
  return lista.slice().sort(function (a, b) {
    const f = forcaTipo(a.camada) - forcaTipo(b.camada);
    if (f !== 0) return f;
    return melhorQue(a, b) ? -1 : (melhorQue(b, a) ? 1 : 0);
  });
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
    // mercado enche de pares. Nao serve pra ordenar nem pra deduplicar alarme —
    // fica no payload so pra auditoria.
    promovido_em: (camada !== 'OPORTUNIDADE' && ctx.abertoEm) ? ctx.abertoEm : null,
    bateu: ctx.bateuPar(ctx.finishingOrderJson, Number(s.pick_trap), Number(s.outro_trap)),
    // ADITIVOS: as medidas que decidiram, pra auditar sem abrir o banco.
    // sp_dif e' a medida que forma o pool; colada_mercado virou informativo.
    da_manha: !!daManha,
    tier_motor: s.tier || null,
    split_dif: (s.split_dif != null ? s.split_dif : null),
    caltm_dif: (s.caltm_dif != null ? s.caltm_dif : null),
    sp_dif: (spDif != null ? spDif : null),
    colada_mercado: mk ? !!mk.colada : null,
    // Preenchido no fim: o primeiro da ordem de merito entre os que a BW abriu.
    // E' ele que representa a corrida no Historico quando nao houve aposta.
    melhor: false
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
  const maxTela = (o.maxTela > 0) ? o.maxTela : MAX_TELA;
  const agora = (o.agora != null) ? o.agora : null;
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
  // Sem teto de mercado e SEM limite por tipo: todo par que a BW abriu e que tem
  // conviccao do motor entra na avaliacao, e a regua diz o tipo de cada um.
  //
  // Ate 09/09/2026 havia um slot por tipo e teto de 3 linhas. O Bruno derrubou
  // os dois: a tela comporta 4 e o tipo PODE repetir — se a BW abriu dois pares
  // que passam na regua TOP, os dois sao TOP e os dois merecem estar na tela.
  // Esconder o segundo era decidir por ele qual dos dois valia olhar.
  const classificados = [];
  const vistos = new Set();
  for (const par of pares) {
    if (par.marketPct == null) continue;
    const ta = Number(par.aTrap), tb = Number(par.bTrap);
    const k = chaveDe(ta, tb);
    if (vistos.has(k)) continue;               // a BW as vezes repete o par no feed
    const s = todos.find(x => mesmoPar(Number(x.pick_trap), Number(x.outro_trap), ta, tb));
    if (!s || !(s.pct > parelhoAte)) continue; // sem opiniao/conviccao do motor
    vistos.add(k);
    classificados.push(montaConfronto(
      ctx, s, camadaPorRegua(s.tier), daManha.has(k), mercadoDe(pares, s, tetoInfo), difDe[k]
    ));
  }

  // ORDEM DE MERITO e corte da tela. O primeiro leva a marca `melhor`: e' ele
  // que vai pro Historico quando o Bruno nao entrar em nenhum.
  const confrontos = ordenaPorMerito(classificados).slice(0, maxTela);
  if (confrontos.length) confrontos[0].melhor = true;

  // ── 3) OPORTUNIDADE ───────────────────────────────────────────────────────
  // So aparece quando a BW NAO abriu nada nesta corrida. E' o par que o motor da
  // manha levantou, na tela pra voce analisar enquanto espera o mercado.
  //
  // Assim que a BW abre qualquer coisa, ela sai: "os que abriram assumem a tela"
  // (Bruno, 09/09). E ela some de vez 1 minuto depois da largada — o registro do
  // dia so guarda o que o mercado confirmou, entao um AvB que nunca abriu nao
  // pode sobreviver ate o Historico.
  //
  // Nao ha nada pra apagar quando isso acontece: a OPORTUNIDADE nunca e'
  // gravada, e' recalculada a cada leitura a partir do PDF + do avb_abertos.
  if (!confrontos.length
      && !jaCorreu(ctx.finishingOrderJson)
      && !expirou(ctx.hora, agora)) {
    let melhor = null;
    for (const s of todos) {
      const k = chaveDe(s.pick_trap, s.outro_trap);
      if (!daManha.has(k)) continue;
      if (melhor == null || melhorQue(s, melhor)) melhor = s;
    }
    if (melhor) {
      const k = chaveDe(melhor.pick_trap, melhor.outro_trap);
      confrontos.push(montaConfronto(ctx, melhor, 'OPORTUNIDADE', true, mercadoDe(pares, melhor, tetoInfo), difDe[k]));
    }
  }

  return confrontos;
}

// ── QUEM VAI PRO HISTORICO ───────────────────────────────────────────────────
// UM registro por corrida (Bruno, 09/09/2026):
//   - entrou em algum dos AvBs -> e' esse, sempre, mesmo que nao fosse o melhor
//   - nao entrou em nenhum     -> o mais bem avaliado
//   - so ha OPORTUNIDADE       -> nenhum: a corrida nao entra no Historico
//
// A aposta ganha do merito de proposito. O Historico e' o registro do que
// ACONTECEU: trocar o AvB que ele apostou pelo que o motor preferia apagaria a
// decisao dele do proprio registro.
//
// `idEscolhido` e' o id do confronto apostado (o mesmo idConfronto), ou null.
function registroDoHistorico(confrontos, idEscolhido) {
  const lista = Array.isArray(confrontos) ? confrontos : [];
  const validos = lista.filter(c => c && c.camada !== 'OPORTUNIDADE');
  if (!validos.length) return null;
  if (idEscolhido != null) {
    const esc = validos.find(c => c.id === idEscolhido);
    if (esc) return esc;
  }
  return validos.find(c => c.melhor) || ordenaPorMerito(validos)[0] || null;
}

module.exports = {
  DIF_SP_MAX, TETO_INFO, MAX_TELA, GRACA_MIN,
  chaveCorrida, idConfronto, mesmoPar, pista, horaBr,
  jaCorreu, expirou, minutosParaLargada,
  melhorQue, camadaPorRegua, forcaTipo, ordenaPorMerito, distanciaSp,
  mercadoDe, montaConfronto, confrontosDaCorrida, registroDoHistorico
};
