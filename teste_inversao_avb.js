'use strict';
// teste_inversao_avb.js — INVERTER VIRA O CARD, NAO ENTRA NA APOSTA
// (Bruno, 15/09/2026)
//
// Historia curta: o botao de inverter so existia no card PRINCIPAL, e chamava
// escolherAvb(). Ou seja, trocar o sentido era ENTRAR: a tela fechava nos
// outros AvBs, a odd descia pro campo de baixo e o botao virava DESISTIR.
// Bruno: "quando clicar em inverter ainda fica na tela de disputa com a odd do
// avb invertido agora... nao e pra entrar".
//
// O QUE ESTE TESTE PROTEGE:
//   1) inverter NAO grava e NAO escolhe — so vira o card;
//   2) o card virado mostra o sentido certo, os nomes certos e os botoes com os
//      traps certos (era o risco real: clicar no 4v1 e apostar no 2v1);
//   3) a ODD e a do sentido desenhado, ou nenhuma. Nunca a do sentido oposto —
//      numero errado e silencioso e' o pior defeito possivel numa tela de
//      aposta;
//   4) o par JA escolhido nao e virado de novo (senao o card voltava sozinho
//      pro sentido do motor depois de voce entrar).
//
// Ele nao le o texto do arquivo procurando padrao: ARRANCA as funcoes do
// app.js e as EXECUTA. O defeito do item (4) so aparece rodando.
//
//   node teste_inversao_avb.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── extracao por contagem de chaves, como nas outras suites ─────────────────
function extrai(nome) {
  const ini = SRC.indexOf('function ' + nome + '(');
  if (ini < 0) return null;
  let i = SRC.indexOf('{', ini), nivel = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') nivel++;
    else if (SRC[i] === '}') { nivel--; if (!nivel) return SRC.slice(ini, i + 1); }
  }
  return null;
}

const ALVOS = ['_chaveParInv', '_avbInvertido', '_oddInvertida', '_cardAvb', 'inverterAvb'];
let corpo = '';
for (const n of ALVOS) {
  const f = extrai(n);
  if (!f) { console.error('ERRO: funcao ' + n + ' nao existe no app.js.'); process.exit(1); }
  corpo += f + '\n';
}

// Stubs: so o que o _cardAvb toca. Os gauges e as imagens nao importam aqui —
// o que importa e QUAL galgo caiu em qual lado.
const STUBS = `
  var results = [], focusRaceIdx = 0;
  var chamou = { escolher: 0, render: 0, salvou: 0, aplicouOdd: 0 };
  function getDogImg(tr){ return 'img' + tr; }
  function buildGauges(){ return '<g>'; }
  function getRaceClass(){ return 'A7'; }
  function _botaoApostar(){ return ''; }
  function _histDoTrap(r, tr){ return { trap: tr }; }
  function _nomeDoTrap(r, tr){ return 'T' + tr + '-motor'; }
  function saveSessionState(){ chamou.salvou++; }
  function renderFocusPanel(){ chamou.render++; }
  function escolherAvb(){ chamou.escolher++; }
  function _aplicarOdd(){ chamou.aplicouOdd++; }
  function _parOddAtual(){ return null; }
  function _confirmarNaTela(){ throw new Error('inverter nao pode mais abrir confirmacao de aposta'); }
`;

const ctx = { console: console, Object: Object, String: String, Number: Number, Math: Math };
vm.createContext(ctx);
vm.runInContext(STUBS + corpo
  + ';this._cardAvb=_cardAvb; this.inverterAvb=inverterAvb; this._avbInvertido=_avbInvertido;'
  + 'this._oddInvertida=_oddInvertida; this.chamou=chamou;'
  + 'this.setCorrida=function(r){ results=[r]; focusRaceIdx=0; };', ctx);

