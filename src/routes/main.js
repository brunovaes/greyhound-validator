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
      <span style="font-size:11px;color:#666">${user.name} · <span style="color:#${user.plan==='premium'?'a78bfa':user.plan==='pro'?'60a5fa':'888'}">${user.plan}</span> · ${user.analyses_used}/${user.analyses_limit===999999?'∞':user.analyses_limit} analises</span>
      <a href="${BASE}/logout" style="font-size:11px;color:#666;text-decoration:none;border:1px solid #333;padding:4px 10px;border-radius:4px">Sair</a>
    </div>
  </nav>
  <style>.nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}.nl:hover,.na{color:#22c55e!important;border-bottom-color:#22c55e!important}</style>`;
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
<style>
:root{--bg:#0a0a0a;--sur:#111;--sur2:#1a1a1a;--bdr:#2a2a2a;--bdr2:#333;--grn:#22c55e;--grn2:#16a34a;--org:#f97316;--txt:#f0f0f0;--mut:#666;--mut2:#888;--red:#ef4444;--rad:6px}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--txt);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;min-height:100vh}
.hero{width:100%;background:#000;border-bottom:2px solid var(--grn);overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
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
.btn-sm{width:100%;padding:6px;background:transparent;color:var(--mut2);font-size:11px;border:1px solid var(--bdr2);border-radius:var(--rad);cursor:pointer}
.btn-sm:hover{color:var(--txt)}.dv{height:1px;background:var(--bdr2)}
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
.tw{overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 255px);border:1px solid var(--bdr2);border-radius:8px}
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
.trap-badge{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-weight:700;font-size:12px;border:2px solid transparent}
.t1{background:radial-gradient(circle at 35% 35%, #ff4444, #c00 60%, #8b0000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.4),0 2px 4px rgba(0,0,0,.3)}
.t2{background:radial-gradient(circle at 35% 35%, #4488ff, #1a3db5 60%, #0a1f6b);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.3),0 2px 4px rgba(0,0,0,.3)}
.t3{background:radial-gradient(circle at 35% 35%, #ffffff, #d0d0d0 60%, #a0a0a0);color:#111;box-shadow:inset -2px -2px 4px rgba(0,0,0,.2),inset 1px 1px 3px rgba(255,255,255,.8),0 2px 4px rgba(0,0,0,.25)}
.t4{background:radial-gradient(circle at 35% 35%, #444, #1a1a1a 60%, #000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.6),inset 1px 1px 3px rgba(255,255,255,.15),0 2px 4px rgba(0,0,0,.4)}
.t5{background:radial-gradient(circle at 35% 35%, #ffaa00, #e07000 60%, #a04800);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.3),inset 1px 1px 3px rgba(255,255,255,.4),0 2px 4px rgba(0,0,0,.3)}
.t6{background:radial-gradient(circle at 50% 50%, #cc0000 0%,#cc0000 38%,transparent 38%),repeating-linear-gradient(90deg,#111 0%,#111 50%,#f0f0f0 50%,#f0f0f0 100%) 0/10px;color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.2),0 2px 4px rgba(0,0,0,.4)}
.trap-row{display:flex;align-items:center;gap:6px}.trap-item{display:flex;flex-direction:column;align-items:center;gap:2px}
.trap-name{font-size:9px;color:var(--mut);text-align:center;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trap-vs{color:var(--mut);font-size:12px;font-weight:600}
.perfil-badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600}
.p-rec{background:rgba(34,197,94,.15);color:var(--grn)}.p-fum{background:rgba(239,68,68,.12);color:var(--red)}
.p-est{background:rgba(100,100,100,.15);color:var(--mut2)}.p-fro{background:rgba(249,115,22,.12);color:var(--org)}
.win-tag{display:inline-flex;align-items:center;font-size:9px;color:rgba(249,115,22,.6);border:1px solid rgba(249,115,22,.2);border-radius:3px;padding:1px 5px;margin-top:3px;background:rgba(249,115,22,.04)}
.top3-tag{display:inline-flex;align-items:center;font-size:10px;font-weight:700;color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:4px;padding:2px 6px;margin-top:4px;background:rgba(251,191,36,.08)}
.hora-br{font-size:10px;color:rgba(34,197,94,.5);margin-top:2px}
.obs-c{font-size:11px;color:var(--mut2);line-height:1.5;max-width:175px}
.obs-cap{font-size:11px;color:var(--org);line-height:1.5;max-width:175px}
td input[type=text]{width:50px;padding:3px 6px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:4px;color:var(--txt);font-size:11px}
td input:focus{outline:none;border-color:var(--grn)}
td select{padding:3px 6px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:4px;color:var(--txt);font-size:11px;cursor:pointer}
.cap-btn{font-size:10px;padding:3px 9px;border:1px solid var(--org);border-radius:4px;background:rgba(249,115,22,.08);color:var(--org);cursor:pointer;font-weight:600}
.cap-ok{font-size:11px;color:var(--grn)}
.empty{text-align:center;padding:50px 20px;color:var(--mut)}.empty h3{font-size:15px;color:var(--mut2);margin-bottom:6px}
.empty p{font-size:12px;line-height:1.6;max-width:380px;margin:0 auto}
.ab{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
.bexp{padding:8px 18px;background:var(--sur2);border:1px solid var(--bdr2);color:var(--mut2);border-radius:var(--rad);cursor:pointer;font-size:12px;font-weight:700;transition:all .2s}
.bexp:hover{border-color:var(--grn);color:var(--grn)}
.bsave{padding:8px 18px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--grn);border-radius:var(--rad);cursor:pointer;font-size:12px;font-weight:700;transition:all .2s}
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
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:var(--sur)}::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:3px}
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
    <button class="btn-sm" id="btn-clear">Limpar tudo</button>
    <div class="dv"></div>
    <div>
      <h2 style="margin-bottom:6px">Sessoes recentes</h2>
      ${sessions.map(s => `<a href="${BASE}/sessao/${s.id}" class="sess-link">${s.name||'Sessao '+s.id}<span>${s.total_avbs} AvBs</span></a>`).join('') || '<span style="font-size:11px;color:var(--mut)">Nenhuma sessao salva</span>'}
    </div>
  </div>
  <div class="content">
    <div class="pw" id="pw"><div class="pb"><div class="pf" id="pf" style="width:0%"></div></div><div class="pt" id="pt"></div></div>
    <div class="st" id="st"></div>
    <div class="kpis">
      <div class="kpi b"><div class="kpi-label">PDFs carregados</div><div class="kpi-val" id="sp">-</div></div>
      <div class="kpi g"><div class="kpi-label">Corridas AvB</div><div class="kpi-val" id="sa">-</div></div>
      <div class="kpi o"><div class="kpi-label">Alta confianca</div><div class="kpi-val" id="sal">-</div></div>
      <div class="kpi p"><div class="kpi-label">Taxa acerto geral</div><div class="kpi-val">${taxa}%</div></div>
    </div>
    <div class="tw">
      <table><thead><tr>
        <th style="width:80px;text-align:center">Hora</th><th style="width:160px;text-align:center">Corrida</th><th style="width:180px;text-align:center">Selecao</th><th style="width:90px;text-align:center">Confianca</th><th style="min-width:280px;text-align:center">Observacao</th><th style="width:130px;text-align:center">Odd / Valor</th><th style="width:130px;text-align:center">Resultado</th><th style="width:70px;text-align:center">Bateu</th><th style="width:55px;text-align:center">Cap</th>
      </tr></thead>
      <tbody id="tb"><tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida analisada</h3><p>Carregue PDFs e clique em Analisar.</p></div></td></tr></tbody></table>
    </div>
    <div class="ab" id="ab" style="display:none">
      <button class="bexp" id="btn-exp" style="border-color:#3b82f6;color:#60a5fa">Exportar CSV</button>
      <button class="bexp" id="btn-print" style="border-color:#a78bfa;color:#a78bfa">&#128438; Imprimir Analises</button>
      <button class="bsave" id="btn-save">&#128190; Salvar Sessao</button>
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
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}.content{padding:24px;max-width:900px;margin:0 auto}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.kpi{background:#111;border:1px solid #333;border-radius:8px;padding:14px;position:relative;overflow:hidden}.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.kpi.g::before{background:#22c55e}.kpi.o::before{background:#f97316}.kpi.b::before{background:#3b82f6}.kpi-label{font-size:10px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}.kpi-val{font-size:26px;font-weight:700}.kpi.g .kpi-val{color:#22c55e}.kpi.o .kpi-val{color:#f97316}.kpi.b .kpi-val{color:#60a5fa}h2{font-size:16px;font-weight:700;margin-bottom:12px}table{width:100%;border-collapse:collapse;background:#111;border:1px solid #333;border-radius:8px;overflow:hidden}th{padding:10px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#1a1a1a;border-bottom:1px solid #333}td{padding:10px 12px;border-bottom:1px solid #222;font-size:13px}tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}a{color:#22c55e;text-decoration:none}a:hover{text-decoration:underline}.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}.btn-del{background:none;border:none;cursor:pointer;color:#666;font-size:18px;padding:4px 6px;border-radius:6px;transition:all .2s;line-height:1}.btn-del:hover{color:#ef4444;background:rgba(239,68,68,.1)}
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
  const validRaces = races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0);
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${sess.name} - Greyhound</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}
.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
.content{padding:24px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.kpi{background:#111;border:1px solid #333;border-radius:8px;padding:12px 14px;position:relative;overflow:hidden}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.kpi.g::before{background:#22c55e}.kpi.o::before{background:#f97316}.kpi.b::before{background:#3b82f6}
.kpi-label{font-size:10px;color:#888;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.kpi-val{font-size:22px;font-weight:700}
.kpi.g .kpi-val{color:#22c55e}.kpi.o .kpi-val{color:#f97316}.kpi.b .kpi-val{color:#60a5fa}
/* tabela wrapper com scroll vertical para sticky funcionar */
.tw-sess{overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 310px);border:1px solid #333;border-radius:8px}
table{width:100%;border-collapse:collapse;background:#111;min-width:760px}
/* sticky: NÃO pode ter overflow:hidden no table — border-radius fica no wrapper */
th{padding:9px 10px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#1a1a1a;border-bottom:1px solid #333;position:sticky;top:0;z-index:10;white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid #222;font-size:12px;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}
.trap-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-weight:700;font-size:11px}
.t1{background:radial-gradient(circle at 35% 35%, #ff4444, #c00 60%, #8b0000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.4),0 2px 4px rgba(0,0,0,.3)}
.t2{background:radial-gradient(circle at 35% 35%, #4488ff, #1a3db5 60%, #0a1f6b);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.3),0 2px 4px rgba(0,0,0,.3)}
.t3{background:radial-gradient(circle at 35% 35%, #ffffff, #d0d0d0 60%, #a0a0a0);color:#111;box-shadow:inset -2px -2px 4px rgba(0,0,0,.2),inset 1px 1px 3px rgba(255,255,255,.8),0 2px 4px rgba(0,0,0,.25)}
.t4{background:radial-gradient(circle at 35% 35%, #444, #1a1a1a 60%, #000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.6),inset 1px 1px 3px rgba(255,255,255,.15),0 2px 4px rgba(0,0,0,.4)}
.t5{background:radial-gradient(circle at 35% 35%, #ffaa00, #e07000 60%, #a04800);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.3),inset 1px 1px 3px rgba(255,255,255,.4),0 2px 4px rgba(0,0,0,.3)}
.t6{background:radial-gradient(circle at 50% 50%, #cc0000 0%,#cc0000 38%,transparent 38%),repeating-linear-gradient(90deg,#111 0%,#111 50%,#f0f0f0 50%,#f0f0f0 100%) 0/10px;color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.2),0 2px 4px rgba(0,0,0,.4)}
.badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700}
.ba{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}
.bm{background:rgba(249,115,22,.12);color:#f97316;border:1px solid rgba(249,115,22,.25)}
.bb{background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25)}
.sim{color:#22c55e;font-weight:700}.nao{color:#ef4444;font-weight:700}
a{color:#22c55e;text-decoration:none}
h2{font-size:16px;margin-bottom:12px}
/* filtros — mesmo estilo da aba Analisar */
.fp{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;margin-bottom:10px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:8px}
.fp-group{display:flex;align-items:center;gap:5px}
.fp-label{font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
.fp select,.fp input[type=time]{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;color:rgba(255,255,255,.8);font-size:11px;outline:none;cursor:pointer;padding:4px 6px;transition:border .15s}
.fp select{min-width:100px}.fp input[type=time]{color-scheme:dark;width:78px}
.fp select:focus,.fp input[type=time]:focus{border-color:rgba(0,230,118,.5)}
.fp select option{background:#1a1f2e;font-size:12px}
.fp-divider{width:1px;height:16px;background:rgba(255,255,255,.08);flex-shrink:0;margin:0 2px}
.fp-hora-pair{display:flex;align-items:center;gap:4px}
.fp-hora-sep{color:rgba(255,255,255,.2);font-size:10px}
#fp-count-h{font-size:10px;color:rgba(255,255,255,.25);margin-left:auto;white-space:nowrap}
#btn-fp-clr{background:transparent;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:15px;padding:2px 4px;line-height:1;transition:color .2s;flex-shrink:0}
#btn-fp-clr:hover{color:#e53935}
.btn-exp-h{padding:8px 18px;background:#0a0a0a;border:1px solid #3b82f6;color:#60a5fa;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;transition:all .2s}
.btn-exp-h:hover{background:rgba(59,130,246,.08)}
.btn-prt-h{padding:8px 18px;background:#0a0a0a;border:1px solid #a78bfa;color:#a78bfa;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;transition:all .2s}
.btn-prt-h:hover{background:rgba(167,139,250,.08)}
.btn-edit{background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5);border-radius:5px;padding:3px 7px;cursor:pointer;font-size:12px;transition:all .2s;margin-right:4px}
.btn-edit:hover{border-color:#60a5fa;color:#60a5fa}
.btn-save-row{background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#22c55e;border-radius:5px;padding:3px 7px;cursor:pointer;font-size:12px;margin-right:3px}
.btn-cancel-row{background:transparent;border:1px solid rgba(255,255,255,.15);color:#888;border-radius:5px;padding:3px 7px;cursor:pointer;font-size:12px}
.edit-inp{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#fff;padding:3px 5px;font-size:11px;text-align:center;outline:none}
.edit-inp:focus{border-color:#22c55e}
.edit-sel{background:#1a1f2e;border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#fff;padding:3px 5px;font-size:11px;outline:none}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'historico')}
<div class="content">
<div style="margin-bottom:16px"><a href="${BASE}/historico" style="color:#666;font-size:12px">&#8592; Voltar</a></div>
<h2>${sess.name||'Sessao '+sess.id}</h2>
<div class="kpis">
  <div class="kpi b"><div class="kpi-label">Corridas</div><div class="kpi-val">${validRaces.length}</div></div>
  <div class="kpi g"><div class="kpi-label">Acertos</div><div class="kpi-val">${ac}</div></div>
  <div class="kpi o"><div class="kpi-label">Apostas</div><div class="kpi-val">${ap}</div></div>
  <div class="kpi"><div class="kpi-label">Taxa</div><div class="kpi-val" style="color:${ap>0&&ac/ap>=.5?'#22c55e':'#f97316'}">${ap>0?Math.round(ac/ap*100):0}%</div></div>
</div>
<div class="fp" id="fp-h">
  <div class="fp-group"><span class="fp-label">Pista</span><select id="fph-pista"><option value="">Todas</option></select></div>
  <div class="fp-divider"></div>
  <div class="fp-group"><span class="fp-label">Horário BR</span>
    <div class="fp-hora-pair"><input type="time" id="fph-min" title="De"><span class="fp-hora-sep">–</span><input type="time" id="fph-max" title="Até"></div>
  </div>
  <button id="btn-fp-clr" title="Limpar filtros">✕</button>
  <span id="fp-count-h"></span>
</div>
<div class="tw-sess"><table><thead><tr><th>Hora BR</th><th>Corrida</th><th>AvB</th><th>Conf</th><th>Perfis</th><th>Obs</th><th>Odd</th><th>Valor</th><th>Resultado</th><th>Bateu</th><th style="width:60px">Ações</th></tr></thead><tbody id="sess-tb"></tbody></table></div>
<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
  <button class="btn-exp-h" onclick="exportCSV()">Exportar CSV</button>
  <button class="btn-prt-h" onclick="printAnalises()">&#128438; Imprimir Analises</button>
</div>
</div>
<script>
var ALL_RACES=${JSON.stringify(validRaces)};
var fState={pista:'',horaMin:'',horaMax:''};

function getPista(c){if(!c)return'';var p=c.trim().split(' ');if(p.length>1&&/^[A-Z]\d+$/i.test(p[p.length-1]))return p.slice(0,-1).join(' ');return c;}
function cvHora(h){if(!h)return'';var p=h.split(':');var hr=parseInt(p[0]);if(hr>=1&&hr<=9)hr+=12;hr=hr-4;if(hr<0)hr+=24;return hr+':'+p[1];}
function toMin(h){if(!h)return null;var p=h.split(':');return parseInt(p[0]||0)*60+parseInt(p[1]||0);}

function getFiltered(){
  return ALL_RACES.filter(function(r){
    if(fState.pista&&getPista(r.corrida||'')!==fState.pista)return false;
    if(fState.horaMin||fState.horaMax){
      var hbr=r.hora_br||cvHora(r.hora||'');
      var hm=toMin(hbr);
      if(hm!==null){
        if(fState.horaMin&&hm<toMin(fState.horaMin))return false;
        if(fState.horaMax&&hm>toMin(fState.horaMax))return false;
      }
    }
    return true;
  });
}

function renderRows(){
  var filtered=getFiltered();
  var tb=document.getElementById('sess-tb');
  if(!filtered.length){tb.innerHTML='<tr><td colspan="11" style="text-align:center;color:#666;padding:20px">Nenhuma corrida com os filtros selecionados</td></tr>';return;}
  var trapCls=['','t1','t2','t3','t4','t5','t6'];
  tb.innerHTML=filtered.map(function(r){
    var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':'bb';
    var horaBr=r.hora_br||cvHora(r.hora||'-');
    var horaUk=r.hora||'';
    return'<tr data-id="'+r.id+'">' 
      +'<td style="white-space:nowrap"><strong style="color:#22c55e;font-size:13px">'+horaBr+'</strong><div style="font-size:9px;color:rgba(34,197,94,.4)">'+horaUk+'</div></td>'
      +'<td><div style="font-weight:700;font-size:12px">'+(r.corrida||'-')+'</div><div style="font-size:10px;color:#666">'+(r.dist||'')+'</div></td>'
      +'<td style="white-space:nowrap"><span class="trap-badge '+trapCls[r.trap_fav||0]+'">'+r.trap_fav+'</span> vs <span class="trap-badge '+trapCls[r.trap_und||0]+'">'+r.trap_und+'</span></td>'
      +'<td style="white-space:nowrap"><span class="badge '+bc+'">'+r.nivel+'</span><div style="font-size:10px;color:#888;margin-top:2px">'+r.pct+'%</div></td>'
      +'<td style="font-size:10px;color:#888;white-space:nowrap">'+(r.perfil_fav||'')+'<br>'+(r.perfil_und||'')+'</td>'
      +'<td style="font-size:11px;color:#888;max-width:200px;line-height:1.4">'+(r.obs||'-')+'</td>'
      +'<td style="text-align:center">'+(r.odd||'-')+'</td>'
      +'<td style="text-align:center">'+(r.valor?'R$'+r.valor:'-')+'</td>'
      +'<td style="font-size:11px;text-align:center">'+([r.resultado_1,r.resultado_2,r.resultado_3].filter(Boolean).join('/')||'-')+'</td>'
      +'<td style="text-align:center" class="'+(r.bateu==='sim'?'sim':r.bateu==='nao'?'nao':'')+'" id="bateu-cell-'+r.id+'">'+(r.bateu==='sim'?'✓':r.bateu==='nao'?'✗':'-')+'</td>'
      +'<td style="text-align:center"><button class="btn-edit" onclick="editRace('+r.id+')" title="Editar">&#9998;</button></td>'
      +'</tr>';
  }).join('');
  var cnt=document.getElementById('fp-count-h');
  if(cnt)cnt.textContent=filtered.length<ALL_RACES.length?filtered.length+' de '+ALL_RACES.length:''+ALL_RACES.length+' corridas';
}

function editRace(id){
  var tr=document.querySelector('tr[data-id="'+id+'"]');
  if(!tr)return;
  var r=ALL_RACES.find(function(x){return x.id==id;});
  if(!r)return;
  var cells=tr.querySelectorAll('td');
  // Salvar conteúdo original
  tr.setAttribute('data-orig','1');
  // Células editáveis: odd(6), valor(7), resultado(8), bateu(9)
  cells[6].innerHTML='<input class="edit-inp" id="ei-odd-'+id+'" value="'+(r.odd||'')+'" style="width:50px">';
  cells[7].innerHTML='<input class="edit-inp" id="ei-val-'+id+'" value="'+(r.valor||'')+'" style="width:55px">';
  cells[8].innerHTML='<input class="edit-inp" id="ei-r1-'+id+'" value="'+(r.resultado_1||'')+'" style="width:24px"> <input class="edit-inp" id="ei-r2-'+id+'" value="'+(r.resultado_2||'')+'" style="width:24px"> <input class="edit-inp" id="ei-r3-'+id+'" value="'+(r.resultado_3||'')+'" style="width:24px">';
  cells[9].innerHTML='<select class="edit-sel" id="ei-bat-'+id+'"><option value="">-</option><option value="sim"'+(r.bateu==='sim'?' selected':'')+'>Sim</option><option value="nao"'+(r.bateu==='nao'?' selected':'')+'>Não</option></select>';
  cells[10].innerHTML='<button class="btn-save-row" onclick="saveRace('+id+')">✓</button><button class="btn-cancel-row" onclick="renderRows()">✕</button>';
  cells[6].querySelector('input').focus();
}

async function saveRace(id){
  var data={
    odd:document.getElementById('ei-odd-'+id)?.value||'',
    valor:document.getElementById('ei-val-'+id)?.value||'',
    resultado_1:document.getElementById('ei-r1-'+id)?.value||'',
    resultado_2:document.getElementById('ei-r2-'+id)?.value||'',
    resultado_3:document.getElementById('ei-r3-'+id)?.value||'',
    bateu:document.getElementById('ei-bat-'+id)?.value||''
  };
  try{
    var resp=await fetch(BASE+'/api/race/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(resp.ok){
      var r=ALL_RACES.find(function(x){return x.id==id;});
      if(r){Object.assign(r,{odd:data.odd,valor:data.valor,resultado_1:data.resultado_1,resultado_2:data.resultado_2,resultado_3:data.resultado_3,bateu:data.bateu});}
      renderRows();
    } else { alert('Erro ao salvar'); }
  }catch(e){alert('Erro ao salvar: '+e.message);}
}

function initFilter(){
  var pistaSet={};
  ALL_RACES.forEach(function(r){var p=getPista(r.corrida||'');if(p)pistaSet[p]=1;});
  var pistas=Object.keys(pistaSet).sort();
  var sel=document.getElementById('fph-pista');
  pistas.forEach(function(p){var o=document.createElement('option');o.value=p;o.textContent=p;sel.appendChild(o);});
  sel.addEventListener('change',function(){fState.pista=this.value;renderRows();});
  document.getElementById('fph-min').addEventListener('change',function(){fState.horaMin=this.value;renderRows();});
  document.getElementById('fph-max').addEventListener('change',function(){fState.horaMax=this.value;renderRows();});
  document.getElementById('btn-fp-clr').addEventListener('click',function(){
    fState={pista:'',horaMin:'',horaMax:''};
    document.getElementById('fph-pista').value='';
    document.getElementById('fph-min').value='';
    document.getElementById('fph-max').value='';
    renderRows();
  });
}

function exportCSV(){
  var h='HoraBR,HoraUK,Corrida,Dist,TrapFav,Favorito,TrapUnd,Underdog,Conf,Nivel,PerfilFav,PerfilUnd,Obs,Odd,Valor,1o,2o,3o,Bateu';
  var rows=ALL_RACES.map(function(r){return[r.hora_br||cvHora(r.hora||''),r.hora||'',r.corrida||'',r.dist||'',r.trap_fav||'',r.name_fav||'',r.trap_und||'',r.name_und||'',r.pct||'',r.nivel||'',r.perfil_fav||'',r.perfil_und||'',(r.obs||'').replace(/,/g,';'),r.odd||'',r.valor||'',r.resultado_1||'',r.resultado_2||'',r.resultado_3||'',r.bateu||''].join(',');});
  var b=new Blob([[h].concat(rows).join(String.fromCharCode(10))],{type:'text/csv'});
  var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='sessao_greyhound.csv';a.click();
}
function printAnalises(){
  var data=getFiltered();
  if(!data.length){alert('Nenhum AvB para imprimir.');return;}
  var rows=data.map(function(r){
    var horaBr=r.hora_br||cvHora(r.hora||'-');
    return'<tr><td style="text-align:center;vertical-align:middle"><strong>'+horaBr+'</strong><br><small style="color:#666">'+(r.hora||'')+'</small></td><td style="vertical-align:middle"><b>'+(r.corrida||'-')+'</b><br><small>'+(r.dist||'')+'</small></td><td style="text-align:center;font-weight:700;font-size:10px">T'+r.trap_fav+' > T'+r.trap_und+'</td><td style="text-align:center">'+(r.pct||'-')+'%</td><td style="font-size:9px;line-height:1.5">'+(r.obs||'-').replace(/CalTm/gi,'Tempo')+'</td></tr>';
  }).join('');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#000;background:#fff;padding:10px}h2{font-size:13px;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #333}table{width:100%;border-collapse:collapse}th{background:#555;color:#fff;border:1px solid #444;padding:6px 8px;text-align:center;font-size:8px;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact}td{border:1px solid #ddd;padding:4px 6px;vertical-align:middle}tr:nth-child(even) td{background:#f5f5f5;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><h2>Greyhound Factory — ${sess.name||'Sessao'}</h2><table><thead><tr><th style="width:60px">Hora BR</th><th style="width:120px">Corrida</th><th style="width:85px;white-space:nowrap">AvB</th><th style="width:40px">Conf</th><th>Observacao</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>';
  var w=window.open('','_blank');w.document.write(html);w.document.close();w.addEventListener('afterprint',function(){w.close();});setTimeout(function(){w.print();},600);
}

initFilter();
renderRows();
</script>
</body></html>`);
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