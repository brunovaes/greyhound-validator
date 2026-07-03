'use strict';
const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { db } = require('../db/database');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '2UnDGfhNkfGbb981901301f0f490a53b587deeb6313c634d1';
const BROWSERLESS_WS    = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`;

const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, updated: 0 };

function addLog(type, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  status.logs.push({ type, msg, ts });
  if (status.logs.length > 300) status.logs.shift();
  console.log(`[RESULTS] [${type}] ${msg}`);
}

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
  const h24 = (hr >= 1 && hr <= 9) ? hr + 12 : hr;
  return h24 + ':' + min;
}

// ── Extrai nomes dos cães por posição ─────────────────────────────────────────
// Formato da página: "1 st Dog Name bk d ... 2 nd Other Dog bd b ..."
function extractFinishingOrder(text) {
  const results = [];
  // Separar por marcadores de posição: "1 st", "2 nd", "3 rd", "4 th", etc.
  // Usar split para dividir o texto nas posições
  const parts = text.split(/\b(\d)\s*(?:st|nd|rd|th)\s+/);
  // parts[0] = antes de qualquer posição
  // parts[1] = "1", parts[2] = texto depois de "1 st"
  // parts[3] = "2", parts[4] = texto depois de "2 nd"
  // etc.
  for (let i = 1; i < parts.length - 1; i += 2) {
    const pos = parseInt(parts[i]);
    if (pos < 1 || pos > 6) continue;
    const rest = parts[i + 1] || '';
    // Pegar palavras do nome até encontrar token de cor/raça (minúsculo 2-3 letras) ou DNF
    const words = rest.split(/\s+/);
    const nameWords = [];
    for (const word of words) {
      // Parar em palavras de cor/raça: bk, bd, be, bef, bew, wbe, w, f, dkbd, etc.
      if (/^(bk|bd|be|bef|bebd|bew|wbe|wbd|dkbd|dkbe|fawn|fw|DNF)$/i.test(word)) break;
      // Parar se palavra é muito curta e minúscula (provavelmente não é nome)
      if (word.length <= 2 && word === word.toLowerCase()) break;
      // Parar se é número (ex: 29.41)
      if (/^\d/.test(word)) break;
      nameWords.push(word);
      if (nameWords.length >= 4) break; // max 4 palavras no nome
    }
    const name = nameWords.join(' ').trim();
    if (name.length > 1 && !results.find(r => r.pos === pos)) {
      results.push({ pos, name });
    }
  }
  return results;
}

// ── Robô principal ────────────────────────────────────────────────────────────
async function runResultsRobot(targetDate) {
  if (status.running) { addLog('warn', 'Robo ja esta rodando.'); return; }
  status.running = true; status.stopRequested = false;
  status.logs = []; status.processed = 0; status.updated = 0;

  const DATE = targetDate || new Date().toISOString().slice(0, 10);
  addLog('info', 'Processando resultados de ' + DATE);

  let browser = null, page = null;
  try {
    const puppeteer = require('puppeteer');
    addLog('info', 'Conectando ao Browserless...');
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    addLog('ok', 'Conectado!');

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

    // 1. Lista de resultados
    await page.goto(`https://greyhoundbet.racingpost.com/#results-list/r_date=${DATE}`, { timeout: 30000, waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 7000));

    const raceLinks = await page.evaluate(function() {
      const links = [], seen = new Set();
      document.querySelectorAll('a[href]').forEach(function(a) {
        const href = a.getAttribute('href') || '';
        if (!href.includes('result-meeting-result') || seen.has(href)) return;
        seen.add(href);
        const raceId = (href.match(/race_id=(\d+)/) || [])[1];
        const rTime  = (href.match(/r_time=([^&]+)/) || [])[1];
        if (!raceId || !rTime) return;
        links.push({ href, raceId, rTime });
      });
      return links;
    });

    addLog('info', raceLinks.length + ' links encontrados');
    if (!raceLinks.length) { addLog('warn', 'Nenhum resultado na pagina.'); return; }

    // 2. Corridas do banco
    const dbRaces = db.prepare(
      'SELECT r.id, r.hora, r.corrida, r.trap_fav, r.name_fav, r.trap_und, r.name_und, r.bateu ' +
      'FROM races r JOIN race_sessions s ON s.id=r.session_id ' +
      'WHERE date(s.created_at)=? AND r.nivel!=? ORDER BY r.hora'
    ).all(DATE, 'skip');
    addLog('info', dbRaces.length + ' corridas no banco para ' + DATE);

    const updateStmt = db.prepare('UPDATE races SET bateu=?,resultado_1=?,resultado_2=?,resultado_3=?,video_url=? WHERE id=?');

    // 3. Processar cada link
    for (const link of raceLinks) {
      if (status.stopRequested) { addLog('warn', 'Parado pelo usuario.'); break; }

      const hora12 = hora24To12(link.rTime);
      const dbRace = dbRaces.find(function(r) {
        return r.hora === hora12 || r.hora === link.rTime || horaDBTo24(r.hora) === link.rTime;
      });
      if (!dbRace) { addLog('info', 'Sem match: ' + link.rTime + ' (12h=' + hora12 + ')'); continue; }

      status.processed++;
      addLog('info', 'Processando ' + link.rTime + ' -> ' + dbRace.corrida);

      try {
        const url = 'https://greyhoundbet.racingpost.com/' + (link.href.startsWith('#') ? link.href : '#' + link.href);
        await page.goto(url, { timeout: 20000, waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 5000));

        const pageText = await page.evaluate(function() {
          // Link do vídeo
          const videoEl = document.querySelector('a[href*="replay"], a[href*="video"], button[class*="replay"]');
          const videoUrl = videoEl ? (videoEl.getAttribute('href') || videoEl.getAttribute('data-url') || '') : '';
          
          // Tentar extrair trap numbers do HTML (elementos visuais)
          const trapOrder = []; // [{pos, trap}]
          // Procurar elementos de resultado com posição e trap
          const runners = document.querySelectorAll(
            '[class*="runner"],[class*="result"],[class*="rp-horse"],[class*="card-row"]'
          );
          runners.forEach(function(row) {
            const posEl  = row.querySelector('[class*="pos"],[class*="position"],.pos');
            const trapEl = row.querySelector('[class*="trap"],[data-trap]');
            const pos  = parseInt((posEl  ? posEl.textContent  : '').trim());
            const trap = parseInt((trapEl ? trapEl.textContent : '').trim());
            if (pos >= 1 && pos <= 6 && trap >= 1 && trap <= 6) {
              if (!trapOrder.find(function(t){ return t.pos === pos; })) {
                trapOrder.push({ pos: pos, trap: trap });
              }
            }
          });
          
          return {
            text: (document.body.innerText || '').slice(0, 5000),
            videoUrl: videoUrl,
            trapOrder: trapOrder
          };
        });

        addLog('info', 'Texto: ' + pageText.text.slice(0, 200));

        // Extrair ordem de chegada por nome
        const finishing = extractFinishingOrder(pageText.text);
        addLog('info', 'Ordem: ' + JSON.stringify(finishing.slice(0, 4)));

        if (!finishing.length) {
          addLog('warn', link.rTime + ' - sem posicoes (formato inesperado)');
          continue;
        }

        // Determinar bateu comparando nome do vencedor com name_fav
        const winner = finishing.find(f => f.pos === 1);
        const p2     = finishing.find(f => f.pos === 2);
        const p3     = finishing.find(f => f.pos === 3);
        const winName  = (winner ? winner.name : '').toLowerCase().trim();
        const favName  = (dbRace.name_fav || '').toLowerCase().trim();
        const favFirst = favName.split(' ')[0];
        const winFirst = winName.split(' ')[0];

        let bateu = 'nao';
        if (winFirst && favFirst && (winFirst === favFirst || winName.includes(favFirst) || favName.includes(winFirst))) {
          bateu = 'sim';
        }

        // Preferir trap numbers se disponíveis no HTML
        let r1, r2, r3;
        if (pageText.trapOrder && pageText.trapOrder.length >= 3) {
          const t1 = pageText.trapOrder.find(function(t){ return t.pos === 1; });
          const t2 = pageText.trapOrder.find(function(t){ return t.pos === 2; });
          const t3 = pageText.trapOrder.find(function(t){ return t.pos === 3; });
          r1 = t1 ? String(t1.trap) : (winner ? winner.name : null);
          r2 = t2 ? String(t2.trap) : (p2 ? p2.name : null);
          r3 = t3 ? String(t3.trap) : (p3 ? p3.name : null);
          if (t1) addLog('info', 'Traps do HTML: 1o=T' + t1.trap + ' 2o=T' + (t2?t2.trap:'?') + ' 3o=T' + (t3?t3.trap:'?'));
        } else {
          r1 = winner ? winner.name : null;
          r2 = p2 ? p2.name : null;
          r3 = p3 ? p3.name : null;
        }

        updateStmt.run(bateu, r1, r2, r3, pageText.videoUrl || null, dbRace.id);
        status.updated++;

        addLog(bateu === 'sim' ? 'ok' : 'info',
          (bateu === 'sim' ? 'BATEU' : 'NAO') + ' ' + dbRace.corrida + ' ' + link.rTime +
          ' | Vencedor:"' + (r1||'?') + '" | Fav:"' + (dbRace.name_fav||'?') + '"'
        );

      } catch (e) {
        addLog('err', 'Erro ' + link.rTime + ': ' + e.message);
        if (e.message.includes('detached') || e.message.includes('Detached') || e.message.includes('Target')) {
          addLog('info', 'Reconectando...');
          try {
            browser = await require('puppeteer').connect({ browserWSEndpoint: BROWSERLESS_WS });
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 900 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36');
            addLog('ok', 'Reconectado!');
          } catch (e2) { addLog('err', 'Falha reconexao: ' + e2.message); break; }
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
      const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      addLog('info', 'Cron 23:00 UK para ' + date);
      runResultsRobot(date).catch(e => addLog('err', e.message));
    }, { timezone: 'Europe/London' });
    console.log('[RESULTS-ROBOT] Cron agendado 23:00 UK');
  } catch(e) { console.warn('[RESULTS-ROBOT] node-cron indisponivel:', e.message); }
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
router.post('/stop', requireAdmin, (req, res) => {
  status.stopRequested = true;
  addLog('warn', 'Parada solicitada...');
  res.json({ ok: true });
});

router.post('/run', requireAdmin, express.json(), (req, res) => {
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  if (status.running) return res.status(409).json({ error: 'Robo ja rodando' });
  runResultsRobot(date).catch(e => addLog('err', e.message));
  res.json({ ok: true, date });
});

router.get('/status', requireAdmin, (req, res) => res.json(status));

module.exports = router;
module.exports.runResultsRobot  = runResultsRobot;
module.exports.getResultsStatus = () => ({ ...status });
module.exports.startCron        = startCron;
module.exports.requestStop      = () => { status.stopRequested = true; };