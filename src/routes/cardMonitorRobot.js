'use strict';
// src/routes/cardMonitorRobot.js
// Robo que varre as corridas do dia de hora em hora, comparando o card atual
// no Racing Post com o race_card salvo na analise da manha. Se detectar
// retirada ou troca de galgo, atualiza o grid E reanalisa so aquela corrida
// (usando a mesma engine de pontuacao do api.js, sem duplicar logica).

const { db, getUserConfig } = require('../db/database');
const { processarCorrida } = require('./api');
const { parseHistoryLine, isHistLine, isColHeader, isBrtLine } = require('../utils/pdfParser');

require('dns').setDefaultResultOrder('ipv4first');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'greyhound2024';
const BROWSERLESS_HOST  = process.env.BROWSERLESS_HOST  || 'chromium.railway.internal';
const BROWSERLESS_PORT  = process.env.BROWSERLESS_PORT  || '8080';
const BROWSERLESS_WS    = `ws://${BROWSERLESS_HOST}:${BROWSERLESS_PORT}?token=${BROWSERLESS_TOKEN}`;

const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, changed: 0, reanalyzed: 0 };

function addLog(type, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  status.logs.push({ type, msg, ts });
  if (status.logs.length > 400) status.logs.shift();
  console.log(`[MONITOR] [${type}] ${msg}`);
}

// Similaridade entre dois strings (mesma logica usada no resultsRobot)
function similarity(a, b) {
  a = (a || '').toLowerCase().replace(/\s/g, '');
  b = (b || '').toLowerCase().replace(/\s/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.9;
  var matches = 0;
  var shorter = a.length < b.length ? a : b;
  var longer  = a.length < b.length ? b : a;
  for (var k = 0; k < shorter.length; k++) {
    if (longer.includes(shorter[k])) matches++;
  }
  return matches / longer.length;
}

// Pista aparece como uma linha isolada, logo ANTES de uma linha tipo "Jul 6"
// (mes abreviado + dia, sem ano) — formato diferente do usado na pagina de
// resultado ("Sheffield 07/07/26"), por isso precisa de logica separada aqui.
function extractTrackFromText(text) {
  const lines = (text || '').split('\n').map(l => l.trim());
  for (let i = 1; i < lines.length; i++) {
    if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(lines[i]) && lines[i-1] && /^[A-Za-z]/.test(lines[i-1])) {
      return lines[i-1];
    }
  }
  return '';
}

// ── Extrai o card ATUAL (trap -> nome) da aba "card" ────────────────────────
// Essa aba mostra uma view tipo "Predictor/Tips", sem numero de trap
// explicito — cada galgo aparece nessa ordem (que corresponde a ordem dos
// traps 1-6): Nome | comentario do tip | "Form: XXXXX Tnr: Fulano" | "SP
// Forecast: X/1 Topspeed: NN". A gente usa esse padrao de 4 linhas pra achar
// os nomes, na ordem, logo apos a linha "Race Status: ...".
function extractCurrentRunnersFromText(text) {
  const runners = [];
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  let idx = lines.findIndex(l => /^Race Status/i.test(l));
  if (idx === -1) idx = 0; else idx++;
  let trap = 1;
  while (idx < lines.length && trap <= 6) {
    if (idx + 2 < lines.length && /^Form:/i.test(lines[idx + 2])) {
      const nome = lines[idx].replace(/\s*\((W|M)\)\s*$/i, '').trim();
      runners.push({ trap, nome });
      trap++;
      idx += 4;
    } else {
      idx++;
    }
  }
  return runners;
}

