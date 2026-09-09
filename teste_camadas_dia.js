'use strict';
// teste_camadas_dia.js — a REGUA DE CAMADAS (OPORTUNIDADE / TOP / HIGH / GOOD).
//
// Roda contra o codigo real: importa o src/utils/camadasDoDia.js e exercita cada
// regra do modelo fechado com o Bruno em set/2026.
//
//   node teste_camadas_dia.js
//
// O MODELO EM UMA TELA
//   A ODD TEM UM PAPEL SO, E E' NA MANHA: responder "quais AvBs a BW tem chance
//   de abrir?". Depois que a BW abre, a odd sai da decisao.
//
//   MANHA  pool = pct acima do corte E as SPs dos dois galgos proximas, medidas
//          pela DIFERENCA absoluta entre as odds decimais da ultima corrida
//          valida (<= 1,0). Enquanto a BW nao abre, e' OPORTUNIDADE.
//   BW     TODO par aberto e' classificado pela REGUA, sem olhar preco:
//          tier TOP -> TOP | tier REGULAR -> HIGH | tier null -> GOOD.
//          Par fora do pool da manha entra igual (a "pescada").
//   TELA   ate 4 AvBs, e o TIPO PODE REPETIR (dois TOP na mesma corrida e'
//          normal). Entram os 4 mais bem avaliados: tipo primeiro
//          (TOP > HIGH > GOOD) e, dentro do tipo, SPLIT -> TEMPO (CalTm) -> pct.
//   SAIDA  a OPORTUNIDADE so aparece enquanto a BW nao abriu NADA na corrida.
//          Abriu qualquer coisa, ela sai. E some de vez 1 min depois da largada.
//   HIST   UM registro por corrida: o AvB apostado; sem aposta, o mais bem
//          avaliado. Nunca uma OPORTUNIDADE.
//
// A segunda parte compara, nos MESMOS cenarios, a regua nova contra a REGUA
// ANTERIOR — que nao foi reescrita a mao: e' a funcao fatiada da versao do
// camadasDoDia.js que estava no ar (pool por RAZAO <= 1,5 e teto de mercado 1,5
// barrando o motor BW). Serve pra ver linha a linha o que a mudanca fez.

const path = require('path');
const cd = require(path.join(__dirname, 'src', 'utils', 'camadasDoDia'));
const { bateuPar } = require(path.join(__dirname, 'src', 'utils', 'avbResultado'));

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── fabricas ─────────────────────────────────────────────────────────────────
function conf(pick, outro, pct, tier, ratioSp, splitDif, caltmDif) {
  return {
    pick_trap: pick, pick_nome: 'Galgo T' + pick,
    outro_trap: outro, outro_nome: 'Galgo T' + outro,
    pct: pct, tier: tier, ratio_sp: ratioSp,
    split_dif: splitDif, caltm_dif: caltmDif
  };
}
function par(a, b, marketPct, oddAB, oddBA) {
  return { aTrap: a, bTrap: b, marketPct: marketPct, oddAvenceB: oddAB, oddBvenceA: oddBA };
}
const CHEGADA = JSON.stringify([
  { trap: 1, pos: 1 }, { trap: 2, pos: 2 }, { trap: 5, pos: 3 },
  { trap: 6, pos: 4 }, { trap: 3, pos: 5 }, { trap: 4, pos: 6 }
]);

function rodar(c) {
  return cd.confrontosDaCorrida({
    todos: c.todos, lastSp: c.lastSp || null, pares: c.pares,
    abertoEm: c.abertoEm || null,
    corrida: c.corrida || 'Sheff A2', hora: c.hora || '1:31',
    finishingOrderJson: c.finishingOrderJson || null,
    parelhoAte: c.parelhoAte != null ? c.parelhoAte : 60,
    difSpMax: c.difSpMax || 0, tetoInfo: c.tetoInfo || 0,
    // `agora` so quando o cenario pede: sem ele o modulo nao expira nada, que e'
    // o que mantem os cenarios antigos independentes do relogio.
    agora: (c.agora != null ? c.agora : null),
    maxTela: c.maxTela || 0,
    bateuPar: bateuPar
  });
}
const pares_ = r => r.map(x => x.par + ':' + x.camada).join('  ') || '(vazio)';
const camadas = r => r.map(x => x.camada).join(', ') || '(vazio)';

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[1] A ODD SO DECIDE NA MANHA — pool por DIFERENCA de SP (<= 1,0)\n');

