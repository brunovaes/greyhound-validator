'use strict';
// teste_bateu_fonte_unica.js
//
// Rede da correcao de 03/09/2026: a coluna races.bateu nao pode discordar do
// bateuPar. Antes, quem GRAVA a coluna chutava quando nao achava um dos dois
// galgos na chegada:
//
//   resultsRobot : bateu = 'nao' por default; 'sim' se o fav ficou no top3
//   robot.js     : mesma heuristica dentro do recalcularBateu, e 'nao' no fim
//
// O bateuPar, no MESMO caso, devolve null (indefinido). Resultado: linha em que
// o banco dizia "sim" e a tela do Historico dizia "-", com os KPIs globais
// (main.js:514 e main.js:1845) lendo a coluna crua.
//
// Roda contra o codigo REAL: importa o avbResultado e EXTRAI o recalcularBateu
// do robot.js por texto (requerer o robot.js inteiro subiria os crons).
//
//   node teste_bateu_fonte_unica.js

const fs   = require('fs');
const path = require('path');
const os   = require('os');
// Em 03/09/2026 o recalcularBateu saiu do robot.js e veio pra ca, junto do
// bateuPar: com tres consumidores (robo, script e rota) uma copia divergente era
// questao de tempo. O teste deixou de extrair a funcao por texto e passou a
// importar, que e o que a mudanca permitiu.
const { bateuPar, vereditoAvB, recalcularBateu, motivoDoRecalculo } = require('./src/utils/avbResultado');
const { planejar, aplicar, contar } = require('./src/utils/recalcBateuDia');

let falhas = 0, testes = 0;
function ok(nome, real, esperado) {
  testes++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) { falhas++; console.log('  FALHOU  ' + nome + '\n            esperado: ' + JSON.stringify(esperado) + '\n            recebeu:  ' + JSON.stringify(real)); }
  else console.log('  ok      ' + nome);
}

// chegada de exemplo: T3 ganhou, T1 em 2o, T5 em 3o, T2 em 4o. T4 e T6 nao constam.
const CHEGADA = JSON.stringify([{ pos: 1, trap: 3 }, { pos: 2, trap: 1 }, { pos: 3, trap: 5 }, { pos: 4, trap: 2 }]);

console.log('\n1) vereditoAvB concorda com bateuPar sempre que o bateuPar decide');
ok('T3 x T1 (1o x 2o) -> sim', vereditoAvB(CHEGADA, 3, 1, 99, 99), 'sim');
ok('T1 x T3 (2o x 1o) -> nao', vereditoAvB(CHEGADA, 1, 3, 99, 99), 'nao');
ok('T2 x T5 (4o x 3o) -> nao', vereditoAvB(CHEGADA, 2, 5, 99, 99), 'nao');
ok('bateuPar concorda em T3xT1', bateuPar(CHEGADA, 3, 1), true);
ok('bateuPar concorda em T1xT3', bateuPar(CHEGADA, 1, 3), false);

console.log('\n2) O CHUTE MORREU: um so galgo achado nao decide nada');
// era exatamente aqui que o resultsRobot gravava 'sim' (fav no top3, und sumido)
ok('fav 1o, und fora da chegada -> indefinido', vereditoAvB(CHEGADA, 3, 4, 1, 99), '');
ok('fav 4o, und fora da chegada -> indefinido', vereditoAvB(CHEGADA, 2, 6, 4, 99), '');
ok('nenhum dos dois na chegada  -> indefinido', vereditoAvB(CHEGADA, 4, 6, 99, 99), '');
ok('e o bateuPar diz a mesma coisa (null)', bateuPar(CHEGADA, 3, 4), null);

console.log('\n3) Fallback por NOME so vale com os DOIS achados');
// chegada sem os traps (nameToTrap falhou), mas o casamento por nome pegou os dois
ok('sem chegada, nomes 2 e 5 -> sim', vereditoAvB('[]', 4, 6, 2, 5), 'sim');
ok('sem chegada, nomes 5 e 2 -> nao', vereditoAvB('[]', 4, 6, 5, 2), 'nao');
ok('sem chegada, so o fav por nome -> indefinido', vereditoAvB('[]', 4, 6, 1, 99), '');
ok('sem chegada, nenhum por nome -> indefinido', vereditoAvB(null, 4, 6, 99, 99), '');
ok('a chegada tem prioridade sobre o nome', vereditoAvB(CHEGADA, 1, 3, 1, 99), 'nao');

