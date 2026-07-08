const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { getUserConfig } = require('../db/database');
const { navBar } = require('./main');
const { designTokensCSS } = require('../utils/designTokens');
const { icon } = require('../utils/icons');
const path = require('path');
const fs = require('fs');

// Forçar IPv4 — Railway private network resolve IPv6 mas Browserless ouve em IPv4
require('dns').setDefaultResultOrder('ipv4first');
const BASE = process.env.BASE_PATH || '/greyhound';
const resultsRobotModule = require('./resultsRobot');
const cardMonitorModule = require('./cardMonitorRobot');
const { runCardMonitorRobot, getMonitorStatus } = cardMonitorModule;
const { runResultsRobot, getResultsStatus } = resultsRobotModule;

// PDF_DIR é dinâmico por data — criado em runRobot

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || 'greyhound2024';
const BROWSERLESS_HOST = process.env.BROWSERLESS_HOST || 'chromium.railway.internal';
const BROWSERLESS_PORT = process.env.BROWSERLESS_PORT || '8080';
const BROWSERLESS_WS = `ws://${BROWSERLESS_HOST}:${BROWSERLESS_PORT}?token=${BROWSERLESS_TOKEN}`;

function cleanOldPdfFolders() {
  if (!fs.existsSync(PDF_BASE)) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  try {
    fs.readdirSync(PDF_BASE).forEach(function(folder) {
      const folderDate = new Date(folder);
      if (!isNaN(folderDate) && folderDate < cutoff) {
        fs.rmSync(path.join(PDF_BASE, folder), { recursive: true, force: true });
        console.log('[CLEAN] Pasta PDF removida:', folder);
      }
    });
  } catch(e) { console.error('[CLEAN] Erro ao limpar PDFs:', e.message); }
}

// ─── CRON MADRUGADA — 06:00 UTC (03:00 BRT) ───────────────────────────────
function getTodayDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function scheduleCronRobot() {
  const { db } = require('../db/database');
  let utcH = 16, utcM = 30; // padrão 13:30 BRT = 16:30 UTC
  try {
    const cfg = db.prepare('SELECT pdf_cron_time FROM analysis_config WHERE user_id=1').get();
    if (cfg && cfg.pdf_cron_time) {
      const p = cfg.pdf_cron_time.split(':');
      let brtH = parseInt(p[0]||13), brtM = parseInt(p[1]||30);
      utcH = brtH + 3; if (utcH >= 24) utcH -= 24;
      utcM = brtM;
    }
  } catch(e) {}
  const now = new Date();
  const nextRun = new Date();
  nextRun.setUTCHours(utcH, utcM, 0, 0);
  if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  const msUntil = nextRun - now;
  console.log('[CRON] Próxima coleta automática em ' + Math.round(msUntil/60000) + ' minutos (' + nextRun.toISOString() + ')');
  setTimeout(async function() {
    if (!robotStatus.running) {
      const date = getTodayDate();
      console.log('[CRON] 🤖 Iniciando coleta automática para ' + date);
      resetStatus();
      robotStatus.running = true;
      addLog('info', '🌙 Coleta automática iniciada — ' + date);
      try {
        await runRobot(date, 400, 575, '', '');
        addLog('ok', '✅ Coleta automática concluída — ' + robotStatus.pdfs.length + ' PDFs');
        console.log('[CRON] Coleta concluída: ' + robotStatus.pdfs.length + ' PDFs');
        cleanOldPdfFolders();
      } catch(e) {
        addLog('err', '❌ Erro na coleta automática: ' + e.message);
        console.error('[CRON] Erro:', e.message);
        robotStatus.running = false;
        robotStatus.error = e.message;
      }
    } else {
      console.log('[CRON] Robô já está rodando, coleta automática ignorada.');
    }
    scheduleCronRobot(); // reagenda para amanhã
  }, msUntil);
}
scheduleCronRobot();


// ─── CRON RESULTADOS — a cada 30 min entre 08:00–17:00 UTC ───────────────────
function scheduleResultsCron() {
  const { db } = require('../db/database');
  let intervalMin = 30, startBRT = '09:00', endBRT = '18:30';
  try {
    const cfg = db.prepare('SELECT results_interval_min, results_window_start, results_window_end FROM analysis_config WHERE user_id=1').get();
    if (cfg) {
      if (cfg.results_interval_min) intervalMin = parseInt(cfg.results_interval_min);
      if (cfg.results_window_start) startBRT = cfg.results_window_start;
      if (cfg.results_window_end) endBRT = cfg.results_window_end;
    }
  } catch(e) {}

  // Converter janela BRT → UTC (+3h)
  function brtToUtcH(t) { const p=t.split(':'); return (parseInt(p[0])+3)%24; }
  function brtToUtcM(t) { return parseInt(t.split(':')[1]||0); }
  const startUtcH = brtToUtcH(startBRT), startUtcM = brtToUtcM(startBRT);
  const endUtcH = brtToUtcH(endBRT), endUtcM = brtToUtcM(endBRT);

  const now = new Date();
  let nextRun = new Date(now);
  const mins = nextRun.getUTCMinutes();
  const interval = intervalMin;
  const nextSlot = Math.ceil((mins + 1) / interval) * interval;
  nextRun.setUTCMinutes(nextSlot % 60, 0, 0);
  if (nextSlot >= 60) nextRun.setUTCHours(nextRun.getUTCHours() + Math.floor(nextSlot / 60));

  // Fora da janela → agenda para início do próximo dia
  const h = nextRun.getUTCHours(), m = nextRun.getUTCMinutes();
  const afterEnd = h > endUtcH || (h === endUtcH && m > endUtcM);
  const beforeStart = h < startUtcH || (h === startUtcH && m < startUtcM);
  if (afterEnd) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    nextRun.setUTCHours(startUtcH, startUtcM, 0, 0);
  } else if (beforeStart) {
    nextRun.setUTCHours(startUtcH, startUtcM, 0, 0);
  }

  const msUntil = nextRun - now;
  console.log('[CRON-RES] Próxima atualização em ' + Math.round(msUntil/60000) + ' min (intervalo: ' + intervalMin + 'min)');

  setTimeout(async function() {
    const nowUtc = new Date();
    const uh = nowUtc.getUTCHours(), um = nowUtc.getUTCMinutes();
    const dentroJanela = (uh > startUtcH || (uh===startUtcH && um>=startUtcM)) &&
                         (uh < endUtcH || (uh===endUtcH && um<=endUtcM));
    if (dentroJanela) {
      const st = getResultsStatus();
      if (!st.running) {
        const date = getTodayDate();
        console.log('[CRON-RES] 🏁 Atualizando resultados para ' + date);
        runResultsRobot(date).then(function() {
          const s = getResultsStatus();
          console.log('[CRON-RES] ✅ Concluído — ' + s.updated + ' corridas atualizadas');
        }).catch(function(e) {
          console.error('[CRON-RES] ❌ Erro:', e.message);
        });
      } else {
        console.log('[CRON-RES] Robô de resultados já rodando, pulando.');
      }
    } else {
      console.log('[CRON-RES] Fora da janela BRT, pulando.');
    }
    scheduleResultsCron();
  }, msUntil);
}
scheduleResultsCron();

