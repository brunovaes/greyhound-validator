'use strict';
const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { db, saveRobotLog, loadRobotLog } = require('../db/database');
const { logChanges } = require('../utils/auditLog');

require('dns').setDefaultResultOrder('ipv4first');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'greyhound2024';
const BROWSERLESS_HOST  = process.env.BROWSERLESS_HOST  || 'chromium.railway.internal';
const BROWSERLESS_PORT  = process.env.BROWSERLESS_PORT  || '8080';
const BROWSERLESS_WS    = `ws://${BROWSERLESS_HOST}:${BROWSERLESS_PORT}?token=${BROWSERLESS_TOKEN}`;

const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, updated: 0, suspicious: false, suspiciousReason: '' };

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

// Converte hora UK crua (ex: "1:16") pra minutos do dia em BRT — mesma regra
// usada no robo de monitoramento (10,11=AM; 12,1-9=PM; BRT=UK-4h)
function horaUkParaMinutosBrt(horaUk) {
  const p = (horaUk || '').split(':');
  if (p.length < 2) return null;
  let h = parseInt(p[0]);
  const min = parseInt(p[1]) || 0;
  if (h >= 1 && h <= 9) h += 12;
  h = h - 4; if (h < 0) h += 24;
  return h * 60 + min;
}

// Minutos do dia agora, em BRT (servidor roda em UTC no Railway; BRT = UTC-3)
function agoraMinutosBrt() {
  const now = new Date();
  let m = (now.getUTCHours() * 60 + now.getUTCMinutes()) - 180;
  if (m < 0) m += 1440;
  return m;
}

// Similaridade entre dois strings (chars em comum / max length) — usada
// tanto pra casar nome de galgo quanto nome de pista.
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