// ── a corrida de teste: o print do Bruno ────────────────────────────────────
// Card TOP: T4 Headford Astrid VENCE T1 Glory Bono, odd 1.5.
function novaCorrida(extra) {
  return Object.assign({
    id: 77, corrida: 'Star Pelaw A7', hora: '8:16',
    _avbsAoVivo: [{ aTrap: 4, bTrap: 1, oddAvenceB: 1.5, oddBvenceA: 2.4 }]
  }, extra || {});
}
const PAR_TOP = { aTrap: 4, bTrap: 1, aNome: 'Headford Astrid', bNome: 'Glory Bono', odd: 1.5 };
const OPTS_TOP = { rotulo: 'TOP', corRotulo: '#3b82f6', escolhido: null };

function dados(html) {
  const btn = html.match(/class="alt-entrar[^"]*"[^>]*data-a="(\d+)" data-b="(\d+)"/);
  const odd = html.match(/<span class="fp-card-odd"[^>]*>odd <strong>([^<]*)<\/strong>/);
  const nomes = [];
  const re = /class="fp-dog-name">([^<]*)</g;
  let m; while ((m = re.exec(html))) nomes.push(m[1]);
  return {
    html: html,
    a: btn ? btn[1] : null, b: btn ? btn[2] : null,
    esq: nomes[0], dir: nomes[1],
    odd: odd ? odd[1] : null,
    oddEscondida: /class="fp-card-odd"[^>]*style="display:none"/.test(html),
    temInvertido: html.indexOf('INVERTIDO') >= 0,
    temTop: html.indexOf('TOP') >= 0,
    temDataInv: /data-inv="1"/.test(html)
  };
}

// ── [1] o card normal ───────────────────────────────────────────────────────
bloco('[1] SEM INVERSAO, NADA MUDA');

let r = novaCorrida();
let d = dados(ctx._cardAvb(r, PAR_TOP, OPTS_TOP));
t('desenha T4 a esquerda e T1 a direita', d.esq === 'Headford Astrid' && d.dir === 'Glory Bono');
t('o botao Entrar leva 4 vence 1', d.a === '4' && d.b === '1');
t('a odd e a do sentido do motor (1.5)', d.odd === '1.5');
t('a etiqueta e so TOP', d.temTop && !d.temInvertido);

// ── [2] inverter NAO entra ──────────────────────────────────────────────────
bloco('[2] INVERTER NAO ESCOLHE, NAO GRAVA, NAO MEXE NA ODD DE BAIXO');

r = novaCorrida();
ctx.setCorrida(r);
ctx.chamou.escolher = 0; ctx.chamou.render = 0; ctx.chamou.salvou = 0; ctx.chamou.aplicouOdd = 0;
ctx.inverterAvb(4, 1);

t('marcou o par como invertido na CORRIDA (nao no DOM — o repinte de 75s apagaria)',
  r._avbInvertidos && r._avbInvertidos['1x4'] === true);
t('NAO chamou escolherAvb — era isto que colocava voce no estado de entrada',
  ctx.chamou.escolher === 0);
t('NAO mexeu no campo Odd de baixo (ele e da entrada, e voce nao entrou)',
  ctx.chamou.aplicouOdd === 0);
t('redesenhou a tela', ctx.chamou.render === 1);
t('e guardou o estado da sessao', ctx.chamou.salvou === 1);

// ── [3] o card virado ───────────────────────────────────────────────────────
bloco('[3] O CARD VIRADO MOSTRA O SENTIDO CERTO');

d = dados(ctx._cardAvb(r, PAR_TOP, OPTS_TOP));
t('agora T1 esta a esquerda e T4 a direita', d.esq === 'Glory Bono' && d.dir === 'Headford Astrid');
t('o botao Entrar leva 1 vence 4 — clicar no 4v1 nao pode apostar no 1v4 sem querer',
  d.a === '1' && d.b === '4');
t('o card avisa que esta INVERTIDO', d.temInvertido);
t('e a camada NAO some: TOP continua dizendo de onde o AvB veio', d.temTop);

// ── [4] A ODD ───────────────────────────────────────────────────────────────
bloco('[4] A ODD E A DO SENTIDO DESENHADO — OU NENHUMA');

t('usa o oddBvenceA do proprio par (2.4), nao o 1.5 do sentido oposto', d.odd === '2.4');
t('e marca o span pro ciclo de 5s nao reescrever com o sentido errado', d.temDataInv);

