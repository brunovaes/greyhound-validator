'use strict';
const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { db } = require('../db/database');

const BASE               = process.env.BASE_PATH || '/greyhound';
const BROWSERLESS_TOKEN  = process.env.BROWSERLESS_TOKEN || '2UnDGfhNkfGbb981901301f0f490a53b587deeb6313c634d1';
const BROWSERLESS_WS     = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`;

// ── Status em memória ─────────────────────────────────────────────────────────
const status = { running: false, logs: [], lastRun: null, processed: 0, updated: 0 };

function addLog(type, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  status.logs.push({ type, msg, ts });
  if (status.logs.length > 200) status.logs.shift();
  console.log(`[RESULTS-ROBOT] [${type}] ${msg}`);
}

// ── Converte hora do banco (ex: "1:06") para 24h UK (ex: "13:06") ─────────────
function horaTo24h(hora) {
  if (!hora) return '';
  const [h, m] = hora.split(':');
  const hr = parseInt(h);
  // Lógica: 10-12 = AM (mantém), 1-9 = PM (+12)
  const h24 = (hr >= 1 && hr <= 9) ? hr + 12 : hr;
  return `${h24}:${m}`;
}

// ── Converte hora do banco para formato Racing Post URL (ex: "13:06") ─────────
function horaToRPTime(hora) {
  return horaTo24h(hora); // Racing Post usa 24h no URL
}

// ── Converte 24h → 12h (como guardamos no banco) ─────────────────────────────
function hora24To12(h24) {
  const [h, m] = h24.split(':');
  let hr = parseInt(h);
  if (hr > 12) hr -= 12;
  if (hr === 0) hr = 12;
  return `${hr}:${m}`;
}

// ── Robô principal ────────────────────────────────────────────────────────────
async function runResultsRobot(targetDate) {
  if (status.running) { addLog('warn', '⚠️ Robô já está rodando.'); return; }

  status.running  = true;
  status.logs     = [];
  status.processed = 0;
  status.updated  = 0;

  const DATE = targetDate || new Date().toISOString().slice(0, 10);
  addLog('info', `🗓️ Processando resultados de ${DATE}`);

  let browser = null;
  try {
    const puppeteer = require('puppeteer');
    addLog('info', '🌐 Conectando ao Browserless...');
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    addLog('ok', '✅ Conectado!');

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

    // ── 1. Abrir lista de resultados do dia ─────────────────────────────────
    const LIST_URL = `https://greyhoundbet.racingpost.com/#results-list/r_date=${DATE}`;
    addLog('info', `📋 Abrindo: ${LIST_URL}`);
    await page.goto(LIST_URL, { timeout: 30000, waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 6000));

    // ── 2. Extrair links de resultados ──────────────────────────────────────
    const raceLinks = await page.evaluate(() => {
      const links = [];
      const seen  = new Set();
      document.querySelectorAll('a[href*="result-meeting-result"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (seen.has(href)) return;
        seen.add(href);

        const raceId  = href.match(/race_id=(\d+)/)?.[1];
        const trackId = href.match(/track_id=(\d+)/)?.[1];
        const rTime   = href.match(/r_time=([^&]+)/)?.[1];
        const rDate   = href.match(/r_date=([^&]+)/)?.[1];

        if (!raceId || !rTime) return;

        // Pega nome do track do contexto visual
        const ctx  = a.closest('li, tr, div.rp-module') || a.parentElement;
        const text = (ctx || a).textContent.trim();

        links.push({ href, raceId, trackId, rTime, rDate, text: text.slice(0, 60) });
      });
      return links;
    });

    addLog('info', `🔍 ${raceLinks.length} corridas encontradas na página`);
    if (!raceLinks.length) {
      addLog('warn', '⚠️ Nenhuma corrida encontrada. O site pode estar bloqueando ou não há resultados ainda.');
      return;
    }

    // ── 3. Buscar corridas sem resultado no banco ────────────────────────────
    
    // Busca corridas do dia em sessões, sem resultado
    const dbRaces = db.prepare(`
      SELECT r.id, r.hora, r.corrida, r.trap_fav, r.trap_und, r.bateu
      FROM races r
      JOIN race_sessions s ON s.id = r.session_id
      WHERE s.created_at >= date(?) AND r.nivel != 'skip'
      ORDER BY r.hora
    `).all(DATE);

    addLog('info', `📊 ${dbRaces.length} corridas no banco para ${DATE}`);

    // ── 4. Para cada link → extrair resultado ──────────────────────────────
    const updateStmt = db.prepare(`
      UPDATE races 
      SET bateu=?, resultado_1=?, resultado_2=?, resultado_3=?, video_url=?
      WHERE id=?
    `);

    for (const link of raceLinks) {
      // Tenta fazer match pelo horário
      // Racing Post usa 24h no URL (ex: "13:06"), banco guarda 12h (ex: "1:06")
      const hora12 = hora24To12(link.rTime);

      const dbRace = dbRaces.find(r => {
        const rHora = r.hora || '';
        return rHora === hora12 || rHora === link.rTime ||
               horaToRPTime(rHora) === link.rTime;
      });

      if (!dbRace) {
        addLog('info', `⏩ ${link.rTime} — sem match no banco`);
        continue;
      }

      status.processed++;
      addLog('info', `🔎 Processando ${link.rTime} → ${dbRace.corrida}`);

      try {
        const RESULT_URL = `https://greyhoundbet.racingpost.com/${link.href.replace(/^#/, '')}`;
        const FULL_URL   = `https://greyhoundbet.racingpost.com/#${link.href.replace(/^#/, '')}`;

        await page.goto(FULL_URL, { timeout: 20000, waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 4000));

        // Extrair posições e link do vídeo
        const result = await page.evaluate(() => {
          const positions = [];

          // Tentar pegar runners em ordem de chegada
          // O Racing Post mostra uma tabela com as posições
          const rows = document.querySelectorAll(
            '.rp-racecard-horse, .rp-horseTable-horseRow, tr[data-trap], .rp-result-row, .rp-module-card-row'
          );

          rows.forEach(row => {
            const posEl  = row.querySelector('.rp-horseTable-pos, .rp-result-pos, [class*="position"], .pos');
            const trapEl = row.querySelector('.rp-horseTable-trap, [class*="trap"], .trap, .rp-trap');
            const pos    = parseInt((posEl?.textContent || '').trim());
            const trap   = parseInt((trapEl?.textContent || '').trim());
            if (pos > 0 && trap > 0 && pos <= 6) {
              positions.push({ pos, trap });
            }
          });

          // Fallback: tentar via texto estruturado
          if (!positions.length) {
            const allText = document.body.innerText;
            const lines   = allText.split('\n').map(l => l.trim()).filter(Boolean);
            lines.forEach(line => {
              const m = line.match(/^(\d+)[^\d]+Trap\s*(\d)/i);
              if (m) positions.push({ pos: parseInt(m[1]), trap: parseInt(m[2]) });
            });
          }

          // Link do vídeo
          const videoEl = document.querySelector(
            'a[href*="replay"], a[href*="video"], button[data-video], [class*="replay"] a'
          );
          const videoUrl = videoEl?.getAttribute('href') || videoEl?.getAttribute('data-url') || '';

          return { positions: positions.sort((a, b) => a.pos - b.pos), videoUrl };
        });

        if (!result.positions.length) {
          addLog('warn', `⚠️ ${link.rTime} — sem posições extraídas`);
          continue;
        }

        const p1 = result.positions.find(p => p.pos === 1)?.trap || null;
        const p2 = result.positions.find(p => p.pos === 2)?.trap || null;
        const p3 = result.positions.find(p => p.pos === 3)?.trap || null;

        const bateu = (p1 !== null && p1 === dbRace.trap_fav) ? 'sim' : 'nao';

        updateStmt.run(bateu, p1, p2, p3, result.videoUrl || null, dbRace.id);
        status.updated++;

        addLog(bateu === 'sim' ? 'ok' : 'info',
          `${bateu === 'sim' ? '✅' : '❌'} ${dbRace.corrida} ${link.rTime} — ` +
          `1°:T${p1} 2°:T${p2} 3°:T${p3} | ` +
          `Fav:T${dbRace.trap_fav} → ${bateu.toUpperCase()}`
        );

      } catch (e) {
        addLog('err', `❌ Erro ao processar ${link.rTime}: ${e.message}`);
      }

      // Pausa entre corridas
      await new Promise(r => setTimeout(r, 2000));
    }

    status.lastRun = new Date().toISOString();
    addLog('ok', `✅ Concluído! ${status.updated}/${status.processed} corridas atualizadas`);

  } catch (e) {
    addLog('err', `❌ Erro fatal: ${e.message}`);
  } finally {
    if (browser) { try { await browser.disconnect(); } catch(e) {} }
    status.running = false;
  }
}

// ── Cron: todo dia às 23:00 UK (horário de Londres) ─────────────────────────
function startCron() {
  try {
    const cron = require('node-cron');
    cron.schedule('0 23 * * *', () => {
      const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      addLog('info', `⏰ Cron disparou às 23:00 UK para ${date}`);
      runResultsRobot(date).catch(e => addLog('err', e.message));
    }, { timezone: 'Europe/London' });
    console.log('[RESULTS-ROBOT] Cron agendado para 23:00 UK');
  } catch(e) {
    console.warn('[RESULTS-ROBOT] node-cron não disponível:', e.message);
  }
}
// cron iniciado via startCron() exportado
// ── Rotas ─────────────────────────────────────────────────────────────────────
router.get('/status', requireAdmin, (req, res) => {
  res.json(status);
});

router.post('/run', requireAdmin, (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  if (status.running) return res.status(409).json({ error: 'Robô já está rodando' });
  runResultsRobot(date).catch(e => addLog('err', e.message));
  res.json({ ok: true, date });
});

// Expõe a função para o cron
module.exports = router;
module.exports.runResultsRobot = runResultsRobot;
module.exports.getResultsStatus = () => ({ ...status });
module.exports.startCron = startCron;