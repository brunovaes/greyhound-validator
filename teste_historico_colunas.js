'use strict';
// teste_historico_colunas.js — a REDE MINIMA da tabela do Historico.
//
// Por que existe: mexer nas colunas do Historico ja quebrou a tela duas vezes
// neste projeto, e das duas o `node --check` passou limpo. Cabecalho com uma
// coluna a mais que a linha nao e' erro de sintaxe: a tabela so' desalinha, ou
// a ultima celula some, e ninguem ve ate abrir a tela. O handoff do front
// chamava isso de "rede minima" e citava um teste_render_hist.js que nao existe
// mais na raiz — este arquivo o substitui.
//
//   node teste_historico_colunas.js
//
// COMO ELE CONTA, e por que assim: as celulas nao estao todas escritas no
// template. Cinco vem de funcoes (_celulaAvb, _celulaMotor, _celulaResultado,
// _celulaObs, _celulaAberto), e cada uma tem ramo de cheio e de vazio. Contar
// "<td" no texto do arquivo daria numero errado. Entao o teste EXTRAI essas
// funcoes do main.js e as EXECUTA, com uma corrida cheia e uma vazia, contando
// o que elas devolvem de verdade — e ainda confere que os dois ramos devolvem
// a mesma quantidade (ramo que devolve td a menos e' o bug classico aqui).

const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, 'src', 'routes', 'main.js');
const src = fs.readFileSync(ARQ, 'utf8');

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── 1) o cabecalho da tabela do Historico ────────────────────────────────────
const linhaCab = src.split(/\r?\n/).find(l => l.indexOf('<th style="width:60px">AvB</th>') !== -1);
if (!linhaCab) { console.error('ERRO: nao achei o cabecalho da tabela do Historico.'); process.exit(1); }
const nTh = (linhaCab.match(/<th[\s>]/g) || []).length;

console.log('\n[1] CABECALHO\n');
console.log('    colunas declaradas: ' + nTh);
for (const nome of ['AvB', '%', 'Origem', 'Entrei', 'Bateu', 'Resultado', 'Observações', 'Odd', 'AvB na BW']) {
  ok(linhaCab.indexOf('>' + nome) !== -1, 'coluna "' + nome + '" presente');
}

// ── 2) as celulas que vem de funcao — extraidas e EXECUTADAS ─────────────────
console.log('\n[2] CELULAS QUE VEM DE FUNCAO (extraidas do main.js e executadas)\n');

const DEPS = ['_jsonOuNull', '_mesmoPar', '_parBW', '_blocoAvb', '_avbDoHistorico',
              '_celulaObs', '_celulaAvb', '_motorDoAvb', '_celulaMotor',
              '_celulaResultado', '_celulaAberto', '_celulaBW'];
