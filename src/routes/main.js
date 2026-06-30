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
    </div>
    <div style="display:flex;align-items:center;gap:14px">
      <span style="font-size:11px;color:#666">${user.name} · <span style="color:#${user.plan==='premium'?'a78bfa':user.plan==='pro'?'60a5fa':'888'}">${user.plan}</span> · ${user.analyses_used}/${user.analyses_limit===999999?'∞':user.analyses_limit} analises</span>
      <a href="${BASE}/logout" style="font-size:11px;color:#666;text-decoration:none;border:1px solid #333;padding:4px 10px;border-radius:4px">Sair</a>
    </div>
  </nav>
  <style>.nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}.nl:hover,.na{color:#22c55e!important;border-bottom-color:#22c55e!important}</style>`;
}

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
.trap-badge{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-weight:700;font-size:12px;border:2px solid transparent}
.t1{background:#dc2626;color:#fff;border-color:#ef4444}.t2{background:#2563eb;color:#fff;border-color:#3b82f6}
.t3{background:#e5e7eb;color:#111;border-color:#d1d5db}.t4{background:#111;color:#fff;border-color:#444}
.t5{background:#d97706;color:#000;border-color:#f59e0b}.t6{background:#111;color:#f59e0b;border-color:#f59e0b}
.trap-row{display:flex;align-items:center;gap:6px}.trap-item{display:flex;flex-direction:column;align-items:center;gap:2px}
.trap-name{font-size:9px;color:var(--mut);text-align:center;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trap-vs{color:var(--mut);font-size:12px;font-weight:600}
.perfil-badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600}
.p-rec{background:rgba(34,197,94,.15);color:var(--grn)}.p-fum{background:rgba(239,68,68,.12);color:var(--red)}
.p-est{background:rgba(100,100,100,.15);color:var(--mut2)}.p-fro{background:rgba(249,115,22,.12);color:var(--org)}
.win-tag{display:inline-flex;align-items:center;font-size:9px;color:rgba(249,115,22,.6);border:1px solid rgba(249,115,22,.2);border-radius:3px;padding:1px 5px;margin-top:3px;background:rgba(249,115,22,.04)}
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
  .win-tag,.hora-br{display:none!important}
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

<script>
var raceFiles=[],capFiles=[],results=[],capModalFilesList=[];
var BASE='${BASE}';
var SS_KEY='ghf_results_v1';
function saveSessionState(){try{sessionStorage.setItem(SS_KEY,JSON.stringify({results:results,raceNames:raceFiles.map(function(f){return f.name;})}));}catch(e){}}
function clearSessionState(){try{sessionStorage.removeItem(SS_KEY);}catch(e){}}
function restoreSessionState(){try{var raw=sessionStorage.getItem(SS_KEY);if(!raw)return false;var data=JSON.parse(raw);if(data&&Array.isArray(data.results)&&data.results.length){results=data.results;return true;}}catch(e){}return false;}

function readB64(file){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(e){res(e.target.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});}
function trapClass(n){return['','t1','t2','t3','t4','t5','t6'][n]||'t1';}
function perfilBadge(p){if(!p)return'';var c=p==='Recuperador'?'p-rec':p==='Fumador'?'p-fum':p==='Frontrunner'?'p-fro':'p-est';var i=p==='Recuperador'?'&#128170;':p==='Fumador'?'&#128684;':p==='Frontrunner'?'&#9889;':'&#10145;';return'<span class="perfil-badge '+c+'">'+i+' '+p+'</span>';}
function convertHora(h){if(!h)return'';var p=h.split(':');var hr=parseInt(p[0])-4;if(hr<0)hr+=24;return hr+':'+p[1];}
function setSt(m){document.getElementById('st').textContent=m;}
function prog(p,t){document.getElementById('pw').style.display='block';document.getElementById('pf').style.width=p+'%';document.getElementById('pt').textContent=t;}
function addFI(name,id){var list=document.getElementById('rlist');var d=document.createElement('div');d.className='fi';d.id='fi-'+id;var sn=name.length>22?name.slice(0,20)+'...':name;d.innerHTML='<span class="fi-name">'+sn+'</span><span class="fi-st fi-load" id="fis-'+id+'">...</span><button class="fi-rm" data-id="'+id+'">x</button>';list.appendChild(d);}
function updFI(id,ok){var el=document.getElementById('fis-'+id);if(!el)return;el.className='fi-st '+(ok?'fi-ok':'fi-err');el.textContent=ok?'OK':'erro';}
function updCards(){var avbs=results.filter(function(r){return r.nivel!=='skip';});var alta=results.filter(function(r){return r.nivel==='alta';}).length;document.getElementById('sp').textContent=raceFiles.length||'-';document.getElementById('sa').textContent=avbs.length||'-';document.getElementById('sal').textContent=alta||'-';}

function renderTable(){
  var tb=document.getElementById('tb');
  if(!results.length){tb.innerHTML='<tr><td colspan="11"><div class="empty"><h3>Sem resultados</h3></div></td></tr>';document.getElementById('ab').style.display='none';return;}
  var winMap={};
  results.forEach(function(r){if(r.tipo==='vencedor'&&r.nivel!=='skip'&&r.trapFav)winMap[(r.hora||'')+'_'+(r.corrida||'')]=r;});
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  var rows='';
  avbs.forEach(function(r,i){
    var sk=r.nivel==='skip';
    var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':r.nivel==='baixa'?'bb':'bs';
    var bt=r.nivel==='alta'?'Alta':r.nivel==='media'?'Media':r.nivel==='baixa'?'Baixa':'Skip';
    var fc=r.pct>=65?'cfg':r.pct>=50?'cfa':'cfr';
    var tf=r.trapFav||0,tu=r.trapUnd||0,nf=r.nameFav||'',nu=r.nameUnd||'';
    var wd=winMap[(r.hora||'')+'_'+(r.corrida||'')];
    var wt=wd?'<div class="win-tag">&#127942; Back T'+wd.trapFav+' '+((wd.nameFav||'').split(' ')[0])+'</div>':'';
    var hh='<strong style="color:var(--grn)">'+(r.hora||'-')+'</strong><div class="hora-br">'+convertHora(r.hora)+'</div>'+wt;
    var sh=sk?'<span style="color:var(--mut)">Descartada</span>':'<div class="trap-row"><div class="trap-item"><div class="trap-badge '+trapClass(tf)+'">'+tf+'</div><div class="trap-name">'+nf+'</div></div><span class="trap-vs">vs</span><div class="trap-item"><div class="trap-badge '+trapClass(tu)+'">'+tu+'</div><div class="trap-name">'+nu+'</div></div></div>';
    var ph=perfilBadge(r.perfilFav)+(r.perfilUnd?'<br>'+perfilBadge(r.perfilUnd):'');
    var ch=sk?'':'<span class="badge '+bc+'">'+bt+'</span><br><span style="font-size:10px;color:var(--mut)">'+r.pct+'%</span><span class="cbar"><span class="cfill '+fc+'" style="width:'+r.pct+'%"></span></span>';
    var oc=r.needsCap?'obs-cap':'obs-c';
    var cap=r.needsCap?'<button class="cap-btn" data-fav="'+nf+'" data-und="'+nu+'">Cap</button>':'<span class="cap-ok">OK</span>';
    var rh=sk?'-':'<input type="text" placeholder="1" data-i="'+i+'" data-f="r1" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="2" data-i="'+i+'" data-f="r2" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="3" data-i="'+i+'" data-f="r3" style="width:50px">';
    var obsText=(r.obs||'-').replace(/CalTm/gi,'Tempo');
    var oddValHtml=sk?'-':'<div style="display:flex;flex-direction:column;gap:6px;align-items:center"><div style="display:flex;flex-direction:column;gap:2px;align-items:center"><span style="font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">Odd</span><input type="text" placeholder="-" data-i="'+i+'" data-f="odd" style="width:52px;text-align:center"></div><div style="display:flex;flex-direction:column;gap:2px;align-items:center"><span style="font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">Valor R$</span><input type="text" placeholder="0" data-i="'+i+'" data-f="valor" style="width:52px;text-align:center"></div></div>';
    rows+='<tr class="row-avb'+(sk?' sk':'')+'">'
      +'<td style="text-align:center">'+hh+'</td>'
      +'<td><div style="font-weight:700;font-size:12px">'+(r.corrida||'-')+'</div><div style="font-size:10px;color:var(--mut)">'+(r.dist||'')+'</div></td>'
      +'<td style="text-align:center">'+sh+'</td>'
      +'<td style="text-align:center">'+ch+'</td>'
      +'<td style="font-size:12px;line-height:1.6">'+(r.needsCap?'<span class="obs-cap">'+obsText+'</span>':'<span class="obs-c">'+obsText+'</span>')+'</td>'
      +'<td style="text-align:center">'+oddValHtml+'</td>'
      +'<td style="text-align:center">'+rh+'</td>'
      +'<td style="text-align:center"><select data-i="'+i+'" data-f="hit" style="text-align:center"><option value="">-</option><option value="sim">Sim</option><option value="nao">Nao</option></select></td>'
      +'<td style="text-align:center">'+cap+'</td>'
      +'</tr>';
  });
  tb.innerHTML=rows;
  document.getElementById('ab').style.display='flex';
  updCards();
}

async function runAnalysis(){
  if(!raceFiles.length){alert('Carregue pelo menos um PDF.');return;}
  document.getElementById('btngo').disabled=true;
  document.getElementById('btngo').innerHTML='<span class="spinner"></span>Analisando...';
  prog(5,'Preparando...');results=[];
  try{
    var fd=new FormData();
    raceFiles.forEach(function(f){fd.append('pdfs',new Blob([Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0))],{type:'application/pdf'}),f.name);});
    capFiles.forEach(function(f){fd.append('caps',new Blob([Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0))],{type:f.mime}),f.name);});
    prog(30,'Enviando...');
    var resp=await fetch(BASE+'/api/analyze',{method:'POST',body:fd});
    prog(80,'Processando...');
    if(!resp.ok){var e=await resp.json();throw new Error(e.error||'Erro '+resp.status);}
    var data=await resp.json();
    if(data.limitReached){alert('Limite de analises atingido! Fale com o administrador.');document.getElementById('btngo').disabled=false;document.getElementById('btngo').innerHTML='Analisar Corridas';return;}
    results=data.races||[];
    prog(95,'Montando...');renderTable();
    saveSessionState();
    setSt('Concluido: '+results.filter(function(r){return r.nivel!=='skip';}).length+' AvBs');
    prog(100,'');setTimeout(function(){document.getElementById('pw').style.display='none';},1200);
  }catch(ex){setSt('Erro: '+ex.message);alert('Erro: '+ex.message);document.getElementById('pw').style.display='none';}
  document.getElementById('btngo').disabled=false;
  document.getElementById('btngo').innerHTML='Analisar Corridas';
}

