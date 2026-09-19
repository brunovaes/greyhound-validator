'use strict';
// teste_completar_dia.js — O DIA NAO NASCE MAIS PELA METADE (Bruno, 19/09/2026)
//
// 19/09: 140 PDFs na pasta e 56 corridas no banco. Uma aba da Analisar criou o
// dia as 06:19, no meio da coleta, e gravou so as nao skip; a analise
// automatica pulou porque "a sessao ja existe". A correcao:
//   [1] completarDia: acrescenta o que falta, sem tocar no que existe
//   [2] a tela espera a coleta (sinal `coletando` no /api/pdfs/hoje)
//   [3] o robo de PDF, no modo "so novas", nao baixa de novo o que ja tem
//   [4] o monitor anula a corrida que sumiu da lista — com trava
//   [5] o robo de resultados desfaz a anulacao do monitor se a corrida correu
//
//   node teste_completar_dia.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');

let ok = 0, fail = 0;
function t(nome, cond) { console.log((cond ? '  OK    | ' : '  FALHA | ') + nome); cond ? ok++ : fail++; }
function bloco(n) { console.log('\n' + n + '\n'); }

const FIX = path.join(__dirname, 'tools', 'fixtures');
const temPdfs = fs.existsSync(path.join(FIX, '9.54PM_Shelbourne.pdf')) && fs.existsSync(path.join(FIX, '9.54PM_Dunstall.pdf'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'completar-'));
process.env.DB_PATH = path.join(TMP, 'x.db');
process.env.PDF_PATH = path.join(TMP, 'pdfs');
const DIA = '2026-09-19';
const PASTA = path.join(process.env.PDF_PATH, DIA);
fs.mkdirSync(PASTA, { recursive: true });

const _log = console.log, _warn = console.warn; console.log = function () {}; console.warn = function () {};
const { db } = require('./src/db/database');
const api = require('./src/routes/api');
const estadoColeta = require('./src/utils/estadoColeta');
console.log = _log; console.warn = _warn;

