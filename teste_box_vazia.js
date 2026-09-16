'use strict';
// teste_box_vazia.js — A NOTA DIZ QUAL BOX ESTA VAZIA (Bruno, 16/09/2026)
//
// De onde veio: "percebi que a trap 1 esta vazia e nao foi avisado na tela
// analisar". O card GRAVADO sabia — 5 galgos, box 1 fora, final_check_status
// 'ok' — e mesmo assim a tela nao disse nada.
//
// EU ERREI O DIAGNOSTICO NA PRIMEIRA VEZ e este arquivo existe em parte pra
// isso nao se repetir. Eu li `flags.trapVazia: []` e concluí "o sistema nao
// sabe que a box esta vazia". Nao era isso: `trapVazia` nunca foi o grid de
// vazias, e a lista de boxes vazias VIZINHAS ao par analisado. A trap 1 estava
// vazia e o sistema sabia; ela so nao era vizinha de nenhum dos dois galgos do
// par, entao a nota nao tinha o que dizer.
//
// Bruno: "poderia so vir indicando qual a box esta vazia na corrida,
// independente de quem esta ao lado".
//
// O QUE ESTE TESTE PROTEGE:
//   1) que existe uma informacao de nivel CORRIDA, que nenhum par consegue
//      esconder — e' o furo original.
//   2) que a vantagem por adjacencia continua existindo e continua dizendo de
//      quem e' o lado.
//   3) que o AVISO nao virou NOTA: o `net` nao pode ter mudado. Mexer nisso
//      mudaria o percentual de todo AvB do sistema.
//
//   node teste_box_vazia.js

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'utils', 'reanaliseEngine.js'), 'utf8');
const re = require('./src/utils/reanaliseEngine');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── um galgo com historico suficiente pra o motor nao descartar ─────────────
// Corridas iguais dos dois lados: o que muda entre os cenarios e SO a lista de
// boxes vazias. Assim qualquer diferenca de percentual que aparecer vem dali, e
// nao de ruido do historico.
function linha(caltm, split, pos) {
  return {
    data: '2026-09-01', pista: 'Test', dist: '480', classe: 'A6',
    caltm: caltm, split: split, pos: pos, bends: 2, going: 0, obs: ''
  };
}
function galgo(trap, nome, caltm) {
  return {
    trap: trap, nome: nome, brtClasse: 'A6', ssnDate: null,
    historico: [linha(caltm, 3.9, 1), linha(caltm + 0.02, 3.9, 2), linha(caltm - 0.01, 3.9, 1),
                linha(caltm + 0.01, 3.9, 2), linha(caltm, 3.9, 3)]
  };
}

function avaliar(trapA, trapB, vazias) {
  return re.avaliarPar(
    galgo(trapA, 'Alfa', 29.50),
    galgo(trapB, 'Beta', 29.80),
    { classeCorrida: 'A6', trapsVazias: vazias, dataCorrida: '2026-09-16', trackCorrida: 'Test', distCorrida: '480' }
  );
}

// ── [1] O CASO DO BRUNO ─────────────────────────────────────────────────────
// Trap 1 vazia, par analisado T4 x T6. A box 1 nao e vizinha de nenhum dos dois.
bloco('[1] O CASO QUE ORIGINOU A ENTREGA: T1 VAZIA, PAR T4xT6');

let r = avaliar(4, 6, [1]);
t('o par nao foi descartado (senao o teste nao mede nada)', !r.descartar);
t('ANTES: nenhuma box vizinha ao par — era por isso que a tela calava',
  (r.flags.trapVaziaBox || []).length === 0);
t('AGORA a corrida carrega a box 1 assim mesmo',
  JSON.stringify(r.flags.boxesVaziasCorrida) === JSON.stringify([1]));
t('e a nota DIZ qual box esta vazia', /box vazia na corrida: 1/.test(r.obs));

// ── [2] nenhum par consegue esconder ────────────────────────────────────────
// E' a propriedade que fecha o furo: o aviso nao pode depender de quem foi
// analisado. Se um unico par calar, o defeito voltou.
bloco('[2] NENHUM PAR CONSEGUE ESCONDER A BOX VAZIA');

