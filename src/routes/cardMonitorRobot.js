'use strict';
// src/routes/cardMonitorRobot.js
// Robo que varre as corridas do dia de hora em hora, comparando o card atual
// no Racing Post com o race_card salvo na analise da manha. Se detectar
// retirada ou troca de galgo, atualiza o grid E reanalisa so aquela corrida
// (usando a mesma engine de pontuacao do api.js, sem duplicar logica).

const { db, getUserConfig } = require('../db/database');
const { processarCorrida } = require('./api');
const { logChanges } = require('../utils/auditLog');
const { parseHistoryLine, isHistLine, isColHeader, isBrtLine } = require('../utils/pdfParser');

require('dns').setDefaultResultOrder('ipv4first');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'greyhound2024';
const BROWSERLESS_HOST  = process.env.BROWSERLESS_HOST  || 'chromium.railway.internal';
const BROWSERLESS_PORT  = process.env.BROWSERLESS_PORT  || '8080';
const BROWSERLESS_WS    = `ws://${BROWSERLESS_HOST}:${BROWSERLESS_PORT}?token=${BROWSERLESS_TOKEN}`;

const status = { running: false, stopRequested: false, logs: [], lastRun: null, processed: 0, changed: 0, reanalyzed: 0, suspicious: false, suspiciousReason: '' };

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

// Dicionario de abreviacoes JA CONFIRMADAS em producao — usado com prioridade
// sobre o algoritmo generico. Necessario porque abreviacao pura por
// subsequencia de letras pode colidir entre pistas parecidas (ex: "DunPk"
// bate tanto em "Dunmore Park" quanto em "Dunstall Park" — letras na mesma
// ordem, mas sao pistas diferentes). Se aparecer uma pista nova que nao esta
// aqui, cai no algoritmo generico como antes (funciona bem pra a maioria,
// so falha em colisoes como essa).
const KNOWN_TRACK_ABBR = {
  dunpk: 'dunmorepark',
  cpark: 'centralpark',
  yrmth: 'yarmouth',
  sland: 'sunderland',
  towc: 'towcester',
  sheff: 'sheffield',
  newc: 'newcastle',
  trlee: 'tralee',
  romfd: 'romford',
  youghl: 'youghal',
  harlow: 'harlow',
  cork: 'cork',
  notts: 'nottingham',
  kinsly: 'kinsley',
  vlley: 'valley',
  thurl: 'thurles',
  pelaw: 'starpelaw',
  donc: 'doncaster',
  hove: 'hove',
  monmr: 'monmore',
};

// Comparacao especifica pra abreviacao de pista (ex: "CPark" vs "Central
// Park", "DunPk" vs "Dunmore Park") — abreviacoes British greyhound tipicamente
// removem vogais/letras mas mantem a ORDEM, entao subsequencia ordenada e
// muito mais confiavel aqui do que o overlap de caracteres do similarity().
function trackAbbrMatches(abbr, fullName) {
  const a = (abbr || '').toLowerCase().replace(/[^a-z]/g, '');
  const f = (fullName || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!a || !f) return false;

  // Prioridade: dicionario curado (evita colisao tipo DunPk x Dunstall Park)
  if (KNOWN_TRACK_ABBR[a]) return KNOWN_TRACK_ABBR[a] === f;

  // Fallback: subsequencia ordenada (pra pistas novas ainda nao mapeadas)
  let i = 0;
  for (let j = 0; j < f.length && i < a.length; j++) {
    if (f[j] === a[i]) i++;
  }
  return i === a.length;
}

