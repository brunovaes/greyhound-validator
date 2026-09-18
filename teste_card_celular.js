'use strict';
// teste_card_celular.js — OS CARDS DE GALGO CABEM NA TELA DO CELULAR
//                         (Bruno, 18/09/2026)
//
// "no mobile queria que tudo se encaixasse na tela sem ter que jogar para o
//  lado. consegue validar se tirando as colunas TRACK e DIS e tambem
//  diminuindo o tamanho das colunas eu consigo encaixar?"
// e, logo depois: "consegue fazer a mesma coisa no botao analisar da tela
// Analisar?"
//
// SAO DOIS CARDS, e o mesmo desenho:
//   - o "ver historico" da tela Historico  -> svCard(),      classes .sv-*
//   - o botao "Analisar" da tela Analisar  -> buildDogCard(), classes .val-*
// Um teste so pra os dois de proposito: a pergunta e a mesma, e se um dia
// alguem mexer num e esquecer o outro, e' exatamente aqui que tem que doer.
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
// O src/app.js e servido como arquivo estatico pra tela Analisar (o main.js faz
// res.sendFile dele). E' onde vivem o buildDogCard e as classes .val-*.
const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');

function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const M = semComentarios(MAIN);
const C = semComentarios(CARD);
const A = semComentarios(APP);

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