console.log('\n4) recalcularBateu (robot.js) segue a mesma regra');
ok('sem resultado_1 -> null (COALESCE preserva)', recalcularBateu(null, null, null, 3, 1, CHEGADA), null);
ok('chegada completa T3xT1 -> sim', recalcularBateu('3', '1', '5', 3, 1, CHEGADA), 'sim');
ok('chegada completa T1xT3 -> nao', recalcularBateu('3', '1', '5', 1, 3, CHEGADA), 'nao');
ok('sem chegada, os dois no top3 -> sim', recalcularBateu('3', '1', '5', 3, 5, null), 'sim');
ok('sem chegada, os dois no top3 -> nao', recalcularBateu('3', '1', '5', 5, 1, null), 'nao');
// o caso do chute antigo: fav no top3, und fora -> era 'sim', agora e indefinido
ok('sem chegada, fav no top3 e und fora -> indefinido', recalcularBateu('3', '1', '5', 3, 6, null), '');
ok('sem chegada, nenhum no top3 -> indefinido (era nao)', recalcularBateu('3', '1', '5', 4, 6, null), '');
ok('chegada vence o top3 quando os dois estao nela', recalcularBateu('3', '1', '5', 2, 5, CHEGADA), 'nao');

console.log('\n5) Indefinido nunca vira derrota, e nunca entra na taxa');
// a taxa dos KPIs filtra por bateu IS NOT NULL AND bateu != ''
const gravados = [
  vereditoAvB(CHEGADA, 3, 1, 99, 99),   // sim
  vereditoAvB(CHEGADA, 1, 3, 99, 99),   // nao
  vereditoAvB(CHEGADA, 3, 4, 1, 99),    // indefinido (antes: 'sim')
  recalcularBateu('3', '1', '5', 4, 6, null) // indefinido (antes: 'nao')
];
const contam  = gravados.filter(v => v !== null && v !== '');
const acertos = gravados.filter(v => v === 'sim').length;
ok('so 2 das 4 linhas contam', contam.length, 2);
ok('taxa = 1/2 = 50%', Math.round(acertos / contam.length * 100), 50);
ok('nenhum indefinido virou nao', gravados.filter(v => v === 'nao').length, 1);

