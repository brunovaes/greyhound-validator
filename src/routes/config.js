const express = require('express');
const router = express.Router();
const db = require('../db/database');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_PATH || '/greyhound';

router.get('/', (req, res) => {
  const config = db.prepare('SELECT * FROM analysis_config WHERE id = 1').get();
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  let logoB64 = '';
  if (fs.existsSync(logoPath)) logoB64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Configuracoes - Greyhound Validator</title>
<style>
:root{--bg:#0a0a0a;--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--border2:#333;--green:#22c55e;--green2:#16a34a;--orange:#f97316;--text:#f0f0f0;--muted:#666;--muted2:#888;--red:#ef4444;--radius:6px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid var(--green);overflow:hidden}
.hero img{width:100%;height:130px;object-fit:cover;object-position:center 30%;display:block}
nav{background:var(--surface);border-bottom:1px solid var(--border2);padding:0 20px;display:flex;gap:0}
.nav-link{padding:12px 18px;color:var(--muted2);text-decoration:none;font-size:13px;font-weight:500;border-bottom:2px solid transparent}
.nav-link:hover,.nav-link.active{color:var(--green);border-bottom-color:var(--green)}
.content{padding:24px;max-width:800px;margin:0 auto}
h1{font-size:20px;font-weight:700;color:var(--text);margin-bottom:4px}
.subtitle{font-size:13px;color:var(--muted2);margin-bottom:24px}
.section{background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:20px;margin-bottom:16px}
.section-title{font-size:13px;font-weight:700;color:var(--green);margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:11px;color:var(--muted2);font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.field input,.field textarea{padding:8px 10px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);color:var(--text);font-size:13px;width:100%}
.field input[type=range]{padding:4px 0;cursor:pointer}
.field input:focus,.field textarea:focus{outline:none;border-color:var(--green)}
.field textarea{min-height:70px;resize:vertical;font-family:monospace;font-size:11px}
.range-val{font-size:11px;color:var(--orange);font-weight:700;margin-top:2px}
.field-hint{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.4}
.btn-save{padding:12px 28px;background:var(--green);color:#000;font-weight:700;font-size:14px;border:none;border-radius:var(--radius);cursor:pointer;margin-top:20px}
.btn-save:hover{background:var(--green2)}
.btn-reset{padding:12px 20px;background:transparent;color:var(--muted2);font-size:13px;border:1px solid var(--border2);border-radius:var(--radius);cursor:pointer;margin-top:20px;margin-left:10px}
.btn-reset:hover{color:var(--text)}
.alert{padding:12px 16px;border-radius:var(--radius);font-size:13px;margin-bottom:16px;display:none}
.alert.ok{background:rgba(34,197,94,.1);color:var(--green);border:1px solid rgba(34,197,94,.2)}
.alert.er{background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.2)}
.peso-display{display:flex;align-items:center;gap:10px}
.peso-bar{flex:1;height:6px;background:var(--border2);border-radius:3px;overflow:hidden}
.peso-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s}
</style>
</head>
<body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="Greyhound Validator">`:'<div style="height:130px;background:#000;display:flex;align-items:center;justify-content:center;color:#22c55e;font-size:24px;font-weight:900">GREYHOUND VALIDATOR</div>'}</div>
<nav>
  <a href="${BASE}" class="nav-link">Analisar</a>
  <a href="${BASE}/historico" class="nav-link">Historico</a>
  <a href="${BASE}/config" class="nav-link active">Configuracoes</a>
</nav>
<div class="content">
  <h1>Configuracoes de Analise</h1>
  <p class="subtitle">Ajuste os parametros que o Claude usa para analisar as corridas.</p>
  <div class="alert" id="alert"></div>
  <form id="config-form">

    <div class="section">
      <div class="section-title">&#9878; Pesos dos Criterios</div>
      <p style="font-size:11px;color:var(--muted2);margin-bottom:14px">Quanto cada criterio vale na analise. Valores maiores = mais importante.</p>
      <div class="grid">
        <div class="field">
          <label>Categoria</label>
          <div class="peso-display">
            <input type="range" name="peso_categoria" min="1" max="10" value="${config.peso_categoria}" oninput="updRange(this)">
            <span class="range-val" id="val_peso_categoria">${config.peso_categoria}</span>
          </div>
          <div class="peso-bar"><div class="peso-fill" id="bar_peso_categoria" style="width:${config.peso_categoria*10}%"></div></div>
          <span class="field-hint">Galgo validado na categoria atual</span>
        </div>
        <div class="field">
          <label>Tempo Final (CalTm)</label>
          <div class="peso-display">
            <input type="range" name="peso_caltm" min="1" max="10" value="${config.peso_caltm}" oninput="updRange(this)">
            <span class="range-val" id="val_peso_caltm">${config.peso_caltm}</span>
          </div>
          <div class="peso-bar"><div class="peso-fill" id="bar_peso_caltm" style="width:${config.peso_caltm*10}%"></div></div>
          <span class="field-hint">Media dos tempos calibrados</span>
        </div>
        <div class="field">
          <label>Bends / Arranque</label>
          <div class="peso-display">
            <input type="range" name="peso_bends" min="1" max="10" value="${config.peso_bends}" oninput="updRange(this)">
            <span class="range-val" id="val_peso_bends">${config.peso_bends}</span>
          </div>
          <div class="peso-bar"><div class="peso-fill" id="bar_peso_bends" style="width:${config.peso_bends*10}%"></div></div>
          <span class="field-hint">Perfil e evolucao nas marcacoes</span>
        </div>
        <div class="field">
          <label>Remarks</label>
          <div class="peso-display">
            <input type="range" name="peso_remarks" min="1" max="10" value="${config.peso_remarks}" oninput="updRange(this)">
            <span class="range-val" id="val_peso_remarks">${config.peso_remarks}</span>
          </div>
          <div class="peso-bar"><div class="peso-fill" id="bar_peso_remarks" style="width:${config.peso_remarks*10}%"></div></div>
          <span class="field-hint">Combinacoes positivas e negativas</span>
        </div>
        <div class="field">
          <label>Melhor Tempo (BRT)</label>
          <div class="peso-display">
            <input type="range" name="peso_brt" min="1" max="10" value="${config.peso_brt}" oninput="updRange(this)">
            <span class="range-val" id="val_peso_brt">${config.peso_brt}</span>
          </div>
          <div class="peso-bar"><div class="peso-fill" id="bar_peso_brt" style="width:${config.peso_brt*10}%"></div></div>
          <span class="field-hint">Desempate final</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">&#127968; Filtros de Corrida</div>
      <div class="grid">
        <div class="field">
          <label>Distancia minima (m)</label>
          <input type="number" name="dist_min" value="${config.dist_min}" min="200" max="600">
          <span class="field-hint">Corridas abaixo sao descartadas</span>
        </div>
        <div class="field">
          <label>Distancia maxima (m)</label>
          <input type="number" name="dist_max" value="${config.dist_max}" min="400" max="1000">
          <span class="field-hint">Corridas acima sao descartadas</span>
        </div>
        <div class="field">
          <label>Min. corridas uteis por galgo</label>
          <input type="number" name="min_corridas_uteis" value="${config.min_corridas_uteis}" min="1" max="10">
          <span class="field-hint">Abaixo disso solicita capivara</span>
        </div>
        <div class="field">
          <label>Classes aceitas</label>
          <input type="text" name="classes_aceitas" value="${config.classes_aceitas}">
          <span class="field-hint">Separadas por virgula</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">&#127919; Thresholds de Confianca</div>
      <div class="grid">
        <div class="field">
          <label>Alta confianca (% minimo)</label>
          <div class="peso-display">
            <input type="range" name="pct_alta" min="50" max="90" value="${config.pct_alta}" oninput="updRange(this)">
            <span class="range-val" id="val_pct_alta">${config.pct_alta}%</span>
          </div>
        </div>
        <div class="field">
          <label>Media confianca (% minimo)</label>
          <div class="peso-display">
            <input type="range" name="pct_media" min="30" max="70" value="${config.pct_media}" oninput="updRange(this)">
            <span class="range-val" id="val_pct_media">${config.pct_media}%</span>
          </div>
        </div>
        <div class="field">
          <label>Diferenca CalTm significativa (s)</label>
          <input type="number" name="diff_caltm_significativa" value="${config.diff_caltm_significativa}" step="0.05" min="0.1" max="1">
          <span class="field-hint">Acima disso = vantagem clara</span>
        </div>
        <div class="field">
          <label>Diferenca CalTm empate (s)</label>
          <input type="number" name="diff_caltm_empate" value="${config.diff_caltm_empate}" step="0.02" min="0.02" max="0.3">
          <span class="field-hint">Abaixo disso = empate tecnico</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">&#128196; Remarks</div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div class="field">
          <label>Combinacoes muito positivas</label>
          <textarea name="remarks_muito_positivos">${config.remarks_muito_positivos}</textarea>
          <span class="field-hint">Separadas por virgula. Ex: SAw+RnOn,Bmp+RnOn</span>
        </div>
        <div class="field">
          <label>Remarks positivos</label>
          <textarea name="remarks_positivos">${config.remarks_positivos}</textarea>
          <span class="field-hint">Cada um separado por virgula</span>
        </div>
        <div class="field">
          <label>Remarks atenuantes (nao penalizar)</label>
          <textarea name="remarks_atenuantes">${config.remarks_atenuantes}</textarea>
          <span class="field-hint">Acidentes externos, nao penalizar derrota</span>
        </div>
        <div class="field">
          <label>Remarks negativos</label>
          <textarea name="remarks_negativos">${config.remarks_negativos}</textarea>
          <span class="field-hint">Penalizar galgo com esses remarks</span>
        </div>
      </div>
    </div>

    <div>
      <button type="submit" class="btn-save">Salvar Configuracoes</button>
      <button type="button" class="btn-reset" onclick="resetConfig()">Restaurar Padrao</button>
    </div>
  </form>
</div>

<script>
function updRange(input) {
  var name = input.name;
  var val = document.getElementById('val_' + name);
  var bar = document.getElementById('bar_' + name);
  if (val) val.textContent = input.value + (name.startsWith('pct') ? '%' : '');
  if (bar) bar.style.width = (input.value * 10) + '%';
}

document.getElementById('config-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  var data = Object.fromEntries(new FormData(this));
  var alert = document.getElementById('alert');
  try {
    var res = await fetch('${BASE}/config/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    if (res.ok) {
      alert.className = 'alert ok';
      alert.textContent = 'Configuracoes salvas com sucesso!';
      alert.style.display = 'block';
      setTimeout(function(){ alert.style.display='none'; }, 3000);
    } else throw new Error('Erro ao salvar');
  } catch(err) {
    alert.className = 'alert er';
    alert.textContent = 'Erro: ' + err.message;
    alert.style.display = 'block';
  }
});

function resetConfig() {
  if (!confirm('Restaurar todas as configuracoes para o padrao?')) return;
  window.location.href = '${BASE}/config/reset';
}
</script>
</body>
</html>`);
});