// Yarmouth R7 real: T1 7/2 = 4,50 | T2 4/1 = 5,00 | T3 7/2 = 4,50
//                   T4 11/10F = 2,10 | T5 7/4F = 2,75
const YARMOUTH = { 1: 4.50, 2: 5.00, 3: 4.50, 4: 2.10, 5: 2.75 };

let r = rodar({
  todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: []
});
ok(r.length === 1 && r[0].sp_dif === 0,
   'T1 x T3 (7/2 x 7/2): distancia 0 — entra no pool  (sp_dif ' + (r[0] && r[0].sp_dif) + ')');

r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.111, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 1 && r[0].sp_dif === 0.5, 'T1 x T2 (4,50 x 5,00): distancia 0,50 — entra');

r = rodar({ todos: [conf(4, 5, 84, 'TOP', 1.310, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 1 && r[0].sp_dif === 0.65, 'T4 x T5 (2,10 x 2,75): distancia 0,65 — entra');

r = rodar({ todos: [conf(1, 5, 84, 'TOP', 1.636, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 0, 'T1 x T5 (4,50 x 2,75): distancia 1,75 — FICA FORA');

r = rodar({ todos: [conf(1, 4, 84, 'TOP', 2.143, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 0, 'T1 x T4 (4,50 x 2,10): distancia 2,40 — FICA FORA');

// A troca de RAZAO por DIFERENCA muda quem entra nos extremos. E' o efeito
// principal da mudanca e precisa estar coberto nos dois sentidos.
const AZAROES = { 1: 7.00, 2: 9.00 };
r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.286, 0.20, 0.30)], lastSp: AZAROES, pares: [] });
ok(r.length === 0,
   'dois azaroes (7,00 x 9,00): razao 1,29 entrava na regua velha, distancia 2,00 fica FORA agora');

const FAVORITOS = { 1: 1.50, 2: 2.40 };
r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.600, 0.20, 0.30)], lastSp: FAVORITOS, pares: [] });
ok(r.length === 1,
   'dois favoritos (1,50 x 2,40): razao 1,60 ficava FORA, distancia 0,90 ENTRA agora');

r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.1, 0.20, 0.30)], lastSp: { 1: 4.5 }, pares: [] });
ok(r.length === 0, 'galgo sem SP valida: nao da pra medir, fica fora do pool');

