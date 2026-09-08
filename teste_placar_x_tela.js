'use strict';
// teste_placar_x_tela.js — o PLACAR e a TELA tem que classificar igual.
//
// Por que existe: o /diag/oportunidades-bw-resultado (que alimenta o Placar
// Camadas do admin) tinha COPIA PROPRIA da regua de camadas. Quando a regua
// mudou em set/2026, so o painel-dia foi atualizado — o Placar ficou
// classificando por PROCEDENCIA (era da manha -> TOP) e ainda exigindo colada no
// mercado. Resultado: o mesmo par aparecia como GOOD na tela e TOP no Placar, e
// nada estourava. Foi exatamente pra impedir isso que o camadasDoDia foi
// extraido — e a extracao tinha ficado pela metade.
//
//   node teste_placar_x_tela.js
//
// COMO TESTA: o Placar e o painel-dia agora chamam a MESMA funcao. Este teste
// confere que (1) o robot.js nao tem mais regua propria, (2) o api.js e o
// robot.js chamam o util com os mesmos parametros, e (3) o aguardando_entrada
// respeita a largada — o bug que enchia os tiles da Analisar de corrida que ja
// tinha acabado.

const fs = require('fs');
const path = require('path');

const cd = require(path.join(__dirname, 'src', 'utils', 'camadasDoDia'));
const { bateuPar } = require(path.join(__dirname, 'src', 'utils', 'avbResultado'));
const API = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'api.js'), 'utf8');
const ROBOT = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── 1) a regua duplicada saiu do robot.js ───────────────────────────────────
console.log('\n[1] O ROBOT.JS NAO CLASSIFICA MAIS POR CONTA PROPRIA\n');

ok(ROBOT.indexOf("tier = eraManha ? 'TOP' : 'HIGH'") === -1,
   'a classificacao por procedencia (eraManha -> TOP) sumiu');
ok(ROBOT.indexOf('manhaKeys') === -1,
   'o conjunto manhaKeys, que era a copia do pool da manha, sumiu');
ok(ROBOT.indexOf("require('../utils/camadasDoDia')") !== -1,
   'o robot.js importa o camadasDoDia');
ok(ROBOT.indexOf('cd.confrontosDaCorrida(') !== -1,
   'e chama confrontosDaCorrida em vez de classificar sozinho');

// Um so lugar decide a camada. Se alguem reintroduzir a regua em outro arquivo,
// esta contagem denuncia.
const arquivos = ['src/routes/api.js', 'src/routes/robot.js', 'src/utils/camadasDoDia.js'];
let quemDecide = 0;
for (const f of arquivos) {
  const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
  if (t.indexOf('function camadaPorRegua') !== -1) quemDecide++;
}
ok(quemDecide === 1,
   'a funcao que traduz regua em camada existe em UM arquivo so  (achei em ' + quemDecide + ')');

// ── 2) os dois chamam com os mesmos parametros ──────────────────────────────
console.log('\n[2] TELA E PLACAR CHAMAM O UTIL DO MESMO JEITO\n');

function argsDaChamada(txt) {
  const i = txt.indexOf('cd.confrontosDaCorrida({');
  if (i < 0) return null;
  const fim = txt.indexOf('});', i);
  const bloco = txt.slice(i, fim);
  return ['todos', 'lastSp', 'pares', 'abertoEm', 'corrida', 'hora',
          'finishingOrderJson', 'parelhoAte', 'difSpMax', 'tetoInfo', 'bateuPar']
    .filter(k => new RegExp('\\b' + k + '\\s*[:,]').test(bloco));
}
const aApi = argsDaChamada(API), aRob = argsDaChamada(ROBOT);
ok(!!aApi && !!aRob, 'as duas chamadas foram encontradas');
if (aApi && aRob) {
  ok(JSON.stringify(aApi.sort()) === JSON.stringify(aRob.sort()),
     'passam exatamente os mesmos parametros  (' + aApi.length + ' de cada)');
  ok(aApi.indexOf('lastSp') !== -1,
     'os dois passam lastSp — sem ele o pool da manha nao tem como medir a diferenca');
}

