'use strict';
// medir_analisar_cel.js — MEDE, num navegador de verdade, se a tela Analisar
// redesenhada pro celular (Bruno, 20/09/2026) cabe na largura do aparelho:
//   1) o cabecalho da corrida numa linha (hora BR + hora UK + pista + selo)
//   2) a barra de baixo numa linha (Odd, Stake, Entrei, bandeirinha, 2 icones)
//   3) o cabecalho da lista (linha da sessao + Atualizar)
// Ferramenta de investigacao: usa o CSS REAL da pagina (o <style> do
// src/routes/main.js, com os tokens do designTokens) e o MESMO HTML que o
// src/app.js escreve.
//
//   node medir_analisar_cel.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { designTokensCSS } = require('./src/utils/designTokens');

const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
// As variaveis (--grn, --mut2, --sur2...) moram no shared.css, que a pagina
// carrega por <link>. Sem ele o texto fica preto no preto.
const SHARED = fs.readFileSync(path.join(__dirname, 'public', 'css', 'shared.css'), 'utf8');

// O <style> da pagina Analisar e' o que tem a .fp-inputs-row.
function cssDaPagina() {
  const re = /<style>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(MAIN))) {
    if (m[1].indexOf('.fp-inputs-row{') >= 0) return m[1];
  }
  return '';
}
let css = cssDaPagina();
if (!css) { console.error('nao achei o <style> da Analisar no main.js'); process.exit(1); }
// A pagina interpola ${designTokensCSS()} e mais nada que mude largura.
css = css.replace('${designTokensCSS()}', designTokensCSS());
css = css.replace(/\$\{[^}]*\}/g, '');

const LARGURAS = [360, 375, 390, 412, 430];

// Mesmo HTML que o app.js escreve (renderFocusPanel e renderRaceListPanel),
// com uma corrida de nome comprido de proposito: Sunderland e' das maiores.
const CORRIDA = { hbr: '16:52', uk: '3:44', track: 'Sunderland', classe: 'A3', dist: '480', pct: 95, nivel: 'alta' };