// ── Extrai o historico (linhas de corrida) de UM galgo especifico dentro do
// texto da aba Form — procura o nome do galgo e le as linhas seguintes que
// batem com o formato de linha de historico (mesmo regex do pdfParser).
// Ordem real observada nessa pagina: Nome -> linha de raca/cor -> linha de
// BRT -> cabecalho de colunas ("Date Track Dis Trp...") -> SO ENTAO vem o
// historico de verdade. Precisa pular tudo isso antes de comecar a colher.
function extractDogHistoricoFromFormText(text, dogName) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  let startIdx = -1;
  let bestScore = 0.55;
  for (let i = 0; i < lines.length; i++) {
    if (isHistLine(lines[i]) || isColHeader(lines[i]) || isBrtLine(lines[i])) continue;
    const score = similarity(lines[i], dogName);
    if (score > bestScore) { bestScore = score; startIdx = i; }
  }
  if (startIdx === -1) return { historico: [], debugNote: 'nome do galgo nao encontrado no texto (score max ' + bestScore.toFixed(2) + ')' };

  // Passo 1: avanca ate achar o cabecalho de colunas (pula raca/cor e BRT)
  let i = startIdx + 1;
  const maxScan = Math.min(lines.length, startIdx + 20);
  let foundColHeader = false;
  while (i < maxScan && !foundColHeader) {
    if (isColHeader(lines[i])) { foundColHeader = true; i++; break; }
    if (isHistLine(lines[i])) break; // ja apareceu historico sem cabecalho — segue mesmo assim
    i++;
  }

  // Passo 2: agora sim colhe as linhas de historico, ate 5 ou ate o padrao quebrar
  const historico = [];
  while (i < maxScan && historico.length < 5) {
    const line = lines[i];
    if (isHistLine(line)) {
      const parsed = parseHistoryLine(line);
      if (parsed) historico.push(parsed);
      i++;
      continue;
    }
    if (historico.length > 0) break; // ja vinha colhendo e quebrou o padrao — acabou o bloco
    i++;
  }
  return { historico, debugNote: 'match "' + lines[startIdx] + '" (score ' + bestScore.toFixed(2) + '), cabecalho colunas ' + (foundColHeader ? 'achado' : 'NAO achado') + ', ' + historico.length + ' linhas extraidas' };
}

