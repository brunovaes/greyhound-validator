const express = require('express');
const router = express.Router();
const { db, getUserConfig } = require('../db/database');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_PATH || '/greyhound';

function getLogo() {
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(logoPath)) return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  return '';
}

function navBar(user, active) {
  const isAdmin = user.role === 'admin';
  return `<nav style="background:#111;border-bottom:1px solid #333;padding:0 20px;display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex">
      <a href="${BASE}" class="nl${active==='analisar'?' na':''}">Analisar</a>
      <a href="${BASE}/historico" class="nl${active==='historico'?' na':''}">Histórico</a>
      ${isAdmin ? `<a href="${BASE}/config" class="nl${active==='config'?' na':''}">Configurações</a>` : ''}
      ${isAdmin ? `<a href="${BASE}/robot" class="nl${active==='robot'?' na':''}">Robô</a>` : ''}
      ${isAdmin ? `<a href="${BASE}/admin/usuarios" class="nl${active==='admin'?' na':''}">Usuários</a>` : ''}
      <a href="${BASE}/live" class="nl${active==='live'?' na':''}">Live</a>
    </div>
    <div style="display:flex;align-items:center;gap:14px">
      <a href="${BASE}/robot" id="robot-badge" style="display:none;align-items:center;gap:6px;font-size:11px;color:#60a5fa;text-decoration:none;border:1px solid rgba(96,165,250,.3);background:rgba(96,165,250,.08);border-radius:20px;padding:3px 10px;animation:blink 1.5s ease-in-out infinite">
        <span style="display:inline-block;width:7px;height:7px;background:#60a5fa;border-radius:50%"></span>
        <span id="robot-badge-txt">Robô rodando...</span>
      </a>
      <span style="font-size:11px;color:#666">${user.name} · <span style="color:#${user.plan==='premium'?'a78bfa':user.plan==='pro'?'60a5fa':'888'}">${user.plan}</span> · ${user.analyses_used}/${user.analyses_limit===999999?'∞':user.analyses_limit} analises</span>
      <a href="${BASE}/logout" style="font-size:11px;color:#666;text-decoration:none;border:1px solid #333;padding:4px 10px;border-radius:4px">Sair</a>
    </div>
  </nav>
  <style>
    .nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}
    .nl:hover,.na{color:#22c55e!important;border-bottom-color:#22c55e!important}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.5}}
  </style>
  <script>
  (function() {
    var BASE = '${BASE}';
    var badge = document.getElementById('robot-badge');
    var badgeTxt = document.getElementById('robot-badge-txt');
    function checkRobots() {
      Promise.all([
        fetch(BASE + '/robot/status').then(function(r){return r.json();}).catch(function(){return {};}),
        fetch(BASE + '/robot/results/status').then(function(r){return r.json();}).catch(function(){return {};})
      ]).then(function(results) {
        var pdf = results[0]; var res = results[1];
        if (pdf.running) {
          badge.style.display = 'flex';
          badgeTxt.textContent = 'Robô PDF: ' + (pdf.progress||0) + '/' + (pdf.total||'?');
        } else if (res.running) {
          badge.style.display = 'flex';
          badgeTxt.textContent = 'Robô Resultados rodando...';
        } else {
          badge.style.display = 'none';
        }
      });
    }
    checkRobots();
    setInterval(checkRobots, 4000);
  })();
  </script>`;
}

// Serve o JS do cliente como arquivo separado
router.get('/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(require('path').join(__dirname, '../../src/app.js'));
});

