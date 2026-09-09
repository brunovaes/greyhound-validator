'use strict';
// teste_historico_colunas.js — a REDE MINIMA da tabela do Historico.
//
// Por que existe: mexer nas colunas do Historico ja quebrou a tela duas vezes
// neste projeto, e das duas o `node --check` passou limpo. Cabecalho com uma
// coluna a mais que a linha nao e' erro de sintaxe: a tabela so desalinha, ou a
// ultima celula some, e ninguem ve ate abrir a tela.
//
//   node teste_historico_colunas.js
//
// O QUE MUDOU EM set/2026: a tabela deixou de ser uma linha por CORRIDA e passou
// a ser uma por AvB confirmado pela BW. Isso trouxe um segundo jeito de a linha
// desalinhar: as celulas da corrida (Resultado, bandeira, Observacoes, AvB na
// BW, lapis) so aparecem na PRIMEIRA linha de cada corrida, e as demais recebem
// uma celula vazia no lugar. Se um dos dois ramos esquecer uma celula, a tabela
// entorta so nas corridas com mais de um AvB — o caso menos frequente e mais
// dificil de notar. Por isso o teste EXECUTA o construtor da linha nos DOIS
// ramos e compara.

const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, 'src', 'routes', 'main.js');
const src = fs.readFileSync(ARQ, 'utf8');

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── 1) cabecalho ─────────────────────────────────────────────────────────────
const linhaCab = src.split(/\r?\n/).find(l => l.indexOf('<th style="width:60px">AvB</th>') !== -1);
if (!linhaCab) { console.error('ERRO: nao achei o cabecalho da tabela do Historico.'); process.exit(1); }
const nTh = (linhaCab.match(/<th[\s>]/g) || []).length;

console.log('\n[1] CABECALHO\n');
console.log('    colunas declaradas: ' + nTh);
for (const nome of ['AvB', '%', 'Camada', 'Entrei', 'Bateu', 'Resultado', 'Observações', 'Odd', 'AvB na BW']) {
  ok(linhaCab.indexOf('>' + nome) !== -1, 'coluna "' + nome + '" presente');
}
ok(linhaCab.indexOf('Origem') === -1,
   'a coluna Origem (VIP/Secundaria/Surpresa) saiu de vez');
ok(/<option value="conta" selected>/.test(linhaCab),
   'o seletor de Camada abre em "Contabilizável" — a tela nasce filtrada');
for (const c of ['TOP', 'HIGH', 'GOOD']) {
  ok(linhaCab.indexOf('<option value="' + c + '">') !== -1, 'o filtro oferece ' + c);
}

// ── 2) as celulas de funcao, extraidas e EXECUTADAS ─────────────────────────
console.log('\n[2] CELULAS QUE VEM DE FUNCAO (extraidas do main.js e executadas)\n');

const DEPS = ['_jsonOuNull', '_mesmoPar', '_parBW', '_blocoAvb', '_avbDoHistorico',
              '_celulaObs', '_celulaAvb', '_motorDoAvb', '_celulaMotor',
              '_celulaResultado', '_celulaAberto', '_celulaBW',
              '_celulaAvbConf', '_celulaCamada', '_celulaEntreiConf',
              '_celulaBateuConf', '_celulaOddConf'];
