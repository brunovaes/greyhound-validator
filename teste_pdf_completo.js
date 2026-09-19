'use strict';
// teste_pdf_completo.js — A JANELA DA CORRIDA COMPLETA TRAZ TODOS OS GALGOS
//                          (Bruno, 19/09/2026)
//
// "quero todos os dados do PDF baixado, sem restricao ou filtro mais", e na
// correcao do mesmo dia: "trazer todos os galgos, mas manter somente as mesmas
// colunas".
//
// A janela (icone de PDF da Analisar) mostrava o RECORTE da analise: galgos
// pontuados, linhas da mesma pista/distancia, ate 5 — e os descartados sem
// historico nenhum. Agora todo galgo traz todas as linhas do PDF, com o MESMO
// card de dez colunas de sempre.
//
// O RISCO QUE ESTE TESTE VIGIA e' o motor. O historico que o motor le
// (hist_full, via mapHistLinhas) NAO muda: 5 linhas por galgo, os mesmos
// campos. O PDF inteiro vai numa coluna separada (pdf_completo) que so a
// janela le.
//
//   node teste_pdf_completo.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }
function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const { parseHistoryLine } = require('./src/utils/pdfParser');
const API = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'api.js'), 'utf8');
const ROBOT = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
const DB = fs.readFileSync(path.join(__dirname, 'src', 'db', 'database.js'), 'utf8');
const A = semComentarios(API), AP = semComentarios(APP);

const L = function (s) { return parseHistoryLine(s); };
const CPARK = [
  '14Sep26 CPark 491m [3] 3.18 4444 4th 5 Swift Arrow Mid,ClrRn 29.85 N 30.4 7/2 A3 30.16',
  '08Sep26 CPark 491m [3] 3.16 2334 4th 3 Lenson Lad Mid,EP,Fcd-Ck1/4 29.90 -10 30.6 3/1 A3 30.28',
  '03Sep26 CPark 491m [3] 3.13 1222 2nd 1 Kilara Blue Mid,QAw,SnLd-2 29.60 N 30.5 2/1 A3 29.69'
];
const ROMFD = '27Aug26 Romfd 400m [4] 4.95 3333 3rd 2 Aero Star Mid,Crd1 24.10 N 30.3 4/1 A4 24.30';

// ═══════════════════════════════════════════════════════════════════════════
bloco('[1] O PARSER NAO FOI TOCADO');
// ═══════════════════════════════════════════════════════════════════════════

// Na primeira versao desta entrega o parser ganhou dois campos (byWin e a
// linha crua) pra alimentar colunas a mais. Com a correcao ("manter somente as
// mesmas colunas") eles perderam o leitor e sairam: o parser e' o de antes.
const l1 = L(CPARK[0]);
t('a linha continua sendo lida', !!l1 && l1.pista === 'CPark' && l1.caltm === 30.16);
t('sem os campos da primeira versao', !('byWin' in l1) && !('linha' in l1));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[2] O MOTOR CONTINUA LENDO EXATAMENTE O QUE LIA');
// ═══════════════════════════════════════════════════════════════════════════

const mapa = new Function('return (' + (A.match(/function mapHistLinhas\([\s\S]*?\n\}/) || [''])[0] + ');')();
const nove = Array.from({ length: 9 }, function (_, i) { return Object.assign(L(CPARK[0]), { data: String(i + 10) + 'Sep26' }); });
t('mapHistLinhas ainda corta em 5 linhas', mapa(nove).length === 5);
t('o hist_full da analise continua saindo do mapHistLinhas',
  /histFull:\(galgos\|\|\[\]\)\.map\(g=>\(\{trap:g\.trap,nome:g\.nome,brtClasse:g\.brtClasse,ssnDate:g\.ssnDate\|\|null,ssnSupp:!!g\.ssnSupp,historico:mapHistLinhas\(g\.historico\|\|\[\]\)\}\)\)/.test(A));
t('nenhum motor le o pdf_completo',
  ['motorManha.js', 'reanaliseEngine.js', 'cascataMotor.js', 'camadasDoDia.js'].every(function (f) {
    try {
      const s = fs.readFileSync(path.join(__dirname, 'src', 'utils', f), 'utf8');
      return s.indexOf('pdf_completo') < 0 && s.indexOf('pdfCompleto') < 0;
    } catch (e) { return true; }
  }));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[3] O PDF COMPLETO: TODO GALGO, TODA LINHA');
// ═══════════════════════════════════════════════════════════════════════════

