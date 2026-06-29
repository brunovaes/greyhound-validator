const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_PATH || '/greyhound';

const PDF_DIR = path.join(__dirname, '../../public/pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '2UnDGfhNkfGbb981901301f0f490a53b587deeb6313c634d1';
const BROWSERLESS_WS = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`;

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
  const ts = new Date().toISOString().substring(11, 19);
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

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Robo - Greyhound Validator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}
.hero img{width:100%;height:130px;object-fit:cover;object-position:center 30%;display:block}
nav{background:#111;border-bottom:1px solid #333;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}
.nl:hover,.na{color:#22c55e;border-bottom-color:#22c55e}
.content{padding:24px;max-width:920px;margin:0 auto}
h1{font-size:20px;font-weight:700;margin-bottom:6px}
.sub{font-size:13px;color:#888;margin-bottom:24px}
.card{background:#111;border:1px solid #333;border-radius:10px;padding:20px;margin-bottom:16px}
.card-title{font-size:12px;font-weight:700;color:#22c55e;margin-bottom:16px;text-transform:uppercase;letter-spacing:.8px}
.form-row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.field input{padding:9px 12px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#f0f0f0;font-size:14px}
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
.srun{background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);color:#60a5fa}
.sdone{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);color:#22c55e}
.serr{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444}
.spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(96,165,250,.3);border-top-color:#60a5fa;border-radius:50%;animation:sp .8s linear infinite;flex-shrink:0}
@keyframes sp{to{transform:rotate(360deg)}}
.ab{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.empty{text-align:center;padding:24px;color:#555;font-size:13px}
</style></head><body>
<div class="hero"><img src="${logoB64}" alt="Greyhound Validator"></div>
<nav>
  <div>
    <a href="${BASE}" class="nl">Analisar</a>
    <a href="${BASE}/historico" class="nl">Historico</a>
    <a href="${BASE}/config" class="nl">Configuracoes</a>
    <a href="${BASE}/admin/usuarios" class="nl">Usuarios</a>
    <a href="${BASE}/robot" class="nl na">Robo</a>
  </div>
  <span style="font-size:11px;color:#666;padding:12px">Admin · <a href="${BASE}/logout" style="color:#666;text-decoration:none">Sair</a></span>
</nav>
<div class="content">
  <h1>&#x1F916; Robo Coletor de PDFs</h1>
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
        <input type="number" id="dist-min" value="400" style="width:110px">
      </div>
      <div class="field">
        <label>Dist. maxima (m)</label>
        <input type="number" id="dist-max" value="575" style="width:110px">
      </div>
      <button class="btn" id="btn-start" onclick="startRobot()">&#x25B6; Iniciar Coleta</button>
      <button class="btn btn-red" id="btn-stop" onclick="stopRobot()">&#x25A0; Parar</button>
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
      <div class="ab">
        <button class="btn" onclick="analyzeAll()">&#x1F50D; Analisar Todos no Validator</button>
        <button class="btn btn-red" onclick="clearPdfs()">&#x1F5D1; Limpar PDFs</button>
      </div>
    </div>
  </div>
</div>

<script>
var BASE = '${BASE}';
var poll = null;

async function startRobot() {
  var date = document.getElementById('race-date').value;
  var dMin = document.getElementById('dist-min').value;
  var dMax = document.getElementById('dist-max').value;
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
      body: JSON.stringify({ date, distMin: dMin, distMax: dMax })
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
    document.getElementById('results-wrap').style.display = 'block';
    document.getElementById('pdf-list').innerHTML = s.pdfs.map(function(p) {
      return '<div class="pdf-item"><div><div class="pdf-name">' + escHtml(p.name) + '</div><div class="pdf-meta">' + escHtml(p.track) + ' · ' + p.dist + 'm</div></div><span style="font-size:10px;color:#22c55e">OK</span></div>';
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
        document.getElementById('results-wrap').style.display = 'block';
        document.getElementById('pdf-list').innerHTML = s.pdfs.map(function(p) {
          return '<div class="pdf-item"><div><div class="pdf-name">' + escHtml(p.name) + '</div><div class="pdf-meta">' + escHtml(p.track) + ' · ' + p.dist + 'm</div></div><span style="font-size:10px;color:#22c55e">OK</span></div>';
        }).join('');
      }
    }
  } catch(e) {}
})();
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
  const { date, distMin, distMax } = req.body;
  if (!date) return res.status(400).json({ error: 'Data obrigatoria' });

  resetStatus();
  robotStatus.running = true;
  addLog('info', '🤖 Comando recebido — data: ' + date + ' | dist: ' + (distMin||400) + 'm–' + (distMax||575) + 'm');

  res.json({ ok: true });

  runRobot(date, parseInt(distMin) || 400, parseInt(distMax) || 575).catch(err => {
    robotStatus.running = false;
    robotStatus.error = err.message;
    addLog('err', '❌ Erro fatal: ' + err.message);
  });
});

// ─── ROBÔ via Browserless.io ───
async function runRobot(DATE, DIST_MIN, DIST_MAX) {
  let browser = null;
  try {
    const puppeteer = require('puppeteer');

    addLog('info', '🌐 Conectando ao Browserless.io...');
    addLog('info', '🔗 ' + BROWSERLESS_WS.replace(/token=.*/, 'token=***'));

    browser = await puppeteer.connect({
      browserWSEndpoint: BROWSERLESS_WS
    });

    addLog('ok', '✅ Conectado ao Browserless!');

    const page = await browser.newPage();
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

    await page.goto('https://greyhoundbet.racingpost.com/', { timeout: 30000, waitUntil: "networkidle0" });
    addLog('ok', '✅ Site carregado: ' + page.url());

    addLog('info', '📅 Navegando para data: ' + DATE);
    await page.evaluate((date) => {
      window.location.hash = 'meeting-list/view=time&r_date=' + date;
    }, DATE);

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

    for (let i = 0; i < races.races.length; i++) {
      if (!robotStatus.running) { addLog('info', '⏹ Parado pelo usuario'); break; }

      const race = races.races[i];
      robotStatus.progress = i + 1;
      robotStatus.current = `[${i+1}/${races.count}] ${race.track} ${race.time}`;
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
          await new Promise(r => setTimeout(r, 2000)); // extra para renderizar tudo
        } catch(e) {
          addLog('info', '   ⚠️ Tabela não detectada, aguardando +5s...');
          await new Promise(r => setTimeout(r, 5000));
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
        const time = (info.time || race.time || `r${i+1}`).replace(':', '.');
        // Priorizar distância da lista — mais confiável que re-extrair da página
        const dist = race.dist || info.dist;

        if (dist > 0 && (dist < DIST_MIN || dist > DIST_MAX)) {
          addLog('skip', `⏭ ${track} ${time} — ${dist}m fora do filtro`);
          skipped++;
          await page.goto(LIST_URL, { timeout: 30000, waitUntil: "networkidle0" });
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        const filename = `${track} ${time}.pdf`;
        const filepath = path.join(PDF_DIR, filename);

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
          robotStatus.pdfs.push({ filename, name: filename, track, dist, time });
          saved++;
        }

      } catch(err) {
        addLog('err', `❌ Erro: ${err.message.slice(0,120)}`);
        errors++;
      }

      await page.goto(LIST_URL, { timeout: 30000, waitUntil: "networkidle0" });
      await new Promise(r => setTimeout(r, 3000));
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

module.exports = router;