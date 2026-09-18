'use strict';
// teste_card_celular.js — O "VER HISTORICO" CABE NA TELA DO CELULAR
//                         (Bruno, 18/09/2026)
//
// "no mobile queria que tudo se encaixasse na tela sem ter que jogar para o
//  lado. consegue validar se tirando as colunas TRACK e DIS e tambem
//  diminuindo o tamanho das colunas eu consigo encaixar?"
//
// Consegue — e foi medido antes de mexer, num navegador de verdade, com o CSS
// e o svCard() reais. O que rolava pro lado nao era a quantidade de colunas:
// era uma linha que MANDAVA a tabela ter 640px no celular
// (.sv-tbl{min-width:640px}) enquanto a largura util dentro do modal e a do
// aparelho menos 38px — 337px num aparelho de 375. Rolava em todos, de 360 a
// 430px. Sem essa linha, e sem Track e Dis, cabe em todos.
//
// ESTE ARQUIVO trava as regras que fazem caber. A MEDIDA em si (largura de
// cada coluna, em pixel, num Chromium) esta no bloco [4], que so roda onde o
// playwright existe — e avisa quando pula, em vez de fingir que conferiu.
//
//   node teste_card_celular.js

const fs = require('fs');
const path = require('path');

const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
const CARD = fs.readFileSync(path.join(__dirname, 'public', 'js', 'cardGalgo.js'), 'utf8');

function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const M = semComentarios(MAIN);
const C = semComentarios(CARD);