function html() {
  const titulo = '<span class="fp-so-cel">' + CORRIDA.hbr + ' BR / </span>' + CORRIDA.uk
    + '<span class="fp-so-cel"> UK</span> - ' + CORRIDA.track + ' (' + CORRIDA.classe + ') - ' + CORRIDA.dist + 'm';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${SHARED}${css}
    /* so pra medir: a coluna de foco existe sozinha nesta pagina */
    .focus-col{display:flex!important}
  </style></head><body>
  <div class="main focus-mode" id="main-layout" style="display:block">
    <div class="race-list-col" id="race-list-col">
      <div style="padding:8px 12px;border-bottom:1px solid var(--bdr2);display:flex;align-items:center;justify-content:space-between;background:var(--sur2)">
        <span style="min-width:0;overflow:hidden"><a class="st-m" href="#"><span id="st-m">20/09/2026 - 2 AvBs carregados</span></a></span>
        <button onclick="void 0" style="font-size:11px;background:none;border:none;color:var(--grn);cursor:pointer;padding:0">&#8635; Atualizar</button>
      </div>
      <div class="rc" style="display:flex;align-items:center;justify-content:space-between"><div style="flex:1;min-width:0"><div class="rc-time">16:52</div><div class="rc-name">Sunderland (A3)</div><div class="rc-meta">480m</div></div></div>
    </div>
    <div class="focus-col" id="focus-col">
      <div class="fp-hdr" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div class="fp-hdr-left" style="min-width:0"><div class="fp-race-title">${titulo}</div>
        <span class="fp-so-cel fp-badge-cel"><span class="badge ba">${CORRIDA.pct}% ${CORRIDA.nivel}</span></span>
        <div class="fp-race-meta">${CORRIDA.dist}m &middot; ${CORRIDA.hbr} BR &middot; <span class="badge ba">${CORRIDA.pct}% ${CORRIDA.nivel}</span></div></div>
        <div id="fp-odds-hdr" style="text-align:right;min-width:110px;flex-shrink:0"><div style="font-size:11px">T1xT3 &middot; 1.85</div></div>
      </div>
      <div class="fp-inputs-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--mut2);display:flex;align-items:center;gap:6px">Odd <input type="text" id="fp-odd" placeholder="-" value="1.85" style="width:52px;text-align:center"></span>
        <span style="font-size:11px;color:var(--mut2);display:flex;align-items:center;gap:6px">Stake <input type="text" id="fp-stake" placeholder="-" value="10" style="width:52px;text-align:center"></span>
        <button type="button" id="fp-entrei" style="font-size:11px;font-weight:700;padding:4px 14px;border-radius:5px;cursor:pointer;white-space:nowrap;background:transparent;border:1px solid #22c55e;color:#22c55e">Entrei !</button>
        <label style="display:none"><input type="checkbox" id="fp-avb-nao-aberto"></label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#eab308;white-space:nowrap"><input type="checkbox" id="fp-atrasada" style="cursor:pointer;margin:0"> \u{1F6A9}<span class="fp-atr-txt"> Atrasada</span></label>
        <a title="rel" style="cursor:pointer;line-height:1;margin-left:auto"><span style="display:inline-block;width:18px;height:18px;background:#444"></span></a>
        <a title="pdf" style="cursor:pointer;line-height:1"><span style="display:inline-block;width:18px;height:18px;background:#444"></span></a>
      </div>
    </div>
  </div></body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const w of LARGURAS) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    await page.setContent(html());
    const r = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const bar = q('.fp-inputs-row');
      const hdr = q('.fp-hdr');
      const lin = [];
      let ultimoTopo = null;
      bar.querySelectorAll(':scope > span, :scope > button, :scope > label, :scope > a').forEach(el => {
        const st = getComputedStyle(el);
        if (st.display === 'none') return;
        const b = el.getBoundingClientRect();
        if (ultimoTopo === null) ultimoTopo = b.top;
        lin.push({ t: (el.textContent || el.title || '').trim().slice(0, 12), x: Math.round(b.left), r: Math.round(b.right), top: Math.round(b.top) });
      });
      const tit = q('.fp-race-title');
      const meta = q('.fp-hdr .fp-race-meta');
      const st = q('.st-m');
      return {
        barW: Math.round(bar.getBoundingClientRect().width),
        barH: Math.round(bar.getBoundingClientRect().height),
        barScroll: bar.scrollWidth,
        hdrH: Math.round(hdr.getBoundingClientRect().height),
        titTxt: tit.textContent.replace(/\s+/g, ' ').trim(),
        titH: Math.round(tit.getBoundingClientRect().height),
        titR: Math.round(tit.getBoundingClientRect().right),
        metaVis: meta ? getComputedStyle(meta).display !== 'none' : null,
        stVis: st ? getComputedStyle(st).display !== 'none' : null,
        stW: st ? Math.round(st.getBoundingClientRect().width) : null,
        docScroll: document.documentElement.scrollWidth,
        itens: lin
      };
    });
    const linhas = new Set(r.itens.map(i => i.top)).size;
    console.log('\n== ' + w + 'px ==');
    console.log('  cabecalho: altura ' + r.hdrH + 'px | titulo ' + r.titH + 'px, termina em ' + r.titR + ' | segunda linha visivel: ' + r.metaVis);
    console.log('  titulo: "' + r.titTxt + '"');
    console.log('  sessao no cabecalho da lista: ' + r.stVis + ' (' + r.stW + 'px)');
    console.log('  barra: ' + r.barW + 'px, conteudo ' + r.barScroll + 'px, altura ' + r.barH + 'px, linhas ' + linhas
      + (r.barScroll > r.barW ? '  ESTOUROU em ' + (r.barScroll - r.barW) + 'px' : '  OK'));
    console.log('  pagina rola pro lado: ' + (r.docScroll > w ? 'SIM (' + r.docScroll + ')' : 'nao'));
    r.itens.forEach(i => console.log('    ' + String(i.x).padStart(4) + '-' + String(i.r).padStart(4) + '  top ' + i.top + '  ' + i.t));
    await page.close();
  }
  await browser.close();
})();
