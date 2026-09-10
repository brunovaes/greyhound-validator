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
// COMO A TABELA CHEGOU AQUI: em 08/09/2026 ela virou uma linha por AvB (ate 3
// por corrida); em 09/09 voltou a ser UMA POR CORRIDA, com o AvB apostado — ou,
// sem aposta, o mais bem avaliado. O construtor da linha continua com os dois
// ramos (`primeira` true/false), porque tirar o ramo vazio agora seria mexer em
// codigo testado pra remover um caso que hoje nao acontece e pode voltar a
// acontecer. O teste segue exercitando os DOIS: se um deles esquecer uma celula,
// a tabela entorta no dia em que ele for usado de novo.

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
// "Camada" virou "Tipo" na tela em 09/09/2026 — mesma coluna, nome que o Bruno
// usa. O valor dentro dela continua TOP/HIGH/GOOD.
for (const nome of ['AvB', '%', 'Tipo', 'Entrei', 'Bateu', 'Resultado', 'Observações', 'Odd', 'AvB na BW']) {
  ok(linhaCab.indexOf('>' + nome) !== -1, 'coluna "' + nome + '" presente');
}
ok(linhaCab.indexOf('Origem') === -1,
   'a coluna Origem (VIP/Secundaria/Surpresa) saiu de vez');
// A opcao "Contabilizavel" saiu em 10/09/2026, junto com o data-conta. Ela
// separava o que entrava no denominador quando cabiam varias linhas por corrida;
// com UM registro por corrida virou sinonimo de "Todas", e duas opcoes pro mesmo
// conjunto so confundem.
ok(linhaCab.indexOf('value="conta"') === -1,
   'a opcao "Contabilizável" saiu do seletor de Tipo');
ok(/<option value="" selected>Todas<\/option>/.test(linhaCab),
   'e a tela abre em "Todas"');
for (const c of ['TOP', 'HIGH', 'GOOD']) {
  ok(linhaCab.indexOf('<option value="' + c + '">') !== -1, 'o filtro oferece ' + c);
}

// ── 2) as celulas de funcao, extraidas e EXECUTADAS ─────────────────────────
console.log('\n[2] CELULAS QUE VEM DE FUNCAO (extraidas do main.js e executadas)\n');

const DEPS = ['_jsonOuNull', '_mesmoPar', '_parBW', '_blocoAvb', '_avbDoHistorico',
              '_celulaObs', '_celulaAvb', '_motorDoAvb', '_celulaMotor',
              '_celulaResultado', '_celulaAberto', '_celulaBW',
              '_celulaAvbConf', '_celulaCamada', '_celulaEntreiConf',
              '_celulaBateuConf', '_celulaOddConf', '_abriuDaLinha'];
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
  H = new Function(STUBS + corpo + ';return {_celulaAvbConf,_celulaCamada,_celulaEntreiConf,_celulaBateuConf,_celulaOddConf,_celulaResultado,_celulaObs,_celulaAberto,_abriuDaLinha};')();
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
  // _celulaAberto passou a receber o estado ja calculado (Bruno, 10/09/2026):
  // a celula e o data-abriu da linha saem do MESMO _abriuDaLinha, pra o filtro
  // do cabecalho nunca discordar do visto verde que esta na tela.
  ['_celulaAberto', () => H._celulaAberto(CORRIDA, H._abriuDaLinha(CORRIDA, CF))]
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

// ── 4) OS QUATRO CARTOES ────────────────────────────────────────────────────
//
// Um por tipo, mais o geral (Bruno, 10/09/2026). Cada um traz a quantidade na
// cor do tipo e, embaixo, acertos / erros / taxa.
//
// Saiu daqui a regra de contabilizacao com data-conta: ela separava o que
// entrava no denominador quando cabiam varias linhas por corrida. Com UM
// registro por corrida, todo registro conta — e a divisao que interessa passou a
// ser por TIPO.
console.log('\n[4] OS QUATRO CARTOES: geral, TOP, HIGH e GOOD\n');

ok(src.indexOf('data-conta') === -1 || !/data-conta="/.test(src),
   'a linha nao grava mais data-conta');

// O GERAL e' BRANCO no desenho, nao azul: ele nao e' um tipo, e' a soma dos
// tres. De azul ficaria com a mesma cara do TOP.
const CARTOES = [
  ['geral', '#ffffff', 'AvBs Geral'],
  ['top',   '#3b82f6', 'AvBs TOP'],
  ['high',  '#f97316', 'AvBs HIGH'],
  ['good',  '#8b5cf6', 'AvBs GOOD']
];
for (const [id, cor, rot] of CARTOES) {
  for (const sufixo of ['qtd', 'ok', 'err', 'pct']) {
    ok(src.indexOf("'kpi-' + K.id + '-" + sufixo + "'") !== -1
       || src.indexOf("kpi-' + id + '-" + sufixo) !== -1,
       'o cartao tem o campo ' + sufixo);
  }
  break;   // os quatro sao gerados pelo MESMO template; conferir um basta
}
for (const [id, cor, rot] of CARTOES) {
  ok(src.indexOf("rot: '" + rot + "'") !== -1, 'existe o conjunto ' + rot);
  ok(src.indexOf("cor: '" + cor + "'") !== -1, 'com a cor ' + cor);
}
ok(src.indexOf("id: 'high',  rot: 'AvBs HIGH',  cor: '#f97316'") !== -1,
   'HIGH em laranja');
ok(src.indexOf("id: 'good',  rot: 'AvBs GOOD',  cor: '#8b5cf6'") !== -1,
   'GOOD em roxo');
ok(src.indexOf("id: 'geral', rot: 'AvBs Geral', cor: '#ffffff'") !== -1,
   'e o Geral em BRANCO — ele nao e um tipo, e a soma dos tres');

