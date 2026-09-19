'use strict';
// teste_diag_apostas_dia.js — A ROTA QUE ACHA APOSTA QUE PERDEU O PAR
//                              (Bruno, 19/09/2026)
//
// "ate umas 18:00 tava tudo certinho e fechado... fui ver agora tem corrida
//  que sumiu o ENTREI e esta desatualizada na banca."
//
// Este teste REPRODUZ, num banco de mentira, o unico caminho do codigo que
// apaga o ENTREI de varias corridas de uma vez depois do fato: sobrescrever a
// sessao do dia na Analisar. O autoSaveSession faz DELETE da sessao (e de
// todas as corridas dela) e POST de uma nova, com IDs novos. A odd vai junto;
// o par, as unidades e o "entrou" ficam na race_user_data, presos a um ID que
// nao existe mais.
//
// E confere que a rota /robot/diag/apostas-dia enxerga as tres coisas que
// provam isso: a sessao criada DEPOIS das apostas, a aposta nova com odd e
// sem par, e a linha orfa com o par dentro.
//
// A rota e' lida do robot.js e executada aqui, sem carregar o robot.js
// inteiro (ele sobe robos e navegador ao ser importado).
//
//   node teste_diag_apostas_dia.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── o banco de mentira, com o esquema das tres tabelas que importam ────────
const arq = path.join(os.tmpdir(), 'diag_apostas_' + process.pid + '.db');
try { fs.unlinkSync(arq); } catch (e) {}
const db = new Database(arq);
db.exec(`
  CREATE TABLE race_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT,
    total_races INTEGER, total_avbs INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE races (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, user_id INTEGER,
    hora TEXT, hora_br TEXT, corrida TEXT, nivel TEXT, tier TEXT, trap_fav INTEGER, trap_und INTEGER,
    bateu TEXT, finishing_order_json TEXT);
  CREATE TABLE race_user_data (race_id INTEGER, user_id INTEGER, odd TEXT, valor TEXT,
    bet_entrou INTEGER DEFAULT 0, bet_unidades TEXT, avb_nao_aberto INTEGER DEFAULT 0,
    flag_atrasada INTEGER DEFAULT 0, avb_escolhido TEXT, vip_tipo TEXT, vip_marcado_em TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (race_id, user_id));
`);
const UID = 1;

