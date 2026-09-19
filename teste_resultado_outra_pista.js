'use strict';
// teste_resultado_outra_pista.js — O ROBO DE RESULTADOS CONFERE OS GALGOS
//                                   (Bruno, 19/09/2026)
//
// "tem duas corridas em que o BATEU esta como aguarda, porem o RESULTADO ja
//  contem o replay... porque nao esta puxando a ordem de chegada?"
//
// O robo casava a pagina do Racing Post com a corrida SO PELO HORARIO. Com uma
// corrida nossa naquele horario, aceitava a pagina de OUTRA pista do mesmo
// horario, nao achava nenhum galgo, e gravava assim mesmo: replay da outra
// corrida + chegada vazia, as vezes por cima da chegada certa.
//
//   node teste_resultado_outra_pista.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const DBF = path.join(os.tmpdir(), 'teste_outra_pista_' + process.pid + '.db');
process.env.DB_PATH = DBF;
const _log = console.log; console.log = function () {};
const rr = require('./src/routes/resultsRobot');
console.log = _log;

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }
function bloco(n) { console.log('\n' + n + '\n'); }

// O card da Romford 7:42 do print (T5 Ashbury x T6 Blazeaway) e a chegada de
// uma corrida de OUTRA pista no mesmo horario.
const CARD_ROMFORD = JSON.stringify([
  { trap: 1, nome: 'Swift Hazel' }, { trap: 2, nome: 'Droopys Nora' }, { trap: 3, nome: 'Kilara Lass' },
  { trap: 4, nome: 'Ballymac Tom' }, { trap: 5, nome: 'Ashbury' }, { trap: 6, nome: 'Blazeaway' }]);
const CHEGADA_ROMFORD = [{ pos: 1, name: 'Blazeaway' }, { pos: 2, name: 'Kilara Lass' }, { pos: 3, name: 'Ashbury' },
  { pos: 4, name: 'Swift Hazel' }, { pos: 5, name: 'Ballymac Tom' }, { pos: 6, name: 'Droopys Nora' }];
const CHEGADA_OUTRA = [{ pos: 1, name: 'Riverside Rex' }, { pos: 2, name: 'Vivaro Warrior' }, { pos: 3, name: 'Goodnitekathleen' },
  { pos: 4, name: 'Priceless Romeo' }, { pos: 5, name: 'Oriental King' }, { pos: 6, name: 'Droopys Winsome' }];

bloco('[1] QUANTOS GALGOS DA PAGINA ESTAO NO CARD DA CORRIDA');
t('pagina certa: os 6 batem', rr.casamentoComCard(CHEGADA_ROMFORD, CARD_ROMFORD) === 6);
t('pagina de outra pista: nenhum bate', rr.casamentoComCard(CHEGADA_OUTRA, CARD_ROMFORD) === 0);
t('"Droopys" em comum nao basta: Droopys Winsome nao e\' Droopys Nora',
  rr.casamentoComCard([{ pos: 1, name: 'Droopys Winsome' }], CARD_ROMFORD) === 0);
t('sem card (sessao antiga) devolve null: nao da pra conferir, nao reprova', rr.casamentoComCard(CHEGADA_ROMFORD, null) === null);
t('card quebrado tambem e\' null', rr.casamentoComCard(CHEGADA_ROMFORD, '{nao e json') === null);
t('o minimo e\' 2 nomes (1 so pode ser coincidencia)', rr.MIN_CASAMENTO === 2);

bloco('[2] NO ROBO: CONFERE MESMO COM UM CANDIDATO SO, E NUNCA GRAVA VAZIO');
const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'resultsRobot.js'), 'utf8');
const miolo = (SRC.match(/var dbRace;[\s\S]*?\/\/ Extrair ordem de chegada por nome/) || [''])[0];
t('a escolha pelos nomes vem ANTES do "um candidato so = aceita"',
  miolo.indexOf('casamentoComCard(') >= 0 && miolo.indexOf('casamentoComCard(') < miolo.indexOf('candidates.length === 1'));
t('pagina que nao bate com nenhum card: pula sem gravar', /pagina de outra pista[\s\S]{0,200}continue;/.test(miolo));
const antesDoUpdate = SRC.slice(SRC.indexOf('const finishingOrderCompleto = [];'), SRC.indexOf('updateStmt.run('));
t('chegada e podio vazios: nao chega no UPDATE', /if \(!finishingOrderCompleto\.length && !r1 && !r2 && !r3\) \{[\s\S]*?continue;/.test(antesDoUpdate));

try { fs.unlinkSync(DBF); } catch (e) {}
console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