// ── Robô principal ────────────────────────────────────────────────────────────
async function runCardMonitorRobot(targetDate) {
  if (status.running) { addLog('warn', 'Robo ja esta rodando.'); return; }
  status.running = true; status.stopRequested = false;
  status.logs = []; status.processed = 0; status.changed = 0; status.reanalyzed = 0;

  const DATE = targetDate || new Date().toISOString().slice(0, 10);
  addLog('info', 'Monitorando cards de ' + DATE);

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

    const LIST_URL = `https://greyhoundbet.racingpost.com/#meeting-list/view=time&r_date=${DATE}`;
    await page.goto(LIST_URL, { timeout: 30000, waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 7000));

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
    addLog('info', races.length + ' corridas encontradas na lista (ainda nao rodadas)');

    // Corridas do banco pra hoje (so as que ja viraram AvB de verdade)
    const dbRaces = db.prepare(
      "SELECT r.id, r.user_id, r.hora, r.corrida, r.dist, r.trap_fav, r.name_fav, r.trap_und, r.name_und, " +
      "r.race_card, r.hist_all, r.top3, r.pct, r.nivel, r.perfil_fav, r.perfil_und " +
      "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
      "WHERE date(s.created_at, '-3 hours')=? AND r.nivel!=? ORDER BY r.hora"
    ).all(DATE, 'skip');
    addLog('info', dbRaces.length + ' corridas no banco para ' + DATE);

    for (const dbRace of dbRaces) {
      if (status.stopRequested) { addLog('warn', 'Parado pelo usuario.'); break; }

      let raceCard = [];
      try { if (dbRace.race_card) raceCard = JSON.parse(dbRace.race_card); } catch(e) {}
      if (!raceCard.length) { addLog('info', dbRace.corrida + ' ' + dbRace.hora + ' — sem race_card salvo, pulando'); continue; }

      // Acha o link correspondente na lista pelo horario (UK 12h cru, igual r.hora)
      const link = races.find(function(r) { return r.time === dbRace.hora; });
      if (!link) { addLog('info', dbRace.corrida + ' ' + dbRace.hora + ' — nao esta mais na lista (ja rodou ou nao encontrada)'); continue; }

      status.processed++;
      addLog('info', 'Verificando ' + dbRace.corrida + ' ' + dbRace.hora + '...');

      try {
        const raceBase = 'https://greyhoundbet.racingpost.com/';
        const raceHash = link.href.replace(/^#/, '');
        await page.goto(raceBase, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1500));
        await page.evaluate(function(hash) { window.location.hash = hash; }, raceHash);

        try {
          await page.waitForSelector(
            '.RC-runnerTable, .RC-cardPage, [class*="runnerTable"], [class*="cardPage"], [class*="RC-runner"], tbody tr',
            { timeout: 15000 }
          );
          await new Promise(r => setTimeout(r, 1500));
        } catch(e) {
          await new Promise(r => setTimeout(r, 4000));
        }

        const cardText = await page.evaluate(function() { return (document.body.innerText || '').slice(0, 6000); });
        const scrapedTrack = extractTrackFromText(cardText);
        addLog('info', '  pista da pagina: "' + scrapedTrack + '"');

        const currentRunners = extractCurrentRunnersFromText(cardText);
        if (!currentRunners.length) {
          addLog('warn', '  nao consegui extrair os corredores atuais dessa pagina (formato inesperado) — pulando');
          addLog('info', '  texto completo (debug): ' + cardText.replace(/\n/g, ' | '));
          continue;
        }

        // A extracao infere o trap pela ORDEM em que os galgos aparecem (essa
        // view nao mostra numero de trap explicito). Isso e confiavel pra
        // SUBSTITUICAO (galgo trocado no mesmo trap), mas se um trap ficar
        // vago SEM substituto, a lista teria menos de 6 nomes e a ordem dos
        // que vem depois desalinha. Se nao vierem exatamente 6, nao arrisca
        // comparar por posicao — so avisa pra checar manualmente.
        if (currentRunners.length !== raceCard.length) {
          addLog('warn', '  ' + dbRace.corrida + ' ' + dbRace.hora + ' — pagina mostra ' + currentRunners.length + ' galgo(s) mas o card salvo tem ' + raceCard.length + '. Pode ser retirada sem substituto — checar manualmente, nao arriscando comparar por posicao.');
          continue;
        }

        // Compara com o race_card salvo
        const changes = [];
        raceCard.forEach(function(g) {
          const atual = currentRunners.find(function(r) { return r.trap === g.trap; });
          if (!atual) return; // nao achou esse trap na pagina — nao mexe (evita falso positivo)
          const score = similarity(atual.nome, g.nome);
          if (score < 0.5) {
            changes.push({ trap: g.trap, nomeAntigo: g.nome, nomeNovo: atual.nome });
          }
        });

        if (!changes.length) {
          addLog('ok', '  ' + dbRace.corrida + ' ' + dbRace.hora + ' — sem alteracoes no card');
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        status.changed++;
        addLog('warn', '  MUDANCA DETECTADA em ' + dbRace.corrida + ' ' + dbRace.hora + ': ' +
          changes.map(function(c){return 'T'+c.trap+' "'+c.nomeAntigo+'" -> "'+(c.nomeNovo||'VAGO')+'"';}).join(', '));

        // Atualiza o race_card com os nomes novos (mesmo se nao conseguir reanalisar depois)
        const novoRaceCard = raceCard.map(function(g) {
          const ch = changes.find(function(c) { return c.trap === g.trap; });
          return ch ? { trap: g.trap, nome: ch.nomeNovo } : g;
        });
        db.prepare('UPDATE races SET race_card=? WHERE id=?').run(JSON.stringify(novoRaceCard), dbRace.id);

        // Se algum trap ficou vago (retirada sem substituto), so atualiza o card e segue
        const changesComGalgoNovo = changes.filter(function(c) { return c.nomeNovo; });
        if (!changesComGalgoNovo.length) {
          addLog('info', '  retirada sem substituto — card atualizado, sem reanalise (galgo insuficiente)');
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        // Precisa do historico dos galgos novos — busca na aba Form
        try {
          const formTab = await page.$('a[href*="form"], button[class*="form"], .RC-tabs__tab--form, [class*="tab"][class*="form"], a.RC-meetingTabs__tab');
          if (formTab) { await formTab.click(); }
          else {
            await page.evaluate(function() {
              const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
              const t = tabs.find(function(x){ return x.textContent.trim().toLowerCase() === 'form'; });
              if (t) t.click();
            });
          }
          await new Promise(r => setTimeout(r, 2500));
        } catch(e) {
          addLog('warn', '  nao consegui clicar na aba Form: ' + e.message);
        }

        const formText = await page.evaluate(function() { return (document.body.innerText || '').slice(0, 8000); });
        addLog('info', '  texto da aba Form (debug, 2000 chars): ' + formText.slice(0, 2000).replace(/\n/g, ' | '));

        let algumFalhou = false;
        const galgosNovos = {}; // trap -> {nome, historico}
        changesComGalgoNovo.forEach(function(c) {
          const extraido = extractDogHistoricoFromFormText(formText, c.nomeNovo);
          addLog('info', '  T' + c.trap + ' "' + c.nomeNovo + '": ' + extraido.debugNote);
          if (!extraido.historico.length) { algumFalhou = true; return; }
          galgosNovos[c.trap] = { nome: c.nomeNovo, historico: extraido.historico };
        });

        if (algumFalhou) {
          addLog('warn', '  nao consegui extrair historico de algum galgo novo — card atualizado, mas sem reanalise automatica (precisa checar manualmente)');
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        // Monta a corrida sintetica: galgos que nao mudaram usam o hist_all ja
        // salvo, galgos trocados usam o historico recem-raspado
        let histAllAntigo = [];
        try { if (dbRace.hist_all) histAllAntigo = JSON.parse(dbRace.hist_all); } catch(e) {}

        const galgosParaAnalise = novoRaceCard.map(function(g) {
          if (galgosNovos[g.trap]) {
            return { trap: g.trap, nome: galgosNovos[g.trap].nome, historico: galgosNovos[g.trap].historico };
          }
          const antigo = histAllAntigo.find(function(h) { return h.trap === g.trap; });
          return { trap: g.trap, nome: g.nome, historico: (antigo && antigo.historico) || [] };
        });

        const corridaRaw = {
          hora: dbRace.hora,
          corrida: dbRace.corrida,
          dist: dbRace.dist,
          classe: (dbRace.corrida || '').split(' ').pop(),
          postPick: [],
          trapsCard: novoRaceCard.map(function(g){ return g.trap; }),
          galgos: galgosParaAnalise
        };

        const config = getUserConfig(dbRace.user_id);
        const novoResultado = processarCorrida(corridaRaw, config);

        if (novoResultado.nivel === 'skip') {
          addLog('warn', '  reanalise resultou em SKIP (' + (novoResultado.obs || '') + ') — card atualizado, resultado da analise nao mudou pra evitar perder o AvB anterior. Confira manualmente.');
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        db.prepare(
          'UPDATE races SET trap_fav=?,name_fav=?,trap_und=?,name_und=?,pct=?,nivel=?,perfil_fav=?,perfil_und=?,obs=?,hist_fav=?,hist_und=?,hist_all=?,race_card=?,top3=? WHERE id=?'
        ).run(
          novoResultado.trapFav || 0, novoResultado.nameFav || '',
          novoResultado.trapUnd || 0, novoResultado.nameUnd || '',
          novoResultado.pct || 0, novoResultado.nivel || '',
          novoResultado.perfilFav || '', novoResultado.perfilUnd || '',
          novoResultado.obs || '',
          novoResultado.histFav ? JSON.stringify(novoResultado.histFav) : null,
          novoResultado.histUnd ? JSON.stringify(novoResultado.histUnd) : null,
          novoResultado.histAll ? JSON.stringify(novoResultado.histAll) : null,
          novoResultado.raceCard ? JSON.stringify(novoResultado.raceCard) : JSON.stringify(novoRaceCard),
          Array.isArray(novoResultado.top3) ? novoResultado.top3.filter(function(x){return x>0;}).join('-') : (novoResultado.top3 || null),
          dbRace.id
        );
        status.reanalyzed++;
        addLog('ok', '  REANALISADO: novo AvB T' + novoResultado.trapFav + ' ' + novoResultado.nameFav + ' vs T' + novoResultado.trapUnd + ' ' + novoResultado.nameUnd + ' (' + novoResultado.pct + '% ' + novoResultado.nivel + ')');

      } catch (e) {
        addLog('err', 'Erro em ' + dbRace.corrida + ' ' + dbRace.hora + ': ' + e.message);
        if (e.message.includes('detached') || e.message.includes('Detached') || e.message.includes('Target')) {
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
    addLog('ok', 'Concluido! ' + status.processed + ' verificadas, ' + status.changed + ' com mudanca, ' + status.reanalyzed + ' reanalisadas');

  } catch (e) {
    addLog('err', 'Erro fatal: ' + e.message);
  } finally {
    if (browser) { try { await browser.disconnect(); } catch(e) {} }
    status.running = false;
  }
}

// ── Cron: roda de hora em hora ──────────────────────────────────────────────
let cronTimer = null;
function scheduleMonitorCron() {
  if (cronTimer) clearTimeout(cronTimer);
  const HOUR_MS = 60 * 60 * 1000;
  cronTimer = setTimeout(function() {
    const today = new Date().toISOString().slice(0, 10);
    console.log('[CRON-MONITOR] Verificando cards para ' + today);
    runCardMonitorRobot(today).catch(function(e) { addLog('err', e.message); });
    scheduleMonitorCron();
  }, HOUR_MS);
}
scheduleMonitorCron();

module.exports = {
  runCardMonitorRobot,
  getMonitorStatus: () => ({ ...status }),
  requestStop: () => { status.stopRequested = true; }
};