router.get('/', (req, res) => {
  const user = req.user;
  const config = getUserConfig(user.id);
  const sessions = db.prepare('SELECT * FROM race_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 8').all(user.id);
  const stats = db.prepare("SELECT COUNT(*) as t, SUM(CASE WHEN bateu='sim' THEN 1 ELSE 0 END) as a FROM races WHERE user_id=? AND bateu IS NOT NULL AND bateu!=''").get(user.id);
  const taxa = stats.t > 0 ? Math.round(stats.a/stats.t*100) : 0;
  const logoB64 = getLogo();

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Greyhound Validator</title>
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>
.main{display:grid;grid-template-columns:250px 1fr;min-height:calc(100vh - 175px)}
.sidebar{background:var(--sur);border-right:1px solid var(--bdr2);padding:16px;display:flex;flex-direction:column;gap:11px;overflow-y:auto}
.sidebar h2{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--mut)}
.uz{border:2px dashed var(--bdr2);border-radius:8px;padding:16px 12px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.uz:hover,.uz.drag{border-color:var(--grn);background:rgba(34,197,94,.08)}
.uz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.uz strong{color:var(--grn);display:block;font-size:12px;margin-bottom:2px}.uz p{font-size:10px;color:var(--mut2);line-height:1.4}
.flist{display:flex;flex-direction:column;gap:4px;max-height:130px;overflow-y:auto;margin-top:5px}
.fi{display:flex;align-items:center;gap:5px;background:var(--sur2);border:1px solid var(--bdr);border-radius:5px;padding:4px 8px;font-size:10px}
.fi-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fi-st{font-size:9px;padding:1px 6px;border-radius:8px;flex-shrink:0}
.fi-ok{background:rgba(34,197,94,.15);color:var(--grn)}.fi-load{background:rgba(249,115,22,.15);color:var(--org)}.fi-err{background:rgba(239,68,68,.12);color:var(--red)}
.fi-rm{background:none;border:none;color:var(--mut);cursor:pointer;font-size:13px;padding:0}.fi-rm:hover{color:var(--red)}
.btn-go{width:100%;padding:11px;background:var(--grn);color:#000;font-weight:700;font-size:13px;border:none;border-radius:var(--rad);cursor:pointer}
.btn-go:hover{background:var(--grn2)}.btn-go:disabled{opacity:.35;cursor:not-allowed}
.btn-sm{width:100%;padding:6px;background:transparent;color:var(--grn);font-size:11px;border:1px solid rgba(34,197,94,.3);border-radius:var(--rad);cursor:pointer;font-weight:600;transition:all .2s}
.btn-sm:hover{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.6)}.dv{height:1px;background:var(--bdr2)}
.sess-link{display:block;font-size:11px;color:var(--mut2);text-decoration:none;padding:3px 0;border-bottom:1px solid var(--bdr)}
.sess-link:hover{color:var(--grn)}.sess-link span{float:right;color:var(--mut)}
.content{padding:18px;overflow-y:auto}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.kpi{background:var(--sur);border:1px solid var(--bdr2);border-radius:8px;padding:10px 14px;position:relative;overflow:hidden}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.kpi.g::before{background:var(--grn)}.kpi.o::before{background:var(--org)}.kpi.b::before{background:#3b82f6}.kpi.p::before{background:#8b5cf6}
.kpi-label{font-size:10px;color:var(--mut2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.kpi-val{font-size:22px;font-weight:700}.kpi.g .kpi-val{color:var(--grn)}.kpi.o .kpi-val{color:var(--org)}.kpi.b .kpi-val{color:#60a5fa}.kpi.p .kpi-val{color:#a78bfa}
.pw{margin-bottom:10px;display:none}.pb{height:3px;background:var(--bdr2);border-radius:2px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,var(--grn),var(--org));transition:width .4s}.pt{font-size:11px;color:var(--mut2);margin-top:3px}
.st{font-size:12px;color:var(--mut2);margin-bottom:8px;min-height:16px}
.tw{overflow-x:auto;border:1px solid var(--bdr2);border-radius:8px}
table{width:100%;border-collapse:collapse;min-width:880px}thead{background:var(--sur2)}
th{padding:9px 10px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--bdr2);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid var(--bdr);vertical-align:middle}tr:last-child td{border-bottom:none}
tr.row-avb td{background:rgba(34,197,94,.03)}tr.row-avb td:first-child{border-left:3px solid var(--grn)}tr.row-avb:hover td{background:rgba(34,197,94,.08)}
tr.sk td{opacity:.35}tr.sk td:first-child{border-left:3px solid var(--bdr2)}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
.ba{background:rgba(34,197,94,.15);color:var(--grn);border:1px solid rgba(34,197,94,.3)}
.bm{background:rgba(249,115,22,.12);color:var(--org);border:1px solid rgba(249,115,22,.25)}
.bb{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.25)}
.bs{background:rgba(100,100,100,.1);color:var(--mut2);border:1px solid var(--bdr2)}
.cbar{width:48px;height:3px;background:var(--bdr2);border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px}
.cfill{height:100%;border-radius:2px}.cfg{background:var(--grn)}.cfa{background:var(--org)}.cfr{background:var(--red)}
.trap-row{display:flex;align-items:center;gap:6px}.trap-item{display:flex;flex-direction:column;align-items:center;gap:2px}
.trap-name{font-size:9px;color:var(--mut);text-align:center;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trap-vs{color:var(--mut);font-size:12px;font-weight:600}
.obs-c{font-size:11px;color:var(--mut2);line-height:1.5}
.obs-cap{font-size:11px;color:var(--org);line-height:1.5}
td input[type=text]{width:50px;padding:3px 6px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:4px;color:var(--txt);font-size:11px}
td input:focus{outline:none;border-color:var(--grn)}
td select{padding:3px 6px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:4px;color:var(--txt);font-size:11px;cursor:pointer}
.cap-btn{font-size:10px;padding:3px 9px;border:1px solid var(--org);border-radius:4px;background:rgba(249,115,22,.08);color:var(--org);cursor:pointer;font-weight:600}
.cap-ok{font-size:11px;color:var(--grn)}
.empty{text-align:center;padding:50px 20px;color:var(--mut)}.empty h3{font-size:15px;color:var(--mut2);margin-bottom:6px}
.empty p{font-size:12px;line-height:1.6;max-width:380px;margin:0 auto}
.ab{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
.bexp{padding:7px 14px;background:var(--sur2);border:1px solid var(--bdr2);color:var(--mut2);border-radius:var(--rad);cursor:pointer;font-size:12px}
.bexp:hover{border-color:var(--grn);color:var(--grn)}
.bsave{padding:7px 14px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--grn);border-radius:var(--rad);cursor:pointer;font-size:12px;font-weight:600}
.bsave:hover{background:rgba(34,197,94,.2)}
.pdf-ready-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:1000;align-items:center;justify-content:center}
.pdf-ready-modal.open{display:flex}
.pdf-ready-box{background:#111;border:1px solid #333;border-radius:12px;padding:28px 32px;text-align:center;max-width:420px;border-top:3px solid #22c55e}
.pdf-ready-icon{font-size:48px;margin-bottom:12px}
.pdf-ready-box h3{font-size:17px;font-weight:700;color:#f0f0f0;margin-bottom:8px}
.pdf-ready-box p{font-size:13px;color:#888;margin-bottom:20px;line-height:1.6}
.pdf-ready-ok{padding:10px 28px;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:6px;cursor:pointer;font-size:14px}
.pdf-ready-ok:hover{background:#16a34a}
@media print{
  .hero,.sidebar,.kpis,.pw,.st,.ab,nav,.bexp,.bsave,#btn-print,.cap-btn,.fi-rm,
  .col-sel-full,.col-perf,.col-res,.col-bat,.col-cap,.col-odd,
  th.th-sel,th.th-perf,th.th-res,th.th-bat,th.th-cap,th.th-odd,
  td.td-sel,td.td-perf,td.td-res,td.td-bat,td.td-cap,td.td-odd{display:none!important}
  body{background:#fff!important;color:#000!important;font-size:10px!important}
  .tw{border:none!important}
  table{min-width:unset!important;width:100%!important;font-size:9px!important}
  th{color:#333!important;background:#f0f0f0!important;padding:4px 6px!important;font-size:8px!important}
  td{color:#000!important;border-color:#ddd!important;padding:4px 6px!important;font-size:9px!important}
  .main{display:block!important}
  .content{padding:4px!important}
  .badge{border:1px solid #999!important;color:#000!important;background:#eee!important;font-size:8px!important}
  .trap-badge{border:1px solid #999!important;color:#000!important;background:#eee!important;width:18px!important;height:18px!important;font-size:9px!important}
  .trap-name{display:none!important}
  tr.sk{display:none!important}
  .obs-c,.obs-cap{max-width:none!important;font-size:9px!important;color:#000!important}
  .perfil-badge{display:none!important}
  .win-tag,.hora-br,.top3-tag{display:none!important}
}

.modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;align-items:flex-start;justify-content:center;padding-top:60px;overflow-y:auto}
.modal-bg.open{display:flex}.modal{background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;padding:22px;width:500px;max-width:95vw;border-top:3px solid var(--org)}
.modal h3{font-size:15px;font-weight:700;color:var(--org);margin-bottom:6px}.modal p{font-size:12px;color:var(--mut2);margin-bottom:14px;line-height:1.6}
.modal-upload{border:2px dashed var(--bdr2);border-radius:8px;padding:16px;text-align:center;cursor:pointer;position:relative;margin-bottom:10px;transition:all .2s}
.modal-upload:hover{border-color:var(--org);background:rgba(249,115,22,.08)}
.modal-upload input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.modal-upload strong{color:var(--org);display:block;font-size:12px;margin-bottom:3px}
.cap-st{font-size:12px;padding:6px 10px;border-radius:5px;margin-bottom:8px;display:none}
.cap-st.ok{background:rgba(34,197,94,.1);color:var(--grn)}.cap-st.er{background:rgba(239,68,68,.1);color:var(--red)}
.flist-modal{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;max-height:120px;overflow-y:auto}
.modal-acts{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}
.bok{padding:9px 20px;background:var(--grn);color:#000;font-weight:700;border:none;border-radius:var(--rad);cursor:pointer}.bok:hover{background:var(--grn2)}
.bca{padding:9px 14px;background:transparent;color:var(--mut2);border:1px solid var(--bdr2);border-radius:var(--rad);cursor:pointer}
.spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(0,0,0,.2);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="hero">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : '<div style="height:130px;background:#000;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#22c55e">GREYHOUND VALIDATOR</div>'}</div>
${navBar(user, 'analisar')}
<div class="main">
  <div class="sidebar">
    <div>
      <h2>PDFs de corridas</h2>
      <div class="uz" id="rz">
        <input type="file" accept=".pdf" multiple id="race-input">
        <strong>Clique ou arraste os PDFs</strong>
        <p>Multiplos PDFs aceitos</p>
      </div>
      <div class="flist" id="rlist"></div>
    </div>
    <div class="dv"></div>
    <button class="btn-go" id="btngo">Analisar Corridas</button>
    <div class="st" id="st" style="font-size:11px;color:var(--mut2);text-align:center;margin-top:6px;min-height:16px"></div>
    <button class="btn-sm" id="btn-clear">Limpar tudo</button>
    <div class="dv"></div>
    <div>
      <h2 style="margin-bottom:6px">Sessoes recentes</h2>
      ${sessions.map(s => `<a href="${BASE}/sessao/${s.id}" class="sess-link">${s.name||'Sessao '+s.id}<span>${s.total_avbs} AvBs</span></a>`).join('') || '<span style="font-size:11px;color:var(--mut)">Nenhuma sessao salva</span>'}
    </div>
  </div>
  <div class="content">
    <div class="pw" id="pw"><div class="pb"><div class="pf" id="pf" style="width:0%"></div></div><div class="pt" id="pt"></div></div>
    <div class="kpis">
      <div class="kpi b"><div class="kpi-label">PDFs carregados</div><div class="kpi-val" id="sp">-</div></div>
      <div class="kpi g"><div class="kpi-label">Corridas AvB</div><div class="kpi-val" id="sa">-</div></div>
      <div class="kpi o"><div class="kpi-label">Alta confianca</div><div class="kpi-val" id="sal">-</div></div>
      <div class="kpi p"><div class="kpi-label">Taxa acerto geral</div><div class="kpi-val">${taxa}%</div></div>
    </div>
    <div class="tw">
      <table><thead><tr>
        <th style="width:75px;text-align:center">Hora</th><th style="width:130px;text-align:center">Corrida</th><th style="width:170px;text-align:center">Selecao</th><th style="width:85px;text-align:center">Confianca</th><th style="text-align:left;padding-left:12px">Observacao</th><th style="width:105px;text-align:center">Odd / Valor</th><th style="width:105px;text-align:center">Resultado</th><th style="width:65px;text-align:center">Bateu</th><th style="width:50px;text-align:center">Cap</th>
      </tr></thead>
      <tbody id="tb"><tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida analisada</h3><p>Carregue PDFs e clique em Analisar.</p></div></td></tr></tbody></table>
    </div>
    <div class="ab" id="ab" style="display:none">
      <button class="bexp" id="btn-exp">Exportar CSV</button>
      <button class="bexp" id="btn-print" style="border-color:#a78bfa;color:#a78bfa">&#128438; Imprimir Analises</button>
      <button class="bsave" id="btn-save">Salvar Sessao</button>
    </div>
  </div>
</div>

<div class="pdf-ready-modal" id="pdf-ready-modal">
  <div class="pdf-ready-box">
    <div class="pdf-ready-icon">&#9989;</div>
    <h3>PDFs prontos!</h3>
    <p>Seus PDFs já estão disponíveis para realização das análises.</p>
    <button class="pdf-ready-ok" id="btn-pdf-ready-ok">OK</button>
  </div>
</div>

<div class="modal-bg" id="cap-modal">
  <div class="modal">
    <h3 id="cm-title">Capivara necessaria</h3>
    <p id="cm-body">Carregue o print ou PDF.</p>
    <div class="modal-upload"><input type="file" id="cap-modal-inp" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple><strong>Clique, arraste ou cole (Ctrl+V)</strong><p>JPG PNG PDF aceitos · Ctrl+V para colar print</p></div>
    <div class="cap-st" id="cap-st"></div>
    <div class="flist-modal" id="cap-modal-list"></div>
    <div class="modal-acts"><button class="bca" id="btn-cap-cancel">Cancelar</button><button class="bok" id="btn-cap-ok" disabled>Validar e Reanalisar</button></div>
  </div>
</div>

<script>var BASE='${BASE}';var SS_KEY='ghf_results_v1';</script>
<script src="${BASE}/app.js"></script></body></html>`);
});

router.get('/live', (req, res) => {
  const user = req.user;
  const logoB64 = getLogo();
  // URLs fixas das pistas (ajustar aqui quando precisar trocar)
  const LIVE_URL_1 = 'https://www.sisracing.tv/';
  const LIVE_URL_2 = process.env.LIVE_URL_2 || 'https://greyhounds.attheraces.com/video/live-video';
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live - Greyhound Validator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
.content{padding:16px 20px;max-width:1600px;margin:0 auto}
h1{font-size:18px;font-weight:700;margin-bottom:12px}
.live-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:900px){.live-grid{grid-template-columns:1fr}}
.live-panel{background:#111;border:1px solid #333;border-radius:10px;overflow:hidden}
.live-crop{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.live-crop iframe{position:absolute;top:-65px;left:0;width:100%;height:600px;border:none}
.live-crop video{width:100%;height:100%;object-fit:cover}
.live-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#555;font-size:12px;text-align:center;padding:20px;gap:10px}
.spinner{width:32px;height:32px;border:3px solid #333;border-top-color:#22c55e;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.btn-retry{padding:6px 14px;background:transparent;border:1px solid #22c55e;color:#22c55e;border-radius:6px;cursor:pointer;font-size:11px}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'live')}
<div class="content">
<h1 style="display:flex;align-items:center;justify-content:space-between">Live — Acompanhamento Simultaneo
  <a href="${BASE}/live/popup" target="_blank" rel="noopener" style="font-size:12px;background:#22c55e;color:#000;font-weight:700;padding:7px 14px;border-radius:6px;text-decoration:none">&#8599; Abrir em nova aba</a>
</h1>
<div class="live-grid">
  <div class="live-panel">
    <div class="live-crop">
      ${LIVE_URL_1 ? `<iframe src="${LIVE_URL_1}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen></iframe>` : '<div class="live-empty">Pista 1 nao configurada</div>'}
    </div>
  </div>
  <div class="live-panel">
    <div class="live-crop" id="p2wrap">
      <div class="live-empty" id="p2status">
        <div class="spinner"></div>
        <span>Buscando stream ATR...</span>
      </div>
    </div>
  </div>
</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js"></script>
<script>
var BASE='${BASE}';
function loadATRStream(){
  var wrap=document.getElementById('p2wrap');
  var status=document.getElementById('p2status');
  status.innerHTML='<div class="spinner"></div><span>Aguardando stream ATR...<br><small style="color:#666;margin-top:4px;display:block">Abra o ATR no Chrome com a extensao instalada</small></span>';
  status.style.display='flex';

  // Consulta a cada 3s ate encontrar um stream
  var tries=0;
  var interval=setInterval(function(){
    tries++;
    fetch(BASE+'/api/atr-stream-status')
      .then(function(r){return r.json();})
      .then(function(data){
        if(data.url){
          clearInterval(interval);
          var video=document.createElement('video');
          video.controls=true; video.autoplay=true; video.muted=true;
          status.style.display='none';
          wrap.appendChild(video);
          if(Hls.isSupported()){
            var hls=new Hls();
            hls.loadSource(data.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED,function(){video.play();});
            hls.on(Hls.Events.ERROR,function(e,d){
              if(d.fatal){
                status.innerHTML='<span style="color:#ef4444">Stream expirou.</span><button class="btn-retry" onclick="loadATRStream()">Atualizar</button>';
                status.style.display='flex';
                video.remove();
              }
            });
          } else if(video.canPlayType('application/vnd.apple.mpegurl')){
            video.src=data.url; video.play();
          }
        } else if(tries>60){
          // Desiste apos 3 minutos sem receber stream
          clearInterval(interval);
          status.innerHTML='<span style="color:#888">Stream nao recebido.</span><button class="btn-retry" onclick="loadATRStream()">Tentar novamente</button>';
        }
      })
      .catch(function(){});
  }, 3000);
}
loadATRStream();
</script>
</body></html>`);
});

router.get('/live/popup', (req, res) => {
  const LIVE_URL_1 = 'https://www.sisracing.tv/';
  const LIVE_URL_2 = process.env.LIVE_URL_2 || 'https://greyhounds.attheraces.com/video/live-video';
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live - Greyhound Validator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;height:100vh;overflow:hidden;display:flex;align-items:center}
.live-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%}
@media(max-width:900px){.live-grid{grid-template-columns:1fr}}
.live-crop{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.live-crop iframe{position:absolute;top:-65px;left:0;width:100%;height:600px;border:none}.live-crop.c2 iframe{top:-225px;height:1450px}
.live-empty{display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:13px;text-align:center;padding:20px;font-family:sans-serif}
</style></head><body>
<div class="live-grid">
  <div class="live-crop">
    ${LIVE_URL_1 ? `<iframe src="${LIVE_URL_1}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen></iframe>` : '<div class="live-empty">Pista 1 nao configurada</div>'}
  </div>
  <div class="live-crop c2">
    ${LIVE_URL_2 ? `<iframe src="${LIVE_URL_2}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen></iframe>` : '<div class="live-empty">Pista 2 ainda nao configurada</div>'}
  </div>
</div>
</body></html>`);
});

router.get('/historico', (req, res) => {
  const user = req.user;
  const sessions = db.prepare('SELECT * FROM race_sessions WHERE user_id=? ORDER BY created_at DESC').all(user.id);
  const stats = db.prepare("SELECT COUNT(*) as t, SUM(CASE WHEN bateu='sim' THEN 1 ELSE 0 END) as a FROM races WHERE user_id=? AND bateu IS NOT NULL AND bateu!=''").get(user.id);
  const logoB64 = getLogo();
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Historico - Greyhound Validator</title>
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>
.content{padding:24px;max-width:900px;margin:0 auto}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
h2{font-size:16px;font-weight:700;margin-bottom:12px}table{width:100%;border-collapse:collapse;background:#111;border:1px solid #333;border-radius:8px;overflow:hidden}th{padding:10px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#1a1a1a;border-bottom:1px solid #333}td{padding:10px 12px;border-bottom:1px solid #222;font-size:13px}tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
.btn-del{background:none;border:none;cursor:pointer;color:#666;font-size:18px;padding:4px 6px;border-radius:6px;transition:all .2s;line-height:1}.btn-del:hover{color:#ef4444;background:rgba(239,68,68,.1)}
.del-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:1000;align-items:center;justify-content:center}
.del-modal-bg.open{display:flex}
.del-modal{background:#111;border:1px solid #333;border-radius:16px;padding:36px 40px;text-align:center;max-width:360px;width:90%;animation:popIn .25s ease}
@keyframes popIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
.del-icon{font-size:56px;margin-bottom:16px;display:block}
.del-modal h3{font-size:18px;font-weight:700;margin-bottom:8px}
.del-modal p{font-size:13px;color:#888;margin-bottom:24px;line-height:1.5}
.del-btns{display:flex;gap:10px;justify-content:center}
.del-btns button{padding:10px 24px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;border:none}
.btn-cancel{background:#222;color:#888;border:1px solid #333!important}
.btn-cancel:hover{background:#2a2a2a}
.btn-confirm-del{background:#ef4444;color:#fff}
.btn-confirm-del:hover{background:#dc2626}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'historico')}
<div class="content">
<div class="kpis">
<div class="kpi g"><div class="kpi-label">Total sessoes</div><div class="kpi-val">${sessions.length}</div></div>
<div class="kpi o"><div class="kpi-label">Total apostas</div><div class="kpi-val">${stats.t||0}</div></div>
<div class="kpi b"><div class="kpi-label">Taxa de acerto</div><div class="kpi-val">${stats.t>0?Math.round(stats.a/stats.t*100):0}%</div></div>
</div>
<h2>Sessoes de analise</h2>
<table><thead><tr><th>Data</th><th>Nome</th><th>AvBs</th><th>Acao</th></tr></thead><tbody>
${sessions.map(s=>`<tr><td>${new Date(s.created_at).toLocaleDateString('pt-BR')}</td><td>${s.name||'Sem nome'}</td><td><span class="badge">${s.total_avbs||0}</span></td><td style="display:flex;gap:14px;align-items:center"><a href="${BASE}/sessao/${s.id}">Ver detalhes</a><button class="btn-del" title="Deletar sessao" onclick="abrirDel('${s.id}','${(s.name||'Sem nome').replace(/'/g,"\\'")}')">&#128465;</button></td></tr>`).join('')}
${!sessions.length?'<tr><td colspan="4" style="text-align:center;color:#666;padding:30px">Nenhuma sessao salva</td></tr>':''}
</tbody></table>
</div>

<div class="del-modal-bg" id="del-bg">
  <div class="del-modal">
    <span class="del-icon">&#128465;&#65039;</span>
    <h3>Deletar sessao?</h3>
    <p id="del-txt">Esta acao nao pode ser desfeita.</p>
    <div class="del-btns">
      <button class="btn-cancel" onclick="fecharDel()">Cancelar</button>
      <button class="btn-confirm-del" onclick="confirmarDel()">Deletar</button>
    </div>
  </div>
</div>
<form id="del-form" method="POST" style="display:none"></form>

<script>
var BASE_H='${BASE}';
var delId=null;
function abrirDel(id,nome){delId=id;document.getElementById('del-txt').textContent='Voce esta deletando a sessao "'+nome+'". Esta acao nao pode ser desfeita.';document.getElementById('del-bg').classList.add('open');}
function fecharDel(){document.getElementById('del-bg').classList.remove('open');delId=null;}
function confirmarDel(){if(!delId)return;var f=document.getElementById('del-form');f.action=BASE_H+'/sessao/'+delId+'/deletar';f.submit();}
document.getElementById('del-bg').addEventListener('click',function(e){if(e.target===this)fecharDel();});
</script>
</body></html>`);
});

router.post('/sessao/:id/deletar', (req, res) => {
  const user = req.user;
  const sess = db.prepare('SELECT * FROM race_sessions WHERE id=? AND user_id=?').get(req.params.id, user.id);
  if (sess) {
    db.prepare('DELETE FROM races WHERE session_id=?').run(sess.id);
    db.prepare('DELETE FROM race_sessions WHERE id=?').run(sess.id);
  }
  res.redirect(BASE + '/historico');
});

router.get('/sessao/:id', (req, res) => {
  const user = req.user;
  const sess = db.prepare('SELECT * FROM race_sessions WHERE id=? AND user_id=?').get(req.params.id, user.id);
  if (!sess) return res.redirect(BASE + '/historico');
  const races = db.prepare('SELECT * FROM races WHERE session_id=? ORDER BY hora').all(sess.id);
  const ac = races.filter(r=>r.bateu==='sim').length;
  const ap = races.filter(r=>r.bateu).length;
  const logoB64 = getLogo();
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${sess.name} - Greyhound</title>
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>
.content{padding:16px 20px;max-width:1600px;margin:0 auto}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.tw{overflow-x:auto;border:1px solid var(--bdr);border-radius:8px}
table{width:100%;border-collapse:collapse;background:#111;min-width:900px}
th{padding:10px 8px;text-align:center;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#1a1a1a;border-bottom:1px solid #333}
td{padding:10px 8px;border-bottom:1px solid var(--sur2);font-size:12px;vertical-align:middle;text-align:center}
tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'historico')}
<div class="content">
<div class="kpis">
<div class="kpi b"><div class="kpi-label">Corridas</div><div class="kpi-val">${races.length}</div></div>
<div class="kpi g"><div class="kpi-label">Acertos</div><div class="kpi-val">${ac}</div></div>
<div class="kpi o"><div class="kpi-label">Apostas</div><div class="kpi-val">${ap}</div></div>
<div class="kpi"><div class="kpi-label">Taxa</div><div class="kpi-val" style="color:${ap>0&&ac/ap>=.5?'#22c55e':'#f97316'}">${ap>0?Math.round(ac/ap*100):0}%</div></div>
</div>
<div class="tw"><table><thead><tr><th style="width:65px">Hora BR</th><th style="width:140px">Corrida</th><th style="width:175px">AvB</th><th style="width:75px">Conf</th><th style="width:110px">Resultado</th><th style="width:50px">Bateu</th><th>Obs</th><th style="width:40px">Odd</th><th style="width:55px">Valor</th></tr></thead><tbody>
${races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0).map(r=>{
  var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':'bb';
  var horaBr=r.hora_br||r.hora||'-';
  var horaUk=r.hora||'';
  return`<tr>
<td style="text-align:center;white-space:nowrap"><div style="font-size:15px;font-weight:700;color:#22c55e;letter-spacing:.5px">${horaUk||'-'}</div><div style="font-size:10px;color:rgba(34,197,94,.45);margin-top:1px">${(function(h){if(!h)return'';var p=h.split(':');var hr=parseInt(p[0]);if(hr>=1&&hr<=9)hr+=12;hr=hr-4;if(hr<0)hr+=24;return hr+':'+p[1];})(horaUk)}</div></td>
<td style="text-align:center"><div style="font-weight:700;font-size:12px">${r.corrida||'-'}</div><div style="font-size:10px;color:#666">${r.dist||''}</div>${r.top3?'<div class="top3-tag">&#127942; '+r.top3+'</div>':''}</td>
<td style="text-align:center;vertical-align:middle"><div style="display:flex;align-items:flex-start;justify-content:center;gap:12px">
<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:60px">
<div class="trap-badge t${r.trap_fav}">${r.trap_fav}</div>
<div style="font-size:10px;font-weight:600;color:rgba(255,255,255,.85);text-align:center;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(r.name_fav||'').split(' ')[0]}</div>
${r.perfil_fav?`<div style="font-size:9px;color:#666;text-align:center">${r.perfil_fav}</div>`:''}
</div>
<div style="font-size:10px;color:#555;padding-top:8px">vs</div>
<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:60px">
<div class="trap-badge t${r.trap_und}">${r.trap_und}</div>
<div style="font-size:10px;font-weight:600;color:rgba(255,255,255,.85);text-align:center;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(r.name_und||'').split(' ')[0]}</div>
${r.perfil_und?`<div style="font-size:9px;color:#666;text-align:center">${r.perfil_und}</div>`:''}
</div></div>
<a style="font-size:9px;color:rgba(96,165,250,.7);cursor:pointer;display:block;text-align:center;margin-top:4px" onclick="openSessValModal(${r.id})">&#128269; ver historico</a></td>
<td style="text-align:center"><span class="badge ${bc}">${r.nivel}</span><div style="font-size:10px;color:#888;margin-top:2px">${r.pct}%</div></td>
<td style="text-align:center">${(function(){var tc=["","t1","t2","t3","t4","t5","t6"];var html="";[r.resultado_1,r.resultado_2,r.resultado_3].forEach(function(v){if(!v)return;var n=parseInt(v);if(n>=1&&n<=6){html+='<span class="trap-badge '+tc[n]+'" style="width:24px;height:24px;font-size:12px;margin:0 1px">'+n+'</span>';}else{var name=String(v).split(" ")[0].slice(0,10);html+='<span style="font-size:9px;color:#888;display:block;text-align:center;line-height:1.3">'+name+'</span>';}});if(r.video_url){html+='<div style="margin-top:5px"><a href="'+r.video_url+'" target="_blank" style="font-size:9px;color:#60a5fa;text-decoration:none;display:inline-flex;align-items:center;gap:3px;border:1px solid rgba(96,165,250,.25);border-radius:4px;padding:1px 6px;background:rgba(96,165,250,.06)">&#9654; Replay</a></div>';}return html||"-";})()}</td>
<td style="text-align:center" class="${r.bateu==='sim'?'sim':r.bateu==='nao'?'nao':''}">${r.bateu==='sim'?'✓':r.bateu==='nao'?'✗':'-'}</td>
<td style="text-align:left;font-size:11px;color:#888;line-height:1.5">${r.obs||'-'}</td>
<td style="text-align:center">${r.odd||'-'}</td>
<td style="text-align:center">${r.valor?'R$'+r.valor:'-'}</td>
</tr>`;}).join('')}
${!races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0).length?'<tr><td colspan="9" style="text-align:center;color:#666;padding:20px">Nenhum AvB nesta sessao</td></tr>':''}
</tbody></table></div>

<style>#sv-modal{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center;z-index:9000}#sv-modal.open{display:flex}#sv-box{background:#12172a;border:1px solid rgba(255,255,255,.12);border-radius:12px;width:88vw;max-width:920px;max-height:88vh;overflow-y:auto;display:flex;flex-direction:column}#sv-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:#12172a}#sv-hdr h3{font-size:13px;font-weight:700;color:#fff;margin:0}#sv-xbtn{background:transparent;border:none;color:#888;font-size:18px;cursor:pointer;padding:0 4px}#sv-body{padding:14px 16px;display:flex;flex-direction:column;gap:0}.sv-dog{width:100%}.sv-dog-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid rgba(255,255,255,.07)}.sv-name{font-size:12px;font-weight:700;color:#fff}.sv-perfil{font-size:10px;color:#888;margin-left:4px}.sv-sep{height:1px;background:rgba(255,255,255,.06);margin:10px 0}.sv-tbl{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}.sv-tbl th{font-size:8px;color:rgba(255,255,255,.3);text-transform:uppercase;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.07);white-space:nowrap;text-align:left}.sv-tbl td{padding:4px 5px;border-bottom:1px solid rgba(255,255,255,.04);color:rgba(255,255,255,.8);white-space:nowrap}.sv-tbl tr:last-child td{border-bottom:none}.sv-bends{font-weight:700}.sv-caltm{color:#60a5fa;font-weight:700}.sv-grade{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 5px;font-size:9px;color:rgba(255,255,255,.55)}</style>
<div id="sv-modal"><div id="sv-box"><div id="sv-hdr"><h3 id="sv-title">Historico</h3><button id="sv-xbtn" onclick="closeSvModal()">&#x2715;</button></div><div id="sv-body"></div></div></div>
<script>
var ALL_RACES=${JSON.stringify(races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0)).replace(/</g,'\u003c').replace(/>/g,'\u003e')};
function closeSvModal(){document.getElementById('sv-modal').classList.remove('open');}
function openSessValModal(id){
  var r=ALL_RACES.find(function(x){return x.id==id;});
  if(!r)return;
  var hf=null,hu=null;
  try{if(r.hist_fav)hf=JSON.parse(r.hist_fav);}catch(e){}
  try{if(r.hist_und)hu=JSON.parse(r.hist_und);}catch(e){}
  if(!hf&&!hu){document.getElementById('sv-title').textContent='Historico indisponivel';document.getElementById('sv-body').innerHTML='<p style="color:#888;font-size:12px;padding:20px;text-align:center">Sessao salva antes do recurso ser ativado.</p>';document.getElementById('sv-modal').classList.add('open');return;}
  document.getElementById('sv-title').textContent='T'+r.trap_fav+' '+(r.name_fav||'')+' vs T'+r.trap_und+' '+(r.name_und||'');
  document.getElementById('sv-body').innerHTML=svCard(r.trap_fav,r.name_fav,r.perfil_fav,hf)+'<div class="sv-sep"></div>'+svCard(r.trap_und,r.name_und,r.perfil_und,hu);
  document.getElementById('sv-modal').classList.add('open');
}
function svCard(trap,nome,perfil,hist){
  var tc=['','t1','t2','t3','t4','t5','t6'];
  if(!hist||!hist.length)return'<div class="sv-dog"><div class="sv-dog-hdr"><span class="trap-badge '+tc[trap||0]+'">'+trap+'</span><span class="sv-name">'+(nome||'')+'</span></div><p style="color:#666;font-size:11px;padding:8px">Sem historico</p></div>';
  var rows=hist.map(function(h){var ct=h.caltm&&parseFloat(h.caltm)>0?parseFloat(h.caltm).toFixed(2):'-';var rem=h.remarks||'';var ci=rem.indexOf(',');if(ci>=0){var ws=rem.lastIndexOf(' ',ci)+1;rem=rem.substring(ws);}return'<tr><td>'+h.data+'</td><td>'+h.pista+'</td><td style="text-align:center">'+h.dist+'m</td><td style="text-align:center;color:#aaa">['+h.trap+']</td><td style="text-align:center;color:#888">'+(h.split||'')+'</td><td class="sv-bends" style="text-align:center">'+(h.bends||'')+'</td><td style="color:#888">'+rem+'</td><td style="text-align:center"><span class="sv-grade">'+(h.classe||'')+'</span></td><td class="sv-caltm" style="text-align:right">'+ct+'</td></tr>';}).join('');
  return'<div class="sv-dog"><div class="sv-dog-hdr"><span class="trap-badge '+tc[trap||0]+'">'+trap+'</span><span class="sv-name">'+(nome||'')+'</span>'+(perfil?'<span class="sv-perfil">'+perfil+'</span>':'')+'</div><table class="sv-tbl"><colgroup><col style="width:60px"><col style="width:44px"><col style="width:38px"><col style="width:32px"><col style="width:38px"><col style="width:46px"><col><col style="width:36px"><col style="width:48px"></colgroup><thead><tr><th>Date</th><th>Track</th><th>Dis</th><th>Trp</th><th>Split</th><th>Bends</th><th>Remarks</th><th>Grade</th><th>CalTm</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
document.addEventListener('click',function(e){if(e.target.id==='sv-modal')closeSvModal();});
</script>
</div></body></html>`);
});

// Cache em memoria do ultimo stream URL recebido da extensao Chrome
var atrStreamCache = { url: null, ts: 0 };

// Recebe o stream URL da extensao Chrome
router.post('/api/atr-stream-push', express.json(), (req, res) => {
  const { url, ts } = req.body || {};
  if (url && url.includes('.m3u8')) {
    atrStreamCache = { url, ts: ts || Date.now() };
    console.log('[ATR Extension] Stream recebido:', url.slice(0,80));
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'URL invalida' });
  }
});

// Frontend consulta essa rota pra saber se tem stream disponivel
router.get('/api/atr-stream-status', (req, res) => {
  const age = Date.now() - atrStreamCache.ts;
  // Stream expira em 2 horas (nimblesessionid dura bastante mas nao e eterno)
  if (atrStreamCache.url && age < 7200000) {
    res.json({ url: atrStreamCache.url, age: Math.round(age/1000) });
  } else {
    res.json({ url: null });
  }
});

module.exports = router;