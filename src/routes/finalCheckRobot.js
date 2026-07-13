'use strict';
// src/routes/finalCheckRobot.js
// Checagem final, pertinho da corrida (15 min antes por padrao, configuravel
// em Configuracoes). Compara o card ao vivo contra o que foi analisado de
// manha. Se bater 100% (mesmos traps, mesmos galgos), so marca como
// validado. Se mudou QUALQUER coisa (retirada, troca, o que for), descarta a
// analise antiga inteira e refaz do zero: gera um PDF novo exclusivo dessa
// corrida (com o card atualizado, direto da pagina ao vivo), reprocessa com
// o parser (leitura de badge — sempre acerta o trap, mesmo com card
// incompleto) e a engine de pontuacao — em vez de tentar remendar o que ja
// existe.
//
// Diferenca de proposito em relacao ao cardMonitorRobot.js (que continua
// existindo, rodando de hora em hora ao longo do dia inteiro): aquele e uma
// rede de seguranca ampla e leve (corrige por cima quando da pra emendar,
// so invalida quando nao da). Esse aqui e a ultima palavra, focado so nas
// corridas prestes a rodar, e prefere refazer tudo a arriscar remendo.

const { db, getUserConfig, saveRobotLog, loadRobotLog, getTrapBadgeColors, saveTrapBadgeColors } = require('../db/database');
const { processarCorrida } = require('./api');
const { parseRacingPostPDF } = require('../utils/pdfParser');
const { logChanges } = require('../utils/auditLog');
const {
  extractTrackFromText,
  extractCurrentRunnersFromText,
  matchRunnersToRaceCard,
  trackAbbrMatches,
  horaUkParaMinutosBrt,
  agoraMinutosBrt
} = require('./cardMonitorRobot');
const fs = require('fs');
const path = require('path');

require('dns').setDefaultResultOrder('ipv4first');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'greyhound2024';
const BROWSERLESS_HOST  = process.env.BROWSERLESS_HOST  || 'chromium.railway.internal';
const BROWSERLESS_PORT  = process.env.BROWSERLESS_PORT  || '8080';
const BROWSERLESS_WS    = `ws://${BROWSERLESS_HOST}:${BROWSERLESS_PORT}?token=${BROWSERLESS_TOKEN}`;

const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, ok: 0, refeitas: 0, erros: 0 };

function addLog(type, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  status.logs.push({ type, msg, ts });
  if (status.logs.length > 400) status.logs.shift();
  console.log(`[FINAL-CHECK] [${type}] ${msg}`);
}

