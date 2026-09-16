'use strict';
// teste_dnf_chegada.js — QUEM NAO COMPLETOU A PROVA (Bruno, 16/09/2026)
//
// De onde veio: "algumas corridas o robo de resultados nao atualiza". O print
// era Nottingham A3 12:14, onde o Racing Post lista:
//
//   0th  T5 Vair Little Legs  DNF        <- nao completou
//   1st  T6 Annadown Guggy    30.22
//   2nd  T1 Churchill Boy
//   3rd  T2 Monbeg Bella
//   4th  T4 Barnfield Venus
//   5th  T3 Blue Danube  shd
//
// O parser NAO engasgava no "0th" — os dois extratores ja o descartavam pela
// guarda `pos >= 1`, e com razao: 0 nao e colocacao. O que se perdia junto era
// o FATO. A trap 5 sumia da chegada, e dai ninguem conseguia distinguir "nao
// terminou" de "nao estava nesta corrida".
//
// Consequencia: AvB que envolvesse a trap 5 nunca resolvia. O bateuPar exige os
// DOIS caes na chegada, devolvia indefinido, e a aposta ficava Pendente pra
// sempre — os mesmos "-" que apareceram na Banca.
//
// REGRA ESCOLHIDA PELO BRUNO: quem completou a prova ganha o par.
//
// O QUE ESTE TESTE PROTEGE, em ordem:
//   1) que o DNF NAO entra na lista de colocacoes. Ali posicao menor e melhor —
//      um DNF como pos 0 pareceria ter vencido a corrida. Silencioso e fatal.
//   2) que todos os DNF recebem a MESMA posicao, pra dois DNF no mesmo par
//      cairem no `pa === pb -> null` que o bateuPar ja tem. Numerar 6 e 7 faria
//      o primeiro da raspagem "ganhar" por sorteio.
//   3) que o bateuPar continua intocado — ele e fonte unica.
//
//   node teste_dnf_chegada.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'resultsRobot.js'), 'utf8');
const { bateuPar, vereditoAvB } = require('./src/utils/avbResultado');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

function arranca(nome) {
  const ini = SRC.indexOf('function ' + nome + '(');
  if (ini < 0) { console.error('ERRO: ' + nome + ' sumiu do resultsRobot.js'); process.exit(1); }
  let i = SRC.indexOf('{', ini), n = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') n++;
    else if (SRC[i] === '}') { n--; if (!n) return SRC.slice(ini, i + 1); }
  }
  console.error('ERRO: nao fechei ' + nome); process.exit(1);
}

const ctxF = { console: console };
vm.createContext(ctxF);
vm.runInContext(arranca('extractFinishingOrder') + '\n' + arranca('extractDnf')
  + '\nthis.ordem = extractFinishingOrder; this.dnf = extractDnf;', ctxF);

// innerText reconstruido do print do Bruno.
const PAGINA = [
  'Nottingham A3', '12:14', 'Race 4 £155 (A3) 500m Going: +40', 'Watch Replay',
  '0th', 'Vair Little Legs', 'DNF', '3/1', 'T: K A Lempard', '(5.22) checked second',
  '1st', 'Annadown Guggy', '30.22', '3/1', 'T: E Saville', '(5.08) early pace, always led, wide',
  '2nd', 'Churchill Boy', '2', '9/4F', 'T: L Cook', '(5.20) clear run, rails to middle',
  '3rd', 'Monbeg Bella', '5', '8/1', 'T: S Spillane', '(5.29) crowded first',
  '4th', 'Barnfield Venus', '5 1/4', '7/1', 'T: F Macklin', '(5.22) crowded first',
  '5th', 'Blue Danube', 'shd', '7/2', 'T: A S McPherson', '(5.28) crowded first'
].join('\n');

// ── [1] a leitura da pagina ─────────────────────────────────────────────────
bloco('[1] A PAGINA DO PRINT, LIDA PELOS EXTRATORES REAIS');

const ordem = ctxF.ordem(PAGINA);
const dnf = ctxF.dnf(PAGINA);

t('as colocacoes vao de 1 a 5 — o 0th NAO entra',
  ordem.length === 5 && ordem[0].pos === 1 && !ordem.find(function (x) { return x.pos === 0; }));
t('o 1o e o Annadown Guggy, nao o cao do 0th', ordem[0].name === 'Annadown Guggy');
t('e o DNF sai por fora, na lista propria', dnf.length === 1 && dnf[0] === 'Vair Little Legs');
t('a distancia nao gruda mais no nome do ultimo ("Blue Danube shd")',
  ordem[4].name === 'Blue Danube');

// Numa corrida sem DNF nada muda.
const SEM_DNF = PAGINA.split('\n').slice(4).join('\n').replace(/^0th[\s\S]*?(?=1st)/, '');
t('corrida sem 0th devolve lista de DNF vazia', ctxF.dnf(SEM_DNF).length === 0);

// ── [2] o bloco que monta a chegada, rodando de verdade ─────────────────────
bloco('[2] O DNF ENTRA NA CHEGADA, DEPOIS DE TODOS');

const INI = 'const dnfNomes = extractDnf(pageText.text);';
const FIM = '// AvB: fav bateu = chegou na frente do und';
const iA = SRC.indexOf(INI), iB = SRC.indexOf(FIM, iA);
if (iA < 0 || iB < 0) { console.error('ERRO: o bloco do DNF mudou de forma.'); process.exit(1); }
const BLOCO = SRC.slice(iA, iB);