// O DESENHO: titulo e quantidade na mesma linha, uma regua, e tres colunas
// embaixo. Os rotulos sao Acertos / Derrotas / Taxa.
ok(src.indexOf('<div class="kc-rot">Acertos</div><div class="kc-rot">Derrotas</div><div class="kc-rot">Taxa</div>') !== -1,
   'os tres rotulos, nessa ordem: Acertos, Derrotas, Taxa');
ok(src.indexOf('class="kc-reg"') !== -1, 'a regua entre o topo e a tabela');
ok(/\.kc-top\{[^}]*justify-content:space-between/.test(src),
   'titulo a esquerda e quantidade a direita, na mesma linha');
ok(/\.kc-num\{[^}]*color:#dfe5ee/.test(src),
   'Acertos e Derrotas em BRANCO — no desenho eles sao neutros, so a taxa e colorida');

// O GRAFICO DE EVOLUCAO: uma barra por tipo, do tamanho da taxa.
console.log('\n[4b] O GRAFICO DE EVOLUCAO\n');
ok(src.indexOf('Gráfico de Evolução') !== -1, 'o cartao do grafico existe');
ok(src.indexOf("KPIS.filter(function(K){ return K.id !== 'geral'; })") !== -1,
   'e ele traz so os TRES tipos — o geral nao e uma barra, e a soma delas');
ok(src.indexOf("var w = (K.k.pct == null ? 0 : Math.max(0, Math.min(100, K.k.pct)));") !== -1,
   'a largura da barra e a TAXA, presa entre 0 e 100');
ok(src.indexOf("bar.style.width = (pct == null ? 0 : Math.max(0, Math.min(100, pct))) + '%';") !== -1,
   'e o recalculo do filtro move a barra junto — senao o grafico congela e passa a discordar do cartao ao lado');
ok(/\.kg-tri\{[^}]*background:rgba\(255,255,255,\.05\)/.test(src),
   'a barra tem trilha: um tipo com 0% precisa ocupar espaco, senao a linha parece erro de render');

// A largura, calculada: e' o unico ponto onde um numero vira pixel.
function larg(pct) { return pct == null ? 0 : Math.max(0, Math.min(100, pct)); }
ok(larg(null) === 0, 'sem resultado: barra vazia');
ok(larg(0) === 0, '0%: barra vazia');
ok(larg(50) === 50, '50%: meia barra');
ok(larg(100) === 100, '100%: barra cheia');
ok(larg(140) === 100, 'acima de 100 nao estoura o cartao');

// A REGRA DA TAXA, executada: 0% branco, acima verde, abaixo vermelho.
function corDaTaxa(pct) {
  return pct == null ? '#555' : (pct > 0 ? '#22C65E' : (pct < 0 ? '#ef4444' : '#fff'));
}
ok(corDaTaxa(null) === '#555', 'sem resultado ainda: cinza');
ok(corDaTaxa(0) === '#fff', '0% em BRANCO');
ok(corDaTaxa(1) === '#22C65E', '1% em verde');
ok(corDaTaxa(100) === '#22C65E', '100% em verde');
ok(corDaTaxa(-1) === '#ef4444', 'abaixo de 0% em vermelho (o ramo existe, mas taxa nao fica negativa)');
ok(src.indexOf("pct > 0 ? '#22C65E' : (K.k.pct < 0 ? '#ef4444' : '#fff')") !== -1,
   'e a MESMA regra esta no servidor');
ok(src.indexOf("pct > 0 ? '#22C65E' : (pct < 0 ? '#ef4444' : '#fff')") !== -1,
   'e no recalculo do filtro — as duas pontas pintam igual');

// A TAXA SAI DOS RESOLVIDOS, nao do total. Uma corrida que ainda nao correu
// entraria como erro e afundaria a taxa do dia ate o robo de resultados passar.
function taxa(ok_, err_) { const r = ok_ + err_; return r ? Math.round(ok_ / r * 100) : null; }
ok(taxa(2, 1) === 67, '2 acertos e 1 erro -> 67%');
ok(taxa(0, 0) === null, 'nenhum resolvido -> sem taxa, nao 0%');
ok(taxa(3, 0) === 100, 'tres acertos e nenhum erro -> 100%');

// ── 5) os atributos que o filtro e os KPIs leem ─────────────────────────────
console.log('\n[5] ATRIBUTOS DA LINHA E O QUE OS LE\n');
for (const attr of ['data-camada', 'data-entrei', 'data-bateu', 'data-primeira']) {
  ok(primeira.indexOf(attr + '=') !== -1, 'a linha grava ' + attr);
}
ok(src.indexOf("var casaMotor = !fm ? true : (cam === fm);") !== -1,
   'o filtro de Tipo compara direto com o data-camada');
ok(src.indexOf("return todas.filter(function(tr){ return (tr.getAttribute('data-camada')||'') === t; });") !== -1,
   'e os cartoes por tipo saem do MESMO data-camada que o filtro le');
ok(src.indexOf("document.addEventListener('DOMContentLoaded', aplicarFiltroHist);") !== -1,
   'a tela abre JA filtrada — senao os cards sairiam de um conjunto e a tabela de outro');

// ── 6) o board segue fora ───────────────────────────────────────────────────
console.log('\n[6] BOARD DO DIA CONTINUA FORA\n');
ok(src.indexOf('hist-board') === -1, 'nenhuma referencia a hist-board');
ok(src.indexOf('boardDia.js') === -1, 'o boardDia.js nao e carregado');

console.log('\n' + (falhas === 0
  ? 'TUDO OK — um registro por corrida, colunas alinhadas, e os quatro cartoes por tipo.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
