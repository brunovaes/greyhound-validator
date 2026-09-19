'use strict';
// teste_odd_entrei.js — ODD DIGITADA NO HISTORICO MARCA O ENTREI DA LINHA
//                       (Bruno, 19/09/2026)
//
// A Hove A10 das 15:46 foi pra Banca com odd 1.45 e sem dupla ("-" x "-",
// Pendente): a odd tinha sido digitada no Historico sem o ENTREI, e so a odd
// era gravada. Sem saber em qual par voce entrou, a Banca nao resolvia.
// Agora digitar a odd numa linha marca o ENTREI dela pelo mesmo caminho do
// clique, que grava par + nomes + odd + bet_entrou num PUT so.
//
// Roda o codigo de verdade da tela num DOM minimo feito a mao.
//
//   node teste_odd_entrei.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }

// Os dois trechos da tela: o laco dos [data-f] e o handler do ENTREI.
const iLaco = MAIN.indexOf("document.querySelectorAll('table [data-f]').forEach(function(el){");
const fLaco = MAIN.indexOf('// ── CORRIGIR A CHEGADA', iLaco);
const iEnt = MAIN.indexOf("document.querySelectorAll('.entrei-chk').forEach(function(el){");
const fEnt = MAIN.indexOf('function closeSvModal()', iEnt);
if (iLaco < 0 || fLaco < 0 || iEnt < 0 || fEnt < 0) { console.error('ERRO: os trechos da tela mudaram de forma.'); process.exit(1); }
// Dentro do template literal, "\\n" e "\\'" viram "\n" e "'" no navegador.
const codigo = (MAIN.slice(iLaco, fLaco) + '\n' + MAIN.slice(iEnt, fEnt)).replace(/\\\\/g, '\\');

function elemento(attrs, extra) {
  const ev = {};
  return Object.assign({
    attrs: attrs, value: '', checked: false, disabled: true, type: 'text', style: {},
    getAttribute: function (k) { return this.attrs[k] != null ? String(this.attrs[k]) : null; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    addEventListener: function (n, f) { (ev[n] = ev[n] || []).push(f); },
    dispatchEvent: function (e) { (ev[e.type] || []).forEach(f => f.call(this, e)); },
    fire: function (n) { (ev[n] || []).forEach(f => f.call(this, { type: n })); },
    closest: function () { return { setAttribute: function () {}, classList: { toggle: function () {} } }; },
    classList: { toggle: function () {} }
  }, extra || {});
}

function montar(jaEntrou) {
  const odd = elemento({ 'data-id': '13007', 'data-f': 'odd', class: 'odd-inp' });
  const chk = elemento({ 'data-id': '13007', 'data-a': 5, 'data-b': 4, 'data-an': 'Airlie', 'data-bn': 'Yougo' }, { type: 'checkbox', checked: jaEntrou });
  const puts = [];
  const doc = {
    querySelectorAll: function (s) {
      if (s === 'table [data-f]') return [odd];
      if (s === '.entrei-chk') return [chk];
      if (s.indexOf('.hist-inp[data-id=') === 0) return [odd, chk];
      return [];
    },
    querySelector: function (s) {
      if (s.indexOf('.entrei-chk[data-id="13007"]') === 0) return chk;
      if (s.indexOf('.odd-inp[data-id="13007"]') === 0) return odd;
      return null;
    }
  };
  const ctx = {
    document: doc, JSON: JSON, Date: Date, Number: Number, console: console,
    Event: function (tipo) { this.type = tipo; },
    BASE: '/greyhound',
    ALL_RACES: [{ id: 13007 }],
    fetch: function (url, o) { puts.push({ url: url, corpo: JSON.parse(o.body) }); return { catch: function () {} }; },
    recalcKpisHist: function () {}
  };
  vm.createContext(ctx);
  // saveHistField / saveHistFields / setRowEdit / recomputeKPIs da propria tela
  const fns = ['saveHistField', 'saveHistFields', 'recomputeKPIs', 'setRowEdit'].map(function (n) {
    const m = MAIN.match(new RegExp('^function ' + n + '\\([^)]*\\)\\{[\\s\\S]*?^\\}', 'm'));
    return m ? m[0] : '';
  }).join('\n');
  vm.runInContext(fns + '\n' + codigo, ctx);
  return { odd: odd, chk: chk, puts: puts };
}

console.log('\n[1] DIGITOU A ODD E SAIU DO CAMPO: A LINHA VIRA ENTREI\n');
const a = montar(false);
a.odd.value = '1.45';
a.odd.fire('input');
a.odd.fire('blur');
const comPar = a.puts.find(function (p) { return p.corpo.avb_escolhido; });
const par = comPar ? JSON.parse(comPar.corpo.avb_escolhido) : {};
t('o ENTREI da linha ficou marcado', a.chk.checked === true);
t('gravou o par DA LINHA (T5 x T4), com os nomes', par.aTrap === 5 && par.bTrap === 4 && par.aNome === 'Airlie' && par.bNome === 'Yougo');
t('com a odd digitada', par.odd === '1.45');
t('e bet_entrou = 1, no mesmo PUT do par', comPar && comPar.corpo.bet_entrou === 1);

console.log('\n[2] O QUE NAO PODE MUDAR\n');
const b = montar(true);
b.odd.value = '1.50';
b.odd.fire('blur');
t('linha que ja tinha ENTREI: nao regrava o par', !b.puts.some(function (p) { return p.corpo.avb_escolhido; }));
const c = montar(false);
c.odd.value = '';
c.odd.fire('blur');
t('odd apagada: nao marca ENTREI nenhum', c.chk.checked === false && !c.puts.some(function (p) { return p.corpo.avb_escolhido; }));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
