'use strict';
const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { db } = require('../db/database');

const BASE               = process.env.BASE_PATH || '/greyhound';
const BROWSERLESS_TOKEN  = process.env.BROWSERLESS_TOKEN || '2UnDGfhNkfGbb981901301f0f490a53b587deeb6313c634d1';
const BROWSERLESS_WS     = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`;

// ── Status em memória ─────────────────────────────────────────────────────────
const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, updated: 0 };

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

  status.running       = true;
  status.stopRequested = false;
  status.logs          = [];
  status.processed     = 0;
  status.updated       = 0;

  const DATE = targetDate || new Date().toISOString().slice(0, 10);
  addLog('info', `🗓️ Processando resultados de ${DATE}`);

  let browser = null;
  try {
    const puppeteer = require('puppeteer');
    addLog('info', '🌐 Conectando ao Browserless...');
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    addLog('ok', '✅ Conectado!');

    let page = await browser.newPage();
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
        await new Promise(r => setTimeout(r, 6000)); // aguardar SPA carregar

        // Extrair posições — dump de texto puro para debug
        const pageData = await page.evaluate(() => {
          const title = document.title || '';
          const url   = window.location.href;
          const text  = (document.body.innerText || '').slice(0, 3000);
          const html  = (document.body.innerHTML || '').slice(0, 5000);

          // Link do vídeo
          const videoEl  = document.querySelector('a[href*="replay"], a[href*="video"], [class*="replay"]');
          const videoUrl = videoEl?.getAttribute('href') || videoEl?.getAttribute('data-url') || '';

          return { title, url, text, html: html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '), videoUrl };
        });

        addLog('info', `📄 Título: "${pageData.title.slice(0,60)}" | URL: ${pageData.url.slice(0,80)}`);
        addLog('info', `📝 Texto: ${pageData.html.slice(0,200)}`);

        // Extrair posições via regex no texto limpo
        const positions = [];
        const cleanText = pageData.html;

        // Padrão 1: "1 3 DogName" ou "1st 3 DogName" (pos trap nome)
        const matches1 = [...cleanText.matchAll(/\b([1-6])(?:st|nd|rd|th)?\s+([1-6])\s+[A-Z][a-z]/g)];
        matches1.forEach(m => {
          const pos = parseInt(m[1]), trap = parseInt(m[2]);
          if (!positions.find(p => p.pos === pos)) positions.push({ pos, trap });
        });

        // Padrão 2: "Trap 3 ... 1st" ou "T3 1st"
        if (positions.length < 3) {
          const matches2 = [...cleanText.matchAll(/[Tt]rap\s*([1-6])[^0-9]*?([1-6])(?:st|nd|rd|th)/g)];
          matches2.forEach(m => {
            const trap = parseInt(m[1]), pos = parseInt(m[2]);
            if (!positions.find(p => p.pos === pos)) positions.push({ pos, trap });
          });
        }

        const result = {
          positions: positions.sort((a,b) => a.pos - b.pos).slice(0,6),
          videoUrl: pageData.videoUrl,
          debug: pageData.html.slice(0,200)
        };

        addLog('info', `🔎 Posições extraídas: ${JSON.stringify(result.positions)}`);uireAdmin } = require('../middleware/auth');
const { db } = require('../db/database');

const BASE               = process.env.BASE_PATH || '/greyhound';
const BROWSERLESS_TOKEN  = process.env.BROWSERLESS_TOKEN || '2UnDGfhNkfGbb981901301f0f490a53b587deeb6313c634d1';
const BROWSERLESS_WS     = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`;