console.log('\n6) O resultsRobot nao tem mais heuristica no fonte');
const rr = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'resultsRobot.js'), 'utf8');
const rb = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
// so o codigo, sem os comentarios que EXPLICAM a heuristica removida
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
ok('resultsRobot sem "posFav <= 3"', /posFav\s*<=\s*3/.test(semComentarios(rr)), false);
ok('robot.js sem "posFav <= 3"', /posFav\s*<=\s*3/.test(semComentarios(rb)), false);
ok('resultsRobot importa o vereditoAvB', /require\(['"]\.\.\/utils\/avbResultado['"]\)/.test(rr), true);
ok('resultsRobot grava o retorno do vereditoAvB', /const bateu = vereditoAvB\(/.test(rr), true);
ok('robot.js nao tem mais copia do recalcularBateu', /function recalcularBateu\(/.test(rb), false);

console.log('\n7) O motivo explica a linha, nao so o veredito');
const mChegada = motivoDoRecalculo('3', '1', '5', 3, 1, CHEGADA);
ok('fonte = chegada', mChegada.fonte, 'chegada');
ok('posicoes vem preenchidas', [mChegada.pos_fav, mChegada.pos_und], [1, 2]);
const mTop3 = motivoDoRecalculo('3', '1', '5', 3, 5, null);
ok('sem chegada, cai no top3', mTop3.fonte, 'top3');
const mNada = motivoDoRecalculo('3', '1', '5', 3, 4, CHEGADA);
ok('so um localizado -> fonte nenhuma', mNada.fonte, 'nenhuma');
ok('e o texto diz qual foi achado', /T3 1o, T4 fora da chegada/.test(mNada.texto), true);
// o texto nao pode mentir: "so um dos dois" quando nenhum foi achado e falso
ok('so um achado -> diz "so um dos dois"', /so um dos dois localizado/.test(mNada.texto), true);
const mNenhum = motivoDoRecalculo('3', '1', '5', 4, 6, null);
ok('nenhum achado -> diz "nenhum dos dois"', /nenhum dos dois localizado/.test(mNenhum.texto), true);
ok('nenhum achado nao diz "so um"', /so um dos dois/.test(mNenhum.texto), false);
ok('sem resultado tem motivo proprio', motivoDoRecalculo(null, null, null, 3, 1, CHEGADA).fonte, 'sem_resultado');

console.log('\n8) planejar() e so-leitura; aplicar() e a unica que grava');
// banco de verdade, em arquivo temporario: nada de simular o SQLite
const Database = require('./node_modules/better-sqlite3');
const tmp = path.join(os.tmpdir(), 'teste_bateu_' + process.pid + '.db');
try { fs.unlinkSync(tmp); } catch (e) {}
const db = new Database(tmp);
db.exec('CREATE TABLE race_sessions (id INTEGER PRIMARY KEY, created_at DATETIME);');
db.exec('CREATE TABLE races (id INTEGER PRIMARY KEY, session_id INTEGER, hora TEXT, corrida TEXT, nivel TEXT, trap_fav INTEGER, trap_und INTEGER, bateu TEXT, resultado_1 TEXT, resultado_2 TEXT, resultado_3 TEXT, finishing_order_json TEXT);');
db.prepare('INSERT INTO race_sessions VALUES (1,?)').run('2026-09-03 15:00:00');
const ins = db.prepare('INSERT INTO races VALUES (?,1,?,?,?,?,?,?,?,?,?,?)');
ins.run(1, '2:08', 'Newc A7',  'top',  3, 1, 'sim', '3', '1', '5', CHEGADA);   // ja correta
ins.run(2, '2:24', 'DunPk A2', 'top',  3, 4, 'sim', '3', '1', '5', CHEGADA);   // chute: und fora
ins.run(3, '2:40', 'Hove A5',  'skip', 4, 6, 'nao', '3', '1', '5', null);      // chute: nenhum no top3
ins.run(4, '9:12', 'Romf A3',  'top',  2, 5, null,  null, null, null, null);   // nao rodou
const p = planejar(db, '2026-09-03');
ok('antes: 4 corridas, 3 preenchidas', [p.antes.total, p.antes.preenchido], [4, 3]);
ok('2 linhas mudam', p.linhas.length, 2);
ok('1 ja correta', p.ja_corretas, 1);
ok('1 sem resultado (intocada)', p.sem_resultado, 1);
ok('as duas sao chute desfeito', p.linhas.map(l => l.tipo), ['chute_desfeito', 'chute_desfeito']);
ok('a linha traz o motivo', /fora da chegada/.test(p.linhas[0].motivo), true);
ok('pega corrida com nivel=skip', p.linhas.some(l => l.nivel === 'skip'), true);
ok('planejar NAO gravou nada', contar(db, '2026-09-03').preenchido, 3);
aplicar(db, p.linhas);
ok('depois de aplicar, 1 preenchida', contar(db, '2026-09-03').preenchido, 1);
ok('a corrida que nao rodou continua null', db.prepare('SELECT bateu FROM races WHERE id=4').get().bateu, null);
ok('NADA foi apagado de races', db.prepare('SELECT COUNT(*) n FROM races').get().n, 4);
ok('NADA foi apagado de race_sessions', db.prepare('SELECT COUNT(*) n FROM race_sessions').get().n, 1);
ok('rodar de novo nao muda mais nada', planejar(db, '2026-09-03').linhas.length, 0);
db.close();
try { fs.unlinkSync(tmp); } catch (e) {}

console.log('\n9) A rota so grava com aplicar === true');
// o corpo chega do navegador: precisa recusar tudo que nao for o booleano
const querAplicar = (corpo) => {
  const c = (corpo && typeof corpo === 'object' && !Array.isArray(corpo)) ? corpo : {};
  return (c.aplicar === true);
};
ok('corpo ausente        -> simula', querAplicar(undefined), false);
ok('corpo vazio          -> simula', querAplicar({}), false);
ok('JSON quebrado (null) -> simula', querAplicar(null), false);
ok('array no lugar       -> simula', querAplicar([{ aplicar: true }]), false);
ok('string "true"        -> simula', querAplicar({ aplicar: 'true' }), false);
ok('numero 1             -> simula', querAplicar({ aplicar: 1 }), false);
ok('string "sim"         -> simula', querAplicar({ aplicar: 'sim' }), false);
ok('aplicar: false       -> simula', querAplicar({ aplicar: false }), false);
ok('aplicar: true        -> GRAVA',  querAplicar({ aplicar: true }), true);
// e a rota tem que usar exatamente essa comparacao, nao truthiness
ok('a rota compara === true', /corpo\.aplicar === true/.test(rb), true);
ok('a rota engole JSON quebrado', /express\.json\(\)\(req, res, \(\) => next\(\)\)/.test(rb), true);

console.log('\n' + (falhas === 0 ? 'TUDO OK — ' + testes + ' testes' : falhas + ' de ' + testes + ' FALHARAM'));
process.exit(falhas === 0 ? 0 : 1);