let ok = 0, fail = 0, pulados = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// O @media do modal, recortado por contagem de chaves.
function mediaModal() {
  // \r?\n: o main.js e CRLF, e procurar por \n cru aqui nunca casa.
  const mm = /@media\(max-width:768px\)\{\r?\n\s*#sv-modal/.exec(M);
  const ini = mm ? mm.index : -1;
  if (ini < 0) { console.error('ERRO: o @media do modal sumiu do main.js'); process.exit(1); }
  let i = M.indexOf('{', ini), n = 0;
  for (; i < M.length; i++) {
    if (M[i] === '{') n++;
    else if (M[i] === '}') { n--; if (!n) return M.slice(ini, i + 1); }
  }
  console.error('ERRO: nao consegui fechar o @media do modal'); process.exit(1);
}
const CEL = mediaModal();
const FORA = M.replace(CEL, '');

const COLUNAS = ['c-date', 'c-track', 'c-dis', 'c-trp', 'c-split', 'c-bends',
                 'c-fin', 'c-rem', 'c-grade', 'c-caltm'];

// ═══════════════════════════════════════════════════════════════════════════
bloco('[1] A LINHA QUE OBRIGAVA A ARRASTAR NAO EXISTE MAIS');
// ═══════════════════════════════════════════════════════════════════════════

t('a tabela nao tem mais largura minima de 640px', !/min-width:640px/.test(M));
t('o card nao rola mais na horizontal', !/\.sv-dog\{overflow-x:auto/.test(M));
t('a tabela passa a caber na largura da tela',
  /\.sv-tbl\{table-layout:auto;width:100%;min-width:0\}/.test(CEL));
// As larguras do <colgroup> foram desenhadas pra 10 colunas numa janela de
// 920px; deixadas de pe, elas empurram a tabela de volta pra fora da tela.
t('as larguras fixas do colgroup saem no celular', /\.sv-tbl col\{width:auto\}/.test(CEL));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[2] COLUNA SOME POR NOME, NUNCA POR POSICAO');
// ═══════════════════════════════════════════════════════════════════════════

t('nenhum nth-child escondendo coluna do card',
  !/\.sv-tbl[^{]*nth-child/.test(M));
t('Track e Dis somem pelo nome', /\.sv-tbl \.c-track,\.sv-tbl \.c-dis\{display:none\}/.test(CEL));

// O invariante de verdade: col, th e td tem que listar as MESMAS colunas na
// MESMA ordem. Se uma das tres listas andar sozinha, a largura de uma coluna
// vai parar noutra — e e' exatamente isso que um <colgroup> por posicao faz
// quando alguem acrescenta ou remove uma coluna.
// Le o atributo class inteiro e escolhe o token c-* dentro dele. A primeira
// versao tentava casar o nome direto no meio do atributo e so achava as
// celulas de UMA classe — meu regex errado reprovando codigo certo.
function nomes(trecho, tag) {
  const re = new RegExp('<' + tag + ' class="([^"]+)"', 'g');
  const out = []; let m;
  while ((m = re.exec(trecho))) {
    const c = m[1].split(/\s+/).filter(function (x) { return /^c-/.test(x); })[0];
    if (c) out.push(c);
  }
  return out;
}
const iniTbl = C.indexOf("+'<colgroup>'");
const cabec = C.slice(iniTbl, C.indexOf('</thead>', iniTbl));
const iniLinha = C.indexOf("return'<tr>'");
const linha = C.slice(iniLinha, C.indexOf("+'</tr>'", iniLinha));

const nCol = nomes(cabec, 'col'), nTh = nomes(cabec, 'th'), nTd = nomes(linha, 'td');
t('as dez colunas estao no <colgroup>: ' + nCol.length, nCol.join(',') === COLUNAS.join(','));
t('as dez colunas estao no cabecalho: ' + nTh.length, nTh.join(',') === COLUNAS.join(','));
t('as dez celulas da linha, na mesma ordem: ' + nTd.length, nTd.join(',') === COLUNAS.join(','));
// As classes de estilo que ja existiam nao podiam ser trocadas pelas novas:
// sao elas que dao a cor e o alinhamento de cada celula.
['sv-td-date c-date', 'sv-td-track c-track', 'sv-td-muted c-dis', 'sv-td-rem c-rem',
 'sv-bends c-bends', 'sv-caltm c-caltm'].forEach(function (par) {
  t('a celula manteve o estilo antigo ao ganhar o nome (' + par + ')', C.indexOf(par) >= 0);
});

// ═══════════════════════════════════════════════════════════════════════════
bloco('[3] O COMPUTADOR NAO MUDOU');
// ═══════════════════════════════════════════════════════════════════════════

t('Track e Dis continuam sendo montados pelo servidor',
  /<th class="c-track">Track<\/th>/.test(C) && /<th class="c-dis">Dis<\/th>/.test(C));
t('e o que os esconde so existe dentro do @media', !/\.c-track/.test(FORA));
t('a tabela grande continua com largura fixa por coluna',
  /\.sv-tbl\{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px\}/.test(M));
t('a fonte menor so vale no celular', !/\.sv-tbl th\{padding:4px 2px/.test(FORA));
t('o teto de 150px da Remarks continua valendo no computador',
  /\.sv-td-rem\{max-width:150px/.test(FORA) && /\.sv-td-rem\{max-width:none\}/.test(CEL));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[4] A MEDIDA, NUM NAVEGADOR DE VERDADE');
// ═══════════════════════════════════════════════════════════════════════════

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }

if (!chromium) {
  console.log('  PULADO| playwright nao esta instalado aqui — os blocos [1] a [3]');
  console.log('        | conferem as REGRAS; a largura em pixel nao foi medida nesta rodada.');
  pulados++;
  fim();
} else {
  medir().then(fim).catch(function (e) {
    console.log('  FALHA | nao consegui medir no navegador: ' + e.message);
    fail++; fim();
  });
}

async function medir() {
  const cssCard = (MAIN.match(/function cssCardGalgo\(\) \{\s*return `([\s\S]*?)`;\s*\}/) || [])[1];
  const cssModal = ['#sv-modal', '#sv-box', '#sv-hdr', '#sv-body', '.sv-dog', '.sv-tbl']
    .map(function (sel) {
      const re = new RegExp(sel.replace(/[.#]/g, '\\$&') + '\\{[^}]*\\}', 'g');
      return (MAIN.match(re) || []).join('\n');
    }).join('\n');

  // Historico de exemplo — a copia local do banco esta vazia, entao estas
  // linhas sao representativas do formato, nao dados do Bruno.
  const HIST = [
    { data: '12Sep26', pista: 'Hove', dist: '500', trap: 1, split: '3.68', bends: '3333', pos: 2, remarks: 'Crd1 SAw Led2', classe: 'A4', caltm: '29.85' },
    { data: '26Aug26', pista: 'Romfd', dist: '575', trap: 1, split: '3.69', bends: '5444', pos: 5, remarks: 'Bmp1 Crd2', classe: 'A3', caltm: '29.77' },
    { data: '08Aug26', pista: 'Hove', dist: '500', trap: 1, split: '3.56', bends: '1333', pos: 3, remarks: 'Led Crd RanOn', classe: 'A5', caltm: '29.68' }
  ];
  const pagina = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}'
    + "body{font-family:'Inter',system-ui,sans-serif}"
    + '.trap-badge{display:inline-flex;width:26px;height:26px}'
    + cssModal + '\n' + cssCard + '\n' + CEL + '\n#sv-modal{display:flex}</style></head><body>'
    + '<div id="sv-modal" class="open"><div id="sv-box"><div id="sv-hdr"><h3>Hove A4</h3></div>'
    + '<div id="sv-body"></div></div></div>'
    + '<script>' + CARD + '</script>'
    + '<script>document.getElementById("sv-body").innerHTML='
    + 'svCard(1,"Candolim Getaway","",' + JSON.stringify(HIST) + ');</script></body></html>';

  const browser = await chromium.launch();
  try {
    for (const w of [360, 375, 390, 414, 430]) {
      const page = await browser.newPage({ viewport: { width: w, height: 800 } });
      await page.setContent(pagina);
      const r = await page.evaluate(function () {
        const dog = document.querySelector('.sv-dog');
        const vis = [].slice.call(document.querySelectorAll('.sv-tbl thead th'))
          .filter(function (th) { return th.getBoundingClientRect().width > 0; });
        return {
          rola: dog.scrollWidth > dog.clientWidth + 1,
          util: Math.round(dog.clientWidth),
          precisa: Math.round(document.querySelector('.sv-tbl').scrollWidth),
          colunas: vis.map(function (th) { return th.textContent.trim(); })
        };
      });
      t('cabe em ' + w + 'px (util ' + r.util + ', tabela ' + r.precisa + ')', !r.rola);
      if (w === 375) {
        t('e sao oito colunas, sem Track e sem Dis: ' + r.colunas.join(' '),
          r.colunas.length === 8 && r.colunas.indexOf('Track') < 0 && r.colunas.indexOf('Dis') < 0);
      }
      await page.close();
    }
    // E no computador as dez continuam la.
    const pc = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await pc.setContent(pagina);
    const nPc = await pc.evaluate(function () {
      return [].slice.call(document.querySelectorAll('.sv-tbl thead th'))
        .filter(function (th) { return th.getBoundingClientRect().width > 0; }).length;
    });
    t('no computador continuam as dez colunas (' + nPc + ')', nPc === 10);
    await pc.close();
  } finally { await browser.close(); }
}

function fim() {
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail)
    : 'TUDO OK: ' + ok + ' verificacoes' + (pulados ? ' (bloco [4] pulado)' : '')) + '\n');
  process.exit(fail ? 1 : 0);
}