document.addEventListener('DOMContentLoaded',function(){
  if(restoreSessionState()){renderTable();updCards();setSt('Restaurado: '+results.filter(function(r){return r.nivel!=='skip';}).length+' AvBs');}
  document.getElementById('race-input').addEventListener('change',async function(){
    for(var i=0;i<this.files.length;i++){var file=this.files[i],id='f'+Date.now()+i;addFI(file.name,id);try{var b64=await readB64(file);raceFiles.push({name:file.name,b64:b64,id:id,mime:'application/pdf'});updFI(id,true);}catch(e){updFI(id,false);}}updCards();
  });
  document.getElementById('rz').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
  document.getElementById('rz').addEventListener('dragleave',function(){this.classList.remove('drag');});
  document.getElementById('rz').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag');var inp=document.getElementById('race-input');inp.files=e.dataTransfer.files;inp.dispatchEvent(new Event('change'));});
  document.getElementById('rlist').addEventListener('click',function(e){if(e.target.classList.contains('fi-rm')){var id=e.target.getAttribute('data-id');raceFiles=raceFiles.filter(function(f){return f.id!==id;});var el=document.getElementById('fi-'+id);if(el)el.remove();updCards();}});
  document.getElementById('btngo').addEventListener('click',runAnalysis);
  document.getElementById('btn-clear').addEventListener('click',function(){raceFiles=[];capFiles=[];results=[];clearSessionState();document.getElementById('rlist').innerHTML='';document.getElementById('tb').innerHTML='<tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida analisada</h3></div></td></tr>';document.getElementById('ab').style.display='none';document.getElementById('pw').style.display='none';setSt('');updCards();});
  document.getElementById('btn-save').addEventListener('click',async function(){var name=prompt('Nome da sessao (ex: Clonmel 28/06):');if(!name)return;var avbs=results.filter(function(r){return r.tipo==='avb';});var resp=await fetch(BASE+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,races:avbs})});if(resp.ok){alert('Sessao salva!');location.reload();}else alert('Erro ao salvar.');});
  document.getElementById('tb').addEventListener('input',function(e){var el=e.target,i=parseInt(el.getAttribute('data-i')),f=el.getAttribute('data-f');if(!isNaN(i)&&f&&results[i]){results[i][f]=el.value;saveSessionState();}});
  document.getElementById('tb').addEventListener('change',function(e){var el=e.target,i=parseInt(el.getAttribute('data-i')),f=el.getAttribute('data-f');if(!isNaN(i)&&f&&results[i]){results[i][f]=el.value;if(f==='hit'){el.style.color=el.value==='sim'?'var(--grn)':el.value==='nao'?'var(--red)':'var(--txt)';}saveSessionState();}});
  document.getElementById('tb').addEventListener('click',function(e){if(e.target.classList.contains('cap-btn')){document.getElementById('cm-body').textContent='Carregue capivara de '+e.target.getAttribute('data-fav');document.getElementById('cap-modal-list').innerHTML='';document.getElementById('cap-st').style.display='none';document.getElementById('btn-cap-ok').disabled=true;capModalFilesList=[];document.getElementById('cap-modal').classList.add('open');}});
  document.getElementById('cap-modal-inp').addEventListener('change',async function(){for(var i=0;i<this.files.length;i++){var file=this.files[i],id='cm'+Date.now()+i;try{var b64=await readB64(file);var isImg=/\.(jpg|jpeg|png|webp)$/i.test(file.name);capModalFilesList.push({name:file.name,b64:b64,id:id,mime:isImg?file.type:'application/pdf',isImg:isImg});var d=document.createElement('div');d.className='fi';d.innerHTML='<span class="fi-name">'+file.name+'</span><span class="fi-st fi-ok">OK</span>';document.getElementById('cap-modal-list').appendChild(d);document.getElementById('btn-cap-ok').disabled=false;}catch(e){alert('Erro ao ler.');}}});
  document.getElementById('btn-cap-cancel').addEventListener('click',function(){document.getElementById('cap-modal').classList.remove('open');});

  // Ctrl+V para colar imagem no modal de capivara
  document.addEventListener('paste', async function(e) {
    if (!document.getElementById('cap-modal').classList.contains('open')) return;
    var items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        var file = items[i].getAsFile();
        var id = 'cm'+Date.now();
        try {
          var b64 = await readB64(file);
          capModalFilesList.push({name:'capivara-colada.png',b64:b64,id:id,mime:'image/png',isImg:true});
          var d = document.createElement('div'); d.className = 'fi';
          d.innerHTML = '<span class="fi-name">&#128247; Imagem colada</span><span class="fi-st fi-ok">OK</span>';
          document.getElementById('cap-modal-list').appendChild(d);
          var st = document.getElementById('cap-st');
          st.className = 'cap-st ok'; st.textContent = 'Imagem colada com sucesso!'; st.style.display = 'block';
          document.getElementById('btn-cap-ok').disabled = false;
        } catch(err) { console.error('Erro ao colar:', err); }
      }
    }
  });
  document.getElementById('btn-cap-ok').addEventListener('click',async function(){if(!capModalFilesList.length)return;capFiles=capModalFilesList.slice();document.getElementById('cap-modal').classList.remove('open');await runAnalysis();});
  document.getElementById('btn-print').addEventListener('click',function(){
    var avbs=results.filter(function(r){return r.nivel!=='skip' && r.tipo==='avb';});
    if(!avbs.length){alert('Nenhuma corrida para imprimir.');return;}
    var rows=avbs.map(function(r){
      var tf=r.trapFav||'?', tu=r.trapUnd||'?';
      var avbStr='T'+tf+' > T'+tu;
      var obsClean=(r.obs||'-').replace(/CalTm/gi,'Tempo');
      return'<tr>'
        +'<td style="text-align:center;vertical-align:middle">'+convertHora(r.hora||'-')+'<br><small style="color:#666">'+( r.hora||'')+'</small></td>'
        +'<td style="vertical-align:middle"><b>'+(r.corrida||'-')+'</b><br><small>'+(r.dist||'')+'</small></td>'
        +'<td style="text-align:center;vertical-align:middle;font-weight:700;font-size:10px">'+avbStr+'</td>'
        +'<td style="text-align:center;vertical-align:middle">'+(r.pct||'-')+'%</td>'
        +'<td style="font-size:9px;line-height:1.5;vertical-align:middle">'+obsClean+'</td>'
        +'</tr>';
    }).join('');
    var nowD=new Date();var ddmm=String(nowD.getDate()).padStart(2,'0')+String(nowD.getMonth()+1).padStart(2,'0')+nowD.getFullYear();
    var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Analises_Greyhound_'+ddmm+'</title>'
      +'<style>'
      +'*{box-sizing:border-box;margin:0;padding:0}'
      +'body{font-family:Arial,sans-serif;font-size:10px;color:#000;background:#fff;padding:10px}'
      +'h2{font-size:13px;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #333}'
      +'table{width:100%;border-collapse:collapse;font-size:9px}'
      +'thead tr{background:#555;color:#fff}'
      +'th{background:#555;color:#fff;border:1px solid #444;padding:6px 8px;text-align:center;font-size:8px;text-transform:uppercase;letter-spacing:.6px;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
      +'td{border:1px solid #ddd;padding:4px 6px;vertical-align:middle}'
      +'tr:nth-child(even) td{background:#f5f5f5;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
      +'small{color:#777;font-size:8px}'
      +'@media print{'
      +'body{padding:4px}'
      +'thead tr{background:#555!important;color:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'
      +'th{background:#555!important;color:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'
      +'tr:nth-child(even) td{background:#f5f5f5!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'
      +'}'
      +'</style></head><body>'
      +'<h2>Greyhound Factory — Analises do dia</h2>'
      +'<table>'
      +'<thead><tr>'
      +'<th style="width:60px">Hora BR</th>'
      +'<th style="width:130px">Corrida</th>'
      +'<th style="width:65px">AvB</th>'
      +'<th style="width:40px">Conf</th>'
      +'<th>Observacao</th>'
      +'</tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'</table>'
      +'</body></html>';
    var w=window.open('','_blank');
    w.document.write(html);
    w.document.close();
    w.addEventListener('afterprint',function(){w.close();});
    setTimeout(function(){w.print();},600);
  });
  document.getElementById('btn-pdf-ready-ok').addEventListener('click',function(){document.getElementById('pdf-ready-modal').classList.remove('open');});
  document.getElementById('btn-exp').addEventListener('click',function(){var h='Hora,HoraBR,Corrida,Dist,TrapFav,Favorito,TrapUnd,Underdog,Conf,Nivel,PerfilFav,PerfilUnd,Obs,Odd,Valor,1o,2o,3o,Bateu';var avbs=results.filter(function(r){return r.tipo==='avb';});var rows=avbs.map(function(r){return[r.hora,convertHora(r.hora),r.corrida,r.dist,r.trapFav||'',r.nameFav||'',r.trapUnd||'',r.nameUnd||'',r.pct,r.nivel,r.perfilFav||'',r.perfilUnd||'',r.obs||'',r.odd||'',r.valor||'',r.r1||'',r.r2||'',r.r3||'',r.hit||''].join(',');});var b=new Blob([[h].concat(rows).join(String.fromCharCode(10))],{type:'text/csv'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='greyhound_'+new Date().toISOString().slice(0,10)+'.csv';a.click();});
});
</script></body></html>`);
});

router.get('/historico', (req, res) => {
  const user = req.user;
  const sessions = db.prepare('SELECT * FROM race_sessions WHERE user_id=? ORDER BY created_at DESC').all(user.id);
  const stats = db.prepare("SELECT COUNT(*) as t, SUM(CASE WHEN bateu='sim' THEN 1 ELSE 0 END) as a FROM races WHERE user_id=? AND bateu IS NOT NULL AND bateu!=''").get(user.id);
  const logoB64 = getLogo();
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Historico - Greyhound Validator</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}.content{padding:24px;max-width:900px;margin:0 auto}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.kpi{background:#111;border:1px solid #333;border-radius:8px;padding:14px;position:relative;overflow:hidden}.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.kpi.g::before{background:#22c55e}.kpi.o::before{background:#f97316}.kpi.b::before{background:#3b82f6}.kpi-label{font-size:10px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}.kpi-val{font-size:26px;font-weight:700}.kpi.g .kpi-val{color:#22c55e}.kpi.o .kpi-val{color:#f97316}.kpi.b .kpi-val{color:#60a5fa}h2{font-size:16px;font-weight:700;margin-bottom:12px}table{width:100%;border-collapse:collapse;background:#111;border:1px solid #333;border-radius:8px;overflow:hidden}th{padding:10px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#1a1a1a;border-bottom:1px solid #333}td{padding:10px 12px;border-bottom:1px solid #222;font-size:13px}tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}a{color:#22c55e;text-decoration:none}a:hover{text-decoration:underline}.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}</style></head><body>
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
${sessions.map(s=>`<tr><td>${new Date(s.created_at).toLocaleDateString('pt-BR')}</td><td>${s.name||'Sem nome'}</td><td><span class="badge">${s.total_avbs||0}</span></td><td><a href="${BASE}/sessao/${s.id}">Ver detalhes</a></td></tr>`).join('')}
${!sessions.length?'<tr><td colspan="4" style="text-align:center;color:#666;padding:30px">Nenhuma sessao salva</td></tr>':''}
</tbody></table>
</div></body></html>`);
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
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}.content{padding:24px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}.kpi{background:#111;border:1px solid #333;border-radius:8px;padding:12px 14px;position:relative;overflow:hidden}.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.kpi.g::before{background:#22c55e}.kpi.o::before{background:#f97316}.kpi.b::before{background:#3b82f6}.kpi-label{font-size:10px;color:#888;margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}.kpi-val{font-size:22px;font-weight:700}.kpi.g .kpi-val{color:#22c55e}.kpi.o .kpi-val{color:#f97316}.kpi.b .kpi-val{color:#60a5fa}table{width:100%;border-collapse:collapse;border:1px solid #333;border-radius:8px;overflow:hidden;background:#111}th{padding:9px 10px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#1a1a1a;border-bottom:1px solid #333}td{padding:8px 10px;border-bottom:1px solid #222;font-size:12px;vertical-align:middle}tr:last-child td{border-bottom:none}.trap-badge{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-weight:700;font-size:11px}.t1{background:#dc2626;color:#fff}.t2{background:#2563eb;color:#fff}.t3{background:#e5e7eb;color:#111}.t4{background:#111;color:#fff;border:1px solid #444}.t5{background:#d97706;color:#000}.t6{background:#111;color:#f59e0b;border:1px solid #f59e0b}.badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700}.ba{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}.bm{background:rgba(249,115,22,.12);color:#f97316;border:1px solid rgba(249,115,22,.25)}.bb{background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25)}.sim{color:#22c55e;font-weight:700}.nao{color:#ef4444;font-weight:700}a{color:#22c55e;text-decoration:none}h2{font-size:16px;margin-bottom:12px}</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'historico')}
<div class="content">
<div style="margin-bottom:16px"><a href="${BASE}/historico" style="color:#666;font-size:12px">&#8592; Voltar</a></div>
<h2>${sess.name||'Sessao '+sess.id}</h2>
<div class="kpis">
<div class="kpi b"><div class="kpi-label">Corridas</div><div class="kpi-val">${races.length}</div></div>
<div class="kpi g"><div class="kpi-label">Acertos</div><div class="kpi-val">${ac}</div></div>
<div class="kpi o"><div class="kpi-label">Apostas</div><div class="kpi-val">${ap}</div></div>
<div class="kpi"><div class="kpi-label">Taxa</div><div class="kpi-val" style="color:${ap>0&&ac/ap>=.5?'#22c55e':'#f97316'}">${ap>0?Math.round(ac/ap*100):0}%</div></div>
</div>
<table><thead><tr><th>Hora</th><th>Corrida</th><th>AvB</th><th>Conf</th><th>Perfis</th><th>Obs</th><th>Odd</th><th>Valor</th><th>Resultado</th><th>Bateu</th></tr></thead><tbody>
${races.map(r=>{var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':'bb';return`<tr><td><strong style="color:#22c55e">${r.hora||'-'}</strong><div style="font-size:10px;color:rgba(34,197,94,.5)">${r.hora_br||''}</div></td><td><div style="font-weight:700">${r.corrida||'-'}</div><div style="font-size:10px;color:#666">${r.dist||''}</div></td><td><span class="trap-badge t${r.trap_fav}">${r.trap_fav}</span> vs <span class="trap-badge t${r.trap_und}">${r.trap_und}</span></td><td><span class="badge ${bc}">${r.nivel}</span> ${r.pct}%</td><td style="font-size:10px">${r.perfil_fav||''}<br>${r.perfil_und||''}</td><td style="font-size:11px;color:#888;max-width:160px">${r.obs||'-'}</td><td>${r.odd||'-'}</td><td>${r.valor?'R$ '+r.valor:'-'}</td><td style="font-size:11px">${[r.resultado_1,r.resultado_2,r.resultado_3].filter(Boolean).join(' / ')||'-'}</td><td class="${r.bateu==='sim'?'sim':r.bateu==='nao'?'nao':''}">${r.bateu==='sim'?'&#10003; Sim':r.bateu==='nao'?'&#10007; Nao':'-'}</td></tr>`;}).join('')}
</tbody></table>
</div></body></html>`);
});

module.exports = router;