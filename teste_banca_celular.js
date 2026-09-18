'use strict';
// teste_banca_celular.js — A BANCA CABE NA TELA DO CELULAR (Bruno, 18/09/2026)
//
// "consegue deixar tambem slim a tela de banca no mobile. o anexo esta
//  mostrando que quebra pro lado. podemos colocar HORA, CORRIDA, AVB (badge v
//  badge), STATUS e R$."
//
// MEDIDO ANTES de mexer, num navegador de verdade, com o <style> e o
// construtor de linha reais: a pagina pedia 872px em QUALQUER aparelho — a
// tabela de dez colunas sozinha precisava de 829. Dois culpados:
//   1) a tabela, com nome de galgo inteiro em duas colunas;
//   2) o min-width:320px da coluna do grafico, que com o respiro da pagina
//      passava de 390px sem a tabela nenhuma.
//
// Uma armadilha de CSS quase passou batido aqui, e por isso o bloco [4]
// existe: o @media do celular tinha sido escrito ANTES das regras que ele
// precisa vencer. Mesma especificidade, quem vem depois ganha — a coluna AvB
// simplesmente nao aparecia, sem erro nenhum, e a tela "cabia" mostrando
// quatro colunas em vez de cinco. So a medida no navegador acusou.
//
//   node teste_banca_celular.js

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'banca.js'), 'utf8');

function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const B = semComentarios(SRC);

let ok = 0, fail = 0, pulados = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

