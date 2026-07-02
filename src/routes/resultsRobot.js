'use strict';
const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { db } = require('../db/database');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '2UnDGfhNkfGbb981901301f0f490a53b587deeb6313c634d1';
const BROWSERLESS_WS    = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`;

// ── Status ───────────────────────────────────────────────────────────────────
const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, updated: 0 };

function addLog(type, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  status.logs.push({ type, msg, ts });
  if (status.logs.length > 300) status.logs.shift();
  console.log(`[RESULTS] [${type}] ${msg}`);
}

// ── Helpers de hora ──────────────────────────────────────────────────────────
// Racing Post usa 24h nos URLs (ex: "13:41")
// Banco guarda 12h como vem do PDF (ex: "1:41" para 1:41 PM)
function hora24To12(h24) {
  if (!h24) return '';
  const parts = h24.split(':');
  let hr = parseInt(parts[0]);
  const min = parts[1] || '00';
  if (hr > 12) hr = hr - 12;
  if (hr === 0) hr = 12;
  return hr + ':' + min;
}

function horaDBTo24(horaDB) {
  if (!horaDB) return '';
  const parts = horaDB.split(':');
  const hr = parseInt(parts[0]);
  const min = parts[1] || '00';
  // 10-12 = AM, 1-9 = PM
  const h24 = (hr >= 1 && hr <= 9) ? hr + 12 : hr;
  return h24 + ':' + min;
}

// ── Robô principal ────────────────────────────────────────────────────────────
async function runResultsRobot(targetDate) {
  if (status.running) { addLog('warn', 'Robo ja esta rodando.'); return; }

  status.running       = true;
  status.stopRequested = false;
  status.logs          = [];
  status.processed     = 0;
  status.updated       = 0;

  const DATE = targetDate || new Date().toISOString().slice(0, 10);
  addLog('info', 'Processando resultados de ' + DATE);

  let browser = null;
  let page    = null;

  try {
    const puppeteer = require('puppeteer');
    addLog('info', 'Conectando ao Browserless...');
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    addLog('ok', 'Conectado!');

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

    // 1. Abrir lista de resultados
    const LIST_URL = 'https://greyhoundbet.racingpost.com/#results-list/r_date=' + DATE;
    addLog('info', 'Abrindo: ' + LIST_URL);
    await page.goto(LIST_URL, { timeout: 30000, waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 7000));

    addLog('info', 'URL: ' + await page.evaluate(() => window.location.href));

    // 2. Extrair links de resultados
    const raceLinks = await page.evaluate(function() {
      var links = [];
      var seen  = new Set();
      document.querySelectorAll('a[href]').forEach(function(a) {
        var href = a.getAttribute('href') || '';
        if (!href.includes('result-meeting-result')) return;
        if (seen.has(href)) return;
        seen.add(href);
        var raceId  = (href.match(/race_id=(\d+)/)  || [])[1];
        var rTime   = (href.match(/r_time=([^&]+)/) || [])[1];
        var trackId = (href.match(/track_id=(\d+)/) || [])[1];
        if (!raceId || !rTime) return;
        var ctx  = a.closest('li, tr, div') || a.parentElement;
        var text = ((ctx || a).textContent || '').trim().slice(0, 60);
        links.push({ href: href, raceId: raceId, rTime: rTime, trackId: trackId, text: text });
      });
      return links;
    });

    addLog('info', raceLinks.length + ' links de resultados encontrados');
    if (!raceLinks.length) {
      addLog('warn', 'Nenhum resultado encontrado na pagina.');
      return;
    }

    // 3. Buscar corridas do dia no banco
    const dbRaces = db.prepare(
      'SELECT r.id, r.hora, r.corrida, r.trap_fav, r.trap_und, r.bateu ' +
      'FROM races r ' +
      'JOIN race_sessions s ON s.id = r.session_id ' +
      'WHERE date(s.created_at) = ? AND r.nivel != ? ' +
      'ORDER BY r.hora'
    ).all(DATE, 'skip');

    addLog('info', dbRaces.length + ' corridas no banco para ' + DATE);

    const updateStmt = db.prepare(
      'UPDATE races SET bateu=?, resultado_1=?, resultado_2=?, resultado_3=?, video_url=? WHERE id=?'
    );

    // 4. Processar cada corrida
    for (var idx = 0; idx < raceLinks.length; idx++) {
      var link = raceLinks[idx];

      if (status.stopRequested) {
        addLog('warn', 'Parado pelo usuario.');
        break;
      }

      // Tentar match pelo horário
      var hora12 = hora24To12(link.rTime);
      var dbRace = dbRaces.find(function(r) {
        return r.hora === hora12 || r.hora === link.rTime || horaDBTo24(r.hora) === link.rTime;
      });

      if (!dbRace) {
        addLog('info', 'Sem match: ' + link.rTime + ' (12h=' + hora12 + ')');
        continue;
      }

      status.processed++;
      addLog('info', 'Processando ' + link.rTime + ' -> ' + dbRace.corrida);

      try {
        var FULL_URL = 'https://greyhoundbet.racingpost.com/' + (link.href.startsWith('#') ? link.href : '#' + link.href);
        await page.goto(FULL_URL, { timeout: 20000, waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 6000));

        // Extrair texto da página para debug e parsing
        var pageResult = await page.evaluate(function() {
          var title   = document.title || '';
          var url     = window.location.href;
          // Pegar texto limpo
          var bodyText = (document.body.innerText || '').slice(0, 4000);
          // Pegar HTML sem tags para busca mais robusta
          var cleanHtml = (document.body.innerHTML || '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 4000);
          // Link do vídeo
          var videoEl  = document.querySelector('a[href*="replay"], a[href*="video"]');
          var videoUrl = videoEl ? (videoEl.getAttribute('href') || videoEl.getAttribute('data-url') || '') : '';
          return { title: title, url: url, text: bodyText, clean: cleanHtml, videoUrl: videoUrl };
        });

        addLog('info', 'Titulo: "' + pageResult.title.slice(0, 60) + '"');
        addLog('info', 'Texto: ' + pageResult.clean.slice(0, 300));

        // Extrair posições via regex no texto limpo
        var positions = [];
        var cleanText = pageResult.clean;

        // Padrão: número 1-6 seguido de outro número 1-6 (pos trap)
        var re1 = /\b([1-6])\s+([1-6])\s+[A-Z]/g;
        var m;
        while ((m = re1.exec(cleanText)) !== null) {
          var pos  = parseInt(m[1]);
          var trap = parseInt(m[2]);
          if (!positions.find(function(p) { return p.pos === pos; })) {
            positions.push({ pos: pos, trap: trap });
          }
        }

        addLog('info', 'Posicoes: ' + JSON.stringify(positions));

        if (!positions.length) {
          addLog('warn', link.rTime + ' - sem posicoes extraidas (pagina pode estar diferente)');
          continue;
        }

        var p1    = (positions.find(function(p) { return p.pos === 1; }) || {}).trap || null;
        var p2    = (positions.find(function(p) { return p.pos === 2; }) || {}).trap || null;
        var p3    = (positions.find(function(p) { return p.pos === 3; }) || {}).trap || null;
        var bateu = (p1 !== null && p1 === dbRace.trap_fav) ? 'sim' : 'nao';

        updateStmt.run(bateu, p1, p2, p3, pageResult.videoUrl || null, dbRace.id);
        status.updated++;

        addLog(bateu === 'sim' ? 'ok' : 'info',
          (bateu === 'sim' ? 'BATEU' : 'NAO BATEU') + ' ' + dbRace.corrida + ' ' + link.rTime +
          ' | 1:T' + p1 + ' 2:T' + p2 + ' 3:T' + p3 + ' | Fav:T' + dbRace.trap_fav
        );

      } catch (e) {
        addLog('err', 'Erro ' + link.rTime + ': ' + e.message);
        // Reconectar se frame detached
        if (e.message.includes('detached') || e.message.includes('Detached') || e.message.includes('Target')) {
          addLog('info', 'Reconectando ao Browserless...');
          try {
            var puppeteer2 = require('puppeteer');
            browser = await puppeteer2.connect({ browserWSEndpoint: BROWSERLESS_WS });
            page    = await browser.newPage();
            await page.setViewport({ width: 1280, height: 900 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36');
            addLog('ok', 'Reconectado!');
          } catch (e2) {
            addLog('err', 'Falha ao reconectar: ' + e2.message);
            break;
          }
        }
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    status.lastRun = new Date().toISOString();
    addLog('ok', 'Concluido! ' + status.updated + '/' + status.processed + ' corridas atualizadas');

  } catch (e) {
    addLog('err', 'Erro fatal: ' + e.message);
  } finally {
    if (browser) { try { await browser.disconnect(); } catch(e) {} }
    status.running = false;
  }
}

// ── Cron 23:00 UK ────────────────────────────────────────────────────────────
function startCron() {
  try {
    const cron = require('node-cron');
    cron.schedule('0 23 * * *', function() {
      var date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      addLog('info', 'Cron 23:00 UK para ' + date);
      runResultsRobot(date).catch(function(e) { addLog('err', e.message); });
    }, { timezone: 'Europe/London' });
    console.log('[RESULTS-ROBOT] Cron agendado 23:00 UK');
  } catch(e) {
    console.warn('[RESULTS-ROBOT] node-cron indisponivel:', e.message);
  }
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
router.post('/stop', requireAdmin, function(req, res) {
  if (!status.running) return res.json({ ok: true, msg: 'Nao esta rodando' });
  status.stopRequested = true;
  addLog('warn', 'Parada solicitada...');
  res.json({ ok: true });
});

router.post('/run', requireAdmin, express.json(), function(req, res) {
  var date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  if (status.running) return res.status(409).json({ error: 'Robo ja esta rodando' });
  runResultsRobot(date).catch(function(e) { addLog('err', e.message); });
  res.json({ ok: true, date: date });
});

router.get('/status', requireAdmin, function(req, res) {
  res.json(status);
});

module.exports = router;
module.exports.runResultsRobot  = runResultsRobot;
module.exports.getResultsStatus = function() { return Object.assign({}, status); };
module.exports.startCron        = startCron;
module.exports.requestStop      = function() { status.stopRequested = true; };