function montar(finishers, dnfTrapsDom, nomesParaTrap) {
  const ctx = {
    console: console,
    extractDnf: ctxF.dnf,
    pageText: { text: PAGINA, dnfTraps: dnfTrapsDom || [] },
    finishingOrderCompleto: finishers.slice(),
    nameToTrap: function (n) { return (nomesParaTrap || {})[n] || null; },
    addLog: function () {},
    parseInt: parseInt
  };
  vm.createContext(ctx);
  vm.runInContext(BLOCO + '\nthis.saida = finishingOrderCompleto;', ctx);
  return ctx.saida;
}

// A chegada da corrida do print: T6, T1, T2, T4, T3. Falta a T5 (DNF).
const FINISHERS = [{ pos: 1, trap: 6 }, { pos: 2, trap: 1 }, { pos: 3, trap: 2 },
                   { pos: 4, trap: 4 }, { pos: 5, trap: 3 }];

let ch = montar(FINISHERS, [5]);
t('a trap do 0th entra na chegada', !!ch.find(function (x) { return x.trap === 5; }));
t('na posicao seguinte a do ultimo que terminou (6)',
  ch.find(function (x) { return x.trap === 5; }).pos === 6);
t('marcada como dnf, pra tela poder dizer o que houve',
  ch.find(function (x) { return x.trap === 5; }).dnf === true);
t('e quem terminou nao e tocado', ch.slice(0, 5).every(function (x, i) { return x.pos === i + 1; }));

// Sem o trap vindo do HTML, o nome resolve pelo race_card.
ch = montar(FINISHERS, [], { 'Vair Little Legs': '5' });
t('sem o trap no HTML, o nome do 0th resolve pelo race_card',
  !!ch.find(function (x) { return x.trap === 5 && x.dnf === true; }));

ch = montar(FINISHERS, [], {});
t('sem HTML e sem casar o nome, nao inventa trap nenhuma', ch.length === 5);

ch = montar(FINISHERS, [3]);
t('trap que JA esta na chegada nao e duplicada',
  ch.filter(function (x) { return x.trap === 3; }).length === 1);

// ── [3] a regra do Bruno, pelo bateuPar ─────────────────────────────────────
bloco('[3] QUEM COMPLETOU GANHA O PAR');

ch = montar(FINISHERS, [5]);
t('T1 (chegou em 2o) x T5 (nao completou) -> bateu', bateuPar(ch, 1, 5) === true);
t('e o inverso, T5 x T1 -> nao bateu', bateuPar(ch, 5, 1) === false);
t('T5 contra o vencedor T6 tambem perde', bateuPar(ch, 5, 6) === false);
t('entre dois que terminaram nada muda', bateuPar(ch, 6, 1) === true && bateuPar(ch, 3, 6) === false);

t('e o vereditoAvB, que grava a coluna, concorda',
  vereditoAvB(JSON.stringify(ch), 1, 5, 99, 99) === 'sim'
  && vereditoAvB(JSON.stringify(ch), 5, 1, 99, 99) === 'nao');

// ── [4] DOIS que nao terminam ───────────────────────────────────────────────
// A parte que mais importa neste desenho. Se os dois caos do AvB nao
// terminaram, nao ha vencedor — e numerar 6 e 7 faria o primeiro da raspagem
// "ganhar" por ordem de leitura. Todos recebem a MESMA posicao, e o
// `pa === pb -> null` do bateuPar devolve indefinido sozinho.
bloco('[4] DOIS DNF NO MESMO PAR = INDEFINIDO, NUNCA SORTEIO');

const CINCO = [{ pos: 1, trap: 6 }, { pos: 2, trap: 1 }, { pos: 3, trap: 2 }, { pos: 4, trap: 4 }];
const ch2 = montar(CINCO, [5, 3]);
t('os dois DNF recebem a MESMA posicao',
  ch2.find(function (x) { return x.trap === 5; }).pos === ch2.find(function (x) { return x.trap === 3; }).pos);
t('e o par entre eles fica INDEFINIDO', bateuPar(ch2, 5, 3) === null);
t('nao vira "sim" nem "nao" por ordem de raspagem',
  bateuPar(ch2, 3, 5) === null && vereditoAvB(JSON.stringify(ch2), 5, 3, 99, 99) === '');
t('mas cada um deles contra quem terminou continua decidindo',
  bateuPar(ch2, 1, 5) === true && bateuPar(ch2, 3, 6) === false);

// ── [5] o que nao podia mudar ───────────────────────────────────────────────
bloco('[5] A FONTE UNICA CONTINUA INTOCADA');

const SRC_AVB = fs.readFileSync(path.join(__dirname, 'src', 'utils', 'avbResultado.js'), 'utf8');
t('o bateuPar nao ganhou ramo especial de DNF', !/dnf/i.test(SRC_AVB));
t('a regra mora na CHEGADA, nao na funcao que a le',
  /pos: posDnf, trap: t, dnf: true/.test(SRC));
t('o DOM devolve os traps do 0th', /dnfTraps: dnfTraps/.test(SRC));
t('e a extracao do 0th e separada da lista de colocacoes',
  /function extractDnf/.test(SRC) && /if \(parseInt\(parts\[i\]\) !== 0\) continue;/.test(SRC));
t('a lista de colocacoes segue recusando a posicao 0',
  /if \(pos < 1 \|\| pos > 6\) continue;/.test(SRC));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