function mediaCelular() {
  const m = /@media\(max-width:768px\)\{/.exec(B);
  if (!m) { console.error('ERRO: o bloco do celular sumiu do banca.js'); process.exit(1); }
  let n = 0;
  for (let k = B.indexOf('{', m.index); k < B.length; k++) {
    if (B[k] === '{') n++;
    else if (B[k] === '}') { n--; if (!n) return { txt: B.slice(m.index, k + 1), pos: m.index }; }
  }
  console.error('ERRO: nao consegui fechar o bloco do celular'); process.exit(1);
}
const CEL = mediaCelular();
const FORA = B.replace(CEL.txt, '');

// HORA, CORRIDA, AvB, STATUS e R$ ficam. O resto some no celular.
const FICAM = ['bc-hora', 'bc-corrida', 'bc-avb', 'bc-status', 'bc-rs'];
const SOMEM = ['bc-fav', 'bc-und', 'bc-odd', 'bc-unid', 'bc-pct', 'bc-acoes'];
// A ordem do cabecalho: a AvB entra entre Corrida e Favorito, pra no celular a
// leitura sair na ordem que o Bruno pediu.
const ORDEM = ['bc-hora', 'bc-corrida', 'bc-avb', 'bc-fav', 'bc-und', 'bc-odd',
               'bc-unid', 'bc-status', 'bc-pct', 'bc-rs', 'bc-acoes'];

// ═══════════════════════════════════════════════════════════════════════════
bloco('[1] TODA COLUNA TEM NOME, E CABECALHO E CELULA BATEM');
// ═══════════════════════════════════════════════════════════════════════════

function nomes(trecho, tag) {
  const re = new RegExp('<' + tag + ' class="([^"]*)"', 'g');
  const out = []; let m;
  while ((m = re.exec(trecho))) {
    const c = m[1].split(/\s+/).filter(function (x) { return /^bc-/.test(x); })[0];
    if (c) out.push(c);
  }
  return out;
}
const iCab = B.indexOf('<table class="betstbl"><thead><tr><th class="bc-hora">');
const cabec = iCab < 0 ? '' : B.slice(iCab, B.indexOf('</thead>', iCab));
const iLin = B.indexOf("return '<tr'+dica+'>");
const linha = iLin < 0 ? '' : B.slice(iLin, B.indexOf("'</td></tr>';", iLin));

t('o cabecalho da tabela do dia foi encontrado', cabec.length > 200);
t('o construtor da linha foi encontrado', linha.length > 200);
t('as onze colunas do cabecalho, na ordem: ' + nomes(cabec, 'th').length,
  nomes(cabec, 'th').join(',') === ORDEM.join(','));
t('as onze celulas da linha, na mesma ordem: ' + nomes(linha, 'td').length,
  nomes(linha, 'td').join(',') === ORDEM.join(','));
// Status, %Gain/Loss e R$ ja carregavam classe de cor. O nome da coluna nao
// podia tomar o lugar dela — sem a cor, green e red ficam iguais.
t('o Status manteve a classe de cor', /class="bc-status '\+statusCls\+'"/.test(B));
t('o %Gain\/Loss manteve a classe de cor', /class="bc-pct '\+gainCls\+'"/.test(B));
t('o R\$ manteve a classe de cor', /class="bc-rs '\+gainCls\+'"/.test(B));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[2] O CELULAR MOSTRA AS CINCO QUE O BRUNO PEDIU');
// ═══════════════════════════════════════════════════════════════════════════

const somem = (CEL.txt.match(/\.bc-[^{]*\{display:none\}/g) || []).join('');
SOMEM.forEach(function (c) { t(c + ' some no celular', somem.indexOf('.' + c) >= 0); });
FICAM.forEach(function (c) { t(c + ' FICA no celular', somem.indexOf('.' + c) < 0); });
t('nenhum nth-child escondendo coluna da Banca', !/betstbl[^{]*nth-child/.test(B));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[3] A COLUNA AvB: DUAS BOLINHAS, DO PAR DA SUA APOSTA');
// ═══════════════════════════════════════════════════════════════════════════

t('a celula AvB existe sempre no HTML', /<td class="bc-avb">'\+avbCurto/.test(B));
t('no computador ela fica escondida', /\.bc-avb\{display:none\}/.test(FORA));
t('no celular ela aparece', /\.bc-avb\{display:table-cell\}/.test(CEL.txt));
// Os traps TEM que ser os mesmos que o galgo() usa. Se um lado viesse de
// trap_fav/trap_und (o par do motor), a tela pequena mostraria uma dupla e a
// grande outra — o defeito de 16/09 de volta, agora so no celular.
t('as bolinhas saem do par EFETIVO (trap_a e trap_b)',
  /bola\(a\.trap_a\)/.test(B) && /bola\(a\.trap_b\)/.test(B));
t('e o nome completo, no computador, sai dos mesmos traps',
  /galgo\(a\.trap_a, a\.name_fav\)/.test(B) && /galgo\(a\.trap_b, a\.name_und\)/.test(B));
t('sem trap conhecido nao inventa bolinha', /class="bnc-semtrap"/.test(B));
t('o separador e um v discreto', /<span class="bnc-avb-v">v<\/span>/.test(B));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[4] O BLOCO DO CELULAR VEM DEPOIS DAS REGRAS QUE ELE VENCE');
// ═══════════════════════════════════════════════════════════════════════════

// Foi exatamente isto que quase passou: escrito antes, o @media perdia por
// ordem e a coluna AvB nao aparecia — sem erro, sem log, so faltando na tela.
[['.bc-avb{display:none}', 'a regra que esconde a AvB no computador'],
 ['table.betstbl{width:100%', 'o tamanho base da tabela'],
 ['.bnc-eq{flex:1', 'a largura minima do grafico']].forEach(function (par) {
  const p = B.indexOf(par[0]);
  t('o @media vem depois de ' + par[1], p >= 0 && p < CEL.pos);
});
t('e nao ha um segundo @media de celular pra discordar deste',
  (B.match(/@media\(max-width:768px\)/g) || []).length === 1);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[5] O GRAFICO DEIXOU DE EXIGIR 320px POR ESTILO EMBUTIDO');
// ═══════════════════════════════════════════════════════════════════════════

// min-width dentro de style="" nao ha CSS que vença sem !important. Virou
// classe justamente pra o bloco do celular poder relaxar sem forca bruta.
t('nao sobrou min-width:320px em atributo style', !/style="[^"]*min-width:320px/.test(B));
t('a coluna do grafico virou classe', /\.bnc-eq\{flex:1;min-width:320px/.test(FORA));
t('e no celular ela relaxa', /\.bnc-eq\{min-width:0/.test(CEL.txt));
t('a linha do grafico tambem virou classe', /class="bnc-chartrow"/.test(B));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[6] O COMPUTADOR NAO MUDOU');
// ═══════════════════════════════════════════════════════════════════════════

t('Favorito e Desafiado continuam sendo montados',
  /<th class="bc-fav">Favorito<\/th>/.test(B) && /<th class="bc-und">Desafiado<\/th>/.test(B));
t('o lapis e a lixeira continuam na linha',
  /class="bnc-pencil"/.test(B) && /class="bnc-del"/.test(B));
t('e o que os esconde so existe dentro do @media', !/\.bc-acoes[^{]*\{display:none/.test(FORA));
t('a fonte menor so vale no celular', !/table\.betstbl\{font-size:10px\}/.test(FORA));
t('o respiro da pagina so encolhe no celular', !/\.content\{padding:12px 10px\}/.test(FORA));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[7] A MEDIDA, NUM NAVEGADOR DE VERDADE');
// ═══════════════════════════════════════════════════════════════════════════

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }

if (!chromium) {
  console.log('  PULADO| playwright nao esta instalado aqui — os blocos [1] a [6]');
  console.log('        | conferem as REGRAS; a largura em pixel nao foi medida.');
  pulados++;
  fim();
} else {
  medir().then(fim).catch(function (e) {
    console.log('  FALHA | nao consegui medir no navegador: ' + e.message);
    fail++; fim();
  });
}

async function medir() {
  const { designTokensCSS } = require('./src/utils/designTokens');

  // O <style> da propria tela — o que contem a tabela.
  let CSS = null;
  const re = /<style>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(SRC))) if (m[1].indexOf('table.betstbl') >= 0) CSS = m[1];
  if (!CSS) throw new Error('nao achei o <style> da Banca');
  CSS = CSS.replace('${designTokensCSS()}', designTokensCSS());

  // E o construtor da tabela, do <script> da propria tela.
  const ini = SRC.indexOf('tblEl.innerHTML = \'<table class="betstbl">');
  const marca = "'</tbody></table>';";
  const fimC = SRC.indexOf(marca, ini);
  if (ini < 0 || fimC < 0) throw new Error('nao achei o construtor da tabela');
  const CORPO = SRC.slice(ini, fimC + marca.length);

  // Apostas de exemplo: a copia local do banco esta vazia.
  const APOSTAS = [
    { id: 1, hora_br: '8:38', corrida: 'Mulgr A4', trap_a: 6, name_fav: 'No Comet (W)', trap_b: 4, name_und: 'Revilo Storm', odd: 1.72, bet_unidades: 2, status: 'green', ganhoPct: 1.44, ganhoReais: 14.4 },
    { id: 2, hora_br: '15:28', corrida: 'Notts A2', trap_a: 3, name_fav: 'Stud Muffin', trap_b: 5, name_und: 'Broomfield Ace', odd: 2.1, bet_unidades: 1.5, status: 'green', ganhoPct: 1.65, ganhoReais: 16.5, par_divergente: true },
    { id: 3, hora_br: '16:34', corrida: 'Harlow A7', trap_a: 0, name_fav: null, trap_b: 0, name_und: null, odd: 1.8, bet_unidades: 1, status: 'pendente', ganhoPct: null, ganhoReais: null, motivo_pendente: 'sem par registrado nesta aposta' }
  ];
  const tabela = new Function('d', '_at', 'fmtPct', 'fmtR$', 'ICONE_LIXO',
    'var tblEl = {};' + CORPO + 'return tblEl.innerHTML;')(
    { apostas: APOSTAS },
    function (v) { return String(v == null ? '' : v); },
    function (v) { return (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%'; },
    function (v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); },
    '<svg width="13" height="13"></svg>');

  const GRAF = '<div class="section"><div class="bnc-chartrow">'
    + '<div style="flex-shrink:0"><div style="width:180px;height:220px"></div></div>'
    + '<div class="bnc-eq"><svg viewBox="0 0 900 220" style="width:100%;height:220px"></svg></div>'
    + '</div></div>';
  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>' + CSS + '</style></head><body><div class="content">'
    + GRAF + '<div class="section"><div id="banca-table">' + tabela + '</div></div>'
    + '</div></body></html>';

  const browser = await chromium.launch();
  try {
    for (const w of [360, 375, 390, 414, 430]) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.setContent(html);
      const r = await page.evaluate(function () {
        const vis = [].slice.call(document.querySelectorAll('table.betstbl thead th'))
          .filter(function (th) { return th.getBoundingClientRect().width > 0; })
          .map(function (th) { return th.textContent.trim(); });
        return {
          pagina: Math.round(document.documentElement.scrollWidth),
          tela: document.documentElement.clientWidth,
          colunas: vis
        };
      });
      t('cabe em ' + w + 'px (pagina ' + r.pagina + ')', r.pagina <= r.tela + 1);
      if (w === 375) {
        t('e sao as cinco: ' + r.colunas.join(' '),
          r.colunas.join(',') === 'Hora,Corrida,AvB,Status,R$');
      }
      await page.close();
    }
    const pc = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await pc.setContent(html);
    const cPc = await pc.evaluate(function () {
      return [].slice.call(document.querySelectorAll('table.betstbl thead th'))
        .filter(function (th) { return th.getBoundingClientRect().width > 0; })
        .map(function (th) { return th.textContent.trim(); });
    });
    t('no computador seguem as dez de sempre, sem a AvB (' + cPc.length + ')',
      cPc.length === 10 && cPc.indexOf('AvB') < 0
      && cPc.indexOf('Favorito') >= 0 && cPc.indexOf('Desafiado') >= 0);
    await pc.close();
  } finally { await browser.close(); }
}

function fim() {
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail)
    : 'TUDO OK: ' + ok + ' verificacoes' + (pulados ? ' (bloco [7] pulado)' : '')) + '\n');
  process.exit(fail ? 1 : 0);
}