// POST /config/save
router.post('/save', express.json(), (req, res) => {
  try {
    const d = req.body;
    db.prepare(`UPDATE analysis_config SET
      peso_categoria=?, peso_caltm=?, peso_bends=?, peso_remarks=?, peso_brt=?,
      dist_min=?, dist_max=?, classes_aceitas=?, min_corridas_uteis=?,
      pct_alta=?, pct_media=?, diff_caltm_significativa=?, diff_caltm_empate=?,
      remarks_muito_positivos=?, remarks_positivos=?, remarks_atenuantes=?, remarks_negativos=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(
      d.peso_categoria, d.peso_caltm, d.peso_bends, d.peso_remarks, d.peso_brt,
      d.dist_min, d.dist_max, d.classes_aceitas, d.min_corridas_uteis,
      d.pct_alta, d.pct_media, d.diff_caltm_significativa, d.diff_caltm_empate,
      d.remarks_muito_positivos, d.remarks_positivos, d.remarks_atenuantes, d.remarks_negativos
    );
    res.json({ ok: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /config/reset
router.get('/reset', (req, res) => {
  db.prepare('DELETE FROM analysis_config WHERE id=1').run();
  db.prepare('INSERT INTO analysis_config (id) VALUES (1)').run();
  res.redirect(BASE + '/config');
});

module.exports = router;