let corpo = '';
for (const n of DEPS) {
  const re = new RegExp('^function\\s+' + n + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm');
  const m = src.match(re);
  if (!m) { console.error('ERRO: funcao ' + n + ' sumiu do main.js.'); process.exit(1); }
  corpo += m[0] + '\n';
}
const STUBS = 'var BASE="/greyhound";'
  + 'function nomeCorridaCompleto(c){return c||"";}'
  + 'function cardGalgoHTML(){return "";}'
  + 'function icon(){return "";}';
let H;
try {
  H = new Function(STUBS + corpo + ';return {_celulaAvbConf,_celulaCamada,_celulaEntreiConf,_celulaBateuConf,_celulaOddConf,_celulaResultado,_celulaObs,_celulaAberto};')();
} catch (e) {
  console.error('ERRO ao montar as funcoes do main.js: ' + e.message);
  process.exit(1);
}

const CORRIDA = {
  id: 1, hora: '1:31', hora_br: '9:31', corrida: 'Sheff A2', dist: '500',
  bateu: 'sim', odd: 1.7, obs: 'observacao de teste', top3: '1-2-5',
  resultado_1: 1, resultado_2: 2, resultado_3: 5,
  finishing_order_json: '[{"trap":1,"pos":1},{"trap":6,"pos":2}]',
  abriu: 1, avb_nao_aberto: 0
};
const CF = {
  id: 'sheff a2|01:31|1x6', par: 'T1xT6',
  pick_trap: 1, pick_nome: 'Braemar Millie', outro_trap: 6, outro_nome: 'Romeo On Point',
  pct: 73, camada: 'TOP', bateu: true, da_manha: true, tier_motor: 'TOP'
};

const UMA = [
  ['_celulaAvbConf', () => H._celulaAvbConf(CORRIDA, CF, true)],
  ['_celulaCamada', () => H._celulaCamada(CF)],
  ['_celulaEntreiConf', () => H._celulaEntreiConf(true)],
  ['_celulaBateuConf', () => H._celulaBateuConf(CF)],
  ['_celulaOddConf', () => H._celulaOddConf(CORRIDA, true)],
  ['_celulaResultado', () => H._celulaResultado(CORRIDA)],
  ['_celulaObs', () => H._celulaObs(CORRIDA)],
  ['_celulaAberto', () => H._celulaAberto(CORRIDA)]
];
for (const [nome, fn] of UMA) {
  const n = (String(fn()).match(/<td[\s>]/g) || []).length;
  ok(n === 1, nome + ' devolve exatamente 1 celula  (devolveu ' + n + ')');
}
// Os ramos "vazios" contam tanto quanto os cheios: e' onde a coluna some.
ok((String(H._celulaEntreiConf(false)).match(/<td[\s>]/g) || []).length === 1,
   '_celulaEntreiConf devolve 1 celula tambem quando NAO houve entrada');
ok((String(H._celulaOddConf(CORRIDA, false)).match(/<td[\s>]/g) || []).length === 1,
   '_celulaOddConf devolve 1 celula tambem na linha sem aposta');
ok((String(H._celulaCamada({ camada: 'VIP' })).match(/<td[\s>]/g) || []).length === 1,
   '_celulaCamada devolve 1 celula com camada desconhecida (linha antiga do banco)');
ok(String(H._celulaCamada({ camada: 'VIP' })).indexOf('VIP') !== -1,
   'e mostra o valor cru em vez de virar traco — e historico, nao erro');

// ── 3) a LINHA, executada nos dois ramos ────────────────────────────────────
console.log('\n[3] A LINHA MONTADA, nos dois ramos\n');

const iIni = src.indexOf('${linhasAvb.map(function(Lx){');
const iFim = src.indexOf("}).join('')}", iIni);
if (iIni < 0 || iFim < 0) { console.error('ERRO: nao achei o construtor da linha.'); process.exit(1); }
const corpoLinha = src.slice(iIni + '${linhasAvb.map('.length, iFim + 1);

let montarLinha;
try {
  montarLinha = new Function(STUBS + corpo
    + ';return (' + corpoLinha + ');')();
} catch (e) {
  console.error('ERRO ao montar o construtor da linha: ' + e.message);
  process.exit(1);
}

const primeira = montarLinha({ r: CORRIDA, cf: CF, primeira: true, escolhido: true });
const seguinte = montarLinha({ r: CORRIDA, cf: CF, primeira: false, escolhido: false });
const nP = (primeira.match(/<td[\s>]/g) || []).length;
const nS = (seguinte.match(/<td[\s>]/g) || []).length;

console.log('    primeira linha da corrida : ' + nP + ' celulas');
console.log('    linhas seguintes          : ' + nS + ' celulas');
ok(nP === nTh, 'a PRIMEIRA linha tem o mesmo numero de colunas do cabecalho (' + nTh + ')');
ok(nS === nTh, 'as linhas SEGUINTES tambem (' + nTh + ') — e onde a tabela entortaria');
ok(nP === nS, 'os dois ramos batem entre si');

ok(primeira.indexOf('Sheff A2') !== -1 && seguinte.indexOf('Sheff A2') === -1,
   'o nome da corrida aparece so na primeira linha');
ok(primeira.indexOf('ENTREI') !== -1 && seguinte.indexOf('ENTREI') === -1,
   'a marca ENTREI so na linha em que a aposta foi feita');
ok(seguinte.indexOf('Braemar') !== -1,
   'mas os galgos do confronto aparecem em TODAS as linhas — e o que distingue uma da outra');

// ── 4) a regra de contabilizacao gravada na linha ───────────────────────────
console.log('\n[4] CONTABILIZACAO: todo TOP + o que voce entrou\n');

function conta(html) { const m = html.match(/data-conta="([^"]*)"/); return m ? m[1] : null; }
const casos = [
  ['TOP', false, '1', 'TOP sem aposta CONTA (senao entrar em 2 de 5 e acertar os 2 daria 100%)'],
  ['TOP', true, '1', 'TOP apostado conta'],
  ['HIGH', true, '1', 'HIGH apostado conta'],
  ['GOOD', true, '1', 'GOOD apostado conta'],
  ['HIGH', false, '', 'HIGH sem aposta NAO conta'],
  ['GOOD', false, '', 'GOOD sem aposta NAO conta']
];
for (const [camada, esc, esperado, msg] of casos) {
  const html = montarLinha({ r: CORRIDA, cf: Object.assign({}, CF, { camada: camada }), primeira: true, escolhido: esc });
  ok(conta(html) === esperado, msg);
}

// ── 5) os atributos que o filtro e os KPIs leem ─────────────────────────────
console.log('\n[5] ATRIBUTOS DA LINHA E O QUE OS LE\n');
for (const attr of ['data-camada', 'data-entrei', 'data-conta', 'data-bateu', 'data-primeira']) {
  ok(primeira.indexOf(attr + '=') !== -1, 'a linha grava ' + attr);
}
ok(src.indexOf("tr.getAttribute('data-conta') === '1'") !== -1,
   'o filtro "Contabilizável" le o data-conta');
ok(src.indexOf("conta.filter(function(tr){ return tr.getAttribute('data-bateu') === 'sim'; })") !== -1,
   'os KPIs contam acertos dentro do conjunto contabilizavel');
ok(src.indexOf("document.addEventListener('DOMContentLoaded', aplicarFiltroHist);") !== -1,
   'a tela abre JA filtrada — senao os cards sairiam de um conjunto e a tabela de outro');

// ── 6) o board segue fora ───────────────────────────────────────────────────
console.log('\n[6] BOARD DO DIA CONTINUA FORA\n');
ok(src.indexOf('hist-board') === -1, 'nenhuma referencia a hist-board');
ok(src.indexOf('boardDia.js') === -1, 'o boardDia.js nao e carregado');

console.log('\n' + (falhas === 0
  ? 'TUDO OK — uma linha por AvB, colunas alinhadas nos dois ramos, contabilizacao na regra.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
