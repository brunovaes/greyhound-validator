const express = require('express');
const router = express.Router();
const db = require('../db/database');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_PATH || '/greyhound';

// Página principal
router.get('/', (req, res) => {
  const config = db.prepare('SELECT * FROM analysis_config WHERE id = 1').get();
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 10').all();
  res.send(renderPage('main', { config, sessions, base: BASE }));
});

// Página de histórico
router.get('/historico', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
  res.send(renderPage('historico', { sessions, base: BASE }));
});

// Detalhes de uma sessão
router.get('/sessao/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  const races = db.prepare('SELECT * FROM races WHERE session_id = ? ORDER BY hora').all(req.params.id);
  if (!session) return res.redirect(BASE);
  res.send(renderPage('sessao', { session, races, base: BASE }));
});

function renderPage(page, data) {
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  let logoB64 = '';
  if (fs.existsSync(logoPath)) {
    logoB64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  }
  data.logoB64 = logoB64;

  if (page === 'main') return renderMain(data);
  if (page === 'historico') return renderHistorico(data);
  if (page === 'sessao') return renderSessao(data);
  return '<h1>Página não encontrada</h1>';
}

function renderMain(data) {
  const { config, sessions, base, logoB64 } = data;
  const totalAcertos = db.prepare("SELECT COUNT(*) as c FROM races WHERE bateu = 'sim'").get().c;
  const totalApostas = db.prepare("SELECT COUNT(*) as c FROM races WHERE bateu IS NOT NULL AND bateu != ''").get().c;
  const taxaAcerto = totalApostas > 0 ? Math.round(totalAcertos / totalApostas * 100) : 0;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Greyhound Validator</title>
<style>
:root{--bg:#0a0a0a;--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--border2:#333;--green:#22c55e;--green2:#16a34a;--green-glow:rgba(34,197,94,.15);--orange:#f97316;--orange2:#ea580c;--orange-glow:rgba(249,115,22,.15);--text:#f0f0f0;--muted:#666;--muted2:#888;--red:#ef4444;--radius:6px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;min-height:100vh}
.hero{width:100%;background:#000;border-bottom:2px solid var(--green);overflow:hidden}
.hero img{width:100%;height:130px;object-fit:cover;object-position:center 30%;display:block}
nav{background:var(--surface);border-bottom:1px solid var(--border2);padding:0 20px;display:flex;gap:0}
.nav-link{padding:12px 18px;color:var(--muted2);text-decoration:none;font-size:13px;font-weight:500;border-bottom:2px solid transparent;transition:all .2s}
.nav-link:hover,.nav-link.active{color:var(--green);border-bottom-color:var(--green)}
.main{display:grid;grid-template-columns:260px 1fr;min-height:calc(100vh - 175px)}
.sidebar{background:var(--surface);border-right:1px solid var(--border2);padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.sidebar h2{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.uz{border:2px dashed var(--border2);border-radius:8px;padding:18px 12px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.uz:hover,.uz.drag{border-color:var(--green);background:var(--green-glow)}
.uz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.uz-icon{font-size:24px;margin-bottom:5px}
.uz strong{color:var(--green);display:block;font-size:12px;margin-bottom:2px}
.uz p{font-size:10px;color:var(--muted2);line-height:1.4}
.flist{display:flex;flex-direction:column;gap:4px;max-height:150px;overflow-y:auto;margin-top:5px}
.fi{display:flex;align-items:center;gap:5px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:4px 8px;font-size:10px}
.fi-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fi-st{font-size:9px;padding:1px 6px;border-radius:8px;flex-shrink:0}
.fi-ok{background:rgba(34,197,94,.15);color:var(--green)}
.fi-load{background:rgba(249,115,22,.15);color:var(--orange)}
.fi-err{background:rgba(239,68,68,.12);color:var(--red)}
.fi-rm{background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:0}
.fi-rm:hover{color:var(--red)}
.btn-go{width:100%;padding:11px;background:var(--green);color:#000;font-weight:700;font-size:13px;border:none;border-radius:var(--radius);cursor:pointer}
.btn-go:hover{background:var(--green2)}
.btn-go:disabled{opacity:.35;cursor:not-allowed}
.btn-sm{width:100%;padding:6px;background:transparent;color:var(--muted2);font-size:11px;border:1px solid var(--border2);border-radius:var(--radius);cursor:pointer}
.btn-sm:hover{color:var(--text)}
.dv{height:1px;background:var(--border2)}
.content{padding:18px;overflow-y:auto}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.kpi{background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:10px 14px;position:relative;overflow:hidden}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.kpi.g::before{background:var(--green)}.kpi.o::before{background:var(--orange)}.kpi.b::before{background:#3b82f6}.kpi.w::before{background:#8b5cf6}
.kpi-label{font-size:10px;color:var(--muted2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.kpi-val{font-size:22px;font-weight:700}
.kpi.g .kpi-val{color:var(--green)}.kpi.o .kpi-val{color:var(--orange)}.kpi.b .kpi-val{color:#60a5fa}.kpi.w .kpi-val{color:#a78bfa}
.pw{margin-bottom:10px;display:none}
.pb{height:3px;background:var(--border2);border-radius:2px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,var(--green),var(--orange));transition:width .4s}
.pt{font-size:11px;color:var(--muted2);margin-top:3px}
.st{font-size:12px;color:var(--muted2);margin-bottom:8px;min-height:16px}
.tw{overflow-x:auto;border:1px solid var(--border2);border-radius:8px}
table{width:100%;border-collapse:collapse;min-width:900px}
thead{background:var(--surface2)}
th{padding:9px 10px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border2);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.row-avb td{background:rgba(34,197,94,.03)}
tr.row-avb td:first-child{border-left:3px solid var(--green)}
tr.row-avb:hover td{background:rgba(34,197,94,.08)}
tr.sk td{opacity:.35}
tr.sk td:first-child{border-left:3px solid var(--border2)}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
.ba{background:rgba(34,197,94,.15);color:var(--green);border:1px solid rgba(34,197,94,.3)}
.bm{background:rgba(249,115,22,.12);color:var(--orange);border:1px solid rgba(249,115,22,.25)}
.bb{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.25)}
.bs{background:rgba(100,100,100,.1);color:var(--muted2);border:1px solid var(--border2)}
.cbar{width:48px;height:3px;background:var(--border2);border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px}
.cfill{height:100%;border-radius:2px}
.cfg{background:var(--green)}.cfa{background:var(--orange)}.cfr{background:var(--red)}
.trap-badge{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-weight:700;font-size:12px;border:2px solid transparent}
.t1{background:#dc2626;color:#fff;border-color:#ef4444}.t2{background:#2563eb;color:#fff;border-color:#3b82f6}
.t3{background:#e5e7eb;color:#111;border-color:#d1d5db}.t4{background:#111;color:#fff;border-color:#444}
.t5{background:#d97706;color:#000;border-color:#f59e0b}.t6{background:#111;color:#f59e0b;border-color:#f59e0b}
.trap-row{display:flex;align-items:center;gap:6px}
.trap-item{display:flex;flex-direction:column;align-items:center;gap:2px}
.trap-name{font-size:9px;color:var(--muted);text-align:center;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trap-vs{color:var(--muted);font-size:12px;font-weight:600}
.perfil-badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600}
.p-rec{background:rgba(34,197,94,.15);color:var(--green)}
.p-fum{background:rgba(239,68,68,.12);color:var(--red)}
.p-est{background:rgba(100,100,100,.15);color:var(--muted2)}
.p-fro{background:rgba(249,115,22,.12);color:var(--orange)}
.win-tag{display:inline-flex;align-items:center;font-size:9px;color:rgba(249,115,22,.6);border:1px solid rgba(249,115,22,.2);border-radius:3px;padding:1px 5px;margin-top:3px;background:rgba(249,115,22,.04)}
.hora-br{font-size:10px;color:rgba(34,197,94,.5);margin-top:2px}
.obs-c{font-size:11px;color:var(--muted2);line-height:1.5;max-width:175px}
.obs-cap{font-size:11px;color:var(--orange);line-height:1.5;max-width:175px}
td input[type=text]{width:50px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-size:11px}
td input:focus{outline:none;border-color:var(--green)}
td select{padding:3px 6px;background:var(--surface2);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-size:11px;cursor:pointer}
.cap-btn{font-size:10px;padding:3px 9px;border:1px solid var(--orange);border-radius:4px;background:var(--orange-glow);color:var(--orange);cursor:pointer;font-weight:600}
.cap-ok{font-size:11px;color:var(--green)}
.empty{text-align:center;padding:50px 20px;color:var(--muted)}
.empty h3{font-size:15px;color:var(--muted2);margin-bottom:6px}
.empty p{font-size:12px;line-height:1.6;max-width:380px;margin:0 auto}
.ab{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
.bexp{padding:7px 14px;background:var(--surface2);border:1px solid var(--border2);color:var(--muted2);border-radius:var(--radius);cursor:pointer;font-size:12px}
.bexp:hover{border-color:var(--green);color:var(--green)}
.bsave{padding:7px 14px;background:var(--green-glow);border:1px solid rgba(34,197,94,.3);color:var(--green);border-radius:var(--radius);cursor:pointer;font-size:12px;font-weight:600}
.bsave:hover{background:rgba(34,197,94,.25)}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--surface)}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
.modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;align-items:flex-start;justify-content:center;padding-top:60px;overflow-y:auto}
.modal-bg.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:22px;width:500px;max-width:95vw;border-top:3px solid var(--orange)}
.modal h3{font-size:15px;font-weight:700;color:var(--orange);margin-bottom:6px}
.modal p{font-size:12px;color:var(--muted2);margin-bottom:14px;line-height:1.6}
.modal-upload{border:2px dashed var(--border2);border-radius:8px;padding:16px;text-align:center;cursor:pointer;position:relative;margin-bottom:10px;transition:all .2s}
.modal-upload:hover{border-color:var(--orange);background:var(--orange-glow)}
.modal-upload input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.modal-upload strong{color:var(--orange);display:block;font-size:12px;margin-bottom:3px}
.cap-st{font-size:12px;padding:6px 10px;border-radius:5px;margin-bottom:8px;display:none}
.cap-st.ok{background:rgba(34,197,94,.1);color:var(--green)}
.cap-st.er{background:rgba(239,68,68,.1);color:var(--red)}
.flist-modal{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;max-height:120px;overflow-y:auto}
.modal-acts{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}
.bok{padding:9px 20px;background:var(--green);color:#000;font-weight:700;border:none;border-radius:var(--radius);cursor:pointer}
.bok:hover{background:var(--green2)}
.bca{padding:9px 14px;background:transparent;color:var(--muted2);border:1px solid var(--border2);border-radius:var(--radius);cursor:pointer}
.spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(0,0,0,.2);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="hero">
  ${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : '<div style="height:130px;background:linear-gradient(135deg,#071a0e,#000);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#22c55e;letter-spacing:4px">GREYHOUND VALIDATOR</div>'}
</div>
<nav>
  <a href="${base}" class="nav-link active">Analisar</a>
  <a href="${base}/historico" class="nav-link">Historico</a>
  <a href="${base}/config" class="nav-link">Configuracoes</a>
</nav>
<div class="main">
  <div class="sidebar">
    <div>
      <h2>PDFs de corridas</h2>
      <div class="uz" id="rz">
        <input type="file" accept=".pdf" multiple id="race-input">
        <div class="uz-icon">&#128196;</div>
        <strong>Clique ou arraste os PDFs</strong>
        <p>Multiplos PDFs aceitos</p>
      </div>
      <div class="flist" id="rlist"></div>
    </div>
    <div class="dv"></div>
    <button class="btn-go" id="btngo">Analisar Corridas</button>
    <button class="btn-sm" id="btn-clear">Limpar tudo</button>
    <div class="dv"></div>
    <div style="font-size:10px;color:var(--muted2);line-height:1.7">
      <strong style="color:var(--green)">Sessoes recentes:</strong><br>
      ${sessions.slice(0,5).map(s => `<a href="${base}/sessao/${s.id}" style="color:var(--muted2);text-decoration:none;display:block;padding:2px 0;border-bottom:1px solid var(--border)">${s.name || 'Sessao ' + s.id} <span style="color:var(--muted);float:right">${s.total_avbs} AvBs</span></a>`).join('')}
    </div>
  </div>
  <div class="content">
    <div class="pw" id="pw"><div class="pb"><div class="pf" id="pf" style="width:0%"></div></div><div class="pt" id="pt"></div></div>
    <div class="st" id="st"></div>
    <div class="kpis">
      <div class="kpi b"><div class="kpi-label">PDFs carregados</div><div class="kpi-val" id="sp">-</div></div>
      <div class="kpi g"><div class="kpi-label">Corridas AvB</div><div class="kpi-val" id="sa">-</div></div>
      <div class="kpi o"><div class="kpi-label">Alta confianca</div><div class="kpi-val" id="sal">-</div></div>
      <div class="kpi w"><div class="kpi-label">Taxa acerto geral</div><div class="kpi-val">${taxaAcerto}%</div></div>
    </div>
    <div class="tw">
      <table>
        <thead><tr>
          <th>Hora</th><th>Corrida</th><th>Selecao</th><th>Confianca</th>
          <th>Perfil</th><th>Observacao</th><th>Odd</th><th>Valor R$</th><th>Resultado</th><th>Bateu</th><th>Cap</th>
        </tr></thead>
        <tbody id="tb">
          <tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida analisada</h3><p>Carregue PDFs e clique em Analisar.</p></div></td></tr>
        </tbody>
      </table>
    </div>
    <div class="ab" id="ab" style="display:none">
      <button class="bexp" id="btn-exp">Exportar CSV</button>
      <button class="bsave" id="btn-save">Salvar Sessao</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="cap-modal">
  <div class="modal">
    <h3 id="cm-title">Capivara necessaria</h3>
    <p id="cm-body">Carregue o print ou PDF da capivara.</p>
    <div class="modal-upload">
      <input type="file" id="cap-modal-inp" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple>
      <strong>Clique ou arraste o print ou PDF</strong>
      <p>JPG PNG PDF aceitos</p>
    </div>
    <div class="cap-st" id="cap-st"></div>
    <div class="flist-modal" id="cap-modal-list"></div>
    <div class="modal-acts">
      <button class="bca" id="btn-cap-cancel">Cancelar</button>
      <button class="bok" id="btn-cap-ok" disabled>Validar e Reanalisar</button>
    </div>
  </div>
</div>

<script>
var raceFiles = [], capFiles = [], results = [], capModalFilesList = [];
var BASE = '${base}';

function readB64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) { resolve(e.target.result.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function trapClass(n) { return ['','t1','t2','t3','t4','t5','t6'][n]||'t1'; }

function perfilBadge(p) {
  if (!p) return '';
  var cls = p==='Recuperador'?'p-rec':p==='Fumador'?'p-fum':p==='Frontrunner'?'p-fro':'p-est';
  var ic = p==='Recuperador'?'&#128170;':p==='Fumador'?'&#128684;':p==='Frontrunner'?'&#9889;':'&#10145;';
  return '<span class="perfil-badge '+cls+'">'+ic+' '+p+'</span>';
}

function convertHora(h) {
  if (!h) return '';
  var p = h.split(':');
  var hr = parseInt(p[0]) - 4;
  if (hr < 0) hr += 24;
  return hr + ':' + p[1];
}

function setSt(m) { document.getElementById('st').textContent = m; }
function prog(p, t) {
  document.getElementById('pw').style.display = 'block';
  document.getElementById('pf').style.width = p + '%';
  document.getElementById('pt').textContent = t;
}

function addFileItem(name, id) {
  var list = document.getElementById('rlist');
  var d = document.createElement('div'); d.className = 'fi'; d.id = 'fi-'+id;
  var sn = name.length > 22 ? name.slice(0,20)+'...' : name;
  d.innerHTML = '<span class="fi-name">'+sn+'</span><span class="fi-st fi-load" id="fis-'+id+'">...</span><button class="fi-rm" data-id="'+id+'">x</button>';
  list.appendChild(d);
}

function updFileItem(id, ok) {
  var el = document.getElementById('fis-'+id);
  if (!el) return;
  el.className = 'fi-st '+(ok?'fi-ok':'fi-err');
  el.textContent = ok?'OK':'erro';
}

function updCards() {
  var avbs = results.filter(function(r){return r.nivel!=='skip';});
  var alta = results.filter(function(r){return r.nivel==='alta';}).length;
  document.getElementById('sp').textContent = raceFiles.length||'-';
  document.getElementById('sa').textContent = avbs.length||'-';
  document.getElementById('sal').textContent = alta||'-';
}

function renderTable() {
  var tb = document.getElementById('tb');
  if (!results.length) {
    tb.innerHTML = '<tr><td colspan="11"><div class="empty"><h3>Sem resultados</h3><p>Nenhuma corrida identificada.</p></div></td></tr>';
    document.getElementById('ab').style.display = 'none'; return;
  }
  var winMap = {};
  results.forEach(function(r) {
    if (r.tipo==='vencedor' && r.nivel!=='skip' && r.trapFav) winMap[(r.hora||'')+'_'+(r.corrida||'')] = r;
  });
  var avbs = results.filter(function(r){ return r.tipo==='avb'; });
  var rows = '';
  avbs.forEach(function(r, i) {
    var sk = r.nivel==='skip';
    var rowCls = sk?'sk':'row-avb';
    var bc = r.nivel==='alta'?'ba':r.nivel==='media'?'bm':r.nivel==='baixa'?'bb':'bs';
    var bt = r.nivel==='alta'?'Alta':r.nivel==='media'?'Media':r.nivel==='baixa'?'Baixa':'Skip';
    var fc = r.pct>=65?'cfg':r.pct>=50?'cfa':'cfr';
    var tf = r.trapFav||0, tu = r.trapUnd||0;
    var nf = r.nameFav||'', nu = r.nameUnd||'';
    var winData = winMap[(r.hora||'')+'_'+(r.corrida||'')];
    var winTag = winData ? '<div class="win-tag">&#127942; Back T'+winData.trapFav+' '+((winData.nameFav||'').split(' ')[0])+'</div>' : '';
    var horaHtml = '<strong style="color:var(--green)">'+(r.hora||'-')+'</strong><div class="hora-br">'+convertHora(r.hora)+'</div>'+winTag;
    var selHtml = sk ? '<span style="color:var(--muted)">Descartada</span>' :
      '<div class="trap-row"><div class="trap-item"><div class="trap-badge '+trapClass(tf)+'">'+tf+'</div><div class="trap-name">'+nf+'</div></div><span class="trap-vs">vs</span><div class="trap-item"><div class="trap-badge '+trapClass(tu)+'">'+tu+'</div><div class="trap-name">'+nu+'</div></div></div>';
    var perfilHtml = perfilBadge(r.perfilFav)+(r.perfilUnd?'<br>'+perfilBadge(r.perfilUnd):'');
    var confHtml = sk?'':'<span class="badge '+bc+'">'+bt+'</span><br><span style="font-size:10px;color:var(--muted)">'+r.pct+'%</span><span class="cbar"><span class="cfill '+fc+'" style="width:'+r.pct+'%"></span></span>';
    var obsClass = r.needsCap?'obs-cap':'obs-c';
    var capHtml = r.needsCap?'<button class="cap-btn" data-fav="'+nf+'" data-und="'+nu+'">Cap</button>':'<span class="cap-ok">OK</span>';
    var resHtml = sk?'-':'<input type="text" placeholder="1" data-i="'+i+'" data-f="r1" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="2" data-i="'+i+'" data-f="r2" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="3" data-i="'+i+'" data-f="r3" style="width:50px">';
    rows += '<tr class="'+rowCls+'">';
    rows += '<td>'+horaHtml+'</td>';
    rows += '<td><div style="font-weight:700;font-size:12px">'+(r.corrida||'-')+'</div><div style="font-size:10px;color:var(--muted)">'+(r.dist||'')+'</div></td>';
    rows += '<td>'+selHtml+'</td>';
    rows += '<td>'+confHtml+'</td>';
    rows += '<td>'+perfilHtml+'</td>';
    rows += '<td class="'+obsClass+'">'+(r.obs||'-')+'</td>';
    rows += '<td><input type="text" placeholder="-" data-i="'+i+'" data-f="odd" style="width:46px"></td>';
    rows += '<td><input type="text" placeholder="0" data-i="'+i+'" data-f="valor" style="width:52px"></td>';
    rows += '<td>'+resHtml+'</td>';
    rows += '<td><select data-i="'+i+'" data-f="hit"><option value="">-</option><option value="sim">Sim</option><option value="nao">Nao</option></select></td>';
    rows += '<td>'+capHtml+'</td>';
    rows += '</tr>';
  });
  tb.innerHTML = rows;
  document.getElementById('ab').style.display = 'flex';
  updCards();
}

async function runAnalysis() {
  if (!raceFiles.length) { alert('Carregue pelo menos um PDF.'); return; }
  document.getElementById('btngo').disabled = true;
  document.getElementById('btngo').innerHTML = '<span class="spinner"></span>Analisando...';
  prog(5, 'Preparando...');
  results = [];
  try {
    var formData = new FormData();
    raceFiles.forEach(function(f) { formData.append('pdfs', new Blob([Uint8Array.from(atob(f.b64), c=>c.charCodeAt(0))], {type:'application/pdf'}), f.name); });
    capFiles.forEach(function(f) { formData.append('caps', new Blob([Uint8Array.from(atob(f.b64), c=>c.charCodeAt(0))], {type:f.mime}), f.name); });
    prog(30, 'Enviando para o servidor...');
    var response = await fetch(BASE+'/api/analyze', { method: 'POST', body: formData });
    prog(80, 'Processando...');
    if (!response.ok) { var e = await response.json(); throw new Error(e.error||'Erro '+response.status); }
    var data = await response.json();
    results = data.races || [];
    prog(95, 'Montando tabela...');
    renderTable();
    setSt('Analise concluida: '+results.filter(function(r){return r.nivel!=='skip';}).length+' corridas com AvB');
    prog(100, 'Concluido!');
    setTimeout(function(){ document.getElementById('pw').style.display='none'; }, 1200);
  } catch(ex) {
    setSt('Erro: '+ex.message); alert('Erro: '+ex.message);
    document.getElementById('pw').style.display = 'none';
  }
  document.getElementById('btngo').disabled = false;
  document.getElementById('btngo').innerHTML = 'Analisar Corridas';
}

async function saveSession() {
  var name = prompt('Nome da sessao (ex: Clonmel 28/06):');
  if (!name) return;
  var avbs = results.filter(function(r){return r.tipo==='avb';});
  var response = await fetch(BASE+'/api/session', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name: name, races: avbs })
  });
  if (response.ok) { alert('Sessao salva!'); location.reload(); }
  else alert('Erro ao salvar sessao.');
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('race-input').addEventListener('change', async function() {
    for (var i = 0; i < this.files.length; i++) {
      var file = this.files[i], id = 'f'+Date.now()+i;
      addFileItem(file.name, id);
      try { var b64 = await readB64(file); raceFiles.push({name:file.name,b64:b64,id:id,mime:'application/pdf'}); updFileItem(id,true); }
      catch(e) { updFileItem(id,false); }
    }
    updCards();
  });

  document.getElementById('rz').addEventListener('dragover', function(e){e.preventDefault();this.classList.add('drag');});
  document.getElementById('rz').addEventListener('dragleave', function(){this.classList.remove('drag');});
  document.getElementById('rz').addEventListener('drop', function(e){
    e.preventDefault();this.classList.remove('drag');
    var inp = document.getElementById('race-input');
    inp.files = e.dataTransfer.files;
    inp.dispatchEvent(new Event('change'));
  });

  document.getElementById('rlist').addEventListener('click', function(e){
    if (e.target.classList.contains('fi-rm')) {
      var id = e.target.getAttribute('data-id');
      raceFiles = raceFiles.filter(function(f){return f.id!==id;});
      var el = document.getElementById('fi-'+id); if(el) el.remove();
      updCards();
    }
  });

  document.getElementById('btngo').addEventListener('click', runAnalysis);
  document.getElementById('btn-clear').addEventListener('click', function(){
    raceFiles=[];capFiles=[];results=[];
    document.getElementById('rlist').innerHTML='';
    document.getElementById('tb').innerHTML='<tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida analisada</h3><p>Carregue PDFs e clique em Analisar.</p></div></td></tr>';
    document.getElementById('ab').style.display='none';
    document.getElementById('pw').style.display='none';
    setSt(''); updCards();
  });

  document.getElementById('btn-save').addEventListener('click', saveSession);

  document.getElementById('tb').addEventListener('input', function(e){
    var el=e.target, i=parseInt(el.getAttribute('data-i')), f=el.getAttribute('data-f');
    if(!isNaN(i)&&f&&results[i]) results[i][f]=el.value;
  });

  document.getElementById('tb').addEventListener('change', function(e){
    var el=e.target, i=parseInt(el.getAttribute('data-i')), f=el.getAttribute('data-f');
    if(!isNaN(i)&&f&&results[i]){
      results[i][f]=el.value;
      if(f==='hit'){el.style.color=el.value==='sim'?'var(--green)':el.value==='nao'?'var(--red)':'var(--text)';}
    }
  });

  document.getElementById('tb').addEventListener('click', function(e){
    if(e.target.classList.contains('cap-btn')){
      document.getElementById('cm-body').textContent='Carregue capivara de '+e.target.getAttribute('data-fav');
      document.getElementById('cap-modal-list').innerHTML='';
      document.getElementById('cap-st').style.display='none';
      document.getElementById('btn-cap-ok').disabled=true;
      capModalFilesList=[];
      document.getElementById('cap-modal').classList.add('open');
    }
  });

  document.getElementById('cap-modal-inp').addEventListener('change', async function(){
    for(var i=0;i<this.files.length;i++){
      var file=this.files[i],id='cm'+Date.now()+i;
      try{
        var b64=await readB64(file);
        var isImg=/\.(jpg|jpeg|png|webp)$/i.test(file.name);
        capModalFilesList.push({name:file.name,b64:b64,id:id,mime:isImg?file.type:'application/pdf',isImg:isImg});
        var d=document.createElement('div');d.className='fi';
        d.innerHTML='<span class="fi-name">'+file.name+'</span><span class="fi-st fi-ok">OK</span>';
        document.getElementById('cap-modal-list').appendChild(d);
        document.getElementById('btn-cap-ok').disabled=false;
      }catch(e){alert('Erro ao ler arquivo.');}
    }
  });

  document.getElementById('btn-cap-cancel').addEventListener('click',function(){document.getElementById('cap-modal').classList.remove('open');});
  document.getElementById('btn-cap-ok').addEventListener('click',async function(){
    if(!capModalFilesList.length) return;
    capFiles=capModalFilesList.slice();
    document.getElementById('cap-modal').classList.remove('open');
    await runAnalysis();
  });

  document.getElementById('btn-exp').addEventListener('click', function(){
    var h='Hora,HoraBR,Corrida,Dist,TrapFav,Favorito,TrapUnd,Underdog,Conf,Nivel,PerfilFav,PerfilUnd,Obs,Odd,Valor,1o,2o,3o,Bateu';
    var avbs=results.filter(function(r){return r.tipo==='avb';});
    var rows=avbs.map(function(r){return[r.hora,convertHora(r.hora),r.corrida,r.dist,r.trapFav||'',r.nameFav||'',r.trapUnd||'',r.nameUnd||'',r.pct,r.nivel,r.perfilFav||'',r.perfilUnd||'',r.obs||'',r.odd||'',r.valor||'',r.r1||'',r.r2||'',r.r3||'',r.hit||''].join(',');});
    var b=new Blob([[h].concat(rows).join('\\n'),{type:'text/csv'}]);
    var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='greyhound_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
  });
});
</script>
</body>
</html>`;
}

function renderHistorico(data) {
  const { sessions, base, logoB64 } = data;
  const stats = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN bateu='sim' THEN 1 ELSE 0 END) as acertos FROM races WHERE bateu IS NOT NULL AND bateu != ''").get();
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Historico - Greyhound Validator</title>
<style>:root{--bg:#0a0a0a;--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--border2:#333;--green:#22c55e;--orange:#f97316;--text:#f0f0f0;--muted:#666;--muted2:#888;--red:#ef4444}*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid var(--green);overflow:hidden}.hero img{width:100%;height:130px;object-fit:cover;object-position:center 30%;display:block}
nav{background:var(--surface);border-bottom:1px solid var(--border2);padding:0 20px;display:flex;gap:0}.nav-link{padding:12px 18px;color:var(--muted2);text-decoration:none;font-size:13px;font-weight:500;border-bottom:2px solid transparent}.nav-link:hover,.nav-link.active{color:var(--green);border-bottom-color:var(--green)}
.content{padding:24px;max-width:900px;margin:0 auto}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
.kpi{background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:14px;position:relative;overflow:hidden}.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.kpi.g::before{background:var(--green)}.kpi.o::before{background:var(--orange)}.kpi.b::before{background:#3b82f6}
.kpi-label{font-size:10px;color:var(--muted2);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}.kpi-val{font-size:26px;font-weight:700}.kpi.g .kpi-val{color:var(--green)}.kpi.o .kpi-val{color:var(--orange)}.kpi.b .kpi-val{color:#60a5fa}
h2{font-size:16px;font-weight:700;color:var(--text);margin-bottom:12px}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border2);border-radius:8px;overflow:hidden}
th{padding:10px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);background:var(--surface2);border-bottom:1px solid var(--border2)}
td{padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px}
tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
a{color:var(--green);text-decoration:none}a:hover{text-decoration:underline}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(34,197,94,.15);color:var(--green);border:1px solid rgba(34,197,94,.3)}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="Greyhound Validator">`:'<div style="height:130px;background:#000;display:flex;align-items:center;justify-content:center;color:#22c55e;font-size:24px;font-weight:900">GREYHOUND VALIDATOR</div>'}</div>
<nav><a href="${base}" class="nav-link">Analisar</a><a href="${base}/historico" class="nav-link active">Historico</a><a href="${base}/config" class="nav-link">Configuracoes</a></nav>
<div class="content">
<div class="kpis">
<div class="kpi g"><div class="kpi-label">Total de sessoes</div><div class="kpi-val">${sessions.length}</div></div>
<div class="kpi o"><div class="kpi-label">Total de apostas</div><div class="kpi-val">${stats.total||0}</div></div>
<div class="kpi b"><div class="kpi-label">Taxa de acerto</div><div class="kpi-val">${stats.total>0?Math.round(stats.acertos/stats.total*100):0}%</div></div>
</div>
<h2>Sessoes de analise</h2>
<table><thead><tr><th>Data</th><th>Nome</th><th>Corridas</th><th>AvBs</th><th>Acao</th></tr></thead><tbody>
${sessions.map(s=>`<tr><td>${new Date(s.created_at).toLocaleDateString('pt-BR')}</td><td>${s.name||'Sem nome'}</td><td>${s.total_races||0}</td><td><span class="badge">${s.total_avbs||0}</span></td><td><a href="${base}/sessao/${s.id}">Ver detalhes</a></td></tr>`).join('')}
${sessions.length===0?'<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:30px">Nenhuma sessao salva ainda</td></tr>':''}
</tbody></table>
</div></body></html>`;
}

function renderSessao(data) {
  const { session, races, base, logoB64 } = data;
  const acertos = races.filter(r=>r.bateu==='sim').length;
  const apostas = races.filter(r=>r.bateu).length;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${session.name} - Greyhound</title>
<style>:root{--bg:#0a0a0a;--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--border2:#333;--green:#22c55e;--orange:#f97316;--text:#f0f0f0;--muted:#666;--muted2:#888;--red:#ef4444}*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid var(--green);overflow:hidden}.hero img{width:100%;height:130px;object-fit:cover;object-position:center 30%;display:block}
nav{background:var(--surface);border-bottom:1px solid var(--border2);padding:0 20px;display:flex;gap:0}.nav-link{padding:12px 18px;color:var(--muted2);text-decoration:none;font-size:13px;font-weight:500;border-bottom:2px solid transparent}.nav-link:hover,.nav-link.active{color:var(--green);border-bottom-color:var(--green)}
.content{padding:24px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.kpi{background:var(--surface);border:1px solid var(--border2);border-radius:8px;padding:12px 14px;position:relative;overflow:hidden}.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.kpi.g::before{background:var(--green)}.kpi.o::before{background:var(--orange)}.kpi.b::before{background:#3b82f6}
.kpi-label{font-size:10px;color:var(--muted2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}.kpi-val{font-size:22px;font-weight:700}.kpi.g .kpi-val{color:var(--green)}.kpi.o .kpi-val{color:var(--orange)}.kpi.b .kpi-val{color:#60a5fa}
table{width:100%;border-collapse:collapse;border:1px solid var(--border2);border-radius:8px;overflow:hidden;background:var(--surface)}
th{padding:9px 10px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);background:var(--surface2);border-bottom:1px solid var(--border2)}
td{padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;vertical-align:middle}tr:last-child td{border-bottom:none}
.trap-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-weight:700;font-size:11px}
.t1{background:#dc2626;color:#fff}.t2{background:#2563eb;color:#fff}.t3{background:#e5e7eb;color:#111}.t4{background:#111;color:#fff;border:1px solid #444}.t5{background:#d97706;color:#000}.t6{background:#111;color:#f59e0b;border:1px solid #f59e0b}
.badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700}
.ba{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}.bm{background:rgba(249,115,22,.12);color:#f97316;border:1px solid rgba(249,115,22,.25)}.bb{background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25)}
.sim{color:var(--green);font-weight:700}.nao{color:var(--red);font-weight:700}
a{color:var(--green);text-decoration:none}h2{font-size:16px;margin-bottom:12px;color:var(--text)}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="Greyhound Validator">`:'<div style="height:130px;background:#000;display:flex;align-items:center;justify-content:center;color:#22c55e;font-size:24px;font-weight:900">GREYHOUND VALIDATOR</div>'}</div>
<nav><a href="${base}" class="nav-link">Analisar</a><a href="${base}/historico" class="nav-link active">Historico</a><a href="${base}/config" class="nav-link">Configuracoes</a></nav>
<div class="content">
<div style="margin-bottom:16px"><a href="${base}/historico" style="color:var(--muted2);font-size:12px">&#8592; Voltar ao historico</a></div>
<h2>${session.name||'Sessao '+session.id}</h2>
<div class="kpis">
<div class="kpi b"><div class="kpi-label">Total corridas</div><div class="kpi-val">${races.length}</div></div>
<div class="kpi g"><div class="kpi-label">Acertos</div><div class="kpi-val">${acertos}</div></div>
<div class="kpi o"><div class="kpi-label">Apostas registradas</div><div class="kpi-val">${apostas}</div></div>
<div class="kpi"><div class="kpi-label">Taxa acerto</div><div class="kpi-val" style="color:${apostas>0&&acertos/apostas>=.5?'var(--green)':'var(--orange)'}">${apostas>0?Math.round(acertos/apostas*100):0}%</div></div>
</div>
<table><thead><tr><th>Hora</th><th>Corrida</th><th>AvB</th><th>Conf</th><th>Perfis</th><th>Obs</th><th>Odd</th><th>Valor</th><th>Resultado</th><th>Bateu</th></tr></thead><tbody>
${races.map(r=>{
  var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':'bb';
  return `<tr>
    <td><strong style="color:var(--green)">${r.hora||'-'}</strong><div style="font-size:10px;color:rgba(34,197,94,.5)">${r.hora_br||''}</div></td>
    <td><div style="font-weight:700">${r.corrida||'-'}</div><div style="font-size:10px;color:var(--muted)">${r.dist||''}</div></td>
    <td><span class="trap-badge t${r.trap_fav}">${r.trap_fav}</span> vs <span class="trap-badge t${r.trap_und}">${r.trap_und}</span></td>
    <td><span class="badge ${bc}">${r.nivel}</span> ${r.pct}%</td>
    <td style="font-size:10px">${r.perfil_fav||''}<br>${r.perfil_und||''}</td>
    <td style="font-size:11px;color:var(--muted2);max-width:160px">${r.obs||'-'}</td>
    <td>${r.odd||'-'}</td>
    <td>${r.valor?'R$ '+r.valor:'-'}</td>
    <td style="font-size:11px">${[r.resultado_1,r.resultado_2,r.resultado_3].filter(Boolean).join(' / ')||'-'}</td>
    <td class="${r.bateu==='sim'?'sim':r.bateu==='nao'?'nao':''}">${r.bateu==='sim'?'&#10003; Sim':r.bateu==='nao'?'&#10007; Nao':'-'}</td>
  </tr>`;
}).join('')}
</tbody></table>
</div></body></html>`;
}

module.exports = router;
