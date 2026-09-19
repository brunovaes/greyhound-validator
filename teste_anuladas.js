'use strict';
// teste_anuladas.js — A LIXEIRINHA DO HISTORICO (Bruno, 19/09/2026)
//
// "colocar uma lixeirinha no historico para quando a corrida nao acontecer
//  por algum motivo extraordinario eu poder excluir" — e, na decisao do mesmo
// dia: marcar como ANULADA em vez de apagar.
//
// Roda o app DE VERDADE (as rotas api, banca e main) contra um banco
// temporario, com a mesma criacao de tabelas do database.js:
//   [1] anular so admin; a marca e' por dia + corrida + hora
//   [2] a corrida some do Historico e das contas; a lista de anuladas aparece
//   [3] a aposta vira "anulada" na Banca: nao e pendente, nao e green nem red
//   [4] a Analisar recria a corrida com OUTRO id e ela continua anulada
//   [5] desfazer volta tudo
//   [6] o painel e o Placar nao olham corrida anulada
//   [7] a tela "Ainda nao fechamos!" da Analisar (o outro pedido do dia)
//
//   node teste_anuladas.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');

const DBF = path.join(os.tmpdir(), 'teste_anuladas_' + process.pid + '.db');
try { fs.unlinkSync(DBF); } catch (e) {}
process.env.DB_PATH = DBF;
const _log = console.log; console.log = function () {};   // o database.js fala muito
const { db } = require('./src/db/database');
const express = require('express');
const api = require('./src/routes/api');
const banca = require('./src/routes/banca');
const main = require('./src/routes/main');
console.log = _log;

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }
function bloco(n) { console.log('\n' + n + '\n'); }

// Quem esta logado em cada requisicao: troca pelo cabecalho de teste.
const ADMIN = { id: 1, role: 'admin', email: 'a@a' };
const COMUM = { id: 2, role: 'user', email: 'u@u' };
const app = express();
app.use(function (req, res, next) { req.user = req.headers['x-teste'] === 'comum' ? COMUM : ADMIN; next(); });
app.use('/api', api);
app.use('/banca', banca);
app.use('/', main);

function pedir(srv, metodo, url, corpo, quem) {
  return new Promise(function (ok2, erro) {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = http.request({ host: '127.0.0.1', port: srv.address().port, path: url, method: metodo,
      headers: Object.assign({ 'x-teste': quem || 'admin', accept: 'application/json' }, dados ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(dados) } : {}) },
      function (res) { let b = ''; res.on('data', function (c) { b += c; }); res.on('end', function () {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        ok2({ status: res.statusCode, json: j, texto: b }); }); });
    req.on('error', erro);
    if (dados) req.write(dados);
    req.end();
  });
}