// Reproduz a mesma formatacao de nome de arquivo usada no robot.js (mantida
// aqui separada de proposito — evita depender do robot.js so por causa de
// uma funcao pura de 6 linhas, o que economiza uma dependencia circular
// desnecessaria entre os dois arquivos de robo).
function formatTime(t) {
  const m = (t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return (t || '').replace(':', '.');
  const h = parseInt(m[1]);
  const min = m[2];
  const ampm = (h >= 10 && h <= 11) ? 'AM' : 'PM';
  return h + '.' + min + ampm;
}
const PDF_BASE = process.env.PDF_PATH || path.join(__dirname, '../../public/pdfs');
function getPdfDir(date) { return path.join(PDF_BASE, date); }

// Acha quantos minutos faltam pra cada corrida (BRT) e filtra so as que
// estao dentro da janela de checagem final AGORA. Janela larga o suficiente
// (minAntes-10 ate minAntes) pra cobrir folga entre execucoes do cron sem
// deixar nenhuma corrida escapar sem checagem nem checar a mesma duas vezes
// (final_check_status IS NULL no SELECT ja impede reprocessar).
function corridasNaJanela(dbRaces, minAntes) {
  const agora = agoraMinutosBrt();
  return dbRaces.filter(function(r) {
    const m = horaUkParaMinutosBrt(r.hora);
    if (m === null) return false;
    const faltam = m - agora;
    return faltam <= minAntes && faltam >= (minAntes - 10);
  });
}

async function runFinalCheckRobot(targetDate) {
  if (status.running) { addLog('warn', 'Robo ja esta rodando.'); return; }
  status.running = true; status.stopRequested = false;
  status.logs = []; status.processed = 0; status.ok = 0; status.refeitas = 0; status.erros = 0;

  const DATE = targetDate || (function() {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000); // hoje em BRT
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();

  let minAntes = 15;
  try {
    const cfg = db.prepare('SELECT final_check_min_antes FROM analysis_config WHERE user_id=1').get();
    if (cfg && cfg.final_check_min_antes) minAntes = parseInt(cfg.final_check_min_antes);
  } catch (e) {}

  const dbRaces = db.prepare(
    "SELECT r.id, r.user_id, r.hora, r.hora_br, r.corrida, r.dist, r.trap_fav, r.name_fav, r.trap_und, r.name_und, " +
    "r.race_card, r.track_full, r.pct, r.nivel " +
    "FROM races r JOIN race_sessions s ON s.id = r.session_id " +
    "WHERE date(s.created_at, '-3 hours')=? AND r.nivel != 'skip' AND r.final_check_status IS NULL"
  ).all(DATE);

  const candidatas = corridasNaJanela(dbRaces, minAntes);

  if (!candidatas.length) {
    addLog('info', 'Nenhuma corrida na janela de checagem final (' + minAntes + ' min antes) agora.');
    status.running = false;
    status.lastRun = new Date().toISOString();
    saveRobotLog('final_check', status);
    return;
  }

  addLog('info', candidatas.length + ' corrida(s) na janela de checagem final: ' + candidatas.map(function(c) { return c.corrida + ' ' + c.hora; }).join(', '));

  let browser = null, page = null;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

    const LIST_URL = `https://greyhoundbet.racingpost.com/#meeting-list/view=time&r_date=${DATE}`;
    await page.goto(LIST_URL, { timeout: 30000, waitUntil: 'networkidle0' });
    await new Promise(function(r) { setTimeout(r, 7000); });

    const races = await page.evaluate(function() {
      const results = [], seen = new Set();
      document.querySelectorAll('a[href*="meeting-races"], a[href*="card/race_id"]').forEach(function(a) {
        const href = a.getAttribute('href') || '';
        if (seen.has(href)) return;
        seen.add(href);
        const raceId = (href.match(/race_id=(\d+)/) || [])[1];
        if (!raceId) return;
        const ctx = a.closest('li, div, tr') || a.parentElement;
        const text = (ctx || a).textContent || '';
        const timeMatch = text.match(/(\d{1,2}:\d{2})/);
        results.push({ href, raceId, time: timeMatch ? timeMatch[1] : '' });
      });
      return results;
    });
    addLog('info', races.length + ' corridas encontradas na lista ao vivo.');

    for (let i = 0; i < candidatas.length; i++) {
      const dbRace = candidatas[i];
      if (status.stopRequested) { addLog('warn', 'Parado pelo usuario.'); break; }
      status.processed++;

      try {
        let raceCard = [];
        try { if (dbRace.race_card) raceCard = JSON.parse(dbRace.race_card); } catch (e) {}
        if (!raceCard.length) { addLog('warn', dbRace.corrida + ' ' + dbRace.hora + ' — sem race_card salvo, pulando'); continue; }

        const trackAbbr = (dbRace.corrida || '').split(' ')[0];
        const candidates = races.filter(function(r) { return r.time === dbRace.hora; });
        if (!candidates.length) {
          addLog('warn', dbRace.corrida + ' ' + dbRace.hora + ' — nao esta mais na lista ao vivo (corrida pode ja ter comecado), pulando checagem final');
          continue;
        }

        let cardText = null, scrapedTrack = '';
        for (let ci = 0; ci < candidates.length; ci++) {
          const raceHash = candidates[ci].href.replace(/^#/, '');
          await page.goto('https://greyhoundbet.racingpost.com/', { timeout: 30000, waitUntil: 'domcontentloaded' });
          await new Promise(function(r) { setTimeout(r, 1500); });
          await page.evaluate(function(hash) { window.location.hash = hash; }, raceHash);
          try {
            await page.waitForSelector('.RC-runnerTable, .RC-cardPage, [class*="runnerTable"], [class*="cardPage"], [class*="RC-runner"], tbody tr', { timeout: 15000 });
            await new Promise(function(r) { setTimeout(r, 1500); });
          } catch (e) { await new Promise(function(r) { setTimeout(r, 4000); }); }
          const text = await page.evaluate(function() { return (document.body.innerText || '').slice(0, 6000); });
          const track = extractTrackFromText(text);
          if (trackAbbrMatches(trackAbbr, track)) { cardText = text; scrapedTrack = track; break; }
        }

        if (!cardText) { addLog('warn', dbRace.corrida + ' ' + dbRace.hora + ' — nao encontrei a pagina certa, pulando'); status.erros++; continue; }

        const currentRunners = extractCurrentRunnersFromText(cardText);
        if (!currentRunners.length) { addLog('warn', dbRace.corrida + ' ' + dbRace.hora + ' — nao consegui ler os corredores atuais, pulando'); status.erros++; continue; }

        const matchResult = matchRunnersToRaceCard(currentRunners, raceCard);
        if (!matchResult.ok) { addLog('warn', dbRace.corrida + ' ' + dbRace.hora + ' — extracao inconsistente, pulando pra nao arriscar'); status.erros++; continue; }

        if (!matchResult.changes.length && !matchResult.vagos.length) {
          db.prepare("UPDATE races SET final_check_status='ok', final_check_at=CURRENT_TIMESTAMP WHERE id=?").run(dbRace.id);
          status.ok++;
          addLog('ok', dbRace.corrida + ' ' + dbRace.hora + ' — card intacto, validado (nada mudou desde a analise da manha).');
          await new Promise(function(r) { setTimeout(r, 1500); });
          continue;
        }

        addLog('warn', dbRace.corrida + ' ' + dbRace.hora + ' — card mudou (' +
          (matchResult.changes.length ? matchResult.changes.length + ' troca(s) ' : '') +
          (matchResult.vagos.length ? matchResult.vagos.length + ' vaga(s)' : '') +
          ') — descartando analise antiga e refazendo do zero...');

        // Clica na aba Form — precisa do historico completo dos 6 galgos pra
        // o PDF novo sair valido (mesmo formato que o robo de PDFs gera).
        try {
          const formTab = await page.$('a[href*="form"], button[class*="form"], .RC-tabs__tab--form, [class*="tab"][class*="form"], a.RC-meetingTabs__tab');
          if (formTab) { await formTab.click(); }
          else {
            await page.evaluate(function() {
              const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
              const t = tabs.find(function(x) { return x.textContent.trim().toLowerCase() === 'form'; });
              if (t) t.click();
            });
          }
          await new Promise(function(r) { setTimeout(r, 2500); });
        } catch (e) {
          addLog('warn', '  nao consegui clicar na aba Form: ' + e.message);
        }

        await page.addStyleTag({ content: `
          @media print {
            body { background: white !important; color: black !important; }
            nav, .RC-header, [class*="header__nav"], [class*="banner"], [class*="cookie"],
            [class*="advertisement"], [class*="sticky"], footer { display: none !important; }
          }
        `});
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' } });

        const PDF_DIR = getPdfDir(DATE);
        if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
        const trackFileName = (scrapedTrack || trackAbbr).split(/[\s,]/)[0].replace(/[^a-zA-Z]/g, '');
        const filename = formatTime(dbRace.hora) + '_' + trackFileName + '_refeito.pdf';
        try { fs.writeFileSync(path.join(PDF_DIR, filename), pdfBuffer); } catch (e) { addLog('warn', '  nao consegui salvar o PDF novo em disco: ' + e.message); }

        const palette = getTrapBadgeColors() || undefined;
        const resultParse = await parseRacingPostPDF(pdfBuffer, palette);

        if (!resultParse) {
          addLog('err', dbRace.corrida + ' ' + dbRace.hora + ' — nao consegui reprocessar o PDF novo (parse falhou). Mantendo analise antiga sem marcar como validada — vai cair de novo na proxima janela se ainda der tempo, ou fica pra revisao manual.');
          status.erros++;
          await new Promise(function(r) { setTimeout(r, 1500); });
          continue;
        }
        if (resultParse.badgeCalibration) saveTrapBadgeColors(resultParse.badgeCalibration);

        const config = getUserConfig(dbRace.user_id);
        const novoResultado = processarCorrida(resultParse, config);

        const oldRowForAudit = { trap_fav: dbRace.trap_fav, name_fav: dbRace.name_fav, trap_und: dbRace.trap_und, name_und: dbRace.name_und, pct: dbRace.pct, nivel: dbRace.nivel };
        const newValues = {
          trap_fav: novoResultado.trapFav || 0, name_fav: novoResultado.nameFav || '',
          trap_und: novoResultado.trapUnd || 0, name_und: novoResultado.nameUnd || '',
          pct: novoResultado.pct || 0, nivel: novoResultado.nivel || '',
          perfil_fav: novoResultado.perfilFav || '', perfil_und: novoResultado.perfilUnd || '',
          obs: (novoResultado.obs || '') + ' [Refeita na checagem final — card havia mudado]',
          hist_fav: novoResultado.histFav ? JSON.stringify(novoResultado.histFav) : null,
          hist_und: novoResultado.histUnd ? JSON.stringify(novoResultado.histUnd) : null,
          hist_all: novoResultado.histAll ? JSON.stringify(novoResultado.histAll) : null,
          race_card: novoResultado.raceCard ? JSON.stringify(novoResultado.raceCard) : JSON.stringify(resultParse.galgos.map(function(g) { return { trap: g.trap, nome: g.nome }; })),
          track_full: novoResultado.trackFull || scrapedTrack || dbRace.track_full || null,
          eliminados: novoResultado.eliminados ? JSON.stringify(novoResultado.eliminados) : null,
          post_pick: novoResultado.postPick || null,
          scores_json: novoResultado.scores ? JSON.stringify(novoResultado.scores) : null
        };

        logChanges(dbRace.id, 'final_check_robot', oldRowForAudit, newValues, ['trap_fav', 'name_fav', 'trap_und', 'name_und', 'pct', 'nivel']);

        db.prepare(
          'UPDATE races SET trap_fav=?,name_fav=?,trap_und=?,name_und=?,pct=?,nivel=?,perfil_fav=?,perfil_und=?,obs=?,hist_fav=?,hist_und=?,hist_all=?,race_card=?,track_full=?,eliminados=?,post_pick=?,scores_json=?,final_check_status=?,final_check_at=CURRENT_TIMESTAMP WHERE id=?'
        ).run(
          newValues.trap_fav, newValues.name_fav, newValues.trap_und, newValues.name_und, newValues.pct, newValues.nivel,
          newValues.perfil_fav, newValues.perfil_und, newValues.obs, newValues.hist_fav, newValues.hist_und, newValues.hist_all,
          newValues.race_card, newValues.track_full, newValues.eliminados, newValues.post_pick, newValues.scores_json,
          novoResultado.nivel === 'skip' ? 'refeita_skip' : 'refeita',
          dbRace.id
        );

        status.refeitas++;
        addLog('ok', '  ' + dbRace.corrida + ' ' + dbRace.hora + ' — REFEITA: novo AvB T' + newValues.trap_fav + ' ' + newValues.name_fav + ' vs T' + newValues.trap_und + ' ' + newValues.name_und + ' (' + newValues.pct + '% ' + newValues.nivel + ')');

      } catch (e) {
        addLog('err', 'Erro em ' + dbRace.corrida + ' ' + dbRace.hora + ': ' + e.message);
        status.erros++;
      }
      await new Promise(function(r) { setTimeout(r, 1500); });
    }

    status.lastRun = new Date().toISOString();
    addLog('ok', 'Concluido! ' + status.processed + ' processada(s), ' + status.ok + ' ja estavam ok, ' + status.refeitas + ' refeita(s), ' + status.erros + ' erro(s)');

  } catch (e) {
    addLog('err', 'Erro fatal: ' + e.message);
  } finally {
    if (browser) { try { await browser.disconnect(); } catch (e) {} }
    status.running = false;
    saveRobotLog('final_check', status);
  }
}

module.exports = {
  runFinalCheckRobot,
  getFinalCheckStatus: () => ({ ...status }),
  requestStop: () => { status.stopRequested = true; }
};