(async function () {
  bloco('[1] COMPLETAR O DIA: ACRESCENTA O QUE FALTA, NAO MEXE NO QUE EXISTE');
  const semSessao = await api.completarDia(DIA);
  t('sem sessao do dia nao faz nada (criar o dia e\' da analise automatica)', semSessao.semSessao === true && !semSessao.inseridas.length);

  const sess = db.prepare("INSERT INTO race_sessions (user_id, name, created_at, total_races, total_avbs) VALUES (1, 'Races 19/09/2026', '2026-09-19 09:19:38', 1, 1)").run().lastInsertRowid;
  // A Dunstall ja esta no dia, com aposta: tem que continuar IGUAL, mesmo id.
  const idDun = db.prepare("INSERT INTO races (session_id, user_id, hora, corrida, nivel) VALUES (?,1,'9:54','DunPk OR3','media')").run(sess).lastInsertRowid;
  db.prepare('INSERT INTO race_user_data (race_id, user_id, odd, bet_unidades, bet_entrou) VALUES (?,1,1.9,2.5,1)').run(idDun);

  if (!temPdfs) {
    console.log('  PULADO| faltam os PDFs de exemplo em tools/fixtures');
  } else {
    const velho = new Date('2026-09-19T09:10:00Z'), novo = new Date('2026-09-19T15:00:00Z');
    const por = function (n, o, q) { const f = path.join(PASTA, n); fs.copyFileSync(path.join(FIX, o), f); fs.utimesSync(f, q, q); };
    por('9.54PM_Dunstall.pdf', '9.54PM_Dunstall.pdf', velho);
    por('9.54PM_Shelbourne.pdf', '9.54PM_Shelbourne.pdf', velho);
    por('9.54PM_Shelbourne_refeito.pdf', '9.54PM_Shelbourne.pdf', novo);
    fs.writeFileSync(path.join(PASTA, '8.30PM_Thurles.pdf'), 'nao e pdf');

    console.log = function () {}; console.warn = function () {};
    const c1 = await api.completarDia(DIA);
    console.log = _log; console.warn = _warn;
    t('acrescentou so a Shelbourne (a Dunstall ja estava)', c1.inseridas.length === 1 && /ShelPk/.test(c1.inseridas[0]));
    t('o "_refeito" nao vira segunda corrida', db.prepare("SELECT COUNT(*) n FROM races WHERE corrida LIKE 'ShelPk%'").get().n === 1);
    t('entrou na MESMA sessao do dia', db.prepare("SELECT session_id s FROM races WHERE corrida LIKE 'ShelPk%'").get().s === sess);
    t('skip entra tambem (e\' corrida do dia)', /\(skip\)/.test(c1.inseridas[0]) || db.prepare("SELECT nivel FROM races WHERE corrida LIKE 'ShelPk%'").get().nivel != null);
    t('a Dunstall continua com o mesmo id e a aposta intacta',
      !!db.prepare('SELECT 1 FROM races WHERE id=?').get(idDun) && !!db.prepare('SELECT 1 FROM race_user_data WHERE race_id=? AND odd=1.9 AND bet_unidades=2.5').get(idDun));
    t('o PDF que nao le entra na lista de falhas, sem derrubar nada', c1.falhas.some(function (f) { return /8\.30PM_Thurles/.test(f); }));
    const s = db.prepare('SELECT total_races FROM race_sessions WHERE id=?').get(sess);
    t('os totais da sessao passam a contar o dia inteiro (2)', s.total_races === 2);
    console.log = function () {}; console.warn = function () {};
    const c2 = await api.completarDia(DIA);
    console.log = _log; console.warn = _warn;
    t('rodar de novo nao acrescenta nada (nunca duplica)', c2.inseridas.length === 0 && db.prepare('SELECT COUNT(*) n FROM races').get().n === 2);
  }

  bloco('[2] A TELA ESPERA A COLETA');
  const express = require('express');
  const app = express();
  app.use(function (req, res, next) { req.user = { id: 1, role: 'admin' }; next(); });
  app.use('/api', api);
  const srv = app.listen(0);
  const pedir = function (u) { return new Promise(function (r) { http.get({ host: '127.0.0.1', port: srv.address().port, path: u }, function (res) { let b = ''; res.on('data', function (c) { b += c; }); res.on('end', function () { r(JSON.parse(b)); }); }); }); };
  estadoColeta.ligar();
  const a1 = await pedir('/api/pdfs/hoje');
  estadoColeta.desligar();
  const a2 = await pedir('/api/pdfs/hoje');
  srv.close();
  t('coleta rodando: /api/pdfs/hoje diz coletando=true', a1.coletando === true);
  t('coleta parada: coletando=false', a2.coletando === false);
  const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
  const auto = (APP.match(/async function autoCheckAndAnalyze\(\)[\s\S]*?\n\}/) || [''])[0];
  t('a tela nao analisa enquanto coleta: espera e tenta de novo em 1 min',
    /if \(d\.coletando\) \{[\s\S]*?setTimeout\(function\(\)\{ autoCheckAndAnalyze\(\); \}, 60000\);\s*return;/.test(auto)
    && auto.indexOf('d.coletando') < auto.indexOf('runAnalysis()'));
  const ROBOT = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
  const col = (ROBOT.match(/async function executarColeta\(\)[\s\S]*?\n\}/) || [''])[0];
  t('a coleta liga o sinal no comeco e desliga no finally', /estadoColeta\.ligar\(\);/.test(col) && /finally \{\s*estadoColeta\.desligar\(\);/.test(col));
  t('sessao ja existia: completa o dia em vez de so pular', /jaExistia\) \{[\s\S]*?completarDia\(date\)/.test(col));

  bloco('[3] O ROBO DE PDF, NO MODO "SO NOVAS", NAO BAIXA O QUE JA TEM');
  const fn = function (nome) { const m = ROBOT.match(new RegExp('^function ' + nome + '\\([^)]*\\) \\{[\\s\\S]*?^\\}', 'm')); return m ? m[0] : ''; };
  const ctx = { fs: fs };
  vm.createContext(ctx);
  vm.runInContext(fn('formatTime') + '\n' + fn('jaTemPdf'), ctx);
  const D2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jatem-'));
  ['9.42PM_Romford.pdf', '6.30PM_Central.pdf', '11.27AM_Romford_refeito.pdf'].forEach(function (n) { fs.writeFileSync(path.join(D2, n), 'x'); });
  t('9:42 Romford: ja tem', ctx.jaTemPdf(D2, '9:42', 'Romford') === true);
  t('"Central Park" na lista casa com "Central" no arquivo', ctx.jaTemPdf(D2, '6:30', 'Central Park') === true);
  t('o "_refeito" conta como ja tem', ctx.jaTemPdf(D2, '11:27', 'Romford') === true);
  t('9:46 Hove: nao tem, baixa', ctx.jaTemPdf(D2, '9:46', 'Hove') === false);
  t('mesma hora, outra pista: nao tem', ctx.jaTemPdf(D2, '9:42', 'Hove') === false);
  t('o monitor chama a coleta complementar DEPOIS de terminar (nunca junto)',
    /runCardMonitorRobot\(date\)\.then[\s\S]*?\.then\(function\(\) \{[\s\S]*?return coletaComplementar\(date\);/.test(ROBOT));
  t('a complementar e\' so das novas e nao regrava o log da coleta da manha',
    /runRobot\(date, 400, 575, '', '', \{ soNovas: true \}\)/.test(ROBOT) && /if \(!opts\.soNovas\) saveRobotLog\('pdf', robotStatus\);/.test(ROBOT));

  bloco('[4] O MONITOR ANULA A CORRIDA QUE SUMIU — COM TRAVA');
  const MON = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'cardMonitorRobot.js'), 'utf8');
  t('lista vazia ou muita corrida sumindo de uma vez: nao anula nada',
    /const podeAnular = races\.length > 0 && _sumidas\.length <= Math\.max\(3, Math\.floor\(_futuras\.length \* 0\.3\)\);/.test(MON));
  t('anula com motivo "monitor:" (pra poder ser desfeita)', /if \(podeAnular\) \{[\s\S]*?_anul\.anular\(db, \{[^}]*motivo: 'monitor: sumiu da lista do Racing Post'/.test(MON));

  bloco('[5] SE A CORRIDA CORREU, A ANULACAO DO MONITOR E\' DESFEITA');
  const RES = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'resultsRobot.js'), 'utf8');
  t('o robo de resultados apaga so a marca "monitor:" (a da lixeira fica)',
    /DELETE FROM corridas_anuladas WHERE data=\? AND chave=\? AND motivo LIKE \?[\s\S]{0,80}'monitor:%'/.test(RES));

  try { db.close(); } catch (e) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); fs.rmSync(D2, { recursive: true, force: true }); } catch (e) {}
  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log = _log; console.log('ERRO: ' + e.stack); process.exit(1); });
