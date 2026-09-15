'use strict';
// teste_par_sumido.js — o par que a BW tirou do ar sai da tela de disputa
//
// Por que existe: em 12/09 eu troquei o descarte por uma FUSAO no
// _gravarParesAbertos pra consertar a odd congelada. Resolveu a odd e criou
// isto: par que sumia do feed era reinserido pra sempre, sem nada marcando que
// tinha sumido, e o card ficava na tela ate a corrida largar (Bruno, 15/09).
//
// A regra nova compara o carimbo `visto` do par com o `capturado_em` da
// CORRIDA, nao com o relogio. O que este teste protege, mais do que o descarte
// em si, e o caso em que ele NAO pode acontecer: robo caido ou BW travada param
// o capturado_em junto, e ai nada pode sumir da tela. Cego nao e informado, e
// uma tela que se esvazia sozinha por falha de captura seria pior que o bug.
const path = require('path');
const fs = require('fs');
const cd = require(path.join(__dirname, 'src', 'utils', 'camadasDoDia'));
const { bateuPar } = require(path.join(__dirname, 'src', 'utils', 'avbResultado'));

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── fabricas, na mesma forma do teste_camadas_dia ───────────────────────────
const conf = (pick, outro, pct, tier) => ({
  pick_trap: pick, pick_nome: 'Galgo T' + pick,
  outro_trap: outro, outro_nome: 'Galgo T' + outro,
  pct: pct, tier: tier, ratio_sp: 1.1, split_dif: 0.05, caltm_dif: 0.2
});
const par = (a, b, visto) => {
  const p = { aTrap: a, bTrap: b, marketPct: 55, oddAvenceB: 1.7, oddBvenceA: 2.1 };
  if (visto != null) p.visto = visto;
  return p;
};
const TODOS = [conf(1, 2, 90, 'TOP'), conf(3, 4, 88, null), conf(5, 6, 85, 'REGULAR')];

const T0 = 1789500000000;               // relogio fixo: o teste nao depende do agora real
const rodar = (c) => cd.confrontosDaCorrida({
  todos: TODOS, lastSp: null, pares: c.pares,
  corrida: 'Monmr A7', hora: '5:57',
  parelhoAte: 60, difSpMax: 0, tetoInfo: 0, bateuPar,
  agora: c.agora != null ? c.agora : null,
  descartarSumidos: c.descartarSumidos === true,
  capturadoEm: c.capturadoEm || 0,
  janelaSumidoMs: c.janelaSumidoMs || 0
}).filter(x => x.camada !== 'OPORTUNIDADE');
const pares_ = (r) => r.map(x => x.par).sort().join(' ') || '(vazio)';

// ── [1] a constante ─────────────────────────────────────────────────────────
bloco('[1] A JANELA');
t('SUMIDO_MS e 30 segundos, como o Bruno escolheu', cd.SUMIDO_MS === 30000);

// ── [2] o descarte ──────────────────────────────────────────────────────────
bloco('[2] O PAR QUE SUMIU DO FEED SAI');

// 1x2 veio no feed agora; 3x4 nao vem ha 40s; 5x6 nao vem ha 10s.
const MISTO = [par(1, 2, T0), par(3, 4, T0 - 40000), par(5, 6, T0 - 10000)];

t('sem o descarte (Historico), os tres continuam',
  pares_(rodar({ pares: MISTO })) === 'T1xT2 T3xT4 T5xT6');

t('com o descarte, o que sumiu ha 40s sai e os outros ficam',
  pares_(rodar({ pares: MISTO, descartarSumidos: true, capturadoEm: T0 })) === 'T1xT2 T5xT6');

t('10s fora do feed ainda nao e sumico',
  rodar({ pares: MISTO, descartarSumidos: true, capturadoEm: T0 }).some(x => x.par === 'T5xT6'));

// ── [3] as bordas da janela ─────────────────────────────────────────────────
bloco('[3] AS BORDAS');

