'use strict';
// teste_resumo_noite.js — A NOITE O DIA NAO "REABRE" (Bruno, 19/09/2026)
//
// A noite, sem corrida nenhuma, a Analisar dizia "Ainda nao fechamos!
// 1 corrida ainda pode abrir AvB hoje. Encerramos as 6:32." A corrida era a
// Doncaster das 10:32 AM (6:32 BR): o relogio das camadas soma 24h a quem
// largou ha mais de 12h, e depois das 18:32 ela virava "amanha as 6:32".
// O resumo do dia agora conta so o mesmo dia.
//
//   node teste_resumo_noite.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'resumo-'));
process.env.DB_PATH = path.join(TMP, 'x.db');
const _log = console.log; console.log = function () {};
const { db } = require('./src/db/database');
const express = require('express');
const api = require('./src/routes/api');
console.log = _log;

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }

const sess = db.prepare("INSERT INTO race_sessions (user_id, name, created_at) VALUES (1,'Races 19/09/2026','2026-09-19 09:19:38')").run().lastInsertRowid;
const ins = db.prepare("INSERT INTO races (session_id, user_id, hora, corrida, nivel, hist_full) VALUES (?,1,?,?,'alta','[]')");
ins.run(sess, '10:32', 'Donc A2');   // 6:32 BR
ins.run(sess, '9:54', 'DunPk A3');   // 17:54 BR

const app = express();
app.use(function (req, res, next) { req.user = { id: 1, role: 'admin' }; next(); });
app.use('/api', api);
const realNow = Date.now;
function pedir(srv, url) {
  return new Promise(function (r) {
    http.get({ host: '127.0.0.1', port: srv.address().port, path: url }, function (res) {
      let b = ''; res.on('data', function (c) { b += c; }); res.on('end', function () { r(JSON.parse(b)); });
    });
  });
}
async function dia(srv, instante, data) {
  Date.now = function () { return Date.parse(instante); };
  try { return (await pedir(srv, '/api/painel-dia?date=' + data)).dia; }
  finally { Date.now = realNow; }
}

(async function () {
  const srv = app.listen(0);
  try {
    console.log('\n[1] O DIA DE 19/09 EM TRES HORAS\n');
    // Em ordem de relogio: o resumo tem cache de 30s por dia.
    const antes = await dia(srv, '2026-09-19T09:40:00Z', '2026-09-19');     // 06:40 BR
    t('06:40 BR: a das 6:32 ja passou, sobra a das 17:54', antes.restantes === 1);
    const meioDia = await dia(srv, '2026-09-19T15:00:00Z', '2026-09-19');   // 12:00 BR
    t('12:00 BR: sobra 1 (a das 17:54), e encerra as 17:54', meioDia.restantes === 1 && meioDia.ultima_hora_br === '17:54');
    const noite = await dia(srv, '2026-09-19T23:30:00Z', '2026-09-19');     // 20:30 BR
    t('20:30 BR: nao sobra nenhuma (a das 6:32 nao volta como "amanha")', noite.restantes === 0 && noite.corridas === 0);
    console.log('\n[2] OUTRO DIA\n');
    const ontem = await dia(srv, '2026-09-20T15:00:00Z', '2026-09-19');     // 20/09 olhando 19/09
    t('olhando um dia que ja passou: nada por largar', ontem.restantes === 0 && ontem.total === 2);
  } catch (e) { t('rodou sem erro: ' + e.message, false); }
  finally { srv.close(); }
  try { db.close(); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})();
