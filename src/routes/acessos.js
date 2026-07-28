// ============================================================================
// Tela "Acessos" — painel de controle de permissoes por perfil (RBAC).
// Layout com barra lateral esquerda (igual Configuracoes): categorias na
// lateral, e no conteudo os itens (telas/secoes/botoes) com liga/desliga
// para o perfil selecionado. Permite criar, renomear e excluir perfis.
// So Admin acessa. Admin sempre libera tudo (bypass) — toggles ficam travados.
// ============================================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');
const { navBar } = require('./main');
const { designTokensCSS } = require('../utils/designTokens');
const { ACCESS_CATEGORIES } = require('../access/registry');
const store = require('../access/store');

const BASE = process.env.BASE_PATH || '/greyhound';

function getLogo() {
  const p = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(p)) return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  return '';
}

router.get('/', requireAdmin, (req, res) => {
  const logoB64 = getLogo();
  const profiles = store.listProfiles();
  const permsByProfile = {};
  profiles.forEach(p => { permsByProfile[p.id] = store.getProfilePerms(p.id); });

  const DATA = JSON.stringify({ profiles, cats: ACCESS_CATEGORIES, perms: permsByProfile });

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acessos - Greyhound Validator</title>
<style>
${designTokensCSS()}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
.content{padding:24px;max-width:1200px;margin:0 auto}
h1{font-size:20px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:#888;margin-bottom:18px}
.prof-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:18px}
.prof-pill{padding:8px 14px;background:#161B27;border:1px solid #222;border-radius:20px;color:#aaa;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
.prof-pill:hover{border-color:#22c55e;color:#ccc}
.prof-pill.active{background:rgba(34,197,94,.14);border-color:#22c55e;color:#22c55e}
.prof-pill .badge-sys{font-size:9px;color:#f97316;margin-left:5px}
.prof-add{padding:8px 12px;background:transparent;border:1px dashed #333;border-radius:20px;color:#22c55e;font-size:12px;font-weight:600;cursor:pointer}
.prof-actions{display:flex;gap:8px;margin-bottom:16px}
.prof-actions button{font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid #333;background:transparent;color:#888;cursor:pointer}
.prof-actions button:hover{border-color:#22c55e;color:#22c55e}
.prof-actions button.danger:hover{border-color:#ef4444;color:#ef4444}
.info-box{background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.2);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#f97316;line-height:1.6}
.layout{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
.tabnav{background:#161B27;border:1px solid #222;border-radius:10px;padding:8px;position:sticky;top:16px;display:flex;flex-direction:column;gap:2px}
.tabbtn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:#888;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;transition:all .15s}
.tabbtn:hover{background:rgba(34,197,94,.08);color:#ccc}
.tabbtn.active{background:rgba(34,197,94,.12);color:#22c55e}
.tabbtn .cnt{font-size:10px;color:#666;font-weight:600}
.section{background:#161B27;border:1px solid #222;border-radius:10px;padding:12px 8px}
.acc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-bottom:1px solid #1e2430}
.acc-row:last-child{border-bottom:none}
.acc-row .lbl{font-size:13px;color:#ddd}
.acc-row .k{font-size:10px;color:#555;font-family:monospace;margin-top:2px}
.sw{position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0}
.sw input{opacity:0;width:0;height:0}
.sw .sl{position:absolute;cursor:pointer;inset:0;background:#333;border-radius:24px;transition:.15s}
.sw .sl:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.15s}
.sw input:checked+.sl{background:#22c55e}
.sw input:checked+.sl:before{transform:translateX(18px)}
.sw input:disabled+.sl{opacity:.45;cursor:not-allowed}
.btn-bar{display:flex;align-items:center;gap:12px;position:sticky;bottom:0;background:#0D1117;padding:14px 0;margin-top:14px;border-top:1px solid #222}
.btn-save{padding:12px 28px;background:#22c55e;color:#000;font-weight:700;font-size:14px;border:none;border-radius:6px;cursor:pointer}
.btn-save:hover{background:#16a34a}
.btn-ghost{padding:10px 16px;background:transparent;color:#888;font-size:13px;border:1px solid #222;border-radius:6px;cursor:pointer}
.toolbtn{font-size:11px;color:#60a5fa;background:none;border:none;cursor:pointer;padding:0}
.acc-tools{display:flex;gap:14px;padding:0 12px 10px;border-bottom:1px solid #1e2430;margin-bottom:2px}
.alert{padding:12px 16px;border-radius:6px;font-size:13px;margin-bottom:14px;display:none}
.alert.ok{background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2)}
@media(max-width:800px){
  html,body{overflow-x:hidden}
  .content{padding:14px 12px}
  .layout{grid-template-columns:1fr}
  .tabnav{position:static;flex-direction:row;overflow-x:auto;gap:4px;-webkit-overflow-scrolling:touch}
  .tabnav .tabbtn{width:auto;white-space:nowrap;flex-shrink:0}
}
</style></head><body>
${req.query.embed ? '' : `<div class="hero">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : ''}</div>`}
${req.query.embed ? '' : navBar(req.user, 'acessos')}
<div class="content">
${req.query.embed ? '' : '<h1>Controle de Acessos</h1>'}
<p class="sub">Escolha um perfil e ligue/desligue o que ele pode ver e usar. O perfil Admin libera tudo automaticamente.</p>
<div class="alert ok" id="alert"></div>

<div class="prof-bar" id="prof-bar"></div>
<div class="prof-actions" id="prof-actions"></div>
<div class="info-box" id="admin-note" style="display:none">Este e o perfil Admin: ele tem acesso total a tudo e nao pode ser restringido.</div>

<div class="layout">
  <div class="tabnav" id="tabnav"></div>
  <div>
    <div class="section" id="items"></div>
    <div class="btn-bar">
      <button class="btn-save" id="btn-save" onclick="salvar()">Salvar acessos</button>
      <button class="btn-ghost" onclick="location.reload()">Descartar</button>
    </div>
  </div>
</div>
</div>

<script>
var BASE='${BASE}';
var DATA=${DATA};
var profiles=DATA.profiles, cats=DATA.cats, perms=DATA.perms;
var activeProfile=(profiles.find(function(p){return !p.is_admin;})||profiles[0]).id;
var activeCat=cats[0].key;

function permVal(pid,key){ var m=perms[pid]||{}; return (key in m)?!!m[key]:true; } // default-allow

function renderProfiles(){
  var bar=document.getElementById('prof-bar'); bar.innerHTML='';
  profiles.forEach(function(p){
    var b=document.createElement('button');
    b.className='prof-pill'+(p.id===activeProfile?' active':'');
    b.innerHTML=p.name+(p.is_system?'<span class="badge-sys">fixo</span>':'');
    b.onclick=function(){ activeProfile=p.id; renderAll(); };
    bar.appendChild(b);
  });
  var add=document.createElement('button');
  add.className='prof-add'; add.textContent='+ Novo perfil';
  add.onclick=novoPerfil; bar.appendChild(add);

  var act=document.getElementById('prof-actions'); act.innerHTML='';
  var cur=profiles.find(function(p){return p.id===activeProfile;});
  document.getElementById('admin-note').style.display=(cur&&cur.is_admin)?'block':'none';
  if(cur && !cur.is_admin){
    var rn=document.createElement('button'); rn.textContent='Renomear'; rn.onclick=function(){renomearPerfil(cur);}; act.appendChild(rn);
    if(!cur.is_system){ var dl=document.createElement('button'); dl.className='danger'; dl.textContent='Excluir perfil'; dl.onclick=function(){excluirPerfil(cur);}; act.appendChild(dl); }
  }
}
function renderTabs(){
  var nav=document.getElementById('tabnav'); nav.innerHTML='';
  cats.forEach(function(c){
    var b=document.createElement('button');
    b.className='tabbtn'+(c.key===activeCat?' active':'');
    b.innerHTML='<span>'+c.label+'</span><span class="cnt">'+c.items.length+'</span>';
    b.onclick=function(){ activeCat=c.key; renderItems(); renderTabs(); };
    nav.appendChild(b);
  });
}
function renderItems(){
  var box=document.getElementById('items'); box.innerHTML='';
  var cur=profiles.find(function(p){return p.id===activeProfile;});
  var isAdmin=cur&&cur.is_admin;
  var cat=cats.find(function(c){return c.key===activeCat;});
  var tools=document.createElement('div'); tools.className='acc-tools';
  var all=document.createElement('button'); all.className='toolbtn'; all.textContent='Marcar tudo';
  all.onclick=function(){ setAllInCat(true); }; tools.appendChild(all);
  var none=document.createElement('button'); none.className='toolbtn'; none.style.color='#ef4444'; none.textContent='Desmarcar tudo';
  none.onclick=function(){ setAllInCat(false); }; tools.appendChild(none);
  if(!isAdmin) box.appendChild(tools);
  cat.items.forEach(function(it){
    var row=document.createElement('div'); row.className='acc-row';
    var left=document.createElement('div');
    left.innerHTML='<div class="lbl">'+it.label+'</div><div class="k">'+it.key+'</div>';
    var sw=document.createElement('label'); sw.className='sw';
    var inp=document.createElement('input'); inp.type='checkbox';
    inp.checked=isAdmin?true:permVal(activeProfile,it.key);
    inp.disabled=!!isAdmin;
    inp.setAttribute('data-key',it.key);
    inp.onchange=function(){ if(!perms[activeProfile])perms[activeProfile]={}; perms[activeProfile][it.key]=inp.checked; };
    var sl=document.createElement('span'); sl.className='sl';
    sw.appendChild(inp); sw.appendChild(sl);
    row.appendChild(left); row.appendChild(sw);
    box.appendChild(row);
  });
}
function setAllInCat(v){
  var cat=cats.find(function(c){return c.key===activeCat;});
  if(!perms[activeProfile])perms[activeProfile]={};
  cat.items.forEach(function(it){ perms[activeProfile][it.key]=v; });
  renderItems();
}
function renderAll(){ renderProfiles(); renderTabs(); renderItems(); }

function toast(msg){ var a=document.getElementById('alert'); a.textContent=msg; a.style.display='block'; setTimeout(function(){a.style.display='none';},2500); }

function salvar(){
  var cur=profiles.find(function(p){return p.id===activeProfile;});
  if(cur&&cur.is_admin){ toast('Admin ja tem acesso total.'); return; }
  // monta o mapa completo do catalogo (default-allow para o que nao foi tocado)
  var full={};
  cats.forEach(function(c){ c.items.forEach(function(it){ full[it.key]=permVal(activeProfile,it.key); }); });
  fetch(BASE+'/acessos/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileId:activeProfile,perms:full})})
    .then(function(r){return r.json();}).then(function(d){ if(d.ok){ perms[activeProfile]=full; toast('Acessos do perfil "'+cur.name+'" salvos.'); } else { toast('Erro ao salvar.'); } })
    .catch(function(){ toast('Erro de conexao.'); });
}
function novoPerfil(){
  var nome=prompt('Nome do novo perfil:'); if(!nome) return;
  fetch(BASE+'/acessos/profile/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:nome})})
    .then(function(r){return r.json();}).then(function(d){ if(d.ok){ location.reload(); } else { toast('Erro ao criar.'); } });
}
function renomearPerfil(p){
  var nome=prompt('Novo nome do perfil:',p.name); if(!nome) return;
  fetch(BASE+'/acessos/profile/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,name:nome})})
    .then(function(r){return r.json();}).then(function(d){ if(d.ok){ location.reload(); } });
}
function excluirPerfil(p){
  if(!confirm('Excluir o perfil "'+p.name+'"? As permissoes dele serao apagadas.')) return;
  fetch(BASE+'/acessos/profile/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id})})
    .then(function(r){return r.json();}).then(function(d){ if(d.ok){ location.reload(); } else { toast('Nao foi possivel excluir (perfil fixo?).'); } });
}
renderAll();
</script>
</body></html>`);
});

router.post('/save', requireAdmin, express.json(), (req, res) => {
  const { profileId, perms } = req.body || {};
  const p = store.getProfileById(profileId);
  if (!p) return res.status(404).json({ ok: false, error: 'perfil nao encontrado' });
  if (p.is_admin) return res.json({ ok: true }); // admin nao restringe
  store.setPermsBulk(profileId, perms || {});
  res.json({ ok: true });
});

router.post('/profile/create', requireAdmin, express.json(), (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'nome vazio' });
  const p = store.createProfile(name);
  res.json({ ok: true, profile: p });
});

router.post('/profile/rename', requireAdmin, express.json(), (req, res) => {
  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ ok: false });
  store.renameProfile(id, name);
  res.json({ ok: true });
});

router.post('/profile/delete', requireAdmin, express.json(), (req, res) => {
  const { id } = req.body || {};
  const okDel = store.deleteProfile(id);
  res.json({ ok: okDel });
});

module.exports = router;
