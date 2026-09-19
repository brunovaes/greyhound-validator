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
bloco('[6] A JANELA: SEIS GALGOS, DEZ COLUNAS, SEM DESCARTE, LETRA GRANDE');
// ═══════════════════════════════════════════════════════════════════════════

// "ta muito pequena a fonte... queria tudo na mesma tela... pode aumentar a
//  tela... e tirar as informacoes de descarte e motivos".
function fn(nome) {
  const m = APP.match(new RegExp('^function\\s+' + nome + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm'));
  if (!m) throw new Error('sumiu do app.js: ' + nome);
  return m[0];
}
function elemento() {
  const cls = {};
  return { textContent: '', innerHTML: '', classList: {
    add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; },
    contains: function (c) { return !!cls[c]; } }, _cls: cls };
}
const doc = { els: {}, getElementById: function (id) { return this.els[id] || (this.els[id] = elemento()); } };
const ctx = { document: doc, console: console, Number: Number, String: String, Math: Math, parseFloat: parseFloat, parseInt: parseInt, JSON: JSON };
vm.createContext(ctx);
vm.runInContext(['_escPdf', '_janelaGrande', 'buildDogCard', 'extrairRemarks', '_pintaPdfCompleto', 'closeValModal', 'corridaDisplay', 'getRaceClass']
  .map(function (n) { try { return fn(n); } catch (e) { return ''; } }).join('\n'), ctx);

// Chegam fora de ordem de proposito: a janela ordena por trap.
const galgos = pdfDe([6, 2, 5, 1, 4, 3].map(function (tp) {
  return { trap: tp, nome: 'Galgo ' + tp, historico: CPARK.concat([ROMFD, CPARK[0]]).slice(0, tp === 6 ? 5 : tp).map(L) };
}));
const corrida = { corrida: 'CPark A3', dist: '491', trackFull: 'Central Park',
  histAll: [{ trap: 3 }], eliminados: [{ trap: 1, motivo: 'qualquer coisa' }] };
doc.els['val-body'] = elemento(); doc.els['val-body'].classList.add('val-compact');
ctx._pintaPdfCompleto(corrida, galgos);
const html = doc.els['val-body'].innerHTML;
const titulo = doc.els['val-title'].textContent;

t('os seis galgos aparecem', (html.match(/class="val-dog"/g) || []).length === 6);
t('na ordem de trap, 1 a 6 (a ordem do PDF)',
  [1, 2, 3, 4, 5, 6].every(function (n, i, a) { return i === 0 || html.indexOf('Galgo ' + a[i - 1]) < html.indexOf('Galgo ' + n); }));
const linhasCorrida = (html.match(/<tr>/g) || []).length - (html.match(/<thead><tr>/g) || []).length;
t('todas as linhas: 1+2+3+4+5+5 = 20', linhasCorrida === 20);
t('inclusive a de outra pista (Romford 400m)', /Romfd/.test(html));
t('SEM a faixa de descartados', html.indexOf('DESCARTADOS') < 0);
t('SEM motivo', !/motivo:/.test(html) && html.indexOf('qualquer coisa') < 0);
t('titulo conta so os galgos: "6 galgos"', /· +6 galgos$/.test(titulo) && !/descartad/.test(titulo));
const cab = (html.match(/<thead><tr>[\s\S]*?<\/tr><\/thead>/) || [''])[0];
const nomesCol = (cab.match(/<th[^>]*>([^<]*)<\/th>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); });
t('as mesmas dez colunas, na mesma ordem: ' + nomesCol.join(' '),
  nomesCol.join(',') === 'Date,Track,Dis,Trp,Split,Bends,Fin,Remarks,Grade,CalTm');