// ─── CRON MONITORAMENTO DE CARD — intervalo/janela configuraveis ──────────────
function scheduleMonitorCron() {
  const { db } = require('../db/database');
  let intervalMin = 60, startBRT = '09:00', endBRT = '20:00';
  try {
    const cfg = db.prepare('SELECT monitor_interval_min, monitor_window_start, monitor_window_end FROM analysis_config WHERE user_id=1').get();
    if (cfg) {
      if (cfg.monitor_interval_min) intervalMin = parseInt(cfg.monitor_interval_min);
      if (cfg.monitor_window_start) startBRT = cfg.monitor_window_start;
      if (cfg.monitor_window_end) endBRT = cfg.monitor_window_end;
    }
  } catch(e) {}

  // Converter janela BRT → UTC (+3h)
  function brtToUtcH(t) { const p=t.split(':'); return (parseInt(p[0])+3)%24; }
  function brtToUtcM(t) { return parseInt(t.split(':')[1]||0); }
  const startUtcH = brtToUtcH(startBRT), startUtcM = brtToUtcM(startBRT);
  const endUtcH = brtToUtcH(endBRT), endUtcM = brtToUtcM(endBRT);

  const now = new Date();
  let nextRun = new Date(now);
  const mins = nextRun.getUTCMinutes();
  const interval = intervalMin;
  const nextSlot = Math.ceil((mins + 1) / interval) * interval;
  nextRun.setUTCMinutes(nextSlot % 60, 0, 0);
  if (nextSlot >= 60) nextRun.setUTCHours(nextRun.getUTCHours() + Math.floor(nextSlot / 60));

  const h = nextRun.getUTCHours(), m = nextRun.getUTCMinutes();
  const afterEnd = h > endUtcH || (h === endUtcH && m > endUtcM);
  const beforeStart = h < startUtcH || (h === startUtcH && m < startUtcM);
  if (afterEnd) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    nextRun.setUTCHours(startUtcH, startUtcM, 0, 0);
  } else if (beforeStart) {
    nextRun.setUTCHours(startUtcH, startUtcM, 0, 0);
  }

  const msUntil = nextRun - now;
  console.log('[CRON-MONITOR] Próxima verificação em ' + Math.round(msUntil/60000) + ' min (intervalo: ' + intervalMin + 'min)');

  setTimeout(async function() {
    const nowUtc = new Date();
    const uh = nowUtc.getUTCHours(), um = nowUtc.getUTCMinutes();
    const dentroJanela = (uh > startUtcH || (uh===startUtcH && um>=startUtcM)) &&
                         (uh < endUtcH || (uh===endUtcH && um<=endUtcM));
    if (dentroJanela) {
      const st = getMonitorStatus();
      if (!st.running) {
        const date = getTodayDate();
        console.log('[CRON-MONITOR] 🔎 Verificando cards para ' + date);
        runCardMonitorRobot(date).then(function() {
          const s = getMonitorStatus();
          console.log('[CRON-MONITOR] ✅ Concluído — ' + s.processed + ' verificadas, ' + s.changed + ' com mudança, ' + s.reanalyzed + ' reanalisadas');
        }).catch(function(e) {
          console.error('[CRON-MONITOR] ❌ Erro:', e.message);
        });
      } else {
        console.log('[CRON-MONITOR] Robô de monitoramento já rodando, pulando.');
      }
    } else {
      console.log('[CRON-MONITOR] Fora da janela BRT, pulando.');
    }
    scheduleMonitorCron();
  }, msUntil);
}
scheduleMonitorCron();

// Corridas de galgo no UK rodam de ~10h ate ~meia-noite. 10,11 = AM (cedo) | 12,1-9 = PM (meio-dia em diante)
function formatTime(t) {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t.replace(':', '.');
  const h = parseInt(m[1]);
  const min = m[2];
  let ampm;
  if (h >= 10 && h <= 11) ampm = 'AM';
  else ampm = 'PM'; // 12 (meio-dia) e 1-9 = PM (meio-dia ate ~21h59)
  return h + '.' + min + ampm;
}

// Pasta por data: pdfs/2026-06-29/
const PDF_BASE = process.env.PDF_PATH || path.join(__dirname, '../../public/pdfs');
function getPdfDir(date) {
  return path.join(PDF_BASE, date);
}

// Converte horário UK (12h sem AM/PM) para minutos do dia (24h)
// Corridas de galgo no UK rodam de ~10h ate ~meia-noite. 10,11 = manha (AM);
// 12 = meio-dia (ja e PM, mas em 24h fica como 12 mesmo); 1-9 = tarde/noite (PM, 13h-21h)
function ukTimeTo24Mins(raceTime) {
  const m = raceTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  const h = parseInt(m[1]);
  const min = parseInt(m[2]);
  let h24;
  if (h >= 10 && h <= 12) h24 = h;        // 10,11 = AM; 12 = meio-dia (12h em 24h tambem)
  else h24 = h + 12;                      // 1-9 = PM (13-21)
  return h24 * 60 + min;
}

// Filtra corrida pelo intervalo de horário
// timeFrom/timeTo estão em horário do BRASIL (HH:MM)
// UK = Brasil + 3h (ajuste padrão; muda para 4 no horário de verão UK)
const UK_OFFSET_MINS = 4 * 60; // UK está 4h à frente do Brasil (BST = UTC+1, Brasil = UTC-3)

function inTimeRange(raceTime, timeFrom, timeTo) {
  if (!timeFrom && !timeTo) return true;

  const raceUKMins = ukTimeTo24Mins(raceTime);
  if (raceUKMins < 0) return true;

  // Converter horário Brasil para minutos e somar offset para obter UK
  const brToMins = (str) => {
    if (!str) return null;
    const p = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!p) return null;
    return parseInt(p[1]) * 60 + parseInt(p[2]) + UK_OFFSET_MINS;
  };

  const fromMins = brToMins(timeFrom);
  const toM = brToMins(timeTo);
  if (fromMins !== null && raceUKMins < fromMins) return false;
  if (toM !== null && raceUKMins > toM) return false;
  return true;
}

let robotStatus = {
  running: false,
  progress: 0,
  total: 0,
  current: '',
  log: [],
  pdfs: [],
  error: null
};

function resetStatus() {
  robotStatus = { running: false, progress: 0, total: 0, current: '', log: [], pdfs: [], error: null };
}

function addLog(type, msg) {
  // Horário do Brasil = UTC - 3h
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const ts = now.toISOString().substring(11, 19);
  const full = `[${ts}] ${msg}`;
  robotStatus.log.push({ type, msg: full });
  console.log('[ROBO]', full);
}