// ── 3) o Placar nao conta OPORTUNIDADE ──────────────────────────────────────
console.log('\n[3] O PLACAR MEDE SO O QUE A BW ABRIU\n');
ok(ROBOT.indexOf("if (cf.camada === 'OPORTUNIDADE') continue;") !== -1,
   'OPORTUNIDADE fica fora da estatistica (ainda nao e resultado de nada)');

// ── 4) aguardando_entrada respeita a largada ────────────────────────────────
console.log('\n[4] AGUARDANDO_ENTRADA RESPEITA A LARGADA\n');

ok(API.indexOf('ja_correu: cd.jaCorreu(row.finishing_order_json)') !== -1,
   'a corrida leva o marcador ja_correu no payload');
ok(/aguardando_entrada:\s*\(cf\.camada !== 'OPORTUNIDADE' && entrada == null && !c\.ja_correu\)/.test(API),
   'aguardando_entrada exige que a corrida NAO tenha largado');

// A regra em si, executada: e' o que separa "da pra apostar" de "ja acabou".
function aguardando(camada, entrada, jaCorreu) {
  return (camada !== 'OPORTUNIDADE' && entrada == null && !jaCorreu);
}
ok(aguardando('TOP', null, false) === true, 'TOP, sem aposta, corrida por vir -> aguardando');
ok(aguardando('TOP', null, true) === false, 'TOP, sem aposta, corrida JA CORREU -> nao aguarda mais');
ok(aguardando('TOP', { odd: 1.8 }, false) === false, 'TOP com aposta feita -> nao aguarda');
ok(aguardando('OPORTUNIDADE', null, false) === false, 'OPORTUNIDADE nunca aguarda (nao da pra apostar no que a BW nao abriu)');

// ── 5) o caso real de hoje ──────────────────────────────────────────────────
// Trlee A4 das 8:21 BR: TOP, bateu, corrida encerrada ha horas. Antes do fix ela
// seguia como aguardando_entrada e ocupava um dos 4 tiles da Analisar.
console.log('\n[5] O CASO REAL: Trlee A4, TOP que ja correu\n');
const CHEGADA = JSON.stringify([{ trap: 4, pos: 1 }, { trap: 5, pos: 3 }]);
const conf = {
  pick_trap: 4, pick_nome: 'Timtam', outro_trap: 5, outro_nome: 'Teevee Breeze (M)',
  pct: 71, tier: 'TOP', ratio_sp: 1.455, split_dif: 0.065, caltm_dif: 0.135
};
const r = cd.confrontosDaCorrida({
  todos: [conf], lastSp: { 4: 2.5, 5: 3.75 },
  pares: [{ aTrap: 4, bTrap: 5, marketPct: 50, oddAvenceB: 1.83, oddBvenceA: 1.83 }],
  abertoEm: '2026-09-08 11:17:06', corrida: 'Trlee A4', hora: '12:21',
  finishingOrderJson: CHEGADA, parelhoAte: 60, bateuPar: bateuPar
});
ok(r.length === 1 && r[0].camada === 'TOP', 'classifica como TOP  (saiu: ' + (r[0] && r[0].camada) + ')');
ok(r[0].bateu === true, 'e o bateu vem preenchido pela chegada');
ok(cd.jaCorreu(CHEGADA) === true, 'jaCorreu reconhece a corrida encerrada');
ok(aguardando(r[0].camada, null, cd.jaCorreu(CHEGADA)) === false,
   'entao ela NAO ocupa mais um tile da Analisar');

console.log('\n' + (falhas === 0
  ? 'TUDO OK — uma regua so, e os tiles nao guardam mais corrida encerrada.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