// Extrai o nome da pista direto do texto raspado da pagina de resultado
// (formato: uma linha exatamente "Sheffield 07/07/26") — usado pra desempatar
// quando ha mais de uma corrida no banco no MESMO horario (comum, ja que
// varias pistas correm no mesmo slot). Busca linha por linha pra nao pegar
// texto de mais (o \s do regex bateria com quebra de linha tambem).
function extractTrackFromText(text) {
  const lines = (text || '').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z\s]*?)\s+\d{2}\/\d{2}\/\d{2}\s*$/);
    if (m) return m[1].trim();
  }
  return '';
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
  status.suspicious = false; status.suspiciousReason = '';
  let noPosicoesCount = 0;

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
    // IMPORTANTE: s.created_at e gravado pelo SQLite em UTC, mas DATE aqui e
    // sempre a data local do Brasil (BRT = UTC-3). Sem esse ajuste, sessoes
    // criadas/recriadas tarde da noite (ex: 21h30 BRT = 00h30 UTC do dia
    // seguinte) ficavam com a data errada nessa comparacao e a corrida nunca
    // era encontrada pelo robo de resultados — mesmo sendo do dia certo.
    const dbRaces = db.prepare(
      "SELECT r.id, r.hora, r.corrida, r.trap_fav, r.name_fav, r.trap_und, r.name_und, r.bateu, r.race_card, r.resultado_1, r.resultado_2, r.resultado_3, r.card_suspect, r.nivel, r.nivel_pre_suspeita " +
      "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
      "WHERE date(s.created_at, '-3 hours')=? AND (r.nivel!=? OR r.card_suspect=1) ORDER BY r.hora"
    ).all(DATE, 'skip');
    addLog('info', dbRaces.length + ' corridas no banco para ' + DATE);

    const updateStmt = db.prepare('UPDATE races SET bateu=?,resultado_1=?,resultado_2=?,resultado_3=?,video_url=? WHERE id=?');

    // 3. Processar cada link
    for (const link of raceLinks) {
      if (status.stopRequested) { addLog('warn', 'Parado pelo usuario.'); break; }

      const hora12 = hora24To12(link.rTime);
      const candidates = dbRaces.filter(function(r) {
        return r.hora === hora12 || r.hora === link.rTime || horaDBTo24(r.hora) === link.rTime;
      });
      if (!candidates.length) { addLog('info', 'Sem match: ' + link.rTime + ' (12h=' + hora12 + ')'); continue; }

      status.processed++;
      addLog('info', 'Processando ' + link.rTime + ' -> ' + candidates.map(function(c){return c.corrida;}).join(' | '));

      try {
        const url = 'https://greyhoundbet.racingpost.com/' + (link.href.startsWith('#') ? link.href : '#' + link.href);
        await page.goto(url, { timeout: 20000, waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 5000));

        const pageText = await page.evaluate(function() {
          // URL da página de resultado (Racing Post)
          const videoUrl = window.location.href;
          
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

        // Se tem mais de uma corrida no banco nesse MESMO horario (comum —
        // varias pistas correm no mesmo slot), desempata pelo nome da pista,
        // que a gente sabe de verdade so depois de abrir a pagina.
        var dbRace;
        if (candidates.length === 1) {
          dbRace = candidates[0];
        } else {
          const scrapedTrack = extractTrackFromText(pageText.text);
          addLog('info', 'Multiplos candidatos em ' + link.rTime + ' — pista da pagina: "' + scrapedTrack + '"');
          var best = null, bestScore = 0.4;
          candidates.forEach(function(c) {
            var trackAbbr = (c.corrida || '').split(' ')[0]; // ex: "DunPk" de "DunPk A7"
            var score = similarity(scrapedTrack, trackAbbr);
            addLog('info', '  candidato ' + c.corrida + ' (pista "' + trackAbbr + '") score=' + score.toFixed(2));
            if (score > bestScore) { bestScore = score; best = c; }
          });
          if (!best) {
            addLog('warn', link.rTime + ' - nao foi possivel identificar a pista certa entre os candidatos — pulando pra nao gravar resultado errado.');
            continue;
          }
          dbRace = best;
          addLog('info', 'Pista escolhida: ' + dbRace.corrida + ' (score ' + bestScore.toFixed(2) + ')');
        }

        // Extrair ordem de chegada por nome
        const finishing = extractFinishingOrder(pageText.text);
        addLog('info', 'Ordem: ' + JSON.stringify(finishing.slice(0, 4)));

        if (!finishing.length) {
          addLog('warn', link.rTime + ' - sem posicoes (formato inesperado)');
          noPosicoesCount++;
          continue;
        }

        // Validar AvB: fav bateu se chegou ANTES do und
        const favName = (dbRace.name_fav || '').toLowerCase().trim();
        const undName = (dbRace.name_und || '').toLowerCase().trim();
        const favFirst = favName.split(' ')[0];
        const undFirst = undName.split(' ')[0];

        let posFav = 99, posUnd = 99;
        finishing.forEach(function(f) {
          const nm = f.name.toLowerCase().trim();
          const nmFirst = nm.split(' ')[0];
          if (favFirst && (nmFirst === favFirst || nm.includes(favFirst) || favFirst.includes(nmFirst))) posFav = f.pos;
          if (undFirst && (nmFirst === undFirst || nm.includes(undFirst) || undFirst.includes(nmFirst))) posUnd = f.pos;
        });

        // AvB: fav bateu = chegou na frente do und (posição menor = melhor)
        let bateu = 'nao';
        if (posFav < 99 && posUnd < 99) {
          bateu = posFav < posUnd ? 'sim' : 'nao';
        } else if (posFav < 99) {
          bateu = posFav <= 3 ? 'sim' : 'nao'; // und não encontrado, heurística
        }

        addLog('info', 'Fav:"'+favName+'"=pos'+posFav+' Und:"'+undName+'"=pos'+posUnd+' → '+bateu.toUpperCase());

        const winner = finishing.find(f => f.pos === 1);
        const p2     = finishing.find(f => f.pos === 2);
        const p3     = finishing.find(f => f.pos === 3);

        // Lookup nome→trap via race_card (todos os 6 galgos da corrida)
        var raceCard = [];
        try { if (dbRace.race_card) raceCard = JSON.parse(dbRace.race_card); } catch(e) {}
        addLog('info', 'race_card: ' + (raceCard.length ? raceCard.map(function(g){return 'T'+g.trap+':'+g.nome;}).join(', ') : 'VAZIO - sessao antiga sem race_card'));

        function nameToTrap(name) {
          if (!name) return null;
          if (!raceCard.length) {
            // sem race_card: fallback fav/und
            const nm = name.toLowerCase().trim();
            const nmF = nm.split(' ')[0];
            if (favFirst && (nmF === favFirst || nm.includes(favFirst))) return String(dbRace.trap_fav);
            if (undFirst && (nmF === undFirst || nm.includes(undFirst))) return String(dbRace.trap_und);
            return name;
          }
          // Buscar melhor match no race_card pelos 6 galgos da corrida
          var bestTrap = null;
          var bestScore = 0.5; // threshold mínimo
          var scores = [];
          for (var i = 0; i < raceCard.length; i++) {
            var cardNome = (raceCard[i].nome || '');
            var score = similarity(name, cardNome);
            scores.push('T'+raceCard[i].trap+'='+cardNome+'('+score.toFixed(2)+')');
            if (score > bestScore) {
              bestScore = score;
              bestTrap = String(raceCard[i].trap);
            }
          }
          addLog('info', 'Match "'+name+'" → '+scores.join(' | ')+' → BEST:'+bestTrap+'('+bestScore.toFixed(2)+')');
          if (bestTrap) return bestTrap;
          return name;
        }

        let r1, r2, r3;
        if (pageText.trapOrder && pageText.trapOrder.length >= 3) {
          const t1 = pageText.trapOrder.find(function(t){ return t.pos === 1; });
          const t2 = pageText.trapOrder.find(function(t){ return t.pos === 2; });
          const t3 = pageText.trapOrder.find(function(t){ return t.pos === 3; });
          r1 = t1 ? String(t1.trap) : nameToTrap(winner ? winner.name : null);
          r2 = t2 ? String(t2.trap) : nameToTrap(p2 ? p2.name : null);
          r3 = t3 ? String(t3.trap) : nameToTrap(p3 ? p3.name : null);
          if (t1) addLog('info', 'Traps do HTML: 1o=T' + t1.trap + ' 2o=T' + (t2?t2.trap:'?') + ' 3o=T' + (t3?t3.trap:'?'));
        } else {
          r1 = nameToTrap(winner ? winner.name : null);
          r2 = nameToTrap(p2 ? p2.name : null);
          r3 = nameToTrap(p3 ? p3.name : null);
        }

        logChanges(
          dbRace.id, 'results_robot', dbRace,
          { bateu: bateu, resultado_1: r1, resultado_2: r2, resultado_3: r3 },
          ['bateu', 'resultado_1', 'resultado_2', 'resultado_3']
        );
        updateStmt.run(bateu, r1, r2, r3, pageText.videoUrl || null, dbRace.id);
        status.updated++;
        // Se essa corrida estava marcada como suspeita (provavel cancelamento)
        // e agora achou resultado de verdade, desfaz a marcacao
        if (dbRace.card_suspect) {
          const nivelRestaurado = dbRace.nivel_pre_suspeita || dbRace.nivel;
          logChanges(dbRace.id, 'results_robot', dbRace, { nivel: nivelRestaurado }, ['nivel']);
          db.prepare('UPDATE races SET card_suspect=0, nivel=?, nivel_pre_suspeita=NULL WHERE id=?').run(nivelRestaurado, dbRace.id);
          addLog('info', '  resultado encontrado apos suspeita de cancelamento — marcacao desfeita, nivel restaurado.');
        }

        addLog(bateu === 'sim' ? 'ok' : 'info',
          (bateu === 'sim' ? 'BATEU' : 'NAO') + ' ' + dbRace.corrida + ' ' + link.rTime +
          ' | 1o:"'+(r1||'?')+'" Fav:pos'+posFav+' Und:pos'+posUnd
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

    // Invariante de sanidade: se a MAIORIA das corridas processadas falhou
    // em extrair a ordem de chegada, isso nao e "corridas dificeis" — e sinal
    // de que o FORMATO DA PAGINA mudou e o robo esta lendo lixo. Falha
    // isolada e normal; falha em massa precisa ser barulhenta, nao silenciosa.
    if (status.processed >= 3 && (noPosicoesCount / status.processed) > 0.5) {
      status.suspicious = true;
      status.suspiciousReason = noPosicoesCount + ' de ' + status.processed + ' corridas processadas nao tiveram a ordem de chegada extraida — provavel mudanca no formato da pagina do Racing Post. Resultados dessa rodada podem estar incompletos ou errados.';
      addLog('err', '⚠️ RODADA SUSPEITA: ' + status.suspiciousReason);
    }

    // Corridas que NUNCA aparecem entre os raceLinks (pagina de resultados)
    // nunca sao tocadas pelo loop acima — ele so percorre o que O RACING POST
    // mostra, nao o que a gente esta esperando. Uma corrida cancelada
    // simplesmente nao gera link de resultado nenhum, entao fica esquecida
    // pra sempre (bateu/resultado ficam em branco, sem log, sem auditoria).
    // Aqui a gente faz o caminho inverso: pega toda corrida do banco ainda
    // sem resultado e ja bem depois do horario previsto, e marca como
    // provavel cancelamento (mesma marcacao reversivel do robo de
    // monitoramento — se algum dia aparecer resultado de verdade, desfaz
    // sozinho, ver logica de UPDATE em cardMonitorRobot.js).
    const ATRASO_MIN_SUSPEITO = 90;
    const semResultado = db.prepare(
      "SELECT r.id, r.hora, r.corrida, r.card_suspect, r.nivel, r.nivel_pre_suspeita " +
      "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
      "WHERE date(s.created_at, '-3 hours')=? AND (r.nivel!=? OR r.card_suspect=1) AND (r.bateu IS NULL OR r.bateu='')"
    ).all(DATE, 'skip');
    let canceladasDetectadas = 0;
    for (const r of semResultado) {
      const minutosRace = horaUkParaMinutosBrt(r.hora);
      if (minutosRace === null) continue;
      const atraso = agoraMinutosBrt() - minutosRace;
      if (atraso < 0) {
        // Corrida ainda vai acontecer mais tarde hoje — nao esta atrasada.
        // Se ela tinha sido marcada como suspeita por engano (bug anterior
        // que tratava "ainda nao aconteceu" como "muito atrasada"), desfaz
        // a marcacao agora, de forma automatica.
        if (r.card_suspect) {
          const nivelRestaurado = r.nivel_pre_suspeita || r.nivel;
          logChanges(r.id, 'results_robot', r, { nivel: nivelRestaurado }, ['nivel']);
          db.prepare('UPDATE races SET card_suspect=0, nivel=?, nivel_pre_suspeita=NULL WHERE id=?').run(nivelRestaurado, r.id);
          addLog('info', '  ' + r.corrida + ' ' + r.hora + ' — corrigido: a corrida ainda nao aconteceu hoje, marcacao de suspeita desfeita.');
        }
        continue;
      }
      if (atraso < ATRASO_MIN_SUSPEITO) continue;
      addLog('warn', '⚠️ ' + r.corrida + ' ' + r.hora + ' — sem resultado ' + Math.floor(atraso/60)+'h'+String(atraso%60).padStart(2,'0') + ' apos o horario previsto. Corrida provavelmente cancelada.');
      canceladasDetectadas++;
      if (r.card_suspect) {
        db.prepare('UPDATE races SET nivel=? WHERE id=?').run('skip', r.id);
      } else {
        logChanges(r.id, 'results_robot', r, { nivel: 'skip' }, ['nivel']);
        db.prepare('UPDATE races SET card_suspect=1, nivel_pre_suspeita=?, nivel=? WHERE id=?').run(r.nivel, 'skip', r.id);
      }
    }
    if (canceladasDetectadas) {
      status.suspicious = true;
      status.suspiciousReason = (status.suspiciousReason ? status.suspiciousReason + ' | ' : '') + canceladasDetectadas + ' corrida(s) sem resultado muito tempo depois do horario — provavel cancelamento.';
      addLog('err', '⚠️ ' + canceladasDetectadas + ' CORRIDA(S) PROVAVELMENTE CANCELADA(S) (sem resultado ha mais de ' + ATRASO_MIN_SUSPEITO + ' min) — verificar manualmente.');
    }

  } catch (e) {
    addLog('err', 'Erro fatal: ' + e.message);
  } finally {
    if (browser) { try { await browser.disconnect(); } catch(e) {} }
    status.running = false;
    saveRobotLog('results', status);
  }
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

router.get('/status', requireAdmin, (req, res) => {
  if (!status.running && !status.logs.length) {
    const persisted = loadRobotLog('results');
    if (persisted) return res.json(persisted);
  }
  res.json(status);
});

module.exports = router;
module.exports.runResultsRobot  = runResultsRobot;
module.exports.getResultsStatus = () => ({ ...status });

module.exports.requestStop      = () => { status.stopRequested = true; };