// ─── PÁGINA DO ROBÔ ───
router.get('/', requireAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  let logoB64 = '';
  if (fs.existsSync(logoPath)) logoB64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  let pastaDownload = 'Racingpost';
  try { const cfg = getUserConfig(req.user.id); pastaDownload = cfg.pasta_download || 'Racingpost'; } catch(e) {}

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Robo - Greyhound Validator</title>
<style>
${designTokensCSS()}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}
.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
nav{background:#0D1117;border-bottom:1px solid #222;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}
.nl:hover,.na{color:#22c55e;border-bottom-color:#22c55e}
.layout{display:flex;gap:18px;min-height:calc(100vh - 210px);padding:0 24px;align-items:flex-start}
.robot-sidebar{width:220px;flex-shrink:0;background:#161B27;border:1px solid #222;border-radius:10px;padding:8px;position:sticky;top:16px;display:flex;flex-direction:column;gap:2px}
.robot-sidebar h3{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.8px;padding:8px 12px 4px}
.robot-menu-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;background:none;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#888;transition:all .15s;text-decoration:none;box-sizing:border-box}
.robot-menu-item:hover{background:rgba(34,197,94,.08);color:#ccc}
.robot-menu-item.active{background:rgba(34,197,94,.12);color:#22c55e}
.robot-menu-item .icon{font-size:16px}
.robot-content{flex:1;padding:24px 0;overflow-y:auto;min-width:0}
.robot-panel{display:none}.robot-panel.active{display:block}
@media(max-width:800px){.layout{flex-direction:column;padding:0 16px}.robot-sidebar{width:100%;position:static;flex-direction:row;overflow-x:auto}}
.content{padding:24px;max-width:920px;margin:0 auto}
h1{font-size:20px;font-weight:700;margin-bottom:6px}
.sub{font-size:13px;color:#888;margin-bottom:24px}
.card{background:#161B27;border:1px solid #222;border-radius:10px;padding:20px;margin-bottom:16px}
.card-title{font-size:12px;font-weight:700;color:#22c55e;margin-bottom:16px;text-transform:uppercase;letter-spacing:.8px}
.form-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:nowrap;overflow-x:auto}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.field input{padding:9px 12px;background:#0D1117;border:1px solid #222;border-radius:6px;color:#f0f0f0;font-size:14px}
.field input:focus{outline:none;border-color:#22c55e}
.btn{padding:10px 22px;background:#22c55e;color:#000;font-weight:700;font-size:13px;border:none;border-radius:6px;cursor:pointer}
.btn:hover{background:#16a34a}.btn:disabled{opacity:.35;cursor:not-allowed}
.btn-red{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)}
.btn-red:hover{background:rgba(239,68,68,.25)}
.pw{margin:12px 0}
.pb{height:8px;background:#222;border-radius:4px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,#22c55e,#f97316);border-radius:4px;transition:width .5s}
.prog-info{font-size:11px;color:#888;margin-top:5px;display:flex;justify-content:space-between}
.log-box{background:#050505;border:1px solid #222;border-radius:6px;padding:12px;height:320px;overflow-y:auto;font-family:monospace;font-size:11px;line-height:2}
.lok{color:#22c55e}.lsk{color:#555}.ler{color:#ef4444}.lin{color:#60a5fa}
.pdf-list{display:flex;flex-direction:column;gap:5px;max-height:280px;overflow-y:auto}
.pdf-item{display:flex;align-items:center;justify-content:space-between;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:8px 12px;border-left:3px solid #22c55e}
.pdf-name{font-size:12px;font-weight:600;color:#f0f0f0}
.pdf-meta{font-size:10px;color:#666;margin-top:1px}
.sbar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px}
.res-log{background:#050505;border:1px solid #222;border-radius:6px;padding:12px;height:280px;overflow-y:auto;font-family:monospace;font-size:11px;line-height:1.8}
.res-ok{color:#22c55e}.res-err{color:#ef4444}.res-info{color:#60a5fa}.res-warn{color:#f97316}
.srun{background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);color:#60a5fa}
.sdone{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);color:#22c55e}
.serr{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444}
.spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(96,165,250,.3);border-top-color:#60a5fa;border-radius:50%;animation:sp .8s linear infinite;flex-shrink:0}
@keyframes sp{to{transform:rotate(360deg)}}
.ab{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.empty{text-align:center;padding:24px;color:#555;font-size:13px}

/* Popup PDF pronto */
.pdf-popup{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:1000;align-items:center;justify-content:center}
.pdf-popup.open{display:flex}
.pdf-popup-box{background:#161B27;border:1px solid #222;border-radius:14px;padding:32px 36px;text-align:center;max-width:400px;border-top:3px solid #22c55e;animation:popIn .3s ease}
@keyframes popIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
.pdf-popup-icon{font-size:52px;margin-bottom:14px}
.pdf-popup-box h3{font-size:18px;font-weight:700;color:#f0f0f0;margin-bottom:8px}
.pdf-popup-box p{font-size:13px;color:#888;line-height:1.6;margin-bottom:22px}
.pdf-popup-ok{padding:11px 32px;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:6px;cursor:pointer;font-size:14px}
.pdf-popup-ok:hover{background:#16a34a}
</style></head><body>
<div class="pdf-popup" id="pdf-ready-popup">
  <div class="pdf-popup-box">
    <div class="pdf-popup-icon">&#9989;</div>
    <h3>Download concluido!</h3>
    <p>Seus PDFs já estão disponíveis para realização das análises.</p>
    <button class="pdf-popup-ok" onclick="document.getElementById('pdf-ready-popup').classList.remove('open')">OK</button>
  </div>
</div>
<div class="hero"><img src="${logoB64}" alt="Greyhound Validator"></div>
${navBar(req.user, 'robot')}
<div class="layout">
<div class="robot-sidebar">
  <h3>Robôs</h3>
  <button class="robot-menu-item active" id="mb-pdfs" onclick="showPanel('pdfs')"><span class="icon">${icon('download',{size:16})}</span> Coletor de PDFs</button>
  <button class="robot-menu-item" id="mb-results" onclick="showPanel('results')"><span class="icon">${icon('flag',{size:16})}</span> Resultados</button>
  <button class="robot-menu-item" id="mb-monitor" onclick="showPanel('monitor')"><span class="icon">${icon('search',{size:16})}</span> Monitoramento</button>
  <button class="robot-menu-item" id="mb-audit" onclick="showPanel('audit')"><span class="icon">${icon('scroll',{size:16})}</span> Auditoria</button>
</div>
<div class="robot-content">
<div class="robot-panel active" id="panel-pdfs">
  <h1 style="display:flex;align-items:center;gap:10px">${icon('download',{size:22})} Robô Coletor de PDFs</h1>
  <p class="sub">Coleta automaticamente as corridas do Racing Post via Browserless.io.</p>

  <div class="card">
    <div class="card-title">Configurar Coleta</div>
    <div class="form-row">
      <div class="field">
        <label>Data</label>
        <input type="date" id="race-date" value="${today}">
      </div>
      <div class="field">
        <label>Dist. minima (m)</label>
        <input type="number" id="dist-min" value="400" style="width:90px">
      </div>
      <div class="field">
        <label>Dist. maxima (m)</label>
        <input type="number" id="dist-max" value="575" style="width:90px">
      </div>
      <div class="field">
        <label>Hora inicio</label>
        <input type="time" id="time-from" style="width:105px">
      </div>
      <div class="field">
        <label>Hora fim</label>
        <input type="time" id="time-to" style="width:105px">
      </div>
      <button class="btn" id="btn-start" onclick="startRobot()" style="white-space:nowrap">&#x25B6; Iniciar Coleta</button>
      <button class="btn btn-red" id="btn-stop" onclick="stopRobot()" style="white-space:nowrap">&#x25A0; Parar</button>
    </div>
  </div>

  <div id="status-wrap">
    <div class="sbar srun" id="sbar" style="display:none"><span class="spin"></span><span id="sbar-text">Iniciando...</span></div>
    <div class="card">
      <div class="card-title">Log em tempo real</div>
      <div class="pw">
        <div class="pb"><div class="pf" id="pf" style="width:0%"></div></div>
        <div class="prog-info"><span id="prog-cur">Aguardando inicio...</span><span id="prog-cnt">0 / 0</span></div>
      </div>
      <div class="log-box" id="log-box"><div class="lin">Aguardando inicio do robo...</div></div>
    </div>
  </div>

  <div id="results-wrap" style="display:none">
    <div class="card">
      <div class="card-title">PDFs Coletados</div>
      <div class="pdf-list" id="pdf-list"><div class="empty">Nenhum PDF ainda</div></div>
      <div class="ab" style="margin-top:14px;flex-direction:column;gap:10px">
        <div style="display:flex;gap:10px">
          <button class="btn" id="btn-dl-all" onclick="downloadAll()">&#x2B07; Baixar Todos</button>
          <button class="btn btn-red" onclick="clearPdfs()">&#x1F5D1; Limpar PDFs</button>
        </div>
        <div id="dl-progress-wrap" style="display:none;width:100%">
          <div style="font-size:11px;color:#888;margin-bottom:5px;display:flex;justify-content:space-between">
            <span id="dl-cur-file">Baixando...</span>
            <span id="dl-cnt">0 / 0</span>
          </div>
          <div style="height:8px;background:#222;border-radius:4px;overflow:hidden">
            <div id="dl-bar" style="height:100%;background:linear-gradient(90deg,#22c55e,#60a5fa);border-radius:4px;transition:width .3s;width:0%"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>


<div class="robot-panel" id="panel-results">
  <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:10px">${icon('flag',{size:20})} Robô de Resultados</h1>
  <p class="sub">Coleta automaticamente os resultados do Racing Post e atualiza o campo Bateu nas sess\u00f5es.</p>
  <div class="card">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">${icon('gear',{size:14})} Executar</div>
    <div class="form-row" style="align-items:flex-end;gap:12px">
      <div class="field"><label>Data</label><input type="date" id="res-date" value="${today}"></div>
      <button class="btn" id="btn-res-start" onclick="startResultsRobot()">&#9654; Executar agora</button>
      <button class="btn btn-red" id="btn-res-stop" onclick="stopResultsRobot()" disabled style="opacity:.35;cursor:not-allowed">&#9646;&#9646; Parar</button>
    </div>
    <p style="font-size:11px;color:#555;margin-top:12px">&#9200; Autom\u00e1tico: 23:00 UK = 19:00 Rio de Janeiro</p>
  </div>
  <div class="card" id="res-status-card" style="display:none">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">${icon('chart',{size:14})} Status</div>
    <div id="res-sbar" class="sbar srun"><span class="spin"></span><span id="res-st-txt"> Aguardando...</span></div>
    <div class="res-log" id="res-log"></div>
  </div>
</div><!-- fim panel-results -->

<div class="robot-panel" id="panel-monitor">
  <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:10px">${icon('search',{size:20})} Monitoramento de Card</h1>
  <p class="sub">Revisita o card de cada corrida do dia de hora em hora — se detectar retirada ou troca de galgo, atualiza o grid e reanalisa so aquela corrida automaticamente.</p>
  <div class="card">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">${icon('gear',{size:14})} Executar</div>
    <div class="form-row" style="align-items:flex-end;gap:12px">
      <div class="field"><label>Data</label><input type="date" id="mon-date" value="${today}"></div>
      <button class="btn" id="btn-mon-start" onclick="startMonitorRobot()">&#9654; Executar agora</button>
      <button class="btn btn-red" id="btn-mon-stop" onclick="stopMonitorRobot()" disabled style="opacity:.35;cursor:not-allowed">&#9646;&#9646; Parar</button>
    </div>
    <p style="font-size:11px;color:#555;margin-top:12px">&#9200; Autom\u00e1tico: roda sozinho a cada 1 hora</p>
  </div>
  <div class="card">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">${icon('gear',{size:14})} Forçar teste (debug)</div>
    <p style="font-size:11px;color:#888;margin-bottom:12px">Reverte o trap 1 de uma corrida de hoje pra um nome falso, pra forcar deteccao de mudanca na proxima execucao. Copia "hora" e "corrida" direto do log (ex: 8:41 / Kinsly A8).</p>
    <div class="form-row" style="align-items:flex-end;gap:12px">
      <div class="field"><label>Hora</label><input type="text" id="mon-test-hora" placeholder="8:41" style="width:80px"></div>
      <div class="field"><label>Corrida</label><input type="text" id="mon-test-corrida" placeholder="Kinsly A8" style="width:140px"></div>
      <button class="btn btn-red" onclick="forceMonitorTest()">&#129514; Forcar</button>
    </div>
    <p id="mon-test-msg" style="font-size:11px;color:#888;margin-top:10px"></p>
  </div>
  <div class="card">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">${icon('bell',{size:14})} Eventos Importantes</div>
    <p style="font-size:11px;color:#888;margin-bottom:10px">Só erros, mudanças de card detectadas e reanálises — sem o log cheio (fica registrado entre execuções, até a próxima verificação).</p>
    <div class="res-log" id="mon-important-log"><div style="padding:10px;color:#555;font-size:11px">Nenhum evento importante ainda.</div></div>
  </div>
  <div class="card" id="mon-status-card" style="display:none">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">${icon('chart',{size:14})} Status</div>
    <div id="mon-sbar" class="sbar srun"><span class="spin"></span><span id="mon-st-txt"> Aguardando...</span></div>
    <div class="res-log" id="mon-log"></div>
  </div>
</div><!-- fim panel-monitor -->

<div class="robot-panel" id="panel-audit">
  <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:10px">${icon('scroll',{size:20})} Trilha de Auditoria</h1>
  <p class="sub">Histórico permanente de todas as alterações em corridas — robô de monitoramento, robô de resultados e edições manuais. Não reseta, fica salvo pra sempre.</p>
  <div class="card">
    <div class="form-row" style="align-items:flex-end;gap:12px">
      <div class="field"><label>Data</label><input type="date" id="audit-date" value="${today}"></div>
      <button class="btn" onclick="loadAuditLog()">&#128269; Filtrar</button>
    </div>
  </div>
  <div class="card">
    <div class="card-title" style="display:flex;align-items:center;gap:8px">${icon('list',{size:14})} Alterações</div>
    <div id="audit-table-wrap" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="text-align:left;color:#666;text-transform:uppercase;font-size:10px;letter-spacing:.5px;border-bottom:1px solid #333">
            <th style="padding:8px 6px">Quando</th>
            <th style="padding:8px 6px">Corrida</th>
            <th style="padding:8px 6px">Origem</th>
            <th style="padding:8px 6px">Campo</th>
            <th style="padding:8px 6px">De</th>
            <th style="padding:8px 6px">Para</th>
          </tr>
        </thead>
        <tbody id="audit-tbody"><tr><td colspan="6" style="padding:16px;color:#555;text-align:center">Carregando...</td></tr></tbody>
      </table>
    </div>
  </div>
</div><!-- fim panel-audit -->

</div><!-- fim robot-content -->
</div><!-- fim layout -->

<script>
var BASE = '${BASE}';
var PASTA_DOWNLOAD = '${pastaDownload}';
var poll = null;

async function startRobot() {
  var date = document.getElementById('race-date').value;
  var dMin = document.getElementById('dist-min').value;
  var dMax = document.getElementById('dist-max').value;
  var timeFrom = document.getElementById('time-from').value;
  var timeTo = document.getElementById('time-to').value;
  if (!date) { alert('Selecione uma data!'); return; }

  document.getElementById('btn-start').disabled = true;
  document.getElementById('results-wrap').style.display = 'none';
  document.getElementById('log-box').innerHTML = '<div class="lin">Enviando comando para o servidor...</div>';
  document.getElementById('pf').style.width = '0%';
  document.getElementById('prog-cur').textContent = 'Iniciando...';
  document.getElementById('prog-cnt').textContent = '0 / 0';
  setSbar('run', 'Iniciando robo...');

  try {
    var r = await fetch(BASE + '/robot/start', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date, distMin: dMin, distMax: dMax, timeFrom, timeTo })
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erro ao iniciar');
    pollStatus();
  } catch(e) {
    setSbar('err', 'Erro: ' + e.message);
    document.getElementById('btn-start').disabled = false;
  }
}

function pollStatus() {
  if (poll) clearInterval(poll);
  poll = setInterval(async function() {
    try {
      var r = await fetch(BASE + '/robot/status');
      var s = await r.json();
      updateUI(s);
      if (!s.running && s.log.length > 0) { clearInterval(poll); finishUI(s); }
    } catch(e) {}
  }, 1000);
}

function updateUI(s) {
  var pct = s.total > 0 ? Math.round(s.progress / s.total * 100) : 0;
  var elPf = document.getElementById('pf');
  var elCnt = document.getElementById('prog-cnt');
  var elCur = document.getElementById('prog-cur');
  var elSbarText = document.getElementById('sbar-text');
  if (elPf) elPf.style.width = pct + '%';
  if (elCnt) elCnt.textContent = s.progress + ' / ' + (s.total || '?');
  if (elCur) elCur.textContent = s.current || 'Processando...';
  if (elSbarText && s.current) elSbarText.textContent = s.current;
  var log = document.getElementById('log-box');
  if (log) {
    log.innerHTML = s.log.map(function(l) {
      var c = l.type==='ok'?'lok':l.type==='skip'?'lsk':l.type==='err'?'ler':'lin';
      return '<div class="' + c + '">' + escHtml(l.msg) + '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;
  }
}

function finishUI(s) {
  document.getElementById('btn-start').disabled = false;
  if (s.error) setSbar('err', 'Erro: ' + s.error);
  else setSbar('done', 'Concluido! ' + s.pdfs.length + ' PDFs coletados.');
  if (s.pdfs && s.pdfs.length > 0) {
    var date = document.getElementById('race-date').value;
    dlQueue = s.pdfs.map(function(p) { return { filename: p.name, date: date }; });
    document.getElementById('results-wrap').style.display = 'block';
    document.getElementById('pdf-list').innerHTML = s.pdfs.map(function(p) {
      return '<div class="pdf-item"><div><div class="pdf-name">' + escHtml(p.name) + '</div><div class="pdf-meta">' + escHtml(p.track) + ' · ' + p.dist + 'm</div></div><span style="font-size:10px;color:#22c55e">✅</span></div>';
    }).join('');
  }
}

function setSbar(type, txt) {
  var el = document.getElementById('sbar');
  el.style.display = 'flex';
  el.className = 'sbar ' + (type==='run'?'srun':type==='done'?'sdone':'serr');
  var spin = type==='run' ? '<span class="spin"></span>' : '';
  el.innerHTML = spin + '<span>' + escHtml(txt) + '</span>';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function stopRobot() {
  await fetch(BASE + '/robot/stop', { method: 'POST' });
  if (poll) clearInterval(poll);
  document.getElementById('btn-start').disabled = false;
  setSbar('err', 'Parado pelo usuario.');
}

async function clearPdfs() {
  if (!confirm('Limpar todos os PDFs coletados?')) return;
  await fetch(BASE + '/robot/clear', { method: 'POST' });
  document.getElementById('results-wrap').style.display = 'none';
  document.getElementById('log-box').innerHTML = '<div class="lin">PDFs limpos. Pronto para nova coleta.</div>';
  document.getElementById('sbar').style.display = 'none';
}

function analyzeAll() {
  window.location.href = BASE + '?from=robot';
}

// Download sequencial com barra de progresso
var dlQueue = [];

async function downloadAll() {
  if (dlQueue.length === 0) { alert('Nenhum PDF para baixar!'); return; }
  var btn = document.getElementById('btn-dl-all');
  btn.disabled = true;
  var wrap = document.getElementById('dl-progress-wrap');
  var bar = document.getElementById('dl-bar');
  var cur = document.getElementById('dl-cur-file');
  var cnt = document.getElementById('dl-cnt');
  wrap.style.display = 'block';

  var dateRaw = dlQueue[0] ? dlQueue[0].date : '';

  cur.textContent = 'Gerando ZIP organizado (' + PASTA_DOWNLOAD + '/...)...';
  cnt.textContent = dlQueue.length + ' PDFs';
  bar.style.width = '30%';

  try {
    var r = await fetch(BASE + '/robot/download-zip?date=' + encodeURIComponent(dateRaw));
    if (!r.ok) { var err = await r.json().catch(function(){return {error:'Erro ao gerar ZIP'};}); throw new Error(err.error || 'Erro ao gerar ZIP'); }
    bar.style.width = '70%';
    var blob = await r.blob();
    bar.style.width = '95%';

    var disposition = r.headers.get('Content-Disposition') || '';
    var match = disposition.match(/filename="([^"]+)"/);
    var zipName = match ? match[1] : ('greyhound_' + dateRaw + '.zip');

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    bar.style.width = '100%';
    cur.textContent = 'Concluido! ZIP com ' + dlQueue.length + ' PDFs baixado.';
    cnt.textContent = dlQueue.length + ' / ' + dlQueue.length;

    // Exibe popup bonito de conclusao
    document.getElementById('pdf-ready-popup').classList.add('open');
  } catch(e) {
    cur.textContent = 'Erro: ' + e.message;
    alert('Erro ao baixar ZIP: ' + e.message);
  }

  btn.disabled = false;
}

(async function() {
  try {
    var r = await fetch(BASE + '/robot/status');
    var s = await r.json();
    if (s.running) {
      setSbar('run', s.current || 'Robo em execucao...');
      updateUI(s);
      document.getElementById('btn-start').disabled = true;
      pollStatus();
    } else if (s.log.length > 0) {
      updateUI(s);
      if (s.error) setSbar('err', 'Erro: ' + s.error);
      else if (s.pdfs.length > 0) setSbar('done', 'Ultima coleta: ' + s.pdfs.length + ' PDFs.');
      if (s.pdfs.length > 0) {
        var date = document.getElementById('race-date').value;
        dlQueue = s.pdfs.map(function(p) { return { filename: p.name, date: date }; });
        document.getElementById('results-wrap').style.display = 'block';
        document.getElementById('pdf-list').innerHTML = s.pdfs.map(function(p) {
          return '<div class="pdf-item"><div><div class="pdf-name">' + escHtml(p.name) + '</div><div class="pdf-meta">' + escHtml(p.track) + ' · ' + p.dist + 'm</div></div><span style="font-size:10px;color:#22c55e">✅</span></div>';
        }).join('');
      }
    }
  } catch(e) {}
})();

// ── Navegação entre painéis ──────────────────────────────────────────────────
function showPanel(id) {
  document.querySelectorAll('.robot-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.robot-menu-item').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  document.getElementById('mb-' + id).classList.add('active');
}

// ── Robô de Resultados ───────────────────────────────────────────────────────
let resPolling = null;

async function startResultsRobot() {
  const date = document.getElementById('res-date').value;
  if (!date) { alert('Selecione uma data'); return; }
  document.getElementById('btn-res-start').disabled = true;
  document.getElementById('res-status-card').style.display = 'block';
  document.getElementById('res-log').innerHTML = '';
  document.getElementById('res-st-txt').textContent = 'Iniciando...';

  try {
    await fetch(BASE + '/robot/results/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ date })
    });
    if (resPolling) clearInterval(resPolling);
    resPolling = setInterval(pollResultsStatus, 2000);
    document.getElementById('btn-res-stop').disabled=false;
    document.getElementById('btn-res-stop').style.opacity='';
    document.getElementById('btn-res-stop').style.cursor='';
    document.getElementById('btn-res-start').disabled=true;
  } catch(e) {
    alert('Erro: ' + e.message);
    document.getElementById('btn-res-start').disabled = false;
  }
}

async function stopResultsRobot() {
  try {
    await fetch(BASE + '/robot/results/stop', { method: 'POST' });
    document.getElementById('res-st-txt').textContent = 'Parando...';
  } catch(e) {}
}

async function pollResultsStatus() {
  try {
    const r = await fetch(BASE + '/robot/results/status');
    const d = await r.json();
    const logEl = document.getElementById('res-log');
    logEl.innerHTML = (d.logs || []).map(l => {
      const cls = l.type === 'ok' ? 'res-ok' : l.type === 'err' ? 'res-err' : l.type === 'warn' ? 'res-warn' : 'res-info';
      return '<div class="' + cls + '">[' + l.ts + '] ' + l.msg + '</div>';
    }).join('');
    logEl.scrollTop = logEl.scrollHeight;

    const stEl = document.getElementById('res-st-txt');
    const sbar = document.getElementById('res-sbar');
    if (!d.running) {
      clearInterval(resPolling);
      document.getElementById('btn-res-start').disabled=false;
      document.getElementById('btn-res-stop').disabled=true;
      document.getElementById('btn-res-stop').style.opacity='.35';
      document.getElementById('btn-res-stop').style.cursor='not-allowed';
      stEl.textContent = d.lastRun ? 'Concluído — ' + d.updated + ' corridas atualizadas' : 'Pronto';
      sbar.className = 'sbar sdone';
      if (d.suspicious) {
        sbar.className = 'sbar serr';
        stEl.innerHTML = '⚠️ RODADA SUSPEITA — ' + (d.suspiciousReason || 'taxa de falha alta');
      }
    } else {
      stEl.textContent = 'Processando... ' + d.processed + ' corridas';
    }
  } catch(e) {}
}

// ── Robô de Monitoramento de Card ───────────────────────────────────────────
let monPolling = null;

async function forceMonitorTest() {
  const hora = document.getElementById('mon-test-hora').value.trim();
  const corrida = document.getElementById('mon-test-corrida').value.trim();
  const msgEl = document.getElementById('mon-test-msg');
  if (!hora || !corrida) { msgEl.textContent = 'Preenche hora e corrida.'; msgEl.style.color = '#ef4444'; return; }
  msgEl.textContent = 'Aplicando...'; msgEl.style.color = '#888';
  try {
    const r = await fetch(BASE + '/robot/monitor/force-test', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ hora, corrida })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erro');
    msgEl.textContent = '\u2713 ' + d.msg;
    msgEl.style.color = '#22c55e';
  } catch(e) {
    msgEl.textContent = 'Erro: ' + e.message;
    msgEl.style.color = '#ef4444';
  }
}

async function startMonitorRobot() {
  const date = document.getElementById('mon-date').value;
  if (!date) { alert('Selecione uma data'); return; }
  document.getElementById('btn-mon-start').disabled = true;
  document.getElementById('mon-status-card').style.display = 'block';
  document.getElementById('mon-log').innerHTML = '';
  document.getElementById('mon-st-txt').textContent = 'Iniciando...';

  try {
    await fetch(BASE + '/robot/monitor/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ date })
    });
    if (monPolling) clearInterval(monPolling);
    monPolling = setInterval(pollMonitorStatus, 2000);
    document.getElementById('btn-mon-stop').disabled=false;
    document.getElementById('btn-mon-stop').style.opacity='';
    document.getElementById('btn-mon-stop').style.cursor='';
    document.getElementById('btn-mon-start').disabled=true;
  } catch(e) {
    alert('Erro: ' + e.message);
    document.getElementById('btn-mon-start').disabled = false;
  }
}

async function stopMonitorRobot() {
  try {
    await fetch(BASE + '/robot/monitor/stop', { method: 'POST' });
    document.getElementById('mon-st-txt').textContent = 'Parando...';
  } catch(e) {}
}

function renderImportantEvents(logs) {
  const el = document.getElementById('mon-important-log');
  if (!el) return;
  var important = (logs || []).filter(function(l) {
    return l.type === 'err' || l.type === 'warn' ||
      /MUDANCA DETECTADA|REANALISADO/.test(l.msg);
  });
  if (!important.length) {
    el.innerHTML = '<div style="padding:10px;color:#555;font-size:11px">Nenhum evento importante ainda.</div>';
    return;
  }
  el.innerHTML = important.map(function(l) {
    const cls = l.type === 'err' ? 'res-err' : l.type === 'warn' ? 'res-warn' : /REANALISADO/.test(l.msg) ? 'res-ok' : 'res-info';
    return '<div class="' + cls + '">[' + l.ts + '] ' + l.msg + '</div>';
  }).join('');
}

async function loadMonitorImportantOnce() {
  try {
    const r = await fetch(BASE + '/robot/monitor/status');
    const d = await r.json();
    renderImportantEvents(d.logs);
  } catch(e) {}
}

async function pollMonitorStatus() {
  try {
    const r = await fetch(BASE + '/robot/monitor/status');
    const d = await r.json();
    const logEl = document.getElementById('mon-log');
    logEl.innerHTML = (d.logs || []).map(l => {
      const cls = l.type === 'ok' ? 'res-ok' : l.type === 'err' ? 'res-err' : l.type === 'warn' ? 'res-warn' : 'res-info';
      return '<div class="' + cls + '">[' + l.ts + '] ' + l.msg + '</div>';
    }).join('');
    logEl.scrollTop = logEl.scrollHeight;
    renderImportantEvents(d.logs);

    const stEl = document.getElementById('mon-st-txt');
    const sbar = document.getElementById('mon-sbar');
    if (!d.running) {
      clearInterval(monPolling);
      document.getElementById('btn-mon-start').disabled=false;
      document.getElementById('btn-mon-stop').disabled=true;
      document.getElementById('btn-mon-stop').style.opacity='.35';
      document.getElementById('btn-mon-stop').style.cursor='not-allowed';
      stEl.textContent = d.lastRun ? 'Concluído — ' + d.processed + ' verificadas, ' + d.changed + ' com mudança, ' + d.reanalyzed + ' reanalisadas' : 'Pronto';
      sbar.className = 'sbar sdone';
      if (d.suspicious) {
        sbar.className = 'sbar serr';
        stEl.innerHTML = '⚠️ RODADA SUSPEITA — ' + (d.suspiciousReason || 'taxa de falha alta');
      }
    } else {
      stEl.textContent = 'Verificando... ' + d.processed + ' corridas';
    }
  } catch(e) {}
}
async function loadAuditLog() {
  const tbody = document.getElementById('audit-tbody');
  const date = document.getElementById('audit-date').value;
  tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#555;text-align:center">Carregando...</td></tr>';
  try {
    const r = await fetch(BASE + '/robot/audit/list?date=' + encodeURIComponent(date));
    const d = await r.json();
    const rows = d.rows || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#555;text-align:center">Nenhuma alteração nessa data.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(row) {
      const t = new Date(row.changed_at);
      const hh = String(t.getHours()).padStart(2,'0'), mm = String(t.getMinutes()).padStart(2,'0');
      const srcColor = row.source === 'monitor_robot' ? '#60a5fa' : row.source === 'results_robot' ? '#f97316' : '#22c55e';
      const srcLabel = row.source === 'monitor_robot' ? 'Monitoramento' : row.source === 'results_robot' ? 'Resultados' : row.source;
      return '<tr style="border-bottom:1px solid #1a1a1a">'
        + '<td style="padding:8px 6px;color:#888;white-space:nowrap">' + hh + ':' + mm + '</td>'
        + '<td style="padding:8px 6px;font-weight:600">' + (row.corrida||'-') + ' <span style="color:#666;font-weight:400">' + (row.hora||'') + '</span></td>'
        + '<td style="padding:8px 6px;color:' + srcColor + '">' + srcLabel + '</td>'
        + '<td style="padding:8px 6px;color:#aaa">' + row.field + '</td>'
        + '<td style="padding:8px 6px;color:#ef4444">' + (row.valor_antigo||'-') + '</td>'
        + '<td style="padding:8px 6px;color:#22c55e">' + (row.valor_novo||'-') + '</td>'
        + '</tr>';
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;color:#ef4444;text-align:center">Erro: ' + e.message + '</td></tr>';
  }
}
loadMonitorImportantOnce();
loadAuditLog();
</script></body></html>`);
});

// ─── STATUS ───
router.get('/status', requireAdmin, (req, res) => res.json(robotStatus));

// ─── STOP ───
router.post('/stop', requireAdmin, (req, res) => {
  robotStatus.running = false;
  res.json({ ok: true });
});

// ─── CLEAR ───
router.post('/clear', requireAdmin, (req, res) => {
  if (fs.existsSync(PDF_DIR)) {
    fs.readdirSync(PDF_DIR).forEach(f => {
      try { fs.unlinkSync(path.join(PDF_DIR, f)); } catch(e) {}
    });
  }
  resetStatus();
  res.json({ ok: true });
});

// ─── START ───
router.post('/start', requireAdmin, async (req, res) => {
  if (robotStatus.running) return res.status(400).json({ error: 'Robo ja esta rodando!' });
  const { date, distMin, distMax, timeFrom, timeTo } = req.body;
  if (!date) return res.status(400).json({ error: 'Data obrigatoria' });

  resetStatus();
  robotStatus.running = true;
  addLog('info', '🤖 Comando recebido — data: ' + date + ' | dist: ' + (distMin||400) + 'm–' + (distMax||575) + 'm' + (timeFrom ? ' | horário: ' + timeFrom + '–' + (timeTo||'fim') : ''));

  res.json({ ok: true });

  runRobot(date, parseInt(distMin) || 400, parseInt(distMax) || 575, timeFrom||'', timeTo||'').catch(err => {
    robotStatus.running = false;
    const msg = err && err.message ? err.message : String(err);
    robotStatus.error = msg;
    addLog('err', '❌ Erro fatal: ' + msg);
    addLog('err', 'Stack: ' + (err && err.stack ? err.stack.split('\n')[0] : 'sem stack'));
  });
});

// ─── ROBÔ via Browserless.io ───
async function runRobot(DATE, DIST_MIN, DIST_MAX, TIME_FROM, TIME_TO) {
  let browser = null;
  const PDF_DIR = getPdfDir(DATE);
  if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
  addLog('info', '📁 Pasta: ' + PDF_DIR);

  try {
    const puppeteer = require('puppeteer');

    addLog('info', '🌐 Conectando ao Browserless.io...');
    addLog('info', '🔗 ' + BROWSERLESS_WS.replace(/token=.*/, 'token=***'));

    // Diagnóstico: DNS lookup
    const dns = require('dns');
    await new Promise(function(resolve) {
      dns.lookup('chromium.railway.internal', function(err, addr) {
        addLog('info', 'DNS chromium.railway.internal → ' + (err ? 'ERRO: '+err.message : addr));
        resolve();
      });
    });

    // Diagnóstico: HTTP health check
    const http = require('http');
    await new Promise(function(resolve) {
      const req = http.get('http://chromium.railway.internal:3000/docs', function(res) {
        addLog('info', 'HTTP /docs → status: ' + res.statusCode);
        resolve();
      });
      req.on('error', function(e) { addLog('err', 'HTTP /docs → ERRO: ' + e.message); resolve(); });
      req.setTimeout(5000, function() { addLog('err', 'HTTP /docs → TIMEOUT'); req.destroy(); resolve(); });
    });

    // Tenta conectar com log detalhado de erro
    try {
      browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    } catch(connErr) {
      let errMsg = 'sem mensagem';
      try { errMsg = JSON.stringify(connErr); } catch(e) { errMsg = String(connErr); }
      addLog('err', '⚠️ Detalhe erro: ' + errMsg);
      const altWS = BROWSERLESS_WS.replace('/chromium?', '?');
      addLog('info', '🔄 Tentando URL alternativa: ' + altWS.replace(/token=.*/, 'token=***'));
      try {
        browser = await puppeteer.connect({ browserWSEndpoint: altWS });
      } catch(connErr2) {
        let errMsg2 = 'sem mensagem';
        try { errMsg2 = JSON.stringify(connErr2); } catch(e) { errMsg2 = String(connErr2); }
        addLog('err', '⚠️ Detalhe erro2: ' + errMsg2);
        throw new Error('Falha ao conectar: ' + errMsg + ' | ' + errMsg2);
      }
    }

    addLog('ok', '✅ Conectado ao Browserless!');

    let page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // User Agent real para não ser bloqueado como bot
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-GB,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    addLog('info', '✅ Nova página criada com User Agent real');

    const LIST_URL = `https://greyhoundbet.racingpost.com/#meeting-list/view=time&r_date=${DATE}`;

    addLog('info', '🏇 Acessando Racing Post...');
    robotStatus.current = 'Carregando site...';

    await page.goto(LIST_URL, { timeout: 30000, waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 3000));

    addLog('ok', '✅ Site carregado: ' + page.url());
    addLog('info', '📅 Data: ' + DATE);

    addLog('info', '⏳ Aguardando lista carregar (6s)...');
    await new Promise(r => setTimeout(r, 8000));
    addLog('info', '🔗 URL atual: ' + await page.evaluate(() => window.location.href));

    addLog('info', '🔎 Buscando corridas na página...');
    robotStatus.current = 'Coletando lista...';

    const races = await page.evaluate(({ distMin, distMax }) => {
      const results = [];
      const seen = new Set();
      const items = document.querySelectorAll('a[href*="meeting-races"], a[href*="card/race_id"]');

      items.forEach(a => {
        const href = a.getAttribute('href') || '';
        if (seen.has(href)) return;
        seen.add(href);
        const ctx = a.closest('li, div, tr') || a.parentElement;
        const text = (ctx || a).textContent || '';
        const timeMatch = text.match(/(\d{1,2}:\d{2})/);
        const distMatch = text.match(/Dis[:\s]*(\d{3,4})/) || text.match(/(\d{3,4})m/);
        const gradeMatch = text.match(/\(([A-Z]\d+)\)/) || text.match(/Grade[:\s]*([A-Z]\d+)/i);
        const lines = text.trim().split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
        const dist = distMatch ? parseInt(distMatch[1]) : 0;
        if (dist > 0 && (dist < distMin || dist > distMax)) return;
        results.push({
          href,
          time: timeMatch ? timeMatch[1] : '',
          dist,
          grade: gradeMatch ? gradeMatch[1] : '',
          track: (lines[0] || '').slice(0, 25)
        });
      });

      return {
        count: results.length,
        totalLinks: document.querySelectorAll('a[href]').length,
        title: document.title,
        hash: window.location.hash,
        races: results
      };
    }, { distMin: DIST_MIN, distMax: DIST_MAX });

    addLog('info', `📄 Título: "${races.title}" | Links: ${races.totalLinks} | Hash: ${races.hash}`);
    addLog(races.count > 0 ? 'ok' : 'err', `📊 Corridas no filtro: ${races.count}`);

    robotStatus.total = races.count;

    if (races.count === 0) {
      addLog('err', '❌ Nenhuma corrida encontrada.');
      addLog('info', '💡 O site pode estar bloqueando o acesso via bot.');
      robotStatus.running = false;
      await browser.disconnect();
      return;
    }

    let saved = 0, skipped = 0, errors = 0;

    // Reconecta ao Browserless se a conexão cair (detached frame)
    async function getActivePage(currentPage) {
      try {
        await currentPage.evaluate(() => true);
        return currentPage;
      } catch(e) {
        addLog('info', '🔄 Reconectando ao Browserless...');
        try { await browser.disconnect(); } catch(e2) {}
        browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
        const newPage = await browser.newPage();
        await newPage.setViewport({ width: 1280, height: 900 });
        await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        addLog('ok', '✅ Reconectado!');
        return newPage;
      }
    }

    for (let i = 0; i < races.races.length; i++) {
      if (!robotStatus.running) { addLog('info', '⏹ Parado pelo usuario'); break; }

      page = await getActivePage(page);

      const race = races.races[i];
      robotStatus.progress = i + 1;
      robotStatus.current = `[${i+1}/${races.count}] ${race.track} ${race.time}`;

      // Filtro de horário antecipado — usa horário da lista sem visitar a página
      if (!inTimeRange(race.time, TIME_FROM, TIME_TO)) {
        const tf = formatTime(race.time);
        addLog('skip', `⏭ ${race.track} ${tf} — fora do horário (pulando visita)`);
        skipped++;
        continue;
      }

      addLog('info', `▶ [${i+1}/${races.count}] ${race.track} | ${race.time} | ${race.dist}m`);

      try {
        const raceHref = race.href.startsWith('http')
          ? race.href
          : 'https://greyhoundbet.racingpost.com/' + race.href.replace(/^\//, '');

        // Navegar para a página base primeiro, depois setar o hash (SPA)
        const raceBase = 'https://greyhoundbet.racingpost.com/';
        const raceHash = raceHref.includes('#') ? raceHref.split('#')[1] : race.href.replace(/^#/, '');

        await page.goto(raceBase, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));
        await page.evaluate((hash) => { window.location.hash = hash; }, raceHash);
        addLog('info', `   Hash: #${raceHash}`);

        // Aguardar tabela da corrida carregar (SPA)
        try {
          await page.waitForSelector(
            '.RC-runnerTable, .RC-cardPage, [class*="runnerTable"], [class*="cardPage"], [class*="RC-runner"], tbody tr',
            { timeout: 15000 }
          );
          addLog('info', '   ✅ Tabela carregada');
          await new Promise(r => setTimeout(r, 1500));
        } catch(e) {
          addLog('info', '   ⚠️ Tabela não detectada, aguardando +5s...');
          await new Promise(r => setTimeout(r, 5000));
        }

        // Clicar na aba "Form" para mostrar histórico completo
        try {
          const formTab = await page.$('a[href*="form"], button[class*="form"], .RC-tabs__tab--form, [class*="tab"][class*="form"], a.RC-meetingTabs__tab');
          if (formTab) {
            await formTab.click();
            addLog('info', '   ✅ Aba Form clicada');
            await new Promise(r => setTimeout(r, 2000));
          } else {
            // Tentar pelo texto do link
            await page.evaluate(() => {
              const tabs = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
              const formTab = tabs.find(t => t.textContent.trim().toLowerCase() === 'form');
              if (formTab) formTab.click();
            });
            await new Promise(r => setTimeout(r, 2000));
            addLog('info', '   ✅ Aba Form clicada via texto');
          }
        } catch(e) {
          addLog('info', '   ⚠️ Aba Form não encontrada: ' + e.message.slice(0,50));
        }

        const info = await page.evaluate(() => {
          const body = document.body.textContent;
          const headerEl = document.querySelector('.RC-meetingHeader__track,[class*="header__track"],[class*="headerTrack"],[class*="meetingHeader"],h1,h2');
          const distM = body.match(/\b([2-9]\d{2}|[1-9]\d{3})m\b/) || body.match(/Distance[:\s]*(\d{3,4})/i) || body.match(/Dist[:\s]*(\d{3,4})/i);
          const timeM = body.match(/(\d{1,2}:\d{2})/);
          // Debug: capturar estrutura da página
          const allClasses = Array.from(document.querySelectorAll('[class]')).slice(0,10).map(el => el.className.toString().slice(0,40));
          return {
            track: headerEl ? headerEl.textContent.trim().split(/[\n\r]/)[0].trim().slice(0,20) : '',
            dist: distM ? parseInt(distM[1]) : 0,
            time: timeM ? timeM[1] : '',
            pageTitle: document.title,
            bodyLen: document.body.innerHTML.length,
            classes: allClasses
          };
        });

        addLog('info', `   Página: "${info.pageTitle}" | HTML: ${info.bodyLen} chars | Track: "${info.track}"`);

        const track = ((info.track || race.track).split(/[\s,]/)[0].replace(/[^a-zA-Z]/g,'') || 'Race');
        const raceTime = info.time || race.time || '';
        const dist = race.dist || info.dist;
        const timeFormatted = formatTime(raceTime);

        if (dist > 0 && (dist < DIST_MIN || dist > DIST_MAX)) {
          addLog('skip', `⏭ ${track} ${timeFormatted} — ${dist}m fora do filtro dist`);
          skipped++;
          await page.goto(LIST_URL, { timeout: 30000, waitUntil: "networkidle0" });
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (!inTimeRange(raceTime, TIME_FROM, TIME_TO)) {
          addLog('skip', `⏭ ${track} ${timeFormatted} — fora do horário`);
          skipped++;
          await page.goto(LIST_URL, { timeout: 30000, waitUntil: "networkidle0" });
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        const filename = `${timeFormatted}_${track}.pdf`;
        const filepath = path.join(PDF_DIR, filename);

        // CSS para impressão limpa — fundo branco, sem elementos desnecessários
        await page.addStyleTag({ content: `
          @media print {
            body { background: white !important; color: black !important; }
            nav, .RC-header, [class*="header__nav"], [class*="banner"], [class*="cookie"], 
            [class*="advertisement"], [class*="sticky"], footer { display: none !important; }
          }
        `});

        // Browserless retorna buffer — não usar path diretamente
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' }
        });

        fs.writeFileSync(filepath, pdfBuffer);

        const size = pdfBuffer.length;
        if (size < 5000) {
          fs.unlinkSync(filepath);
          addLog('skip', `⚠️ ${filename} — PDF vazio (${size} bytes)`);
          skipped++;
        } else {
          addLog('ok', `✅ ${filename} — ${Math.round(size/1024)}KB`);
          robotStatus.pdfs.push({ filename, name: filename, track, dist, time: raceTime });
          saved++;
        }

      } catch(err) {
        const msg = err.message || '';
        if (msg.includes('detached') || msg.includes('Session closed') || msg.includes('Target closed')) {
          addLog('info', '🔄 Sessão expirada, reconectando...');
          try { await browser.disconnect(); } catch(e2) {}
          try {
            browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 900 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
            addLog('ok', '✅ Reconectado! Retentando corrida...');
            i--; // retenta a mesma corrida
          } catch(reconnErr) {
            addLog('err', '❌ Falha ao reconectar: ' + reconnErr.message.slice(0,80));
            errors++;
          }
        } else {
          addLog('err', `❌ Erro: ${err.message.slice(0,120)}`);
          errors++;
        }
      }

      try {
        await page.goto(LIST_URL, { timeout: 30000, waitUntil: "networkidle0" });
        await new Promise(r => setTimeout(r, 3000));
      } catch(navErr) {
        addLog('info', '🔄 Erro ao voltar para lista, reconectando...');
        try { await browser.disconnect(); } catch(e2) {}
        browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        addLog('ok', '✅ Reconectado após erro de navegação');
      }
    }

    addLog('ok', `🏁 Concluido! ✅${saved} salvos | ⏭${skipped} pulados | ❌${errors} erros`);

  } catch(err) {
    robotStatus.error = err.message;
    addLog('err', '❌ Erro fatal: ' + err.message);
    addLog('err', err.stack ? err.stack.slice(0, 300) : '(sem stack)');
  } finally {
    if (browser) {
      try { await browser.disconnect(); } catch(e) {}
    }
    robotStatus.running = false;
    robotStatus.current = 'Concluido';
  }
}

// ─── DOWNLOAD PDF INDIVIDUAL ───
router.get('/download-pdf', requireAdmin, (req, res) => {
  const { date, file } = req.query;
  if (!date || !file) return res.status(400).send('Parametros invalidos');

  // Segurança: não permitir path traversal
  const safeName = path.basename(file);
  const filepath = path.join(PDF_BASE, date, safeName);

  if (!fs.existsSync(filepath)) {
    return res.status(404).send('Arquivo nao encontrado');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  fs.createReadStream(filepath).pipe(res);
});

// ─── DOWNLOAD ZIP ───
router.get('/download-zip', requireAdmin, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const dir = path.join(PDF_BASE, date);

  if (!fs.existsSync(dir)) {
    return res.status(404).json({ error: 'Nenhum PDF encontrado para esta data' });
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
  if (files.length === 0) {
    return res.status(404).json({ error: 'Nenhum PDF encontrado' });
  }

  let pastaDownload = 'Racingpost';
  try { const cfg = getUserConfig(req.user.id); pastaDownload = (cfg.pasta_download || 'Racingpost').replace(/[^a-zA-Z0-9_-]/g,''); } catch(e) {}

  // DDMMYYYY a partir da data YYYY-MM-DD
  const dParts = date.split('-');
  const ddmmyyyy = dParts.length === 3 ? dParts[2] + dParts[1] + dParts[0] : date;
  const subfolder = pastaDownload + '/' + ddmmyyyy;

  const archiver = require('archiver');
  const ZipArchive = archiver.ZipArchive || archiver;
  const zipName = `${pastaDownload}_${ddmmyyyy}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = typeof ZipArchive === 'function' && ZipArchive.prototype && ZipArchive.prototype.pipe
    ? new ZipArchive({ zlib: { level: 6 } })
    : archiver('zip', { zlib: { level: 6 } });

  archive.on('error', err => {
    console.error('[ZIP] Erro:', err.message);
    if (!res.headersSent) res.status(500).send('Erro ao gerar ZIP');
  });

  archive.pipe(res);

  files.forEach(f => {
    archive.file(path.join(dir, f), { name: subfolder + '/' + f });
  });

  // Aguardar o ZIP ser finalizado antes de fechar
  await new Promise((resolve, reject) => {
    res.on('finish', resolve);
    archive.on('error', reject);
    archive.finalize();
  });
});

// ── Robô de Resultados ────────────────────────────────────────────────────────
router.post('/results/stop', requireAdmin, (req, res) => {
  const st = getResultsStatus();
  if (!st.running) return res.json({ ok: true, msg: 'Não está rodando' });
  // Sinalizar parada diretamente no módulo
  resultsRobotModule.requestStop && resultsRobotModule.requestStop();
  res.json({ ok: true });
});

router.post('/results/run', requireAdmin, express.json(), async (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  try {
    runResultsRobot(date).catch(e => console.error('[RESULTS]', e.message));
    res.json({ ok: true, date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/results/status', requireAdmin, (req, res) => {
  res.json(getResultsStatus());
});

// ── Robô de Monitoramento de Card ───────────────────────────────────────────
router.post('/monitor/stop', requireAdmin, (req, res) => {
  const st = getMonitorStatus();
  if (!st.running) return res.json({ ok: true, msg: 'Não está rodando' });
  cardMonitorModule.requestStop && cardMonitorModule.requestStop();
  res.json({ ok: true });
});

router.post('/monitor/run', requireAdmin, express.json(), async (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  try {
    runCardMonitorRobot(date).catch(e => console.error('[MONITOR]', e.message));
    res.json({ ok: true, date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/monitor/status', requireAdmin, (req, res) => {
  res.json(getMonitorStatus());
});

// ── Ferramenta de teste: forca uma "mudanca falsa" no trap 1 de uma corrida,
// pra disparar o fluxo completo (deteccao + extracao de historico + reanalise)
// na proxima rodada do robo, sem precisar esperar uma mudanca real acontecer.
router.post('/monitor/force-test', requireAdmin, express.json(), (req, res) => {
  const { hora, corrida } = req.body || {};
  if (!hora || !corrida) return res.status(400).json({ error: 'Informe hora e corrida (ex: "8:41" e "Kinsly A8")' });
  const { db } = require('../db/database');
  const date = new Date().toISOString().slice(0, 10);
  const race = db.prepare(
    "SELECT r.id, r.race_card FROM races r JOIN race_sessions s ON s.id=r.session_id " +
    "WHERE date(s.created_at, '-3 hours')=? AND r.hora=? AND r.corrida=?"
  ).get(date, hora, corrida);
  if (!race) return res.status(404).json({ error: 'Corrida nao encontrada para hoje com essa hora/corrida' });
  let card = [];
  try { card = JSON.parse(race.race_card || '[]'); } catch(e) {}
  if (!card.length) return res.status(400).json({ error: 'race_card vazio pra essa corrida' });
  const trapOriginal = card[0].nome;
  card[0] = { trap: card[0].trap, nome: 'TESTE Nome Falso XYZ' };
  db.prepare('UPDATE races SET race_card=? WHERE id=?').run(JSON.stringify(card), race.id);
  res.json({ ok: true, msg: 'Trap ' + card[0].trap + ' revertido de "' + trapOriginal + '" pra nome de teste. Roda o monitor agora pra disparar a deteccao.' });
});

// ── Auditoria: lista as alteracoes registradas em race_audit_log pra uma data
router.get('/audit/list', requireAdmin, (req, res) => {
  const { db } = require('../db/database');
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const rows = db.prepare(
      "SELECT a.changed_at, a.source, a.field, a.valor_antigo, a.valor_novo, r.corrida, r.hora " +
      "FROM race_audit_log a JOIN races r ON r.id = a.race_id " +
      "WHERE date(a.changed_at, '-3 hours') = ? " +
      "ORDER BY a.changed_at DESC LIMIT 300"
    ).all(date);
    res.json({ rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;