// Comparacao de IDENTIDADE (mesmo galgo ou nao) — precisa ser rigorosa, ao
// contrario do similarity() acima que e usado pra achar o MELHOR entre varios
// candidatos (comparacao relativa). Pra decisao absoluta sim/nao (mudou ou
// nao mudou o card), overlap de caracteres da falso positivo com frequencia
// (strings bem diferentes compartilham letras comuns do ingles e pontuam
// alto). Usa igualdade ou substring do nome normalizado.
function namesMatch(a, b) {
  const na = (a || '').toLowerCase().trim().replace(/\s*\((w|m)\)\s*$/i, '').trim();
  const nb = (b || '').toLowerCase().trim().replace(/\s*\((w|m)\)\s*$/i, '').trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length > 3 && nb.length > 3 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

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
// Extrai os nomes dos corredores atuais, na ORDEM em que aparecem na pagina
// (nao da pra confiar que posicao = trap, porque o numero do trap so existe
// como badge visual, nao como texto simples — entao devolve so os nomes; o
// casamento com o trap certo e feito depois por IDENTIDADE, via
// matchRunnersToRaceCard, no lugar de assumir a ordem).
function extractCurrentRunnersFromText(text) {
  const names = [];
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  let idx = lines.findIndex(l => /^Race Status/i.test(l));
  if (idx === -1) idx = 0; else idx++;
  while (idx < lines.length && names.length < 6) {
    if (idx + 2 < lines.length && /^Form:/i.test(lines[idx + 2])) {
      const nome = lines[idx].replace(/\s*\((W|M)\)\s*$/i, '').trim();
      names.push(nome);
      idx += 4;
    } else {
      idx++;
    }
  }
  return names;
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

// Casa os nomes extraidos (ordem NAO confiavel como trap, ja que o numero do
// trap so existe como badge visual na pagina, nao como texto simples) contra
// os traps do race_card salvo — por IDENTIDADE (nome), nao por posicao. Isso
// e o que permite detectar retirada SEM substituto corretamente: o trap cujo
// nome antigo nao aparece em lugar nenhum da lista nova e o vago, nao importa
// em que posicao os outros ficaram depois disso.
function matchRunnersToRaceCard(extractedNames, raceCard) {
  const rcPool = raceCard.map(g => ({ trap: g.trap, nome: g.nome, used: false }));
  const curPool = extractedNames.map(n => ({ nome: n, used: false }));

  // Passo 1: casa por identidade (nome igual/substring) — esses NAO mudaram
  rcPool.forEach(rc => {
    const found = curPool.find(c => !c.used && namesMatch(c.nome, rc.nome));
    if (found) { found.used = true; rc.used = true; }
  });

  const rcSobra = rcPool.filter(rc => !rc.used);
  const curSobra = curPool.filter(c => !c.used);

  if (!rcSobra.length && !curSobra.length) {
    return { changes: [], vagos: [], ok: true }; // tudo bateu, nada mudou
  }

  if (curSobra.length > rcSobra.length) {
    // extraiu mais corredores "novos" do que sobrou trap pra encaixar —
    // sinal de erro de extracao (nomes duplicados/lixo), nao arrisca
    return { changes: [], vagos: [], ok: false };
  }

  // Pareia o que sobrou 1-a-1 (assume ordem relativa — funciona bem pra 1-2
  // substituicoes simultaneas). O que sobrar de trap sem nome novo pra
  // encaixar e retirada sem substituto (vago).
  const changes = [], vagos = [];
  rcSobra.forEach((rc, i) => {
    if (i < curSobra.length) {
      changes.push({ trap: rc.trap, nomeAntigo: rc.nome, nomeNovo: curSobra[i].nome });
    } else {
      vagos.push(rc);
    }
  });
  return { changes, vagos, ok: true };
}

// ── Robô principal ────────────────────────────────────────────────────────────
async function runCardMonitorRobot(targetDate) {
  if (status.running) { addLog('warn', 'Robo ja esta rodando.'); return; }
  status.running = true; status.stopRequested = false;
  status.logs = []; status.processed = 0; status.changed = 0; status.reanalyzed = 0;
  status.suspicious = false; status.suspiciousReason = '';
  let extractFailCount = 0;

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
      "r.race_card, r.hist_all, r.top3, r.pct, r.nivel, r.perfil_fav, r.perfil_und, r.track_full " +
      "FROM races r JOIN race_sessions s ON s.id=r.session_id " +
      "WHERE date(s.created_at, '-3 hours')=? AND r.nivel!=? ORDER BY r.hora"
    ).all(DATE, 'skip');
    addLog('info', dbRaces.length + ' corridas no banco para ' + DATE);

    for (const dbRace of dbRaces) {
      if (status.stopRequested) { addLog('warn', 'Parado pelo usuario.'); break; }

      let raceCard = [];
      try { if (dbRace.race_card) raceCard = JSON.parse(dbRace.race_card); } catch(e) {}
      if (!raceCard.length) { addLog('info', dbRace.corrida + ' ' + dbRace.hora + ' — sem race_card salvo, pulando'); continue; }

      // Acha os candidatos na lista pelo horario (UK 12h cru, igual r.hora) —
      // pode ter mais de um (varias pistas correm no mesmo horario)
      const candidates = races.filter(function(r) { return r.time === dbRace.hora; });
      if (!candidates.length) { addLog('info', dbRace.corrida + ' ' + dbRace.hora + ' — nao esta mais na lista (ja rodou ou nao encontrada)'); continue; }

      status.processed++;
      addLog('info', 'Verificando ' + dbRace.corrida + ' ' + dbRace.hora + (candidates.length > 1 ? ' (' + candidates.length + ' candidatos no mesmo horario)' : '') + '...');

      try {
        const raceBase = 'https://greyhoundbet.racingpost.com/';
        const trackAbbr = (dbRace.corrida || '').split(' ')[0];

        // Se tem mais de um candidato no mesmo horario, navega em cada um ate
        // achar o que bate com a pista certa (evita analisar a pista errada,
        // igual o bug que a gente corrigiu no robo de resultados)
        let cardText = null, scrapedTrack = '';
        for (let ci = 0; ci < candidates.length; ci++) {
          const cand = candidates[ci];
          const raceHash = cand.href.replace(/^#/, '');
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

          const text = await page.evaluate(function() { return (document.body.innerText || '').slice(0, 6000); });
          const track = extractTrackFromText(text);
          if (trackAbbrMatches(trackAbbr, track)) {
            cardText = text; scrapedTrack = track;
            break;
          }
          addLog('info', '  candidato ' + (ci+1) + '/' + candidates.length + ' pista "' + track + '" nao bate com "' + trackAbbr + '" — tentando proximo');
        }

        if (!cardText) {
          addLog('warn', '  nao encontrei a pagina certa entre ' + candidates.length + ' candidatos para ' + dbRace.corrida + ' ' + dbRace.hora + ' — pulando pra evitar analisar pista errada');
          extractFailCount++;
          continue;
        }
        addLog('info', '  pista da pagina: "' + scrapedTrack + '"' + (candidates.length > 1 ? ' (desambiguado entre ' + candidates.length + ' candidatos)' : ''));

        const currentRunners = extractCurrentRunnersFromText(cardText);
        if (!currentRunners.length) {
          addLog('warn', '  nao consegui extrair os corredores atuais dessa pagina (formato inesperado) — pulando');
          extractFailCount++;
          addLog('info', '  texto completo (debug): ' + cardText.replace(/\n/g, ' | '));
          continue;
        }

        // Casamento por IDENTIDADE (nome), nao por posicao/ordem — o numero
        // do trap so existe como badge visual na pagina (nao da pra ler como
        // texto), e confiar na ordem quebra quando um trap fica vago sem
        // substituto (a lista so "pula" ele, sem marcador nenhum).
        const matchResult = matchRunnersToRaceCard(currentRunners, raceCard);
        if (!matchResult.ok) {
          addLog('warn', '  ' + dbRace.corrida + ' ' + dbRace.hora + ' — extracao inconsistente (mais corredores extraidos do que traps no card salvo) — pulando pra nao arriscar');
          extractFailCount++;
          continue;
        }

        const changes = matchResult.changes;
        const vagos = matchResult.vagos;

        if (!changes.length && !vagos.length) {
          addLog('ok', '  ' + dbRace.corrida + ' ' + dbRace.hora + ' — sem alteracoes no card');
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        if (vagos.length) {
          addLog('warn', '  ' + dbRace.corrida + ' ' + dbRace.hora + ' — trap(s) vago(s) sem substituto: ' + vagos.map(v => 'T'+v.trap+' "'+v.nome+'"').join(', ') + '. Card atualizado (retirada marcada), sem reanalise automatica pra esse(s) trap(s).');
        }

        status.changed++;
        if (changes.length) {
          addLog('warn', '  MUDANCA DETECTADA em ' + dbRace.corrida + ' ' + dbRace.hora + ': ' +
            changes.map(function(c){return 'T'+c.trap+' "'+c.nomeAntigo+'" -> "'+c.nomeNovo+'"';}).join(', '));
        }

        // Atualiza o race_card com os nomes novos — substituicoes trocam o
        // nome, vagos ficam com nome vazio (retirada sem substituto)
        const novoRaceCard = raceCard.map(function(g) {
          const ch = changes.find(function(c) { return c.trap === g.trap; });
          if (ch) return { trap: g.trap, nome: ch.nomeNovo };
          const vg = vagos.find(function(v) { return v.trap === g.trap; });
          if (vg) return { trap: g.trap, nome: '' };
          return g;
        });
        db.prepare('UPDATE races SET race_card=? WHERE id=?').run(JSON.stringify(novoRaceCard), dbRace.id);

        // Se so teve retirada sem substituto (nenhuma substituicao de verdade
        // pra reanalisar), so atualiza o card e segue
        if (!changes.length) {
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
        changes.forEach(function(c) {
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
        // salvo, galgos trocados usam o historico recem-raspado. Trap vago
        // (retirada sem substituto) e EXCLUIDO da analise — nao faz sentido
        // competir usando o historico antigo de um galgo que nem corre mais.
        let histAllAntigo = [];
        try { if (dbRace.hist_all) histAllAntigo = JSON.parse(dbRace.hist_all); } catch(e) {}

        const trapsVagos = vagos.map(function(v){ return v.trap; });
        const galgosParaAnalise = novoRaceCard
          .filter(function(g) { return trapsVagos.indexOf(g.trap) === -1; })
          .map(function(g) {
            if (galgosNovos[g.trap]) {
              return { trap: g.trap, nome: galgosNovos[g.trap].nome, historico: galgosNovos[g.trap].historico };
            }
            const antigo = histAllAntigo.find(function(h) { return h.trap === g.trap; });
            return { trap: g.trap, nome: g.nome, historico: (antigo && antigo.historico) || [] };
          });

        const postPickMatch = cardText.match(/POST PICK:\s*([\d-]+)/i);
        const postPick = postPickMatch ? postPickMatch[1] : '';

        const corridaRaw = {
          hora: dbRace.hora,
          corrida: dbRace.corrida,
          dist: dbRace.dist,
          classe: (dbRace.corrida || '').split(' ').pop(),
          postPick: postPick,
          trapsCard: galgosParaAnalise.map(function(g){ return g.trap; }),
          galgos: galgosParaAnalise,
          trackFull: scrapedTrack || dbRace.track_full || null
        };

        const config = getUserConfig(dbRace.user_id);
        const novoResultado = processarCorrida(corridaRaw, config);

        if (novoResultado.nivel === 'skip') {
          addLog('warn', '  reanalise resultou em SKIP (' + (novoResultado.obs || '') + ') — card atualizado, resultado da analise nao mudou pra evitar perder o AvB anterior. Confira manualmente.');
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        // Grava a trilha de auditoria ANTES de sobrescrever — compara o que
        // tinha no banco (dbRace) com o que a reanalise calculou
        const auditCount = logChanges(
          dbRace.id, 'monitor_robot', dbRace,
          {
            trap_fav: novoResultado.trapFav || 0,
            name_fav: novoResultado.nameFav || '',
            trap_und: novoResultado.trapUnd || 0,
            name_und: novoResultado.nameUnd || '',
            pct: novoResultado.pct || 0,
            nivel: novoResultado.nivel || ''
          },
          ['trap_fav', 'name_fav', 'trap_und', 'name_und', 'pct', 'nivel']
        );
        if (auditCount) addLog('info', '  auditoria: ' + auditCount + ' campo(s) registrado(s) no historico de alteracoes');

        db.prepare(
          'UPDATE races SET trap_fav=?,name_fav=?,trap_und=?,name_und=?,pct=?,nivel=?,perfil_fav=?,perfil_und=?,obs=?,hist_fav=?,hist_und=?,hist_all=?,race_card=?,top3=?,track_full=? WHERE id=?'
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
          novoResultado.trackFull || dbRace.track_full || null,
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

    // Invariante de sanidade: se a MAIORIA das corridas verificadas falhou em
    // confirmar a pista ou extrair os corredores, isso nao e coincidencia —
    // e sinal de que o formato da pagina mudou. Falha isolada e normal;
    // falha em massa precisa ser barulhenta, nao silenciosa.
    if (status.processed >= 3 && (extractFailCount / status.processed) > 0.5) {
      status.suspicious = true;
      status.suspiciousReason = extractFailCount + ' de ' + status.processed + ' corridas verificadas falharam em confirmar a pista ou extrair os corredores — provavel mudanca no formato da pagina do Racing Post. Mudancas de card dessa rodada podem estar incompletas.';
      addLog('err', '⚠️ RODADA SUSPEITA: ' + status.suspiciousReason);
    }

  } catch (e) {
    addLog('err', 'Erro fatal: ' + e.message);
  } finally {
    if (browser) { try { await browser.disconnect(); } catch(e) {} }
    status.running = false;
  }
}

module.exports = {
  runCardMonitorRobot,
  getMonitorStatus: () => ({ ...status }),
  requestStop: () => { status.stopRequested = true; }
};