const soUm = (ms) => rodar({
  pares: [par(1, 2, T0), par(3, 4, T0 - ms)],
  descartarSumidos: true, capturadoEm: T0
}).some(x => x.par === 'T3xT4');

t('exatos 30s ainda FICA (a regra e "mais que", nao "a partir de")', soUm(30000) === true);
t('30s e 1ms SAI', soUm(30001) === false);
t('janela custom de 5s tambem vale',
  rodar({ pares: [par(1, 2, T0), par(3, 4, T0 - 6000)], descartarSumidos: true,
          capturadoEm: T0, janelaSumidoMs: 5000 }).some(x => x.par === 'T3xT4') === false);

// ── [4] O QUE NAO PODE SUMIR ────────────────────────────────────────────────
bloco('[4] CEGO NAO E INFORMADO — os casos em que NADA pode ser descartado');

t('par sem carimbo nunca e descartado (gravado antes desta versao)',
  pares_(rodar({ pares: [par(1, 2, null), par(3, 4, null), par(5, 6, null)],
                 descartarSumidos: true, capturadoEm: T0 })) === 'T1xT2 T3xT4 T5xT6');

t('carimbo antigo + capturado_em ANTIGO = robo parado -> ninguem sai',
  pares_(rodar({ pares: [par(1, 2, T0 - 600000), par(3, 4, T0 - 600000)],
                 descartarSumidos: true, capturadoEm: T0 - 600000 })) === 'T1xT2 T3xT4');

t('sem capturado_em, a referencia e o par mais recente do proprio feed',
  pares_(rodar({ pares: [par(1, 2, T0), par(3, 4, T0 - 40000)],
                 descartarSumidos: true, capturadoEm: 0 })) === 'T1xT2');

t('mercado FECHADO (nenhum par novo, capturado_em fresco) limpa a tela',
  pares_(rodar({ pares: [par(1, 2, T0 - 60000), par(3, 4, T0 - 60000)],
                 descartarSumidos: true, capturadoEm: T0 })) === '(vazio)');

t('e o mesmo cenario SEM o descarte mantem tudo (o Historico nao muda)',
  pares_(rodar({ pares: [par(1, 2, T0 - 60000), par(3, 4, T0 - 60000)],
                 capturadoEm: T0 })) === 'T1xT2 T3xT4');

// ── [5] as pontas no fonte ──────────────────────────────────────────────────
bloco('[5] AS PONTAS: quem carimba e quem liga o descarte');

const ROBOT = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
const LIVE = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'liveOddsRobot.js'), 'utf8');
const API = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'api.js'), 'utf8');

t('o captador carimba `visto` nos pares do feed atual',
  /const comVisto = \(info\.pares \|\| \[\]\)\.map\(p => Object\.assign\(\{\}, p, \{ visto: agoraMs \}\)\)/.test(ROBOT));
t('e a fusao continua guardando o par que sumiu (a odd do estudo nao se perde)',
  /for \(const velho of antigos\) if \(!novos\.has\(chave\(velho\)\)\) fundido\.push\(velho\)/.test(ROBOT));

t('o _onPairs nao exige mais pares: feed VAZIO tambem carimba a hora',
  /Array\.isArray\(snap\._avbsBrutos\)\) \{/.test(LIVE)
  && !/snap\._avbsBrutos && snap\._avbsBrutos\.length\) \{/.test(LIVE));

t('o painel-dia (tela ao vivo) liga o descarte',
  /descartarSumidos: true, capturadoEm: capturadoEmMs/.test(API));
t('e converte o capturado_em do SQLite pra ms com T e Z',
  /Date\.parse\(String\(abertoEm\)\.replace\(' ', 'T'\) \+ 'Z'\)/.test(API));

// O Historico NAO pode ligar o descarte. A chamada dele e a que passa agora:null.
const posHist = API.indexOf('agora: null');
const trechoHist = API.slice(Math.max(0, posHist - 900), posHist + 120);
t('a chamada do Historico (agora:null) NAO passa descartarSumidos',
  posHist > 0 && !/descartarSumidos/.test(trechoHist));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
