'use strict';
// teste_relatorio_fonte.js — A LETRA DO RELATORIO DE ANALISE (Bruno, 19/09/2026)
//
// "consegue deixar o relatorio de analise do jeito que esta, porem aumentar
//  um pouquinho a fonte? pode ser do tamanho dessa que voce colocou no pdf"
//
// Cada font-size do relatorio virou var(--rel-*, TAMANHO_ANTIGO). No celular
// nenhuma variavel e' definida, entao vale o tamanho antigo; no computador o
// @media(min-width:769px) define os maiores. Este teste trava as duas pontas
// e mede num Chromium que a tabela maior nao passa da janela.
//
//   node teste_relatorio_fonte.js

const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
const MAINJS = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }
function bloco(n) { console.log('\n' + n + '\n'); }
function fn(nome) {
  const m = APP.match(new RegExp('^function\\s+' + nome + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm'));
  if (!m) throw new Error('sumiu do app.js: ' + nome);
  return m[0];
}
const REL = fn('buildRelatorioHtml');

bloco('[1] NO HTML: TODO TAMANHO E\' VARIAVEL, COM O ANTIGO DE RESERVA');
t('nenhum font-size fixo em px sobrou no relatorio', !/font-size:\d+px/.test(REL));
[['--rel-tit', 11], ['--rel-res', 13], ['--rel-txt', 12], ['--rel-tbl', 11], ['--rel-tag', 9]].forEach(function (p) {
  t('reserva do celular ' + p[0] + ' = ' + p[1] + 'px (o tamanho de antes)',
    new RegExp('var\\(' + p[0] + ',' + p[1] + 'px\\)').test(REL));
});

bloco('[2] NO CSS: OS TAMANHOS MAIORES SO NO COMPUTADOR');
const css = (APP.match(/vs\.textContent=`([\s\S]*?)`;/) || [])[1] || '';
t('as variaveis so existem dentro de @media(min-width:769px)',
  /@media\(min-width:769px\)\{\s*#val-body\{--rel-tit:12px;--rel-txt:14px;--rel-res:15px;--rel-tbl:14px;--rel-tag:11px\}/.test(css)
  && (css.match(/--rel-tbl:/g) || []).length === 1);
t('tabela em 14px, a mesma letra da janela do PDF', /--rel-tbl:14px/.test(css));
t('e sem o min-width:880px geral do main.js', /#val-body \.rel-tbl\{min-width:0\}/.test(css));

bloco('[3] A MEDIDA: NUM NAVEGADOR, COM O CSS DA PAGINA');
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
const medidas = [];
if (chromium) {
  medidas.push((async function () {
    const { designTokensCSS } = require('./src/utils/designTokens');
    const tabelaGeral = (MAINJS.match(/^table\{[^\r\n]*/m) || [''])[0];
    const thGeral = (MAINJS.match(/^th\{[^\r\n]*/m) || [''])[0];
    const js = ['buildRelatorioHtml', 'buildResumoHumanizado', '_fmtOdd'].map(fn).join('\n');
    // A corrida do print do Bruno: Thurles A4 9:00.
    const r = { tipo: 'avb', hora: '9:00', corrida: 'Thurles A4', trapFav: 1, trapUnd: 6, nameFav: 'Cabra Rambo', nameUnd: 'Mumbai Pickle (W)',
      pct: 95, nivel: 'media', eliminados: [{ trap: 4, motivo: '2 linha(s) na pista/distancia exata (min. 3)' }, { trap: 5, motivo: '0 linha(s) na pista/distancia exata (min. 3)' }],
      scores: [
        { trap: 2, nome: 'Giddyup Cash', score: 71.3, oddMedia: 3.5, scores: { caltm: 100, categoria: 70, bends: 80, split: 14, remarks: 27, sp: 60, brt: 100, postPick: 100 } },
        { trap: 1, nome: 'Cabra Rambo', score: 75.9, oddMedia: 3.5, scores: { caltm: 100, categoria: 60, bends: 80, split: 100, remarks: 7, sp: 50, brt: 82, postPick: 75 } },
        { trap: 6, nome: 'Mumbai Pickle (W)', score: 61.9, oddMedia: 2.56, scores: { caltm: 91, categoria: 70, bends: 25, split: 55, remarks: 8, sp: 59, brt: 92, postPick: 55 } },
        { trap: 3, nome: 'Monadreenspecial', score: 48.2, oddMedia: 5.5, scores: { caltm: 50, categoria: 70, bends: 25, split: 55, remarks: 20, sp: 50, brt: 60, postPick: 30 } }] };
    const pag = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}'
      + designTokensCSS() + tabelaGeral + thGeral + css + '#val-modal{display:flex}</style></head><body>'
      + '<div id="val-modal" class="open"><div id="val-box"><div id="val-hdr"><h3 id="val-title"></h3></div><div id="val-body"></div></div></div>'
      + '<script>' + js + '\ndocument.getElementById("val-body").innerHTML=buildRelatorioHtml(' + JSON.stringify(r) + ');</script></body></html>';
    const browser = await chromium.launch();
    try {
      for (const [w, h, tbl, th] of [[1536, 730, '14px', '11px'], [1366, 650, '14px', '11px'], [1920, 1080, '14px', '11px'], [390, 800, '11px', '9px']]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        await page.setContent(pag);
        const m = await page.evaluate(function () {
          const tb = document.querySelector('.rel-tbl');
          const box = document.getElementById('val-box');
          return { td: getComputedStyle(tb.querySelector('td')).fontSize, th: getComputedStyle(tb.querySelector('th')).fontSize,
            // Mede contra a margem do quadro (o pai da tabela), nao contra a
            // borda da janela: encostar na borda ja' e' passar da margem. Tudo
            // em px de CSS (scrollWidth/clientWidth): o getBoundingClientRect
            // vem encolhido pelo zoom .9 do app e nao compara com padding.
            lado: (function () { const p = tb.parentElement, cs = getComputedStyle(p);
              return tb.scrollWidth > p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; })() };
        });
        t(w + 'x' + h + ': tabela em ' + m.td + ' (esperado ' + tbl + '), cabecalho ' + m.th + ' (esperado ' + th + ')', m.td === tbl && m.th === th);
        if (w > 768) t(w + 'x' + h + ': a tabela maior nao passa da janela', !m.lado);
        await page.close();
      }
    } finally { await browser.close(); }
  })());
} else {
  console.log('  PULADO| playwright nao esta instalado aqui — a medida nao rodou');
}

Promise.all(medidas).catch(function (e) { t('medida no navegador: ' + e.message, false); }).then(function () {
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
});