// ── o dia como estava as 18h: sessao das 9h, aposta com par ────────────────
db.prepare("INSERT INTO race_sessions (user_id,name,created_at) VALUES (1,'Races 18/09/2026','2026-09-18 12:00:00')").run();
const s1 = 1;
const insRace = db.prepare('INSERT INTO races (session_id,user_id,hora,hora_br,corrida,nivel,tier,trap_fav,trap_und,bateu,finishing_order_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
const chegada = JSON.stringify([{ pos: 1, trap: 6 }, { pos: 2, trap: 5 }, { pos: 3, trap: 3 }, { pos: 4, trap: 2 }, { pos: 5, trap: 1 }, { pos: 6, trap: 4 }]);
const sland1 = insRace.run(s1, 0, '9:43', '17:43', 'Sland A6', 'top', 'GOOD', 6, 5, 'sim', chegada).lastInsertRowid;
const sheff1 = insRace.run(s1, 0, '8:58', '16:58', 'Sheff A3', 'top', 'GOOD', 6, 3, 'sim', chegada).lastInsertRowid;
const snap = JSON.stringify({ aTrap: 6, aNome: 'Stormy Shelby', bTrap: 4, bNome: 'Kilteely', odd: 1.33,
  origem: 'bw', ts: Math.round(Date.parse('2026-09-18T20:20:00Z') / 1000) });
db.prepare("INSERT INTO race_user_data (race_id,user_id,odd,bet_unidades,bet_entrou,avb_escolhido,updated_at) VALUES (?,?,?,?,?,?,'2026-09-18 20:20:00')")
  .run(sland1, UID, '1.4', '2.5', 1, snap);

// ── e o que o "Sim, sobrescrever" faz depois das 18h ───────────────────────
// Espelha o autoSaveSession + POST /api/session: apaga a sessao inteira,
// cria outra, e so a odd vai pra corrida nova.
db.prepare('DELETE FROM races WHERE session_id=?').run(s1);
db.prepare('DELETE FROM race_sessions WHERE id=?').run(s1);
db.prepare("INSERT INTO race_sessions (user_id,name,created_at) VALUES (1,'Races 18/09/2026','2026-09-18 22:40:00')").run();
const s2 = 2;
const sland2 = insRace.run(s2, 0, '9:43', '17:43', 'Sland A6', 'top', 'GOOD', 6, 5, 'sim', null).lastInsertRowid;
insRace.run(s2, 0, '8:58', '16:58', 'Sheff A3', 'top', 'GOOD', 6, 3, 'sim', null);
db.prepare("INSERT INTO race_user_data (race_id,user_id,odd,updated_at) VALUES (?,?,?,'2026-09-18 22:40:05')").run(sland2, UID, '1.4');

// ── a rota, lida do robot.js ───────────────────────────────────────────────
const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
const ini = SRC.indexOf("router.get('/diag/apostas-dia'");
if (ini < 0) { console.error('ERRO: a rota /diag/apostas-dia sumiu do robot.js'); process.exit(1); }
// Fecha a chamada router.get( ... ) contando parenteses.
let k = SRC.indexOf('(', ini), n = 0, fim = -1;
for (; k < SRC.length; k++) {
  if (SRC[k] === '(') n++;
  else if (SRC[k] === ')') { n--; if (!n) { fim = k + 1; break; } }
}
const trecho = SRC.slice(ini, fim);
let handler = null;
const routerFalso = { get: function (p, mw, h) { handler = h; } };
const requireFalso = function (m) { if (/db\/database/.test(m)) return { db: db }; return require(m); };
new Function('router', 'requireAdmin', 'require', trecho)(routerFalso, function () {}, requireFalso);
if (typeof handler !== 'function') { console.error('ERRO: nao consegui montar a rota'); process.exit(1); }

function chama(query) {
  let status = 200, corpo = null;
  const res = {
    status: function (s) { status = s; return this; },
    json: function (j) { corpo = j; return this; }
  };
  handler({ query: query, user: { id: UID, role: 'admin' } }, res);
  return { status: status, corpo: corpo };
}

// ═══════════════════════════════════════════════════════════════════════════
bloco('[1] A ROTA SO LE, E RECUSA DATA TORTA');
// ═══════════════════════════════════════════════════════════════════════════

t('sem data, responde 400 com o formato certo', chama({}).status === 400);
t('data em outro formato tambem e recusada', chama({ dia: '18/09/2026' }).status === 400);
const antes = db.prepare('SELECT COUNT(*) n FROM race_user_data').get().n;
const R = chama({ dia: '2026-09-18' });
t('com a data certa, responde 200', R.status === 200);
t('e nao grava nada no banco', db.prepare('SELECT COUNT(*) n FROM race_user_data').get().n === antes);
t('o trecho da rota nao tem INSERT, UPDATE nem DELETE', !/\b(INSERT|UPDATE|DELETE)\b/.test(trecho));

const J = R.corpo || {};

// ═══════════════════════════════════════════════════════════════════════════
bloco('[2] PROVA 1: A SESSAO DO DIA NASCEU DEPOIS DAS APOSTAS');
// ═══════════════════════════════════════════════════════════════════════════

t('acha a sessao do dia', J.sessoes && J.sessoes.length === 1);
t('e mostra a hora em que ela foi criada, no horario do Brasil (19:40)',
  J.sessoes && J.sessoes[0].criada_em_br === '2026-09-18 19:40:00');

// ═══════════════════════════════════════════════════════════════════════════
bloco('[3] PROVA 2: A APOSTA NOVA TEM ODD E NAO TEM PAR');
// ═══════════════════════════════════════════════════════════════════════════

const sland = (J.corridas || []).filter(function (c) { return c.corrida === 'Sland A6'; })[0];
t('a Sland A6 aparece com a aposta', !!(sland && sland.aposta));
t('com a odd que a recriacao carregou', sland && sland.aposta && sland.aposta.odd === '1.4');
t('e SEM o par', sland && sland.aposta && sland.aposta.par === null);
t('e sem as unidades', sland && sland.aposta && sland.aposta.unidades == null);
t('o par do motor aparece a parte, pra nao confundir com o seu', sland && sland.par_do_motor === 'T6xT5');
t('o resumo conta 1 aposta com odd e sem par', J.resumo && J.resumo.apostas_com_odd_sem_par === 1);
t('e 1 aposta com odd e sem unidades', J.resumo && J.resumo.apostas_com_odd_sem_unidades === 1);
const sheff = (J.corridas || []).filter(function (c) { return c.corrida === 'Sheff A3'; })[0];
t('corrida sem aposta nenhuma vem com aposta: null', sheff && sheff.aposta === null);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[4] PROVA 3: O PAR NAO SUMIU, FICOU ORFAO');
// ═══════════════════════════════════════════════════════════════════════════

const orfa = (J.orfas || [])[0];
t('acha a linha orfa', J.resumo && J.resumo.orfas === 1 && !!orfa);
t('ela aponta pro ID da corrida que foi apagada', orfa && orfa.race_id_que_sumiu === sland1);
t('e ainda tem o SEU par: T6 x T4', orfa && orfa.par && orfa.par.a === 6 && orfa.par.b === 4);
t('com o nome dos dois galgos, que e o que permite devolver pra corrida certa',
  orfa && orfa.par && orfa.par.aNome === 'Stormy Shelby' && orfa.par.bNome === 'Kilteely');
t('com as unidades e o "entrou" que a recriacao largou',
  orfa && orfa.unidades === '2.5' && orfa.entrou === 1);
t('e com a hora do Entrei, no Brasil (17:20, antes da sessao nova)',
  orfa && orfa.par && orfa.par.gravado_em_br === '2026-09-18 17:20:00');
t('o resumo conta 1 orfa com par', J.resumo && J.resumo.orfas_com_par === 1);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[5] SO O DIA PEDIDO, SO O USUARIO LOGADO');
// ═══════════════════════════════════════════════════════════════════════════

db.prepare("INSERT INTO race_user_data (race_id,user_id,odd,avb_escolhido,updated_at) VALUES (99999,2,'2.0',?,'2026-09-18 20:00:00')").run(snap);
db.prepare("INSERT INTO race_user_data (race_id,user_id,odd,avb_escolhido,updated_at) VALUES (88888,1,'2.0',?,'2026-08-01 20:00:00')").run(snap);
const R2 = chama({ dia: '2026-09-18' }).corpo;
t('orfa de outro usuario nao entra', R2.orfas.every(function (o) { return o.race_id_que_sumiu !== 99999; }));
t('orfa de outro mes nao entra', R2.orfas.every(function (o) { return o.race_id_que_sumiu !== 88888; }));
t('outro dia nao traz as corridas deste', chama({ dia: '2026-09-17' }).corpo.corridas.length === 0);

// Snapshot torto nao derruba a rota: o objetivo e' ver o banco como ele esta.
db.prepare("UPDATE race_user_data SET avb_escolhido='{nao e json' WHERE race_id=?").run(sland2);
const R3 = chama({ dia: '2026-09-18' });
t('par ilegivel vira { cru } em vez de estourar', R3.status === 200
  && R3.corpo.corridas.filter(function (c) { return c.corrida === 'Sland A6'; })[0].aposta.par.cru === '{nao e json');

db.close();
try { fs.unlinkSync(arq); } catch (e) {}

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