const semOutroLado = novaCorrida({ _avbsAoVivo: [{ aTrap: 4, bTrap: 1, oddAvenceB: 1.5 }] });
semOutroLado._avbInvertidos = { '1x4': true };
const dSem = dados(ctx._cardAvb(semOutroLado, PAR_TOP, OPTS_TOP));
t('sem odd pro sentido novo, a odd SOME', dSem.oddEscondida);
t('e em hipotese nenhuma mostra a do outro lado', dSem.html.indexOf('>1.5<') < 0);

// ── [5] O PAR JA ESCOLHIDO NAO VIRA DE NOVO ─────────────────────────────────
// Depois que voce entra, o _parEmFoco devolve o par NO SENTIDO ESCOLHIDO. Sem
// esta guarda o _cardAvb virava de novo e o card voltava sozinho pro sentido do
// motor — logo depois de voce ter apostado no contrario.
bloco('[5] DEPOIS DE ENTRAR, O CARD NAO DESANDA');

const escolhido = { a: 1, b: 4, odd: 2.4 };
const dEsc = dados(ctx._cardAvb(r,
  { aTrap: 1, bTrap: 4, aNome: 'Glory Bono', bNome: 'Headford Astrid', odd: 2.4 },
  { rotulo: 'SEU AvB', corRotulo: '#1d4ed8', escolhido: escolhido }));
t('continua T1 vence T4, e nao volta pro 4v1', dEsc.esq === 'Glory Bono' && dEsc.dir === 'Headford Astrid');
t('os botoes seguem no sentido apostado', dEsc.a === '1' && dEsc.b === '4');

// ── [6] desfazer ────────────────────────────────────────────────────────────
bloco('[6] O MESMO CLIQUE DESFAZ');

ctx.setCorrida(r);
ctx.inverterAvb(4, 1);
t('clicar de novo tira a marca', !r._avbInvertidos['1x4']);
t('e a chave some do objeto em vez de virar false (o sessionStorage nao acumula)',
  !('1x4' in r._avbInvertidos));
const dVolta = dados(ctx._cardAvb(r, PAR_TOP, OPTS_TOP));
t('o card volta pro sentido do motor', dVolta.esq === 'Headford Astrid' && dVolta.dir === 'Glory Bono');
t('com a odd do motor de volta', dVolta.odd === '1.5');
t('e sem o selo INVERTIDO', !dVolta.temInvertido);

// ── [7] a chave e sem direcao ───────────────────────────────────────────────
bloco('[7] A MARCA E DO PAR, NAO DO SENTIDO');

ctx.setCorrida(r);
ctx.inverterAvb(1, 4);       // clicado a partir do card ja virado
t('inverter por 1,4 mexe na MESMA chave que 4,1', r._avbInvertidos['1x4'] === true);
t('nao nasce uma segunda chave 4x1', !('4x1' in r._avbInvertidos));

// ── [8] a confirmacao saiu, e de proposito ──────────────────────────────────
// O texto dela dizia "isso muda a aposta: o resultado, o Historico e a Banca
// passam a contar por esse sentido". Deixou de ser verdade — nada e gravado
// aqui. O stub de _confirmarNaTela estoura se alguem voltar a chama-la.
bloco('[8] SEM CAIXA DE CONFIRMACAO (ela dizia que gravava, e nao grava mais)');
let estourou = null;
try { ctx.setCorrida(r); ctx.inverterAvb(4, 1); } catch (e) { estourou = e; }
t('inverter nao abre mais o dialogo de "isso muda a aposta"', !estourou);

// ── [9] a ponta que registra ────────────────────────────────────────────────
bloco('[9] ENTRAR NUM CARD VIRADO REGISTRA COMO INVERSAO');
t('o clique do Entrar le o sentido do card e marca a origem',
  /_avbInvertido\(r, _ea, _eb\) \? 'inversao' : 'bw'/.test(SRC));
t('e o botao de inverter existe em TODO card, com os traps dele',
  /onclick="inverterAvb\(' \+ ta \+ ',' \+ tb \+ '\)"/.test(SRC));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