r = rodar({ todos: [conf(1, 3, 55, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 0, 'pct abaixo do corte nao entra no pool nem com SP identica');

r = rodar({ todos: [conf(1, 3, 84, null, 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 1, 'par de regua frouxa entra no pool — senao GOOD nunca viria da manha');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[2] MOTOR BW — a REGUA decide, o preco NAO barra\n');

for (const [tier, esperada] of [['TOP', 'TOP'], ['REGULAR', 'HIGH'], [null, 'GOOD']]) {
  r = rodar({
    todos: [conf(1, 6, 84, tier, 1.20, 0.20, 0.30)], lastSp: { 1: 4.5, 6: 4.6 },
    pares: [par(1, 6, 52.0, 1.85, 1.92)], abertoEm: '2026-09-08 12:00:00'
  });
  ok(r.length === 1 && r[0].camada === esperada,
     'tier ' + String(tier) + ' -> ' + esperada + '  (saiu: ' + camadas(r) + ')');
}

// O caso que muda tudo: par ESCANCARADO no mercado (razao 2,6).
r = rodar({
  todos: [conf(1, 6, 84, 'TOP', 1.20, 0.20, 0.30)], lastSp: { 1: 4.5, 6: 4.6 },
  pares: [par(1, 6, 72.0, 1.25, 3.60)], abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 1 && r[0].camada === 'TOP',
   'mercado 72x28 (razao 2,6): a regua manda, vira TOP mesmo assim');
ok(r[0].colada_mercado === false && r[0].razao_mercado > 1.5,
   'a razao de mercado segue VISIVEL no payload, so nao decide mais nada');

r = rodar({
  todos: [conf(4, 3, 92, null, 4.333, 0.12, 0.41)], lastSp: { 4: 2.0, 3: 9.0 },
  pares: [par(4, 3, 47.7, 1.92, 1.75)], abertoEm: '2026-09-08 10:07:12'
});
ok(r.length === 1 && r[0].camada === 'GOOD' && r[0].da_manha === false,
   'pescada real do Newc A6: fora do pool (distancia 7,00) e a BW abriu -> GOOD');

// ═════════════════════════════════════════════════════════════════════════════
// MUDOU EM 09/09/2026. Ate entao havia UM slot por tipo e teto de 3 linhas: com
// dois pares passando na regua TOP, um deles sumia da tela. O Bruno derrubou a
// regra — a tela comporta 4 e o tipo pode repetir, porque esconder o segundo TOP
// era decidir por ele qual dos dois valia olhar.
console.log('\n[3] O TIPO PODE REPETIR — dois TOP na mesma corrida ficam os dois\n');

const SP6 = { 1: 4.5, 2: 4.6, 3: 4.7, 4: 4.8, 5: 4.9, 6: 5.0 };
r = rodar({
  todos: [conf(1, 6, 95, 'TOP', 1.20, 0.12, 0.40), conf(2, 5, 70, 'TOP', 1.30, 0.28, 0.10)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 2, 'os DOIS TOP entram na tela  (saiu: ' + r.length + ')');
ok(camadas(r) === 'TOP, TOP', 'e os dois seguem marcados como TOP');
ok(r[0].par === 'T2xT5',
   'na frente vem o de melhor SPLIT, mesmo com pct bem menor (95 x 70)');
ok(r[0].melhor === true && r[1].melhor === false,
   'so o primeiro leva a marca `melhor` — e' + String.fromCharCode(39) + ' ele que representa a corrida no Historico');

r = rodar({
  todos: [conf(1, 6, 95, 'TOP', 1.20, 0.20, 0.11), conf(2, 5, 70, 'TOP', 1.30, 0.20, 0.33)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r[0].par === 'T2xT5', 'split empatado: desempata pelo TEMPO (CalTm)');

r = rodar({
  todos: [conf(1, 6, 70, 'TOP', 1.20, 0.20, 0.30), conf(2, 5, 95, 'TOP', 1.30, 0.20, 0.30)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r[0].par === 'T2xT5', 'split e tempo empatados: desempata pelo pct');

// O exemplo que o Bruno escreveu: a manha levantou 1v2, e a BW abriu 5v2 (TOP),
// 5v3 (HIGH) e 1v4 (GOOD). Os tres da BW entram; o 1v2, que a BW nao abriu, nao.
console.log('\n[3b] O EXEMPLO DO BRUNO: manha 1v2, BW abre 5v2 TOP, 5v3 HIGH, 1v4 GOOD\n');
r = rodar({
  todos: [
    conf(1, 2, 90, 'TOP', 1.05, 0.30, 0.40),      // a manha levantou; BW nao abriu
    conf(5, 2, 88, 'TOP', 1.10, 0.28, 0.35),
    conf(5, 3, 82, 'REGULAR', 1.15, 0.22, 0.18),
    conf(1, 4, 76, null, 1.20, 0.15, 0.08)
  ],
  lastSp: SP6,
  pares: [par(5, 2, 52, 1.85, 1.92), par(5, 3, 51, 1.90, 1.95), par(1, 4, 50, 1.98, 1.98)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 3, 'entram os 3 que a BW abriu  (saiu: ' + r.length + ')');
ok(camadas(r) === 'TOP, HIGH, GOOD', 'classificados pela regua, em ordem de merito');
ok(!r.some(x => x.par === 'T1xT2'),
   'o par da manha que a BW NAO abriu fica de fora — os que abriram assumem a tela');
ok(!r.some(x => x.camada === 'OPORTUNIDADE'),
   'e nao volta como OPORTUNIDADE: com a BW aberta, ela nao existe mais nesta corrida');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[4] TETO DE 4 e a ordem de merito\n');

r = rodar({
  todos: [
    conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'REGULAR', 1.20, 0.25, 0.20),
    conf(3, 4, 80, null, 1.30, 0.20, 0.10), conf(1, 5, 75, null, 1.40, 0.05, 0.05),
    conf(2, 4, 72, null, 1.45, 0.02, 0.02)
  ],
  lastSp: SP6,
  pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95),
          par(3, 4, 50.5, 1.95, 1.97), par(1, 5, 50, 1.98, 1.98),
          par(2, 4, 49.5, 2.00, 2.00)]
  , abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 4, 'cinco candidatos, quatro vagas: sai o pior  (saiu: ' + r.length + ')');
ok(camadas(r) === 'TOP, HIGH, GOOD, GOOD', 'ordem por tipo, com GOOD repetindo: ' + camadas(r));
ok(!r.some(x => x.par === 'T2xT4'), 'o de pior split e o que fica de fora');
ok(r.every(x => x.camada !== 'OPORTUNIDADE'), 'com a BW aberta nao existe linha cinza');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[5] OPORTUNIDADE some DEPOIS da corrida\n');

const SEM_ABRIR = { todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] };
r = rodar(SEM_ABRIR);
ok(r.length === 1 && r[0].camada === 'OPORTUNIDADE', 'antes da largada a OPORTUNIDADE aparece');

r = rodar(Object.assign({}, SEM_ABRIR, { finishingOrderJson: CHEGADA }));
ok(r.length === 0, 'depois da largada some — corrida sem nenhuma das tres sai inteira');

r = rodar({
  todos: [conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'TOP', 1.20, 0.10, 0.10)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92)],
  abertoEm: '2026-09-08 12:00:00', finishingOrderJson: CHEGADA
});
ok(r.length === 1 && r[0].camada === 'TOP',
   'depois da largada sobra so o que a BW abriu; o achado que nao abriu sai');

// A regra que o Bruno escreveu em 09/09: assim que a BW abre QUALQUER COISA na
// corrida, a OPORTUNIDADE sai — mesmo antes da largada, mesmo que o par dela
// fosse melhor que o que abriu. "Os que abriram assumem a tela."
r = rodar({
  todos: [conf(1, 3, 95, 'TOP', 1.000, 0.40, 0.50),   // a manha levantou este
          conf(2, 4, 70, null, 1.000, 0.05, 0.05)],   // e a BW abriu este
  lastSp: { 1: 4.5, 3: 4.6, 2: 4.7, 4: 4.8 },
  pares: [par(2, 4, 50, 1.98, 1.98)], abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 1 && r[0].camada === 'GOOD' && r[0].par === 'T2xT4',
   'BW abriu um GOOD: a OPORTUNIDADE de melhor split some assim mesmo');
ok(!r.some(x => x.camada === 'OPORTUNIDADE'),
   'a tela nao mistura o que o mercado confirmou com o que ele nao abriu');

// ═════════════════════════════════════════════════════════════════════════════
// O corte de 1 MINUTO, pelo relogio. Ate 09/09 a OPORTUNIDADE so saia quando a
// CHEGADA era gravada — e o robo de resultados costuma demorar bem mais que
// isso. O relogio e' o sinal antecipado; a chegada continua sendo o definitivo.
console.log('\n[5b] O CORTE DE 1 MINUTO, PELO RELOGIO\n');

// Monta um instante REAL (ms) a partir de um horario de Brasilia. O servidor
// roda em UTC, entao BR = UTC-3.
function agoraBr(hhmm) {
  const p = String(hhmm).split(':');
  return Date.UTC(2026, 8, 9, parseInt(p[0], 10) + 3, parseInt(p[1], 10), 0);
}
// A hora do PDF vem sem AM/PM: 1..9 e' tarde (soma 12), depois -4h de fuso.
// Entao "6:00" UK e' 18:00 la e 14:00 aqui.
const HORA_UK = '6:00';                       // = 14:00 BR
ok(cd.horaBr(HORA_UK) === '14:00', 'a hora UK 6:00 e' + String.fromCharCode(39) + ' 14:00 BR  (' + cd.horaBr(HORA_UK) + ')');

const MIN = [
  ['13:55', 5,  'faltando 5 min'],
  ['14:00', 0,  'na hora da largada'],
  ['14:01', -1, 'um minuto depois'],
  ['14:05', -5, 'cinco minutos depois']
];
for (const [rel, esperado, msg] of MIN) {
  ok(cd.minutosParaLargada(HORA_UK, agoraBr(rel)) === esperado,
     msg + ' -> ' + esperado + ' min  (deu ' + cd.minutosParaLargada(HORA_UK, agoraBr(rel)) + ')');
}

ok(cd.expirou(HORA_UK, agoraBr('13:55')) === false, 'antes da largada NAO expirou');
ok(cd.expirou(HORA_UK, agoraBr('14:00')) === false, 'na hora, ainda vale');
ok(cd.expirou(HORA_UK, agoraBr('14:01')) === false, 'um minuto depois AINDA vale (a BW aceita entrada)');
ok(cd.expirou(HORA_UK, agoraBr('14:02')) === true,  'dois minutos depois, expirou');
ok(cd.expirou(HORA_UK, null) === false,
   'sem relogio nao expira nada — mostrar demais e' + String.fromCharCode(39) + ' melhor que sumir com o que vale');

// A VIRADA DO DIA nao pode inverter o sinal. A ultima corrida sai as 20:00 BR
// (hora UK "0:00"); se voce deixa a tela aberta ate 00:05, a conta crua daria
// +1195 min — a corrida de ontem apareceria como se faltassem 20 horas pra ela.
// Com o ajuste da volta, da -245: ela largou ha 4 horas, e some.
const VIRADA = cd.minutosParaLargada('0:00', Date.UTC(2026, 8, 10, 3, 5, 0));
ok(cd.horaBr('0:00') === '20:00', 'a hora UK 0:00 e' + String.fromCharCode(39) + ' 20:00 BR  (' + cd.horaBr('0:00') + ')');
ok(VIRADA === -245, 'virada do dia: largou as 20:00, sao 00:05 -> -245 min  (deu ' + VIRADA + ')');
ok(cd.expirou('0:00', Date.UTC(2026, 8, 10, 3, 5, 0)) === true,
   'e por isso ela expirou, em vez de voltar pra tela como corrida futura');

// E o corte valendo dentro da regra: OPORTUNIDADE sem chegada gravada, mas com
// o relogio ja passado, nao aparece.
const SO_MANHA = { todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [], hora: HORA_UK };
r = rodar(Object.assign({}, SO_MANHA, { agora: agoraBr('13:55') }));
ok(r.length === 1 && r[0].camada === 'OPORTUNIDADE', 'faltando 5 min, a OPORTUNIDADE esta na tela');
r = rodar(Object.assign({}, SO_MANHA, { agora: agoraBr('14:01') }));
ok(r.length === 1, 'um minuto depois ela ainda esta la');
r = rodar(Object.assign({}, SO_MANHA, { agora: agoraBr('14:02') }));
ok(r.length === 0, 'dois minutos depois some, mesmo sem a chegada ter sido gravada');

// ═════════════════════════════════════════════════════════════════════════════
// UM REGISTRO POR CORRIDA no Historico (Bruno, 09/09/2026). A aposta ganha do
// merito: o Historico registra o que ACONTECEU, e trocar o AvB apostado pelo que
// o motor preferia apagaria a decisao dele do proprio registro.
console.log('\n[5c] O QUE VAI PRO HISTORICO: um por corrida\n');

const QUATRO = rodar({
  todos: [
    conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'REGULAR', 1.20, 0.25, 0.20),
    conf(3, 4, 80, null, 1.30, 0.20, 0.10), conf(1, 5, 75, null, 1.40, 0.05, 0.05)
  ],
  lastSp: SP6,
  pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95),
          par(3, 4, 50.5, 1.95, 1.97), par(1, 5, 50, 1.98, 1.98)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(QUATRO.length === 4, 'os quatro estao na tela');

let reg = cd.registroDoHistorico(QUATRO, null);
ok(reg && reg.camada === 'TOP' && reg.melhor === true,
   'sem aposta: vai o mais bem avaliado  (' + (reg && reg.par) + ', ' + (reg && reg.camada) + ')');

const idGood = QUATRO.filter(x => x.camada === 'GOOD')[0].id;
reg = cd.registroDoHistorico(QUATRO, idGood);
ok(reg && reg.camada === 'GOOD',
   'apostou num GOOD: vai o GOOD, nao o TOP — o registro guarda a SUA decisao');

reg = cd.registroDoHistorico(QUATRO, 'id-que-nao-existe');
ok(reg && reg.camada === 'TOP',
   'id de aposta que nao bate com nenhum (par trocado na mao): cai no mais bem avaliado');

// OBS1 do Bruno: no fim do dia nao pode sobrar registro com tipo diferente de
// TOP, HIGH ou GOOD.
reg = cd.registroDoHistorico([montaOportunidade()], null);
ok(reg === null, 'corrida que so teve OPORTUNIDADE nao entra no Historico');
ok(cd.registroDoHistorico([], null) === null, 'corrida sem nada tambem nao');

function montaOportunidade() {
  const x = rodar({ todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
  return x[0];
}

ok(cd.jaCorreu(CHEGADA) === true && cd.jaCorreu(null) === false && cd.jaCorreu('[]') === false,
   'jaCorreu trata vazio/nulo como "ainda nao correu"');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[6] HELPERS\n');
ok(cd.idConfronto('Sheff A2', '1:31', 1, 6) === 'sheff a2|01:31|1x6', 'idConfronto monta a chave do contrato');
ok(cd.idConfronto('Sheff A2', '1:31', 6, 1) === cd.idConfronto('Sheff A2', '1:31', 1, 6), 'idConfronto e INSENSIVEL a ordem');
ok(cd.horaBr('1:31') === '9:31' && cd.horaBr('14:02') === '10:02', 'horaBr converte UK -> BR');
ok(cd.pista('Sheff A2') === 'Sheff', 'pista pega a primeira palavra');
ok(cd.DIF_SP_MAX === 1.0, 'DIF_SP_MAX default 1,0');
ok(cd.distanciaSp({ 1: 4.5, 2: 5.0 }, 1, 2) === 0.5, 'distanciaSp mede a diferenca absoluta');
ok(cd.distanciaSp({ 1: 4.5 }, 1, 2) === null, 'distanciaSp devolve null quando falta um lado');
ok(cd.camadaPorRegua('TOP') === 'TOP' && cd.camadaPorRegua('REGULAR') === 'HIGH' && cd.camadaPorRegua(null) === 'GOOD',
   'camadaPorRegua mapeia a regua nas tres camadas');

// ═════════════════════════════════════════════════════════════════════════════
// REGUA ANTERIOR — pool por RAZAO <= 1,5 e teto de mercado 1,5 barrando o BW.
// Fatiada da versao que estava no ar. Existe so pra o comparativo.
// ═════════════════════════════════════════════════════════════════════════════
function regraAnterior(o) {
  const TETO = 1.5, FAIXA = 1.8 - 0.3; // 1,5, os cortes de quando esta regra rodava
  const mercadoDe = cd.mercadoDe, montaConfronto = cd.montaConfronto, mesmoPar = cd.mesmoPar;
  const todos = o.todos || [], pares = o.pares || [];
  const parelhoAte = o.parelhoAte > 0 ? o.parelhoAte : 0;
  const ctx = {
    corrida: o.corrida, hora: o.hora, abertoEm: o.abertoEm || null,
    finishingOrderJson: o.finishingOrderJson,
    bateuPar: typeof o.bateuPar === 'function' ? o.bateuPar : function () { return null; }
  };
  const out = [], jaAdd = new Set();
  const ch = (a, b) => Math.min(a, b) + 'x' + Math.max(a, b);
  const manha = todos.filter(s => s.pct > parelhoAte && s.ratio_sp <= FAIXA);
  for (const s of manha) {
    const mk = mercadoDe(pares, s, TETO);
    out.push(montaConfronto(ctx, s, (mk && mk.colada) ? 'TOP' : 'OPORTUNIDADE', true, mk, null));
    jaAdd.add(ch(s.pick_trap, s.outro_trap));
  }
  for (const p of pares) {
    if (p.marketPct == null) continue;
    const ta = Number(p.aTrap), tb = Number(p.bTrap);
    if (jaAdd.has(ch(ta, tb))) continue;
    const mp = p.marketPct / 100, hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
    const razao = lo > 0 ? hi / lo : null;
    if (!(razao != null && razao <= TETO)) continue;
    const s = todos.find(x => mesmoPar(Number(x.pick_trap), Number(x.outro_trap), ta, tb));
    if (!s || s.pct <= parelhoAte) continue;
    out.push(montaConfronto(ctx, s, s.tier != null ? 'HIGH' : 'GOOD', false, mercadoDe(pares, s, TETO), null));
    jaAdd.add(ch(ta, tb));
  }
  return out;
}

console.log('\n' + '='.repeat(78));
console.log('ANTES x DEPOIS — mesmos cenarios nas duas reguas');
console.log('='.repeat(78) + '\n');

const COMPARA = [
  { nome: 'Yarmouth R7: T1xT5 (4,50 x 2,75) — razao 1,64 / distancia 1,75',
    todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30), conf(1, 5, 80, 'TOP', 1.636, 0.25, 0.35)],
    lastSp: YARMOUTH, pares: [] },
  { nome: 'Dois azaroes 7,00 x 9,00 — razao 1,29 / distancia 2,00',
    todos: [conf(1, 2, 84, 'TOP', 1.286, 0.20, 0.30)], lastSp: AZAROES, pares: [] },
  { nome: 'Dois favoritos 1,50 x 2,40 — razao 1,60 / distancia 0,90',
    todos: [conf(1, 2, 84, 'TOP', 1.600, 0.20, 0.30)], lastSp: FAVORITOS, pares: [] },
  { nome: 'Mercado ESCANCARADO 72x28, tier TOP',
    todos: [conf(1, 6, 84, 'TOP', 1.20, 0.20, 0.30)], lastSp: { 1: 4.5, 6: 4.6 },
    pares: [par(1, 6, 72.0, 1.25, 3.60)], abertoEm: '2026-09-08 12:00:00' },
  { nome: 'Corrida cheia: TOP + REGULAR + null, todos abertos',
    todos: [conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'REGULAR', 1.20, 0.25, 0.20), conf(3, 4, 80, null, 1.30, 0.20, 0.10)],
    lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95), par(3, 4, 50.5, 1.95, 1.97)],
    abertoEm: '2026-09-08 12:00:00' },
  { nome: 'Tres GOOD abertos na mesma corrida (Yrmth A6)',
    todos: [conf(4, 2, 88, null, 2.50, 0.30, 0.20), conf(6, 1, 78, null, 1.24, 0.18, 0.15), conf(3, 2, 86, null, 1.39, 0.22, 0.25)],
    lastSp: SP6, pares: [par(4, 2, 50, 1.83, 1.83), par(6, 1, 48.5, 1.91, 1.91), par(3, 2, 48.1, 1.90, 1.90)],
    abertoEm: '2026-09-08 12:00:00' },
  { nome: 'Achado da manha que nao abriu, DEPOIS da corrida',
    todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [], finishingOrderJson: CHEGADA }
];

let tA = 0, tD = 0;
for (const c of COMPARA) {
  const base = {
    todos: c.todos, pares: c.pares, abertoEm: c.abertoEm || null,
    corrida: 'Sheff A2', hora: '1:31',
    finishingOrderJson: c.finishingOrderJson || null,
    parelhoAte: 60, bateuPar: bateuPar
  };
  const antes = regraAnterior(Object.assign({}, base));
  const depois = cd.confrontosDaCorrida(Object.assign({}, base, { lastSp: c.lastSp }));
  tA += antes.length; tD += depois.length;
  const mudou = JSON.stringify(antes.map(x => x.par + x.camada)) !== JSON.stringify(depois.map(x => x.par + x.camada));
  console.log((mudou ? '  MUDOU  ' : '  igual  ') + c.nome);
  console.log('           antes  (' + antes.length + '): ' + pares_(antes));
  console.log('           depois (' + depois.length + '): ' + pares_(depois));
  console.log('');
}
console.log('  TOTAL DE LINHAS NOS CENARIOS:  antes ' + tA + '  ->  depois ' + tD);

console.log('\n' + (falhas === 0
  ? 'TUDO OK — a regua nova esta valendo em todos os casos.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
