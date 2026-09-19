'use strict';
// teste_pista_cabecalho.js — A PISTA DA CORRIDA VEM DO CABECALHO DO CARD
//                             (Bruno, 19/09/2026)
//
// O parser pegava a pista da primeira linha de historico do primeiro galgo:
// a pista onde ELE correu por ultimo. Em prova aberta e na Irlanda isso dava a
// pista errada — "Doncaster 7:24" virou "Monmr OR", "Shelbourne 8:03" virou
// "Nwbrdg A1", "Thurles 7:45" virou "Clnml ON2" — e o motor filtrava o
// historico pela pista errada. Agora a abreviacao sai do nome no cabecalho.
//
//   node teste_pista_cabecalho.js

const fs = require('fs');
const path = require('path');
const { abreviacaoPista, parseRacingPostPDF } = require('./src/utils/pdfParser');

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }

console.log('\n[1] OS CASOS DE 19/09: O PRIMEIRO GALGO TINHA CORRIDO EM OUTRA PISTA\n');
t('Doncaster com o 1o galgo vindo de Dunstall: Donc', abreviacaoPista('Doncaster', ['DunPk', 'DunPk', 'Donc', 'Donc', 'Donc']) === 'Donc');
t('Thurles com o 1o galgo vindo de Clonmel: Thurl', abreviacaoPista('Thurles', ['Clnml', 'Thurl']) === 'Thurl');
t('Shelbourne com o 1o galgo vindo de Newbridge: ShelPk (pela tabela)', abreviacaoPista('Shelbourne Park', ['Nwbrdg']) === 'ShelPk');
t('Central Park com o 1o galgo vindo de Hove: CPark', abreviacaoPista('Central Park', ['Hove']) === 'CPark');

console.log('\n[2] AS REGRAS\n');
t('o codigo do proprio card vale antes da tabela ("Romfd" em "Romford")', abreviacaoPista('Romford', ['Romfd']) === 'Romfd');
t('pista nova, fora da tabela: o codigo do card ("PBarr" em "Perry Barr")', abreviacaoPista('Perry Barr', ['PBarr', 'Romfd']) === 'PBarr');
t('letra inicial diferente nunca casa ("Hove" nao e\' Romford)', abreviacaoPista('Romford', ['Hove']) === 'Romfd');
t('sem historico e fora da tabela: 5 primeiras letras, como antes', abreviacaoPista('Nova Pista', []) === 'NovaP');
t('Thurles entrou na tabela de nomes', require('./src/utils/nomesPistas').NOMES_PISTAS.Thurl === 'Thurles');

const FIX = path.join(__dirname, 'tools', 'fixtures');
(async function () {
  console.log('\n[3] OS PDFs DE VERDADE\n');
  if (!fs.existsSync(path.join(FIX, '9.54PM_Dunstall.pdf'))) {
    console.log('  PULADO| faltam os PDFs de exemplo em tools/fixtures');
  } else {
    const _w = console.warn, _l = console.log; console.warn = function () {};
    const d = await parseRacingPostPDF(fs.readFileSync(path.join(FIX, '9.54PM_Dunstall.pdf')));
    const s = await parseRacingPostPDF(fs.readFileSync(path.join(FIX, '9.54PM_Shelbourne.pdf')));
    console.warn = _w;
    t('Dunstall Park 9:54 -> "DunPk OR3"', d && d.corrida === 'DunPk OR3');
    t('Shelbourne Park 9:54 -> "ShelPk OR"', s && s.corrida === 'ShelPk OR');
  }
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})();
