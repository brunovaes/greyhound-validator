'use strict';
// teste_diag_pdfs.js — O DIAG QUE COMPARA OS PDFs DA PASTA COM O BANCO
//                      (Bruno, 19/09/2026: 140 PDFs, 55 corridas)
//
// Monta um dia de verdade num banco e numa pasta temporarios, com os dois PDFs
// reais que o Bruno mandou (Shelbourne e Dunstall das 9:54 PM):
//   - Dunstall esta no banco           -> "no_banco"
//   - Shelbourne nao esta, e o PDF e' mais velho que a sessao -> "lido_nao_gravado"
//     (o parser le ele agora: a perda foi depois da leitura)
//   - um PDF gravado depois da sessao  -> "chegou_depois"
//   - um arquivo que nao e' PDF valido -> "parser_falhou"
//
//   node teste_diag_pdfs.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'diagpdfs-'));
process.env.DB_PATH = path.join(TMP, 'x.db');
process.env.PDF_PATH = path.join(TMP, 'pdfs');
const DIA = '2026-09-19';
const PASTA = path.join(process.env.PDF_PATH, DIA);
fs.mkdirSync(PASTA, { recursive: true });

const ORIG = path.join(__dirname, 'tools', 'fixtures');
const shel = path.join(ORIG, '9.54PM_Shelbourne.pdf');
const duns = path.join(ORIG, '9.54PM_Dunstall.pdf');
let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }
if (!fs.existsSync(shel) || !fs.existsSync(duns)) {
  console.log('  PULADO| faltam os PDFs de exemplo em tools/fixtures — o teste nao rodou');
  process.exit(0);
}

const _log = console.log; console.log = function () {};
const { db } = require('./src/db/database');
const express = require('express');
const api = require('./src/routes/api');
console.log = _log;

// A sessao foi criada as 09:19 UTC (06:19 BRT), como a 164.
const sess = db.prepare("INSERT INTO race_sessions (user_id, name, created_at) VALUES (1, 'Races 19/09/2026', '2026-09-19 09:19:38')").run().lastInsertRowid;
db.prepare("INSERT INTO races (session_id, user_id, hora, corrida, track_full, nivel) VALUES (?,1,'9:54','DunPk OR3','Dunstall Park','skip')").run(sess);

const antes = new Date('2026-09-19T09:00:00Z'), depois = new Date('2026-09-19T15:00:00Z');
function por(nome, origem, quando) {
  const f = path.join(PASTA, nome);
  if (origem) fs.copyFileSync(origem, f); else fs.writeFileSync(f, 'isto nao e um pdf');
  fs.utimesSync(f, quando, quando);
}
por('9.54PM_Dunstall.pdf', duns, antes);
por('9.54PM_Shelbourne.pdf', shel, antes);
por('9.54PM_Shelbourne_refeito.pdf', shel, depois);
por('8.00PM_Thurles.pdf', null, antes);

const app = express();
app.use(function (req, res, next) { req.user = { id: 1, role: req.headers['x-comum'] ? 'user' : 'admin' }; next(); });
app.use('/api', api);

function pedir(srv, url, comum) {
  return new Promise(function (ok2) {
    http.get({ host: '127.0.0.1', port: srv.address().port, path: url, headers: comum ? { 'x-comum': '1' } : {} }, function (res) {
      let b = ''; res.on('data', function (c) { b += c; }); res.on('end', function () { let j = null; try { j = JSON.parse(b); } catch (e) {} ok2({ status: res.statusCode, json: j }); });
    });
  });
}

(async function () {
  const srv = app.listen(0);
  try {
    console.log('\n[1] O DIAG DIZ ONDE CADA PDF SE PERDEU\n');
    t('usuario comum nao ve (403)', (await pedir(srv, '/api/diag/pdfs-x-corridas?date=' + DIA, true)).status === 403);
    const r = await pedir(srv, '/api/diag/pdfs-x-corridas?date=' + DIA);
    const j = r.json || {};
    const de = function (n) { return (j.faltando || []).concat(j.no_banco || []).find(function (l) { return l.arquivo === n; }) || {}; };
    t('respondeu', r.status === 200 && j.pdfs === 4 && j.corridas_no_banco === 1);
    t('Dunstall 9:54: no_banco (casou "Dunstall" com "Dunstall Park" e a hora)', de('9.54PM_Dunstall.pdf').situacao === 'no_banco');
    const sh = de('9.54PM_Shelbourne.pdf');
    t('Shelbourne 9:54: lido_nao_gravado, e diz o que o parser leu', sh.situacao === 'lido_nao_gravado' && /9:54/.test(sh.parser || ''));
    t('a copia gravada depois da sessao: chegou_depois', de('9.54PM_Shelbourne_refeito.pdf').situacao === 'chegou_depois');
    t('arquivo que nao e PDF: parser_falhou', de('8.00PM_Thurles.pdf').situacao === 'parser_falhou');
    t('o resumo conta por situacao', j.resumo && j.resumo.no_banco === 1 && j.resumo.lido_nao_gravado === 1 && j.resumo.chegou_depois === 1 && j.resumo.parser_falhou === 1);
    t('e mostra a sessao do dia', Array.isArray(j.sessoes) && j.sessoes.length === 1);
  } catch (e) { t('rodou sem erro: ' + e.message, false); }
  finally { srv.close(); }
  try { db.close(); } catch (e) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})();