// ── o dia de teste ─────────────────────────────────────────────────────────
const agoraUtc = new Date().toISOString().replace('T', ' ').slice(0, 19);
const DIA = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const sess = db.prepare('INSERT INTO race_sessions (user_id, name, created_at) VALUES (1, ?, ?)').run('Races teste', agoraUtc).lastInsertRowid;
const insRace = db.prepare('INSERT INTO races (session_id, user_id, hora, corrida, dist, nivel, trap_fav, trap_und, name_fav, name_und, hist_full) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
const idMonmore = insRace.run(sess, 1, '12:42', 'Monmore A4', '480', 'media', 1, 6, 'Cabra Rambo', 'Mumbai Pickle', '[]').lastInsertRowid;
const idHove = insRace.run(sess, 1, '3:10', 'Hove A5', '500', 'media', 2, 3, 'Never Let Go', 'Yougo Jenny', '[]').lastInsertRowid;
// A aposta do Bruno na corrida que nao vai acontecer.
db.prepare('INSERT INTO race_user_data (race_id, user_id, odd, bet_unidades, bet_entrou) VALUES (?,?,?,?,1)').run(idMonmore, 1, 1.8, 2.5);

(async function () {
  const srv = app.listen(0);
  try {
    bloco('[1] ANULAR: SO ADMIN, E A MARCA E\' POR DIA + CORRIDA + HORA');
    const antes = await pedir(srv, 'GET', '/api/painel-dia');
    t('antes: o dia tem 2 corridas que podem virar camada', antes.json && antes.json.dia && antes.json.dia.total === 2);
    const semPerm = await pedir(srv, 'POST', '/api/race/' + idMonmore + '/anular', {}, 'comum');
    t('usuario comum nao anula (403)', semPerm.status === 403);
    const r1 = await pedir(srv, 'POST', '/api/race/' + idMonmore + '/anular', { motivo: 'abandonada' });
    t('admin anula', r1.status === 200 && r1.json && r1.json.ok);
    const marca = db.prepare('SELECT * FROM corridas_anuladas').all();
    t('uma marca, com o dia da sessao e a chave "monmore a4|12:42"', marca.length === 1 && marca[0].data === DIA && marca[0].chave === 'monmore a4|12:42');
    t('a corrida NAO foi apagada', !!db.prepare('SELECT id FROM races WHERE id=?').get(idMonmore));
    t('a aposta NAO foi apagada', !!db.prepare('SELECT race_id FROM race_user_data WHERE race_id=?').get(idMonmore));

    bloco('[2] O HISTORICO: SOME DA TABELA E DAS CONTAS, APARECE NA LISTA DE ANULADAS');
    const h = await pedir(srv, 'GET', '/sessao/' + sess);
    const allRaces = (h.texto.match(/var ALL_RACES=(\[[\s\S]*?\]);\r?\n/) || [])[1] || '[]';
    t('a tela abriu', h.status === 200);
    t('a anulada saiu do ALL_RACES (e com ela KPIs, filtro e graficos)', allRaces.indexOf('Monmore A4') < 0 && allRaces.indexOf('Hove A5') >= 0);
    t('e entrou na lista "Corridas anuladas neste dia (1)"', /Corridas anuladas neste dia \(1\)/.test(h.texto));
    t('com o botao Desfazer pro admin', /class="anuladas-desf" data-data="\d{4}-\d{2}-\d{2}" data-chave="monmore a4\|12:42"/.test(h.texto));
    const hc = await pedir(srv, 'GET', '/sessao/' + sess, null, 'comum');
    t('usuario comum nao ve lixeira nem Desfazer', hc.texto.indexOf('onclick="anularCorrida(this)"') < 0 && hc.texto.indexOf('onclick="desanularCorrida(this)"') < 0);
    t('a tela carrega o dialogo do app (sem confirm() nativo)', /static\/js\/dialogo\.js/.test(h.texto) && /ghConfirmar\(/.test(h.texto));

    bloco('[3] A BANCA: A APOSTA FICA, MARCADA ANULADA, SEM VALOR');
    const bd = await pedir(srv, 'GET', '/banca/data?view=day&date=' + DIA);
    const ap = (bd.json && bd.json.apostas || []).find(function (a) { return a.id === idMonmore; });
    t('a aposta continua na lista do dia', !!ap);
    t('status "anulada"', ap && ap.status === 'anulada');
    t('sem green nem red, e sem valor (ganhoReais null)', ap && ap.bateu == null && ap.ganhoReais == null);
    t('nao conta como pendente', bd.json && bd.json.pendentes === 0);
    t('nem no dinheiro transitado (o stake volta)', bd.json && bd.json.dinheiroTransitado === 0);

    bloco('[4] A ANALISAR RECRIA A CORRIDA COM OUTRO ID, E ELA CONTINUA ANULADA');
    // E' o que o autoSaveSession faz: apaga as corridas do dia e grava de novo.
    db.prepare('DELETE FROM races WHERE id=?').run(idMonmore);
    const idNovo = insRace.run(sess, 1, '12:42', 'Monmore A4', '480', 'media', 1, 6, 'Cabra Rambo', 'Mumbai Pickle', '[]').lastInsertRowid;
    t('(o id mudou)', idNovo !== idMonmore);
    const h2 = await pedir(srv, 'GET', '/sessao/' + sess);
    const all2 = (h2.texto.match(/var ALL_RACES=(\[[\s\S]*?\]);\r?\n/) || [])[1] || '[]';
    t('a corrida recriada continua fora do Historico', all2.indexOf('Monmore A4') < 0);
    const p2 = await pedir(srv, 'GET', '/api/painel-dia');
    t('e fora do resumo do dia do painel (so a Hove conta)', p2.json && p2.json.dia && p2.json.dia.total === 1);

    bloco('[5] DESFAZER VOLTA TUDO');
    const semPerm2 = await pedir(srv, 'POST', '/api/anuladas/desanular', { data: DIA, chave: 'monmore a4|12:42' }, 'comum');
    t('usuario comum nao desfaz (403)', semPerm2.status === 403);
    const d1 = await pedir(srv, 'POST', '/api/anuladas/desanular', { data: DIA, chave: 'monmore a4|12:42' });
    t('admin desfaz', d1.status === 200 && d1.json && d1.json.desfeitas === 1);
    const h3 = await pedir(srv, 'GET', '/sessao/' + sess);
    const all3 = (h3.texto.match(/var ALL_RACES=(\[[\s\S]*?\]);\r?\n/) || [])[1] || '[]';
    t('a corrida volta pro Historico', all3.indexOf('Monmore A4') >= 0 && !/Corridas anuladas neste dia/.test(h3.texto));
    const p3 = await pedir(srv, 'GET', '/api/painel-dia');
    t('e pro resumo do dia', p3.json && p3.json.dia && p3.json.dia.total === 2);
  } catch (e) {
    t('o teste rodou sem erro: ' + e.message, false);
  } finally { srv.close(); }

  bloco('[6] O PAINEL, O PUSH E O PLACAR NAO OLHAM CORRIDA ANULADA');
  const semCom = function (s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''); };
  const API = semCom(fs.readFileSync(path.join(__dirname, 'src', 'routes', 'api.js'), 'utf8'));
  // O robot.js SEM tirar comentario: ele tem string com "/*" dentro (glob de
  // pasta), e o removedor de comentario engolia metade do arquivo.
  const ROBOT = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
  const base = (API.match(/function baseDoDia\(date\)[\s\S]*?\n\}/) || [''])[0];
  t('baseDoDia (painel-dia e push) pula anulada', /SQL_NAO_ANULADA/.test(base));
  const placar = (ROBOT.match(/router\.get\('\/diag\/oportunidades-bw-resultado'[\s\S]*?const vazio/) || [''])[0];
  t('o Placar pula anulada', /SQL_NAO_ANULADA/.test(placar));

  bloco('[7] ANALISAR: "AINDA NAO FECHAMOS!" SO ENQUANTO SOBRAR CORRIDA NO DIA');
  const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
  const fn = function (nome) { const m = APP.match(new RegExp('^function\\s+' + nome + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm')); return m ? m[0] : ''; };
  const foco = { innerHTML: '' };
  const outro = { innerHTML: '', style: {} };
  const ctx = { window: {}, document: { getElementById: function (id) { return id === 'focus-col' ? foco : outro; } },
    clearInterval: function () {}, focusRefreshInterval: null, alertCheckInterval: null, serverSyncInterval: null };
  vm.createContext(ctx);
  vm.runInContext(['_resumoDiaPainel', 'showAllExpiredMsg', 'showDayEndMsg'].map(fn).join('\n'), ctx);
  const tela = function (dia) {
    ctx.window.PainelDia = { dados: function () { return dia === undefined ? null : { dia: dia }; } };
    foco.innerHTML = ''; ctx.showAllExpiredMsg(); return foco.innerHTML;
  };
  const a = tela({ total: 12, restantes: 3, ultima_hora_br: '17:45' });
  t('sobram 3: "Ainda não fechamos!"', /Ainda não fechamos!/.test(a) && /Fique atento às possíveis oportunidades/.test(a));
  t('e diz quantas e ate quando', /3 corridas ainda podem abrir AvB hoje, a última às 17:45/.test(a));
  t('sobra 1: singular', /1 corrida ainda pode abrir AvB hoje/.test(tela({ total: 12, restantes: 1, ultima_hora_br: '17:45' })));
  t('o dia teve corrida e todas largaram: "Ciclo do dia encerrado"', /Ciclo do dia encerrado/.test(tela({ total: 12, restantes: 0, ultima_hora_br: null })));
  t('sem corrida no dia (antes da coleta): a mensagem de antes', /Favor aguardar o próximo turno/.test(tela({ total: 0, restantes: 0 })));
  t('painel ainda sem resposta: a mensagem de antes, nunca uma promessa', /Favor aguardar o próximo turno/.test(tela(undefined)));
  t('nenhum travessao comprido na mensagem nova', !/—/.test(a));

  try { db.close(); } catch (e) {}
  try { fs.unlinkSync(DBF); } catch (e) {}
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})();