let corpo = '';
for (const n of DEPS) {
  const re = new RegExp('^function\\s+' + n + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm');
  const m = src.match(re);
  if (!m) { console.error('ERRO: funcao ' + n + ' sumiu do main.js.'); process.exit(1); }
  corpo += m[0] + '\n';
}
// Stubs do que essas funcoes chamam por fora. Se alguma passar a depender de
// algo novo, o new Function abaixo estoura e o teste avisa em vez de mentir.
const STUBS = 'var BASE="/greyhound";'
  + 'function nomeCorridaCompleto(c){return c||"";}'
  + 'function cardGalgoHTML(){return "";}'
  + 'function icon(){return "";}';
let H;
try {
  H = new Function(STUBS + corpo + ';return {_celulaAvb,_celulaMotor,_celulaResultado,_celulaObs,_celulaAberto,_motorDoAvb};')();
} catch (e) {
  console.error('ERRO ao montar as funcoes do main.js: ' + e.message);
  process.exit(1);
}

const CHEIA = {
  id: 1, hora: '1:31', hora_br: '9:31', corrida: 'Sheff A2', dist: '500', pct: 73,
  nivel: 'alta', trap_fav: 1, name_fav: 'A', trap_und: 6, name_und: 'B',
  bateu: 'sim', odd: 1.7, obs: 'observacao de teste', top3: '1-2-5',
  resultado_1: 1, resultado_2: 2, resultado_3: 5,
  finishing_order_json: '[{"trap":1,"pos":1},{"trap":6,"pos":2}]',
  tier: 'TOP', abriu: 1, avb_nao_aberto: 0, hist_all: '[]'
};
const VAZIA = { id: 2, corrida: 'X A1', hora: '2:00' };

const CELULAS = ['_celulaAvb', '_celulaMotor', '_celulaResultado', '_celulaObs', '_celulaAberto'];
let tdDeFuncao = 0;
for (const k of CELULAS) {
  const cheio = (String(H[k](CHEIA)).match(/<td[\s>]/g) || []).length;
  const vazio = (String(H[k](VAZIA)).match(/<td[\s>]/g) || []).length;
  ok(cheio === 1 && vazio === 1,
     k + ' devolve exatamente 1 celula nos dois ramos  (cheio ' + cheio + ', vazio ' + vazio + ')');
  tdDeFuncao += cheio;
}

// ── 3) as celulas escritas direto no template ────────────────────────────────
console.log('\n[3] CELULAS ESCRITAS NO TEMPLATE DA LINHA\n');
const iIni = src.indexOf("${races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0).map(r=>{");
const iFim = src.indexOf('</tr>`;}).join(\'\')}', iIni);
if (iIni < 0 || iFim < 0) { console.error('ERRO: nao achei o template da linha.'); process.exit(1); }
const tplLinha = src.slice(iIni, iFim);
const tdInline = (tplLinha.match(/<td[\s>]/g) || []).length;
console.log('    escritas no template: ' + tdInline);
console.log('    vindas de funcao:     ' + tdDeFuncao);

const totalTd = tdInline + tdDeFuncao;
console.log('    TOTAL na linha:       ' + totalTd);

// ── 4) o teste que importa ───────────────────────────────────────────────────
console.log('\n[4] ALINHAMENTO\n');
ok(nTh === totalTd,
   'cabecalho (' + nTh + ') e linha (' + totalTd + ') tem o MESMO numero de colunas');

const mColspan = src.match(/colspan="(\d+)"[^>]*>Nenhum AvB nesta sessao/);
ok(!!mColspan, 'estado vazio da tabela existe');
if (mColspan) {
  ok(Number(mColspan[1]) === nTh,
     'colspan do estado vazio (' + mColspan[1] + ') bate com o numero de colunas (' + nTh + ')');
}

// ── 5) o filtro ENTREI ligado de ponta a ponta ───────────────────────────────
// Tres pontas: o seletor no cabecalho, o atributo na linha e o uso no filtro.
// Faltando qualquer uma, o filtro nao filtra e nao da erro nenhum.
console.log('\n[5] FILTRO "ENTREI" LIGADO DE PONTA A PONTA\n');
ok(src.indexOf('id="fh-entrei"') !== -1, 'seletor fh-entrei existe no cabecalho');
ok(tplLinha.indexOf('data-entrei=') !== -1, 'a linha grava data-entrei');
ok(src.indexOf("getElementById('fh-entrei')") !== -1, 'aplicarFiltroHist le o seletor');
ok(src.indexOf("getAttribute('data-entrei')") !== -1, 'aplicarFiltroHist le o atributo da linha');
ok(src.indexOf('casaEntrei&&') !== -1, 'casaEntrei entra na composicao do filtro');

// ── 6) o board saiu ──────────────────────────────────────────────────────────
// A Analisar continua usando o painelDia.js; o que nao pode sobrar e' o board
// DENTRO da tela Historico. Sobra de div sem script (ou o contrario) deixa
// "carregando..." eterno na tela.
console.log('\n[6] BOARD DO DIA REMOVIDO DA TELA HISTORICO\n');
ok(src.indexOf('hist-board') === -1, 'nenhuma referencia a hist-board sobrou');
ok(src.indexOf('boardDia.js') === -1, 'o script boardDia.js nao e mais carregado');
ok(src.indexOf('BoardDia.render') === -1, 'nenhuma chamada a BoardDia.render sobrou');
const nPainelDia = (src.match(/painelDia\.js/g) || []).length;
ok(nPainelDia === 1,
   'painelDia.js segue carregado UMA vez (a Analisar depende dele)  (achei ' + nPainelDia + ')');

console.log('\n' + (falhas === 0
  ? 'TUDO OK — cabecalho e linha alinhados, filtro ligado, board fora.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