const pdfDe = new Function('return (' + (A.match(/function pdfCompletoDe\([\s\S]*?\n\}/) || [''])[0] + ');')();
const pc = pdfDe([{ trap: 3, nome: 'Roseville Chic', historico: nove }, { trap: 1, nome: 'Descartado', historico: [L(ROMFD)] }]);
t('todas as 9 linhas do galgo, nao 5', pc[0].historico.length === 9);
t('os dois galgos, inclusive o que o motor descartaria', pc.length === 2);
t('cada linha traz o que o card de dez colunas precisa',
  ['data', 'pista', 'dist', 'trap', 'split', 'bends', 'pos', 'remarks', 'classe', 'caltm']
    .every(function (c) { return c in pc[0].historico[0]; }));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[4] GRAVA NOS DOIS CAMINHOS, E NAO VIAJA ONDE NAO PRECISA');
// ═══════════════════════════════════════════════════════════════════════════

t('a coluna nova existe no banco', /ALTER TABLE races ADD COLUMN pdf_completo TEXT/.test(DB));
t('a analise devolve o pdfCompleto', /pdfCompleto: pdfCompletoDe\(galgos\),/.test(A));
t('a analise automatica do servidor grava',
  /const infoAuto = ins\.run\(sessionId,CANONICO/.test(A)
  && /UPDATE races SET pdf_completo=\? WHERE id=\?'\)\.run\(JSON\.stringify\(r\.pdfCompleto\), Number\(infoAuto\.lastInsertRowid\)\)/.test(A));
t('o POST /session do navegador grava',
  /if \(novoId && r\.pdfCompleto\) db\.prepare\('UPDATE races SET pdf_completo=\? WHERE id=\?'\)/.test(A));
t('a lista de corridas que a Analisar busca NAO leva o PDF completo',
  /races\.forEach\(r => \{ delete r\.pdf_completo; \}\);/.test(A));
t('a pagina do Historico NAO embute o PDF completo', /pdf_completo:undefined/.test(MAIN));
t('o sessionStorage da Analisar NAO guarda o PDF completo', /return k==='pdfCompleto'\?undefined:v;/.test(AP));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[5] A ROTA SOB DEMANDA');
// ═══════════════════════════════════════════════════════════════════════════

const iRota = ROBOT.indexOf("router.get('/pdf-completo/:id'");
t('a rota existe', iRota >= 0);
const rota = ROBOT.slice(iRota, ROBOT.indexOf('\n});', iRota));
t('exige usuario logado', /if \(!req\.user\) return res\.status\(401\)/.test(rota));
t('devolve o que ja esta gravado sem reler o PDF', /if \(row\.pdf_completo\)/.test(rota) && /fonte: 'banco'/.test(rota));
t('acha o PDF com a MESMA busca do reprocessamento', /encontrarPdfDaCorrida\(arquivos, formatTime\(row\.hora\), trackAbbr\)/.test(rota));
t('grava depois de ler, pra ler do disco uma vez so', /UPDATE races SET pdf_completo=\? WHERE id=\?/.test(rota));
t('NAO recalibra a paleta de traps', rota.indexOf('saveTrapBadgeColors') < 0);
t('sem PDF no disco, diz por que em vez de estourar', /os PDFs desse dia nao estao mais no servidor/.test(rota));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[6] A JANELA: TODOS OS GALGOS, AS MESMAS DEZ COLUNAS');
// ═══════════════════════════════════════════════════════════════════════════

function fn(nome) {
  const m = APP.match(new RegExp('^function\\s+' + nome + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm'));
  if (!m) throw new Error('sumiu do app.js: ' + nome);
  return m[0];
}
const doc = { els: {}, getElementById: function (id) {
  if (!this.els[id]) this.els[id] = { textContent: '', innerHTML: '', classList: { add: function () {}, contains: function () { return true; } } };
  return this.els[id];
} };
const ctx = { document: doc, console: console, Number: Number, String: String, Math: Math, parseFloat: parseFloat, parseInt: parseInt, JSON: JSON };
vm.createContext(ctx);
vm.runInContext(['_escPdf', 'buildDogCard', 'extrairRemarks', '_pintaPdfCompleto', 'corridaDisplay', 'getRaceClass']
  .map(function (n) { try { return fn(n); } catch (e) { return ''; } }).join('\n'), ctx);

const galgos = pdfDe([
  { trap: 3, nome: 'Roseville Chic', historico: CPARK.concat([ROMFD]).map(L) },
  { trap: 2, nome: 'Insane Drum', historico: CPARK.slice(0, 2).map(L) },
  { trap: 6, nome: 'Roseville Comet', historico: [L(CPARK[0])] },
  { trap: 1, nome: 'Kilara Ace', historico: [L(ROMFD), L(CPARK[1])] },
  { trap: 4, nome: 'Lenson Fox', historico: [L(CPARK[2])] },
  { trap: 5, nome: 'Fora De Tudo', historico: [L(CPARK[0])] }
]);
const corrida = {
  corrida: 'CPark A3', dist: '491', trackFull: 'Central Park',
  histAll: [{ trap: 3 }, { trap: 2 }, { trap: 6 }],
  eliminados: [{ trap: 1, motivo: '0 linha(s) na pista/distancia exata (min. 3)' },
               { trap: 4, motivo: 'Ret.inatividade (47d parado, 0/2 corridas pos-trial)' }]
};
ctx._pintaPdfCompleto(corrida, galgos);
const html = doc.els['val-body'].innerHTML;
const titulo = doc.els['val-title'].textContent;

t('os seis galgos aparecem (antes eram so os do calculo)', (html.match(/class="val-dog"/g) || []).length === 6);
// Conta so as linhas de corrida: cada card tem tambem o <tr> do cabecalho.
const linhasCorrida = (html.match(/<tr>/g) || []).length - (html.match(/<thead><tr>/g) || []).length;
t('todas as linhas aparecem (4+2+1+2+1+1 = 11)', linhasCorrida === 11);
t('inclusive a de outra pista e distancia (Romford 400m)', /Romfd/.test(html) && /400m/.test(html));
t('o descartado agora vem COM historico', /Kilara Ace[\s\S]*?<tbody><tr>/.test(html));
t('e com o motivo, como antes', /motivo: 0 linha\(s\) na pista\/distancia exata/.test(html));
t('a faixa DESCARTADOS DO CÁLCULO continua', html.indexOf('DESCARTADOS DO CÁLCULO') >= 0);
t('ordem de antes: calculo (3, 2, 6), depois o que o PDF trouxe a mais (5), depois os descartados',
  html.indexOf('Roseville Chic') < html.indexOf('Insane Drum')
  && html.indexOf('Insane Drum') < html.indexOf('Roseville Comet')
  && html.indexOf('Roseville Comet') < html.indexOf('Fora De Tudo')
  && html.indexOf('Fora De Tudo') < html.indexOf('DESCARTADOS')
  && html.indexOf('DESCARTADOS') < html.indexOf('Kilara Ace'));
t('titulo no mesmo formato: "4 no cálculo + 2 descartados"', /4 no cálculo \+ 2 descartados/.test(titulo));

// As colunas: exatamente as dez do anexo, nenhuma a mais.
const cab = (html.match(/<thead><tr>[\s\S]*?<\/tr><\/thead>/) || [''])[0];
const nomesCol = (cab.match(/<th[^>]*>([^<]*)<\/th>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); });
t('as mesmas dez colunas do anexo, na mesma ordem: ' + nomesCol.join(' '),
  nomesCol.join(',') === 'Date,Track,Dis,Trp,Split,Bends,Fin,Remarks,Grade,CalTm');
t('nenhuma coluna da primeira versao sobrou', !/WnrTm|Gng|Wght|Winner/.test(html));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[7] O CALTM AMARELO SO COMPARA A MESMA PROVA');
// ═══════════════════════════════════════════════════════════════════════════

const misto = [L(CPARK[0]), L(CPARK[2]), L(ROMFD)];
const comProva = ctx.buildDogCard(3, 'X', '', misto, true, { pista: 'CPark', dist: '491' });
t('com a prova, o amarelo vai no melhor de CPark 491m (29.69)', /color:#fbbf24"?>29\.69</.test(comProva));
t('e NAO no 24.30 de Romford 400m, que e outra prova', !/color:#fbbf24"?>24\.30</.test(comProva));
// Sem o 6o parametro o card faz o que sempre fez — e' assim que a disputa de
// dois galgos chama, e ela nao podia mudar.
const semProva = ctx.buildDogCard(3, 'X', '', misto, true);
t('sem a prova, o card se comporta como antes (menor da lista)', /color:#fbbf24"?>24\.30</.test(semProva));
const chamadas = (APP.match(/buildDogCard\([^;]*?\)/g) || []).filter(function (c) { return !/^buildDogCard\(trap,/.test(c); });
t('so a janela da corrida completa passa a prova',
  chamadas.filter(function (c) { return /, prova\)$/.test(c); }).length === 1);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[8] O RECORTE ANTIGO VIROU PLANO B, E SE ANUNCIA');
// ═══════════════════════════════════════════════════════════════════════════

t('o icone continua chamando openAllDogsModal', /onclick="openAllDogsModal\(/.test(APP));
t('existe o plano B', /function _abrirRecorteAntigo\(key, aviso\)/.test(APP));
t('e ele avisa que e recorte', /Não consegui o PDF completo desta corrida/.test(APP));
t('a busca nao pinta uma corrida por cima de outra', /_pdfPedidoAtual !== pedido/.test(AP));
t('o card de 15 colunas da primeira versao saiu', !/function buildDogCardCompleto/.test(APP) && !/\.vf-tbl\{/.test(APP));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