const pares = [[2, 3], [3, 4], [4, 5], [5, 6], [2, 6], [3, 6]];
let todosAvisam = true, algumComVizinha = false;
for (const [a, b] of pares) {
  const x = avaliar(a, b, [1]);
  if (x.descartar) continue;
  if (!/box vazia na corrida: 1/.test(x.obs)) todosAvisam = false;
  if ((x.flags.trapVaziaBox || []).length) algumComVizinha = true;
}
t('todos os pares possiveis avisam a box 1', todosAvisam);
t('mesmo os que TEM vizinha (T2 e vizinho do 1) — a informacao nao se anula',
  algumComVizinha);

// ── [3] a vantagem por adjacencia continua ──────────────────────────────────
bloco('[3] A VANTAGEM POR ADJACENCIA NAO FOI SUBSTITUIDA');

r = avaliar(2, 5, [1]);
t('box 1 colada no T2 continua sendo detectada',
  JSON.stringify(r.flags.vaziaBoxPorTrap[2] || []) === JSON.stringify([1]));
t('e a nota diz de quem e o lado', /ao lado do (favorito|rival) \(1\)/.test(r.obs));
t('junto com o fato da corrida', /box vazia na corrida: 1/.test(r.obs));

// ── [4] O PERCENTUAL NAO PODE TER MUDADO ────────────────────────────────────
// Esta e a assercao mais importante do arquivo. O pedido era de AVISO. Se o
// numero mudar, todo AvB do sistema mudou junto e ninguem pediu isso.
bloco('[4] O AVISO NAO VIROU NOTA: O PERCENTUAL E O MESMO');

const semVazia = avaliar(4, 6, []);
const comVaziaLonge = avaliar(4, 6, [1]);
t('T1 vazia LONGE do par nao mexe no percentual',
  semVazia.avaliacao === comVaziaLonge.avaliacao);
t('nem no favorito', semVazia.aTrap === comVaziaLonge.aTrap);

const comVaziaColada = avaliar(2, 5, [1]);
const semVazia25 = avaliar(2, 5, []);
t('mas box COLADA continua mexendo, como sempre mexeu',
  comVaziaColada.avaliacao !== semVazia25.avaliacao);

t('o flags novo nao entra na conta: nenhuma linha soma boxesVaziasCorrida ao net',
  !/net\s*[+-]?=[^;]*boxesVaziasCorrida/.test(SRC));
t('o bonus continua saindo so do adjVazia',
  (SRC.match(/net \+= sinal \* o\.bonusTrapVazia/g) || []).length === 1);

// ── [5] o campo e limpo e ordenado ──────────────────────────────────────────
bloco('[5] O CAMPO NAO PASSA LIXO PRA TELA');

r = avaliar(3, 4, [6, 1, 2]);
t('as boxes saem em ordem', JSON.stringify(r.flags.boxesVaziasCorrida) === JSON.stringify([1, 2, 6]));
t('e o plural aparece certo', /boxes vazias na corrida: 1,2,6/.test(r.obs));

r = avaliar(3, 4, []);
t('corrida cheia nao inventa aviso',
  r.flags.boxesVaziasCorrida.length === 0 && !/vazia na corrida/.test(r.obs));

r = avaliar(3, 4, [0, 9, null, 2]);
t('valor fora de 1..6 e descartado, nao vira box vazia',
  JSON.stringify(r.flags.boxesVaziasCorrida) === JSON.stringify([2]));

// ── [6] o GRITO saiu do captador ────────────────────────────────────────────
bloco('[6] O GRITO SAIU: UM SO AVISA NO CELULAR');

const SRC_ROBOT = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
t('o captador nao dispara mais push', !/_surpresaGritada/.test(SRC_ROBOT));
t('nem le alerta_forte', !/alerta_forte/.test(SRC_ROBOT));
t('nem chama o sender', !/sender\.enviarParaUsuario/.test(SRC_ROBOT));
t('e a gravacao dos pares abertos continua la — era so o grito que saiu',
  /INSERT INTO avb_abertos/.test(SRC_ROBOT));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
