'use strict';
// teste_banca_bw.js — BANCA BW EDITAVEL NO CARTAO, POR DIA (Bruno, 19/09/2026)
//
// "deixar na banca o valor Banca BW editavel... isso e' para o dia, nao tem
//  que mexer com o passado. No dia seguinte ele comeca com o valor que esta."
//
// Roda as rotas de verdade da Banca contra um banco temporario.
//
//   node teste_banca_bw.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bancabw-'));
process.env.DB_PATH = path.join(TMP, 'x.db');
const _log = console.log; console.log = function () {};
const { db } = require('./src/db/database');
const express = require('express');
const banca = require('./src/routes/banca');
// Como no servidor: as colunas pessoais (avb_escolhido...) e a linha de config
// do usuario nascem sob demanda.
require('./src/db/compartilhado').garantirColunas(db);
require('./src/db/database').getUserConfig(1);
console.log = _log;

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }
function bloco(n) { console.log('\n' + n + '\n'); }

const HOJE = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const ONTEM = new Date(Date.now() - 27 * 3600 * 1000).toISOString().slice(0, 10);
const utc = function (dia) { return dia + ' 12:00:00'; };   // meio-dia UTC = 09h BRT do mesmo dia

// Banca fixa 1000 -> 1 unidade = R$ 10. Odd 2.0 e 2.5 un: green = +R$ 25, red = -R$ 25.
db.prepare("UPDATE analysis_config SET banca_valor_inicial=1000, banca_bw_valor=300, banca_bw_reset_em=? WHERE user_id=1").run(ONTEM);
const sOntem = db.prepare("INSERT INTO race_sessions (user_id, name, created_at) VALUES (1,'ontem',?)").run(utc(ONTEM)).lastInsertRowid;
const sHoje = db.prepare("INSERT INTO race_sessions (user_id, name, created_at) VALUES (1,'hoje',?)").run(utc(HOJE)).lastInsertRowid;
const corrida = db.prepare("INSERT INTO races (session_id, user_id, hora, corrida, trap_fav, trap_und, name_fav, name_und, bateu, nivel) VALUES (?,1,?,?,1,2,'A','B',?,'alta')");
const aposta = db.prepare('INSERT INTO race_user_data (race_id, user_id, odd, bet_unidades, bet_entrou) VALUES (?,1,2.0,2.5,1)');
aposta.run(corrida.run(sOntem, '1:00', 'Romfd A1', 'sim').lastInsertRowid);          // ontem: +25
aposta.run(corrida.run(sHoje, '2:00', 'Romfd A2', 'nao').lastInsertRowid);           // hoje:  -25
const idPend = corrida.run(sHoje, '3:00', 'Romfd A3', null).lastInsertRowid;         // hoje:  pendente
aposta.run(idPend);

const app = express();
app.use(function (req, res, next) { req.user = { id: 1, role: 'admin' }; next(); });
app.use('/banca', banca);

function pedir(srv, metodo, url, corpo) {
  return new Promise(function (ok2) {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = http.request({ host: '127.0.0.1', port: srv.address().port, path: url, method: metodo,
      headers: dados ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(dados) } : {} }, function (res) {
      let b = ''; res.on('data', function (c) { b += c; }); res.on('end', function () { let j = null; try { j = JSON.parse(b); } catch (e) {} ok2({ status: res.statusCode, json: j, texto: b }); });
    });
    if (dados) req.write(dados); req.end();
  });
}
const bw = async function (srv, dia) { const r = await pedir(srv, 'GET', '/banca/data?view=day&date=' + dia); return r.json && r.json.bancaBw; };

(async function () {
  const srv = app.listen(0);
  try {
    bloco('[1] SEM EDICAO: A REGRA DE ANTES');
    t('hoje = 300 (ontem) + 25 - 25 = 300', Math.abs((await bw(srv, HOJE)) - 300) < 0.001);

    bloco('[2] EDITOU HOJE: O CARTAO MOSTRA EXATAMENTE O QUE VOCE DIGITOU');
    t('valor invalido e\' recusado', (await pedir(srv, 'POST', '/banca/bw-ajuste', { valor: 'abc' })).status === 400);
    t('grava 512,40 (virgula aceita)', (await pedir(srv, 'POST', '/banca/bw-ajuste', { valor: '512,40' })).status === 200);
    t('hoje = 512,40 — o red de hoje, ja resolvido, nao desconta de novo', Math.abs((await bw(srv, HOJE)) - 512.40) < 0.001);
    t('ontem continua 300 + 25 = 325 (o passado nao mexe)', Math.abs((await bw(srv, ONTEM)) - 325) < 0.001);

    bloco('[3] DEPOIS DE EDITAR: O QUE RESOLVER ENTRA EM CIMA');
    db.prepare("UPDATE races SET bateu='sim' WHERE id=?").run(idPend);
    t('a pendente de hoje deu green: 512,40 + 25 = 537,40', Math.abs((await bw(srv, HOJE)) - 537.40) < 0.001);

    bloco('[4] O DIA SEGUINTE COMECA COM O VALOR QUE ESTA');
    // Simula "amanha": o ajuste de hoje passa a ser o ultimo ate la.
    const AMANHA = new Date(Date.now() + 21 * 3600 * 1000).toISOString().slice(0, 10);
    t('amanha, sem aposta nova: 537,40', Math.abs((await bw(srv, AMANHA)) - 537.40) < 0.001);

    bloco('[5] A TELA');
    const pag = await pedir(srv, 'GET', '/banca');
    t('o campo e o botao "Resetar BW" sairam das configuracoes', pag.texto.indexOf('id="cfg_bw"') < 0 && pag.texto.indexOf("resetarBanca('bw')") < 0);
    t('o cartao so vira campo no dia de hoje', /var ehHoje = \(d\.date === hojeBrTela\(\)\);/.test(pag.texto) && /onclick="editarBw\(this\)"/.test(pag.texto));
    await pedir(srv, 'POST', '/banca/save-config', { banca_unidade_padrao: 2.5, banca_valor_inicial: 1000, banca_pct_stop: 20 });
    t('salvar as configuracoes nao zera mais a base da BW', db.prepare('SELECT banca_bw_valor v FROM analysis_config WHERE user_id=1').get().v === 300);
  } catch (e) { t('rodou sem erro: ' + e.message, false); }
  finally { srv.close(); }
  try { db.close(); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})();