// ── Status em memória ─────────────────────────────────────────────────────────
const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, updated: 0 };

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

  status.running       = true;
  status.stopRequested = false;
  status.logs          = [];
  status.processed     = 0;
  status.updated       = 0;

  const DATE = targetDate || new Date().toISOString().slice(0, 10);
  addLog('info', `🗓️ Processando resultados de ${DATE}`);

  let browser = null;
  try {
    const puppeteer = require('puppeteer');
    addLog('info', '🌐 Conectando ao Browserless...');
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    addLog('ok', '✅ Conectado!');

    let page = await browser.newPage();
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
        await new Promise(r => setTimeout(r, 6000)); // aguardar SPA carregar

        // Extrair posições e link do vídeo
        const result = await page.evaluate(() => {
          const positions = [];

          // Abordagem 1: procurar todos os elementos que têm número de trap
          // Racing Post greyhoundbet usa estrutura própria
          const allEls = document.querySelectorAll('*');
          const trapCandidates = [];

          allEls.forEach(el => {
            const cls = (el.className || '').toLowerCase();
            const txt = (el.textContent || '').trim();
            if ((cls.includes('trap') || cls.includes('runner') || cls.includes('result')) &&
                txt.length < 200) {
              trapCandidates.push({ cls, txt: txt.slice(0, 100) });
            }
          });

          // Abordagem 2: buscar tabela de resultados por padrão de texto
          // Procurar células com apenas "1", "2", "3" etc. seguidas de trap numbers
          const cells = document.querySelectorAll('td, .cell, [class*="cell"], [class*="Col"]');
          const numCells = [];
          cells.forEach(cell => {
            const n = parseInt((cell.textContent || '').trim());
            if (n >= 1 && n <= 6 && cell.textContent.trim().length <= 2) {
              numCells.push({ el: cell, n });
            }
          });

          // Tentar achar pares posição+trap em células adjacentes
          for (let i = 0; i < numCells.length - 1; i++) {
            const a = numCells[i];
            const b = numCells[i+1];
            // Se dois números entre 1-6 adjacentes, provavelmente pos+trap
            if (a.n !== b.n && a.n >= 1 && a.n <= 6 && b.n >= 1 && b.n <= 6) {
              // Verificar se são irmãos ou próximos no DOM
              const aParent = a.el.parentElement;
              const bParent = b.el.parentElement;
              if (aParent === bParent || aParent?.parentElement === bParent?.parentElement) {
                if (!positions.find(p => p.pos === a.n)) {
                  positions.push({ pos: a.n, trap: b.n });
                }
              }
            }
          }

          // Abordagem 3: regex no texto completo da página
          if (positions.length < 3) {
            const bodyText = document.body.innerText || '';
            // Padrões como "1st Trap 3" ou "1 T3" ou "Position 1 ... Trap 3"
            const patterns = [
              /(\d)(?:st|nd|rd|th)?\s+(?:Trap\s*)?(\d)\b/gi,
              /Pos[^\d]*(\d)[^\d]*(\d)/gi,
            ];
            patterns.forEach(re => {
              let m;
              while ((m = re.exec(bodyText)) !== null) {
                const pos = parseInt(m[1]);
                const trap = parseInt(m[2]);
                if (pos >= 1 && pos <= 6 && trap >= 1 && trap <= 6) {
                  if (!positions.find(p => p.pos === pos)) {
                    positions.push({ pos, trap });
                  }
                }
              }
            });
          }

          // Debug: classes e texto dos primeiros elementos relevantes
          const debug = trapCandidates.slice(0, 5).map(t => t.cls + ':' + t.txt.slice(0, 40)).join(' | ');

          // Link do vídeo
          const videoEl = document.querySelector(
            'a[href*="replay"], a[href*="video"], [class*="replay"], [class*="video"]'
          );
          const videoUrl = videoEl?.getAttribute('href') || videoEl?.getAttribute('data-url') || '';

          return { positions: positions.sort((a, b) => a.pos - b.pos).slice(0, 6), videoUrl, debug };
        });

        if (result.debug) addLog('info', \`🔍 Debug ${link.rTime}: \${result.debug.slice(0,100)}\`);

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
        // Reconectar se frame foi destruído
        if (e.message.includes('detached') || e.message.includes('Detached') || e.message.includes('Target')) {
          addLog('info', '🔄 Reconectando ao Browserless...');
          try {
            const puppeteer = require('puppeteer');
            browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 900 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
            addLog('ok', '✅ Reconectado!');
          } catch(e2) {
            addLog('err', `❌ Falha ao reconectar: ${e2.message}`);
            break;
          }
        }
      }

      // Verificar stop
      if(status.stopRequested){ addLog('warn','⏹️ Parado pelo usuário.');break; }
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

router.post('/stop', requireAdmin, (req, res) => {
  if (!status.running) return res.json({ ok: true, msg: 'Não está rodando' });
  status.stopRequested = true;
  addLog('warn', '⏹️ Parada solicitada...');
  res.json({ ok: true });
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
module.exports.requestStop = () => { status.stopRequested = true; };