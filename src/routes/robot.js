const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_PATH || '/greyhound';

// Status global do robô (em memória)
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

// Pasta para salvar PDFs
const PDF_DIR = path.join(__dirname, '../../public/pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// ─── PÁGINA DO ROBÔ ───
router.get('/', requireAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
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
.content{padding:24px;max-width:900px;margin:0 auto}
h1{font-size:20px;font-weight:700;margin-bottom:6px}
.sub{font-size:13px;color:#888;margin-bottom:24px}
.card{background:#111;border:1px solid #333;border-radius:10px;padding:20px;margin-bottom:16px}
.card-title{font-size:13px;font-weight:700;color:#22c55e;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px}
.form-row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.field input,.field select{padding:9px 12px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#f0f0f0;font-size:14px}
.field input:focus,.field select:focus{outline:none;border-color:#22c55e}
.btn{padding:10px 20px;background:#22c55e;color:#000;font-weight:700;font-size:13px;border:none;border-radius:6px;cursor:pointer;white-space:nowrap}
.btn:hover{background:#16a34a}
.btn:disabled{opacity:.35;cursor:not-allowed}
.btn-danger{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)}
.btn-danger:hover{background:rgba(239,68,68,.25)}
.btn-blue{background:rgba(96,165,250,.15);color:#60a5fa;border:1px solid rgba(96,165,250,.3)}
.btn-blue:hover{background:rgba(96,165,250,.25)}
.pw{margin-bottom:12px}
.pb{height:8px;background:#222;border-radius:4px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,#22c55e,#f97316);border-radius:4px;transition:width .5s}
.prog-text{font-size:12px;color:#888;margin-top:6px;display:flex;justify-content:space-between}
.log-box{background:#0a0a0a;border:1px solid #222;border-radius:6px;padding:12px;max-height:200px;overflow-y:auto;font-family:monospace;font-size:11px;line-height:1.8}
.log-ok{color:#22c55e}.log-skip{color:#888}.log-err{color:#ef4444}.log-info{color:#60a5fa}
.pdf-list{display:flex;flex-direction:column;gap:6px;margin-top:12px;max-height:300px;overflow-y:auto}
.pdf-item{display:flex;align-items:center;justify-content:space-between;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:8px 12px}
.pdf-name{font-size:12px;font-weight:600}
.pdf-meta{font-size:10px;color:#888;margin-top:2px}
.pdf-ok{border-left:3px solid #22c55e}.pdf-skip{border-left:3px solid #444;opacity:.5}
.badge-sm{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600}
.b-ok{background:rgba(34,197,94,.15);color:#22c55e}.b-skip{background:rgba(100,100,100,.1);color:#888}
.empty-state{text-align:center;padding:30px;color:#666}
.status-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px}
.status-running{background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);color:#60a5fa}
.status-done{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);color:#22c55e}
.status-error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ef4444}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(96,165,250,.3);border-top-color:#60a5fa;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ab{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
</style></head><body>
<div class="hero" id="hero-div"></div>
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
  <p class="sub">Coleta automaticamente as corridas do Racing Post e prepara para analise.</p>

  <div class="card">
    <div class="card-title">Configurar Coleta</div>
    <div class="form-row">
      <div class="field">
        <label>Data das corridas</label>
        <input type="date" id="race-date" value="${today}">
      </div>
      <div class="field">
        <label>Distancia minima (m)</label>
        <input type="number" id="dist-min" value="400" min="200" max="600" style="width:130px">
      </div>
      <div class="field">
        <label>Distancia maxima (m)</label>
        <input type="number" id="dist-max" value="575" min="400" max="1000" style="width:130px">
      </div>
      <div class="field">
        <label>Classes</label>
        <select id="grade-filter">
          <option value="A">Apenas A (A1-A12)</option>
          <option value="all">Todas as classes</option>
        </select>
      </div>
      <button class="btn" id="btn-start" onclick="startRobot()">&#x25B6; Iniciar Coleta</button>
      <button class="btn btn-danger" id="btn-stop" onclick="stopRobot()" style="display:none">&#x25A0; Parar</button>
    </div>
  </div>

  <div id="status-section" style="display:none">
    <div class="status-bar status-running" id="status-bar">
      <span class="spinner"></span>
      <span id="status-text">Iniciando...</span>
    </div>
    <div class="card">
      <div class="card-title">Progresso</div>
      <div class="pw">
        <div class="pb"><div class="pf" id="pf" style="width:0%"></div></div>
        <div class="prog-text">
          <span id="prog-current">Aguardando...</span>
          <span id="prog-count">0 / 0</span>
        </div>
      </div>
      <div class="log-box" id="log-box"></div>
    </div>
  </div>

  <div id="results-section" style="display:none">
    <div class="card">
      <div class="card-title">PDFs Coletados</div>
      <div class="pdf-list" id="pdf-list">
        <div class="empty-state">Nenhum PDF coletado ainda</div>
      </div>
      <div class="ab" id="action-btns" style="display:none">
        <button class="btn" onclick="analyzeAll()">&#x1F50D; Analisar Todos no Validator</button>
        <button class="btn btn-blue" onclick="downloadAll()">&#x2B07; Baixar Todos</button>
        <button class="btn btn-danger" onclick="clearPdfs()">&#x1F5D1; Limpar</button>
      </div>
    </div>
  </div>
</div>

<script>
var BASE = '${BASE}';
var pollInterval = null;

async function startRobot() {
  var date = document.getElementById('race-date').value;
  var distMin = document.getElementById('dist-min').value;
  var distMax = document.getElementById('dist-max').value;
  var gradeFilter = document.getElementById('grade-filter').value;
  if (!date) { alert('Selecione uma data!'); return; }

  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').style.display = 'inline-block';
  document.getElementById('status-section').style.display = 'block';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('log-box').innerHTML = '';
  document.getElementById('pf').style.width = '0%';

  try {
    var resp = await fetch(BASE + '/robot/start', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date, distMin, distMax, gradeFilter })
    });
    var data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao iniciar');
    pollStatus();
  } catch(e) {
    showError(e.message);
  }
}

function pollStatus() {
  pollInterval = setInterval(async function() {
    try {
      var resp = await fetch(BASE + '/robot/status');
      var s = await resp.json();
      updateUI(s);
      if (!s.running) {
        clearInterval(pollInterval);
        finishUI(s);
      }
    } catch(e) {}
  }, 1000);
}

function updateUI(s) {
  var pct = s.total > 0 ? Math.round(s.progress / s.total * 100) : 0;
  document.getElementById('pf').style.width = pct + '%';
  document.getElementById('prog-count').textContent = s.progress + ' / ' + s.total;
  document.getElementById('prog-current').textContent = s.current || 'Processando...';
  document.getElementById('status-text').textContent = s.current || 'Coletando corridas...';

  var log = document.getElementById('log-box');
  log.innerHTML = s.log.slice(-20).map(function(l) {
    var cls = l.type === 'ok' ? 'log-ok' : l.type === 'skip' ? 'log-skip' : l.type === 'err' ? 'log-err' : 'log-info';
    return '<div class="' + cls + '">' + l.msg + '</div>';
  }).join('');
  log.scrollTop = log.scrollHeight;
}

function finishUI(s) {
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').style.display = 'none';

  var bar = document.getElementById('status-bar');
  if (s.error) {
    bar.className = 'status-bar status-error';
    document.getElementById('status-text').textContent = 'Erro: ' + s.error;
  } else {
    bar.className = 'status-bar status-done';
    document.getElementById('status-text').textContent = 'Coleta concluida! ' + s.pdfs.length + ' PDFs coletados.';
  }

  if (s.pdfs.length > 0) {
    document.getElementById('results-section').style.display = 'block';
    document.getElementById('action-btns').style.display = 'flex';
    var list = document.getElementById('pdf-list');
    list.innerHTML = s.pdfs.map(function(p) {
      return '<div class="pdf-item pdf-ok">' +
        '<div><div class="pdf-name">' + p.name + '</div><div class="pdf-meta">' + p.track + ' · ' + p.grade + ' · ' + p.dist + 'm</div></div>' +
        '<span class="badge-sm b-ok">OK</span>' +
      '</div>';
    }).join('');
  }
}

function showError(msg) {
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').style.display = 'none';
  var bar = document.getElementById('status-bar');
  bar.className = 'status-bar status-error';
  document.getElementById('status-text').textContent = 'Erro: ' + msg;
}

async function stopRobot() {
  await fetch(BASE + '/robot/stop', { method: 'POST' });
  clearInterval(pollInterval);
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').style.display = 'none';
}

async function analyzeAll() {
  var resp = await fetch(BASE + '/robot/status');
  var s = await resp.json();
  if (!s.pdfs.length) { alert('Nenhum PDF para analisar!'); return; }
  // Redirecionar para pagina principal com os PDFs ja carregados
  sessionStorage.setItem('robotPdfs', JSON.stringify(s.pdfs));
  window.location.href = BASE + '?from=robot';
}

async function downloadAll() {
  var resp = await fetch(BASE + '/robot/status');
  var s = await resp.json();
  s.pdfs.forEach(function(p) {
    var a = document.createElement('a');
    a.href = BASE + '/static/pdfs/' + p.filename;
    a.download = p.name;
    a.click();
  });
}

async function clearPdfs() {
  if (!confirm('Limpar todos os PDFs coletados?')) return;
  await fetch(BASE + '/robot/clear', { method: 'POST' });
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('status-section').style.display = 'none';
}

// Carregar logo
fetch(BASE + '/robot/logo').then(r=>r.json()).then(function(d) {
  if (d.logo) {
    var img = document.createElement('img');
    img.src = d.logo; img.alt = 'Logo';
    img.style.cssText = 'width:100%;height:130px;object-fit:cover;object-position:center 30%;display:block';
    document.getElementById('hero-div').appendChild(img);
  }
});
</script>
</body></html>`);
});

// ─── API: STATUS ───
router.get('/status', requireAdmin, (req, res) => {
  res.json(robotStatus);
});

// ─── API: LOGO ───
router.get('/logo', requireAdmin, (req, res) => {
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  const fs2 = require('fs');
  if (fs2.existsSync(logoPath)) {
    const b64 = 'data:image/png;base64,' + fs2.readFileSync(logoPath).toString('base64');
    res.json({ logo: b64 });
  } else {
    res.json({ logo: null });
  }
});

// ─── API: STOP ───
router.post('/stop', requireAdmin, (req, res) => {
  robotStatus.running = false;
  res.json({ ok: true });
});

// ─── API: CLEAR ───
router.post('/clear', requireAdmin, (req, res) => {
  // Limpar PDFs da pasta
  if (fs.existsSync(PDF_DIR)) {
    fs.readdirSync(PDF_DIR).forEach(f => {
      try { fs.unlinkSync(path.join(PDF_DIR, f)); } catch(e) {}
    });
  }
  resetStatus();
  res.json({ ok: true });
});

// ─── API: START ───
router.post('/start', requireAdmin, async (req, res) => {
  if (robotStatus.running) return res.status(400).json({ error: 'Robo ja esta rodando!' });

  const { date, distMin, distMax, gradeFilter } = req.body;
  if (!date) return res.status(400).json({ error: 'Data obrigatoria' });

  resetStatus();
  robotStatus.running = true;
  robotStatus.log.push({ type: 'info', msg: '🤖 Iniciando robo para ' + date + '...' });

  res.json({ ok: true, message: 'Robo iniciado!' });

  // Rodar em background
  runRobot(date, parseInt(distMin)||400, parseInt(distMax)||575, gradeFilter||'A').catch(err => {
    robotStatus.running = false;
    robotStatus.error = err.message;
    robotStatus.log.push({ type: 'err', msg: '❌ Erro fatal: ' + err.message });
  });
});

// ─── FUNÇÃO PRINCIPAL DO ROBÔ ───
async function runRobot(date, distMin, distMax, gradeFilter) {
  let browser = null;
  try {
    const { chromium } = require('playwright');

    robotStatus.log.push({ type: 'info', msg: '🌐 Abrindo navegador...' });

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    // ─── 1. Acessar lista de corridas ───
    const listUrl = `https://greyhoundbet.racingpost.com/#meeting-list/r_date=${date}`;
    robotStatus.log.push({ type: 'info', msg: '📋 Acessando lista de corridas...' });
    robotStatus.current = 'Carregando lista de corridas...';

    await page.goto('https://greyhoundbet.racingpost.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Navegar para a data correta
    await page.goto(listUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // ─── 2. Pegar lista de corridas ───
    robotStatus.log.push({ type: 'info', msg: '🔍 Buscando corridas...' });

    const races = await page.evaluate((distMin, distMax, gradeFilter) => {
      const items = document.querySelectorAll('.RC-meetingItem, .meeting-item, [class*="meeting"], [class*="race-item"], a[href*="card/race_id"]');
      const results = [];
      items.forEach(item => {
        const text = item.textContent || '';
        const href = item.getAttribute('href') || (item.querySelector('a') ? item.querySelector('a').getAttribute('href') : '');

        // Extrair distância
        const distMatch = text.match(/Dis:?(\d+)m/) || text.match(/(\d{3,4})m/);
        const dist = distMatch ? parseInt(distMatch[1]) : 0;

        // Extrair grade/classe
        const gradeMatch = text.match(/Grade:\s*\(?([A-Z]\d+|[A-Z]\d*)\)?/) || text.match(/\(([A-Z]\d+)\)/);
        const grade = gradeMatch ? gradeMatch[1] : '';

        // Extrair pista e horário
        const timeMatch = text.match(/(\d{1,2}:\d{2})/);
        const time = timeMatch ? timeMatch[1] : '';

        if (dist >= distMin && dist <= distMax) {
          if (gradeFilter === 'all' || (grade && grade.startsWith('A') && /A\d+/.test(grade))) {
            results.push({ text: text.trim().slice(0, 100), href, dist, grade, time });
          }
        }
      });
      return results;
    }, distMin, distMax, gradeFilter);

    // Se não achou via evaluate, tentar pegar os links diretamente
    let raceLinks = [];

    if (races.length === 0) {
      // Tentar pegar todos os links de corridas
      raceLinks = await page.evaluate((distMin, distMax) => {
        const links = Array.from(document.querySelectorAll('a[href*="race_id"]'));
        return links.map(a => ({
          href: a.getAttribute('href'),
          text: a.closest('[class]') ? a.closest('[class]').textContent.trim().slice(0, 150) : a.textContent.trim()
        })).filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i); // deduplicar
      }, distMin, distMax);
    }

    robotStatus.log.push({ type: 'info', msg: `📊 Encontradas ${races.length + raceLinks.length} corridas potenciais` });

    // Combinar resultados
    const allRaces = races.length > 0 ? races : raceLinks.map(r => ({
      href: r.href,
      text: r.text,
      dist: 0,
      grade: '',
      time: ''
    }));

    if (allRaces.length === 0) {
      robotStatus.log.push({ type: 'err', msg: '❌ Nenhuma corrida encontrada. Tente outra data.' });
      robotStatus.running = false;
      return;
    }

    robotStatus.total = allRaces.length;

    // ─── 3. Processar cada corrida ───
    for (let i = 0; i < allRaces.length; i++) {
      if (!robotStatus.running) {
        robotStatus.log.push({ type: 'info', msg: '⏹ Robô parado pelo usuário' });
        break;
      }

      const race = allRaces[i];
      robotStatus.progress = i + 1;
      const label = (race.time || '') + ' ' + (race.grade || '') + ' ' + (race.dist ? race.dist + 'm' : '');
      robotStatus.current = `Processando ${label} (${i+1}/${allRaces.length})`;

      try {
        // Navegar para a corrida
        let raceUrl = race.href || '';
        if (!raceUrl.startsWith('http')) {
          raceUrl = 'https://greyhoundbet.racingpost.com/' + raceUrl.replace(/^#/, '#');
          if (!raceUrl.includes('racingpost')) {
            raceUrl = 'https://greyhoundbet.racingpost.com/#' + race.href.replace(/^#/, '');
          }
        }

        await page.goto(raceUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Verificar distância e grade na página
        const pageInfo = await page.evaluate(() => {
          const text = document.body.textContent;
          const distM = text.match(/(\d{3,4})m\s*(Flat|Hurdles|Chase)?/);
          const gradeM = text.match(/Grade:\s*\(?([A-Z]\d+)\)?/) || text.match(/\(([A-Z]\d+)\)/);
          const timeM = text.match(/(\d{1,2}:\d{2})/);
          const trackM = document.querySelector('.RC-header__track, h2, .track-name');
          return {
            dist: distM ? parseInt(distM[1]) : 0,
            grade: gradeM ? gradeM[1] : '',
            time: timeM ? timeM[1] : '',
            track: trackM ? trackM.textContent.trim() : ''
          };
        });

        // Filtrar por distância e classe
        const finalDist = race.dist || pageInfo.dist;
        const finalGrade = race.grade || pageInfo.grade;

        if (finalDist > 0 && (finalDist < distMin || finalDist > distMax)) {
          robotStatus.log.push({ type: 'skip', msg: `⏭ ${label} — distância ${finalDist}m fora do filtro` });
          continue;
        }

        if (gradeFilter === 'A' && finalGrade && !(/^A\d+$/.test(finalGrade))) {
          robotStatus.log.push({ type: 'skip', msg: `⏭ ${label} — classe ${finalGrade} fora do filtro` });
          continue;
        }

        // Gerar nome do arquivo
        const track = pageInfo.track.split(' ')[0] || 'Race';
        const time = (race.time || pageInfo.time || '').replace(':', 'h') || `race${i+1}`;
        const grade = finalGrade || 'XX';
        const filename = `${track}_${grade}_${time}_${date}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const filepath = path.join(PDF_DIR, filename);

        // Salvar como PDF
        await page.pdf({
          path: filepath,
          format: 'A4',
          printBackground: true,
          margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
        });

        const pdfSize = fs.statSync(filepath).size;
        if (pdfSize < 5000) {
          // PDF muito pequeno, provavelmente vazio
          fs.unlinkSync(filepath);
          robotStatus.log.push({ type: 'skip', msg: `⚠ ${label} — PDF vazio, pulando` });
          continue;
        }

        robotStatus.pdfs.push({
          filename,
          name: `${track} ${grade} ${time.replace('h',':')}`,
          track,
          grade,
          dist: finalDist,
          time: time.replace('h',':'),
          path: filepath
        });

        robotStatus.log.push({ type: 'ok', msg: `✅ ${track} ${grade} ${time.replace('h',':')} — salvo!` });

      } catch (raceErr) {
        robotStatus.log.push({ type: 'err', msg: `❌ Erro em corrida ${i+1}: ${raceErr.message.slice(0,60)}` });
      }

      // Pausa entre corridas
      await new Promise(r => setTimeout(r, 1500));
    }

    robotStatus.log.push({ type: 'ok', msg: `🏁 Coleta finalizada! ${robotStatus.pdfs.length} PDFs salvos.` });

  } catch (err) {
    robotStatus.error = err.message;
    robotStatus.log.push({ type: 'err', msg: '❌ Erro: ' + err.message });
  } finally {
    if (browser) await browser.close();
    robotStatus.running = false;
    robotStatus.current = 'Concluido';
  }
}

module.exports = router;