t('os galgos vao numa grade', /^<div class="vf-grade">/.test(html));
t('a letra miuda (val-compact, 9px) saiu', !doc.els['val-body'].classList.contains('val-compact'));
t('a janela alarga', doc.els['val-box'].classList.contains('vf-grande'));
ctx.closeValModal();
t('e fechar devolve o tamanho de sempre (a disputa usa a mesma caixa)', !doc.els['val-box'].classList.contains('vf-grande'));
t('o plano B tambem volta ao tamanho normal', /function _abrirRecorteAntigo\(key, aviso\)\{\r?\n\s*\/\/[^\n]*\r?\n\s*_janelaGrande\(false\);/.test(APP));
t('remark inteiro: sem reticencias na janela', /\.vf-grade (\.val-tbl td)?\.val-td-rem\{[^}]*text-overflow:clip/.test(APP));
t('e ele so quebra depois de virgula', html.indexOf(',<wbr>') >= 0);
// "As colunas nao ficaram no mesmo tamanho" (19/09): com table-layout:auto
// cada card media as colunas pelo proprio texto e a tabela invadia o vizinho.
const CSSJ = semComentarios(APP);
t('a tabela da janela e\' de largura fixa (nao mede pelo texto)',
  /\.vf-grade \.val-tbl\{table-layout:fixed;width:100%;min-width:0\}/.test(CSSJ) && !/\.vf-grade \.val-tbl\{table-layout:auto/.test(CSSJ));
// "Reduzir todas as colunas... deixar meio que no automatico": as nove curtas
// com a largura do proprio conteudo, em px, iguais em todo card; o Remarks sem
// largura, ficando com o que sobra.
const px = ['date', 'track', 'dis', 'trp', 'split', 'bends', 'fin', 'grade', 'caltm'].map(function (c) {
  const m = CSSJ.match(new RegExp('\\.vf-grade \\.val-tbl col\\.c-' + c + '\\{width:(\\d+)px!important\\}'));
  return m ? Number(m[1]) : NaN;
});
t('as nove colunas curtas com largura justa, em px: ' + px.join('+'), px.every(isFinite) && px.every(function (x) { return x <= 70; }));
// Em tela larga (19/09): as larguras que o Bruno escolheu, coluna por coluna.
const larga = (CSSJ.match(/@media\(min-width:1560px\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
const BRUNO = { date: 100, track: 120, dis: 80, trp: 50, split: 80, bends: 70, fin: 25, grade: 50, caltm: 55 };
const lidas = Object.keys(BRUNO).map(function (c) {
  const m = larga.match(new RegExp('col\\.c-' + c + '\\{width:(\\d+)px!important\\}'));
  return m ? Number(m[1]) : NaN;
});
t('tela larga: as larguras do Bruno (' + lidas.join(',') + ')',
  Object.keys(BRUNO).every(function (c, k) { return lidas[k] === BRUNO[c]; }));
t('e o Remarks segue automatico nela', !/c-rem/.test(larga));
// "Tem que ficar com no maximo 140": teto da tabela = soma das nove + 140.
const soma = lidas.reduce(function (a, b) { return a + b; }, 0);
t('e com no maximo 140px: a tabela tem teto de ' + (soma + 140) + 'px',
  new RegExp('\\.vf-grade \\.val-tbl\\{max-width:' + (soma + 140) + 'px\\}').test(larga));
t('e o Remarks fica com o resto da linha', /\.vf-grade \.val-tbl col\.c-rem\{width:auto!important\}/.test(CSSJ));
t('um card nunca desenha por cima do vizinho', /\.vf-grade \.vf-cel\{overflow:hidden\}/.test(CSSJ));
t('celula que nao couber corta dentro dela, nao por cima do vizinho',
  /\.vf-grade \.val-tbl td\{[^}]*overflow:hidden/.test(CSSJ));
t('a letra desceu um ponto (15 -> 14) so no computador',
  /@media\(min-width:769px\)\{[\s\S]*?\.vf-grade \.val-tbl td\{font-size:14px/.test(CSSJ) && !/\.vf-grade \.val-tbl td\{font-size:15px/.test(CSSJ));
t('e a janela nao ganha barra pro lado', /#val-box\.vf-grande #val-body\{overflow-x:hidden\}/.test(CSSJ));
t('a tabela anula o min-width:880px geral do main.js', /\.vf-grade \.val-tbl\{table-layout:fixed;width:100%;min-width:0\}/.test(CSSJ));

// A MEDIDA: seis galgos de cinco linhas cabem numa tela so? Num Chromium de
// verdade, com o zoom .9 do app e dados como os do print do Bruno de 19/09
// (Hove A5): split vazio, bends "4-3-", linha de 285m, grade T3/D3/T, e os
// remarks compridos de verdade. O dado sintetico uniforme da primeira versao
// passou aqui e estourou na tela dele.
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
const medidas = [];
if (chromium) {
  medidas.push((async function () {
    const { designTokensCSS } = require('./src/utils/designTokens');
    // A regra GERAL de tabela do main.js ("table{...min-width:880px}") vale na
    // pagina de verdade. Sem ela aqui, a medida passava e a tela do Bruno
    // cortava o CalTm (19/09) — foi exatamente o que aconteceu.
    const MAINJS = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
    const tabelaGeral = (MAINJS.match(/^table\{[^\r\n]*/m) || [''])[0];
    if (!tabelaGeral) throw new Error('a regra geral table{} do main.js sumiu: rever esta medida');
    const css = tabelaGeral + (APP.match(/vs\.textContent=`([\s\S]*?)`;/) || [])[1];
    const js = ['_escPdf', '_janelaGrande', 'buildDogCard', 'extrairRemarks', '_pintaPdfCompleto', 'corridaDisplay', 'getRaceClass'].map(fn).join('\n');
    const REM = ['Rls-Mid,HitRls1,W&Blk4', 'SAw,EP,Crd1,Imp1/4', 'Mid,CrdRnUp&1&1/4', 'EP,Crd1&1/4&3&4', 'Blk1&1/4,Ld3-3/4',
      'QAw,Mid,ALd,HldOn', 'Mid,Crd&CkdW1', 'Rls-Mid,Eased&BdCrd1&1/4', 'MsdBrk,Crd1&3,RnOn'];
    const GR = ['A5', 'T3', 'D3', 'T2', 'T', 'A4', 'A6'];
    const NOMES = ['Sly Big Bird', 'Slingshot Coisty', 'Pips Gamble', 'Ballymac Rocketman', 'Swift Hazel Queen', 'Droopys Nightingale'];
    const seis = [1, 2, 3, 4, 5, 6].map(function (tp, i) {
      return { trap: tp, nome: NOMES[i], historico: [0, 1, 2, 3, 4].map(function (k) {
        const dist = (k + i) % 3 === 0 ? 285 : (k === 2 ? 695 : 500);
        return { data: (28 - k * 5) + (k % 2 ? 'Aug26' : 'Sep26'), pista: k === 3 ? 'Towcs' : 'Hove', dist: dist, trap: (k + tp) % 6 + 1,
          split: (k + i) % 4 === 0 ? '' : (4.1 + k / 10).toFixed(2), bends: dist === 285 ? '4-3-' : (k % 2 ? '1-1-' : '4444'),
          // Fin vem do PDF so com o numero ("2", "3"), sem "th".
          pos: String(((k + i) % 6) + 1), remarks: REM[(i * 2 + k) % REM.length], classe: GR[(k + i) % GR.length],
          caltm: dist === 285 ? 16.87 : (30.23 + k / 7).toFixed(2) };
      }) };
    });
    const pag = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}'
      + designTokensCSS() + '.trap-badge{display:inline-flex;border-radius:50%}' + css + '#val-modal{display:flex}</style></head><body>'
      + '<div id="val-modal" class="open"><div id="val-box"><div id="val-hdr"><h3 id="val-title"></h3></div><div id="val-body"></div></div></div>'
      + '<script>' + js + '\n_pintaPdfCompleto(' + JSON.stringify({ corrida: 'Hove A5', dist: '500', trackFull: 'Hove' }) + ',' + JSON.stringify(seis) + ');</script></body></html>';
    const browser = await chromium.launch();
    try {
      for (const [w, h] of [[1920, 1080], [1600, 900], [1600, 700], [1536, 864], [1366, 768], [1366, 650], [1280, 600]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        await page.setContent(pag);
        const r = await page.evaluate(function () {
          const body = document.getElementById('val-body');
          const dogs = [].slice.call(document.querySelectorAll('.val-dog'));
          const larg = dogs.map(function (d) {
            return [].slice.call(d.querySelectorAll('thead th')).map(function (th) { return Math.round(th.getBoundingClientRect().width); }).join(',');
          });
          return {
            rola: body.scrollHeight > body.clientHeight + 1,
            lado: body.scrollWidth > body.clientWidth + 1 || dogs.some(function (d) { return d.scrollWidth > d.clientWidth + 1; }),
            iguais: larg.every(function (x) { return x === larg[0]; }),
            cortados: [].slice.call(document.querySelectorAll('.vf-grade td,.vf-grade th')).filter(function (c) { return c.scrollWidth > c.clientWidth + 1; }).length
          };
        });
        t('6 galgos x 5 linhas cabem numa tela so em ' + w + 'x' + h + ', sem rolar pra baixo nem pro lado', !r.rola && !r.lado);
        t('  e as colunas tem a mesma largura nos seis cards', r.iguais);
        t('  e nenhum texto (nem o CalTm) fica cortado', r.cortados === 0);
        await page.close();
      }
    } finally { await browser.close(); }
  })());
} else {
  console.log('  PULADO| playwright nao esta instalado aqui — a medida de "cabe numa tela" nao rodou');
}

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
// Conta pela linha inteira da chamada: com Number(g.trap) dentro, um regex que
// para no primeiro ")" nao enxerga o fim da chamada.
t('so a janela da corrida completa passa a prova',
  (semComentarios(APP).match(/buildDogCard\([^\n]*, prova\)/g) || []).length === 1);
t('sem a prova o remark nao ganha quebra (a disputa nao muda)', semProva.indexOf('<wbr>') < 0);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[8] O RECORTE ANTIGO VIROU PLANO B, E SE ANUNCIA');
// ═══════════════════════════════════════════════════════════════════════════

t('o icone continua chamando openAllDogsModal', /onclick="openAllDogsModal\(/.test(APP));
t('existe o plano B', /function _abrirRecorteAntigo\(key, aviso\)/.test(APP));
t('e ele avisa que e recorte', /Não consegui o PDF completo desta corrida/.test(APP));
t('a busca nao pinta uma corrida por cima de outra', /_pdfPedidoAtual !== pedido/.test(AP));
t('o card de 15 colunas da primeira versao saiu', !/function buildDogCardCompleto/.test(APP) && !/\.vf-tbl\{/.test(APP));
t('e a faixa de descartados saiu da janela completa (so o plano B ainda tem)',
  (fn('_pintaPdfCompleto').indexOf('DESCARTADOS') < 0));

Promise.all(medidas).catch(function (e) { t('medida no navegador: ' + e.message, false); }).then(function () {
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
});