// O modal do "Analisar" e' governado por DUAS camadas de CSS: o <style> que o
// app.js injeta em tempo de execucao, e o @media do main.js que sobrescreve
// parte dele com !important (o app.js injeta depois, entao sem !important o
// main.js perderia). As duas precisam concordar — foi justamente uma
// discordancia entre elas, 640 aqui e 560 la, que escondia qual numero valia.
function mediaDe(texto, marca) {
  const re = /@media\s*\(max-width:768px\)\s*\{/g;
  let m;
  while ((m = re.exec(texto))) {
    let n = 0, fim = -1;
    for (let k = texto.indexOf('{', m.index); k < texto.length; k++) {
      if (texto[k] === '{') n++;
      else if (texto[k] === '}') { n--; if (!n) { fim = k + 1; break; } }
    }
    const trecho = texto.slice(m.index, fim);
    if (trecho.indexOf(marca) >= 0) return trecho;
  }
  return '';
}
const VAL_APP = mediaDe(A, '.val-tbl');
const VAL_MAIN = mediaDe(M, '#val-modal');
if (!VAL_APP || !VAL_MAIN) {
  console.error('ERRO: nao achei os @media do card do Analisar');
  process.exit(1);
}
const VAL_APP_FORA = A.replace(VAL_APP, '');

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
bloco('[4] O CARD DO BOTAO "ANALISAR": A LARGURA MINIMA SAIU DOS DOIS LUGARES');
// ═══════════════════════════════════════════════════════════════════════════

// O 640 do app.js estava MORTO: o main.js sobrescrevia a mesma regra com
// min-width:560px!important, e era o 560 que valia. Regra morta contradizendo
// a viva e' como se mexe no numero errado e se conclui que a tela nao obedece.
t('o app.js nao pede mais 640px de largura minima', !/min-width:640px/.test(A));
t('o main.js nao impoe mais 560px', !/min-width:560px/.test(M));
t('no app.js a tabela passa a caber na tela',
  /\.val-tbl\{table-layout:auto;width:100%;min-width:0\}/.test(VAL_APP));
t('e o main.js manda a mesma coisa, sem contradizer',
  /\.val-tbl\{table-layout:auto!important;width:100%!important;min-width:0!important\}/.test(VAL_MAIN));
t('as larguras fixas do colgroup saem no celular', /\.val-tbl col\{width:auto\}/.test(VAL_APP));
t('o card do galgo nao rola mais sozinho', !/\.val-dog\{overflow-x:auto/.test(A));
// O card completo (os seis galgos) usa a MESMA tabela. Se ficasse de fora,
// metade da tela continuaria arrastando e a outra metade nao.
t('o card completo (val-compact) tambem perdeu a largura minima',
  /#val-body\.val-compact \.val-tbl\{min-width:0\}/.test(VAL_APP));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[5] O CARD DO "ANALISAR" TAMBEM ESCONDE POR NOME');
// ═══════════════════════════════════════════════════════════════════════════

t('Track e Dis somem pelo nome',
  /\.val-tbl \.c-track,\.val-tbl \.c-dis\{display:none\}/.test(VAL_APP));
t('nenhum nth-child escondendo coluna deste card', !/\.val-tbl[^{]*nth-child/.test(A));

const iniTblA = A.indexOf("+'<colgroup>'");
const cabecA = A.slice(iniTblA, A.indexOf('</thead>', iniTblA));
const iniLinhaA = A.indexOf("return'<tr>'", A.indexOf('function buildDogCard'));
const linhaA = A.slice(iniLinhaA, A.indexOf("+'</tr>'", iniLinhaA));
const aCol = nomes(cabecA, 'col'), aTh = nomes(cabecA, 'th'), aTd = nomes(linhaA, 'td');
t('as dez colunas no <colgroup>: ' + aCol.length, aCol.join(',') === COLUNAS.join(','));
t('as dez colunas no cabecalho: ' + aTh.length, aTh.join(',') === COLUNAS.join(','));
t('as dez celulas da linha, na mesma ordem: ' + aTd.length, aTd.join(',') === COLUNAS.join(','));
// As duas telas usam os MESMOS nomes de coluna. Nomes diferentes pra mesma
// coluna seriam duas linguagens pro mesmo desenho.
t('os nomes sao os mesmos das duas telas', aTd.join(',') === nTd.join(','));
['val-td-date c-date', 'val-td-track c-track', 'val-td-muted c-dis',
 'val-td-rem c-rem', 'val-td-bends c-bends', 'val-td-caltm c-caltm'].forEach(function (par) {
  t('a celula manteve o estilo antigo ao ganhar o nome (' + par + ')', A.indexOf(par) >= 0);
});

// ═══════════════════════════════════════════════════════════════════════════
bloco('[6] E O COMPUTADOR TAMBEM NAO MUDOU NA ANALISAR');
// ═══════════════════════════════════════════════════════════════════════════

t('Track e Dis continuam sendo montados',
  /<th class="c-track">Track<\/th>/.test(A) && /<th class="c-dis">Dis<\/th>/.test(A));
t('e o que os esconde so existe dentro do @media', !/\.c-track/.test(VAL_APP_FORA));
t('a tabela grande continua com largura fixa por coluna',
  /\.val-tbl\{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed/.test(A));
t('a fonte menor so vale no celular', !/\.val-tbl th\{padding:4px 2px/.test(VAL_APP_FORA));
t('o teto de 140px da Remarks continua valendo no computador',
  /\.val-td-rem\{[^}]*max-width:140px/.test(VAL_APP_FORA));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[7] A MEDIDA, NUM NAVEGADOR DE VERDADE');
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

    // ── E agora o card do botao "Analisar", nos seus dois modos ──────────
    const cssApp = (APP.match(/vs\.textContent=`([\s\S]*?)`;/) || [])[1];
    if (!cssApp) throw new Error('nao achei o CSS do val-modal no app.js');
    function fnApp(n) {
      const re = new RegExp('^function\\s+' + n + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm');
      const mm = APP.match(re);
      if (!mm) throw new Error('nao achei ' + n + ' no app.js');
      return mm[0];
    }
    const jsApp = fnApp('buildDogCard') + '\n' + fnApp('extrairRemarks');
    const valMediaMain = (MAIN.match(/@media\s*\(max-width:768px\)\s*\{/g) ? VAL_MAIN : '');

    const pagVal = function (compacto) {
      return '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<style>*{box-sizing:border-box;margin:0;padding:0}'
        + ":root{--font-body:'Inter',system-ui,sans-serif}"
        + 'body{font-family:var(--font-body)}'
        + '.trap-badge{display:inline-flex;border-radius:50%}'
        + cssApp + '\n' + valMediaMain + '</style></head><body>'
        + '<div id="val-modal" class="open"><div id="val-box">'
        + '<div id="val-hdr"><h3>Hove A4</h3></div>'
        + '<div id="val-body" class="' + (compacto ? 'val-compact' : '') + '"></div></div></div>'
        + '<script>' + jsApp + '</script>'
        + '<script>document.getElementById("val-body").innerHTML='
        + 'buildDogCard(1,"Candolim Getaway","",' + JSON.stringify(HIST) + ','
        + (compacto ? 'true' : 'false') + ');</script></body></html>';
    };

    for (const compacto of [false, true]) {
      const rot = compacto ? 'card completo' : 'Analisar disputa';
      for (const w of [360, 375, 390, 414, 430]) {
        const page = await browser.newPage({ viewport: { width: w, height: 800 } });
        await page.setContent(pagVal(compacto));
        const r = await page.evaluate(function () {
          const body = document.getElementById('val-body');
          const dog = document.querySelector('.val-dog');
          const vis = [].slice.call(document.querySelectorAll('.val-tbl thead th'))
            .filter(function (th) { return th.getBoundingClientRect().width > 0; });
          return {
            rola: body.scrollWidth > body.clientWidth + 1 || dog.scrollWidth > dog.clientWidth + 1,
            util: Math.round(body.clientWidth),
            precisa: Math.round(document.querySelector('.val-tbl').scrollWidth),
            colunas: vis.map(function (th) { return th.textContent.trim(); })
          };
        });
        t(rot + ' cabe em ' + w + 'px (util ' + r.util + ', tabela ' + r.precisa + ')', !r.rola);
        if (w === 375) {
          t(rot + ': oito colunas, sem Track e sem Dis',
            r.colunas.length === 8 && r.colunas.indexOf('Track') < 0 && r.colunas.indexOf('Dis') < 0);
        }
        await page.close();
      }
    }
    const pcVal = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await pcVal.setContent(pagVal(false));
    const nPcVal = await pcVal.evaluate(function () {
      return [].slice.call(document.querySelectorAll('.val-tbl thead th'))
        .filter(function (th) { return th.getBoundingClientRect().width > 0; }).length;
    });
    t('no computador o card do Analisar tambem segue com dez (' + nPcVal + ')', nPcVal === 10);
    await pcVal.close();
  } finally { await browser.close(); }
}

function fim() {
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail)
    : 'TUDO OK: ' + ok + ' verificacoes' + (pulados ? ' (bloco [4] pulado)' : '')) + '\n');
  process.exit(fail ? 1 : 0);
}
