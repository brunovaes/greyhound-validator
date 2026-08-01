const express = require('express');
const router = express.Router();
const { findUserByEmail, validatePassword, createUser, db } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { navBar } = require('./main');
const { planLabel, planDuracao } = require('../utils/plans');
const { designTokensCSS } = require('../utils/designTokens');
const accessStore = require('../access/store');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_PATH || '/greyhound';

function getLogo() {
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(logoPath)) return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  return '';
}

// Logo especifica da tela de login (separada da logo padrao usada no resto
// do app) — se nao existir, cai pra logo padrao como fallback
function getLoginLogo() {
  const logoPath = path.join(__dirname, '../../public/img/logo_login.png');
  if (fs.existsSync(logoPath)) return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  return getLogo();
}

function getBg() {
  const bgPath = path.join(__dirname, '../../public/img/login_bg.png');
  if (fs.existsSync(bgPath)) return 'data:image/png;base64,' + fs.readFileSync(bgPath).toString('base64');
  return '';
}

// Video de fundo — servido como arquivo estatico (nao da pra fazer base64
// inline como a imagem, o HTML ficaria gigante). So usa se o arquivo existir;
// senao cai pro fallback de imagem/preto normal.
function getBgVideoUrl() {
  const vidPath = path.join(__dirname, '../../public/img/login_bg.mp4');
  if (fs.existsSync(vidPath)) return BASE + '/static/img/login_bg.mp4';
  return null;
}

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect(BASE);
  const err = req.query.err;
  const logoB64 = getLoginLogo();
  const bgB64 = getBg();
  const bgVideoUrl = getBgVideoUrl();
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login - Greyhound Validator</title>
<style>
${designTokensCSS()}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;color:#f0f0f0;min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.bg{position:fixed;inset:0;${bgB64 ? `background:url('${bgB64}') center center/cover no-repeat;` : 'background:#000;'}opacity:.5;z-index:0}
.bg-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5;z-index:0}
.overlay{position:fixed;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,.3) 0%,rgba(0,0,0,.85) 100%);z-index:1}
.card{position:relative;z-index:2;background:rgba(10,10,10,.92);border:1px solid rgba(34,197,94,.3);border-radius:14px;padding:32px;width:100%;max-width:420px;box-shadow:0 0 60px rgba(34,197,94,.08),0 20px 60px rgba(0,0,0,.8);backdrop-filter:blur(10px)}
.logo-box{margin-bottom:22px;text-align:center}
.logo-box img{width:100%;height:auto;object-fit:contain;display:block;border-radius:6px}
p{font-size:13px;color:#888;text-align:center;margin-bottom:22px}
label{display:block;font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px}
input{width:100%;padding:11px 14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#f0f0f0;font-size:14px;margin-bottom:16px;transition:border-color .2s}
input:focus{outline:none;border-color:#22c55e;background:rgba(34,197,94,.05)}
button{width:100%;padding:13px;background:#22c55e;color:#000;font-weight:700;font-size:15px;border:none;border-radius:8px;cursor:pointer;margin-top:4px;letter-spacing:.3px;transition:all .2s}
button:hover{background:#16a34a;box-shadow:0 4px 20px rgba(34,197,94,.3)}
.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px;text-align:center}
.perfil-sel{padding:4px 8px;background:#0D1117;border:1px solid #222;border-radius:5px;color:#f0f0f0;font-size:11px;max-width:170px}
.perfil-sel:focus{outline:none;border-color:#22c55e}
</style></head><body>
${bgVideoUrl
  ? `<video class="bg-video" autoplay muted loop playsinline><source src="${bgVideoUrl}" type="video/mp4"></video>`
  : `<div class="bg"></div>`
}
<div class="overlay"></div>
<div class="card">
  <div class="logo-box">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : ''}</div>
  <p>Entre com sua conta para continuar</p>
  ${err ? '<div class="err">Email ou senha incorretos</div>' : ''}
  <form method="POST" action="${BASE}/login">
    <label>Email</label>
    <input type="email" name="email" placeholder="seu@email.com" required autofocus>
    <label>Senha</label>
    <input type="password" name="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" required>
    <button type="submit">Entrar</button>
  </form>
</div>
</body></html>`);
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user || !validatePassword(user, password)) return res.redirect(BASE + '/login?err=1');
  req.session.userId = user.id;
  db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?').run(user.id);
  res.redirect(BASE);
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect(BASE + '/login');
});

router.get('/admin/usuarios', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id,name,email,role,plan,analyses_used,analyses_limit,active,created_at,last_login,access_profile FROM users ORDER BY created_at DESC').all();
  // Perfis de acesso disponiveis, pro seletor de cada linha. Sem isto, os
  // perfis criados na tela de Acessos nao podiam ser dados a ninguem.
  const perfisAcesso = accessStore.listProfiles().filter(p => !p.is_admin);
  const logoB64 = getLogo();
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Usuários - Greyhound Validator</title>
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>
${designTokensCSS()}
body{background:#0D1117}
nav{background:#0D1117 !important;border-bottom:1px solid #222 !important}
.content{padding:24px;max-width:1000px;margin:0 auto}h1{font-size:20px;font-weight:700;margin-bottom:20px}
.form-card{background:#161B27;border:1px solid #222;border-radius:10px;padding:20px;margin-bottom:20px;border-top:2px solid #22c55e}
.form-card h2{font-size:13px;color:#22c55e;margin-bottom:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
.field label{display:block;font-size:10px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px}
.field input,.field select{width:100%;padding:7px 10px;background:#0D1117;border:1px solid #222;border-radius:5px;color:#f0f0f0;font-size:13px}
.field input:focus,.field select:focus{outline:none;border-color:#22c55e}
.btn{padding:8px 16px;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:6px;cursor:pointer;font-size:13px;width:100%}.btn:hover{background:#16a34a}
table{width:100%;border-collapse:collapse;background:#161B27;border:1px solid #222;border-radius:8px;overflow:hidden}
th{padding:10px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#0D1117;border-bottom:1px solid #222}
td{padding:9px 12px;border-bottom:1px solid #222;font-size:12px;vertical-align:middle}tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
.badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700}
.badge-admin{background:rgba(249,115,22,.15);color:#f97316}.badge-user{background:rgba(100,100,100,.15);color:#888}
.badge-premium{background:rgba(139,92,246,.15);color:#a78bfa}.badge-pro{background:rgba(96,165,250,.15);color:#60a5fa}.badge-free{background:rgba(100,100,100,.15);color:#888}
.badge-on{background:rgba(34,197,94,.15);color:#22c55e}.badge-off{background:rgba(239,68,68,.12);color:#ef4444}
.btn-sm{font-size:10px;padding:3px 8px;border-radius:4px;border:none;cursor:pointer;font-weight:600;background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)}
.tw{overflow-x:auto}
@media(max-width:768px){
  html,body{overflow-x:hidden}
  .content{padding:14px 12px}
  .tw{-webkit-overflow-scrolling:touch;border:1px solid #222;border-radius:8px}
  .tw table{min-width:760px;border:none;border-radius:0}
}
</style></head><body>
${req.query.embed ? '' : `<div class="hero">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : ''}</div>`}
${req.query.embed ? '' : navBar(req.user, 'admin')}
<div class="content">
${req.query.embed ? '' : '<h1>Gestão de Usuários</h1>'}
<div class="form-card">
  <h2>Criar novo usuário</h2>
  <form method="POST" action="${BASE}/admin/usuarios/criar">
    <input type="hidden" name="embed" value="${req.query.embed ? '1' : ''}">
    <div class="form-grid">
      <div class="field"><label>Nome</label><input type="text" name="name" placeholder="Nome completo" required></div>
      <div class="field"><label>Email</label><input type="email" name="email" placeholder="email@exemplo.com" required></div>
      <div class="field"><label>Senha</label><input type="password" name="password" placeholder="senha" required></div>
      <div class="field"><label>Perfil</label><select name="role"><option value="user">Usuário</option><option value="admin">Admin</option></select></div>
      <div class="field"><label>Plano</label><select name="plan"><option value="free">Standard - Semanal (30/mês)</option><option value="pro">Pró - Mensal (200/mês)</option><option value="premium">Premium - Trimestral (ilimitado)</option></select></div>
      <div class="field" style="display:flex;align-items:flex-end"><button type="submit" class="btn">Criar</button></div>
    </div>
  </form>
</div>
<div class="tw"><table><thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Plano</th><th>Perfil de acesso</th><th>Análises</th><th>Status</th><th>Último login</th><th>Ação</th></tr></thead><tbody>
${users.map(u => `<tr>
  <td><strong>${u.name}</strong></td><td style="color:#888">${u.email}</td>
  <td><span class="badge badge-${u.role}">${u.role}</span></td>
  <td><span class="badge badge-${u.plan}" title="${planDuracao(u.plan)}">${planLabel(u.plan)}</span></td>
  <td>${u.role==='admin'
        ? '<span class="badge badge-admin" title="Admin sempre tem acesso total">total</span>'
        : `<select class="perfil-sel" data-id="${u.id}" onchange="salvarPerfil(this)">
             <option value="">Pelo plano (${planLabel(u.plan)})</option>
             ${perfisAcesso.map(p => `<option value="${p.key}" ${u.access_profile===p.key?'selected':''}>${p.name}</option>`).join('')}
           </select>`}</td>
  <td style="color:#888">${u.analyses_used}/${u.analyses_limit===999999?'&infin;':u.analyses_limit}</td>
  <td><span class="badge badge-${u.active?'on':'off'}">${u.active?'Ativo':'Inativo'}</span></td>
  <td style="color:#666;font-size:11px">${u.last_login?new Date(u.last_login).toLocaleDateString('pt-BR'):'Nunca'}</td>
  <td><form method="POST" action="${BASE}/admin/usuarios/toggle" style="display:inline"><input type="hidden" name="id" value="${u.id}"><input type="hidden" name="embed" value="${req.query.embed ? '1' : ''}"><button type="submit" class="btn-sm">${u.active?'Desativar':'Ativar'}</button></form></td>
</tr>`).join('')}
</tbody></table></div>
</div>
<script>
function salvarPerfil(sel){
  var id=sel.getAttribute('data-id'), antes=sel.getAttribute('data-antes')||'';
  sel.disabled=true;
  fetch('${BASE}/admin/usuarios/perfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,profile:sel.value})})
    .then(function(r){return r.json();})
    .then(function(d){ sel.disabled=false; if(!d.ok){ alert('Nao foi possivel salvar o perfil.'); sel.value=antes; } else { sel.setAttribute('data-antes',sel.value); } })
    .catch(function(){ sel.disabled=false; sel.value=antes; alert('Erro de conexao.'); });
}
document.querySelectorAll('.perfil-sel').forEach(function(s){ s.setAttribute('data-antes', s.value); });
</script>
</body></html>`);
});

router.post('/admin/usuarios/criar', requireAdmin, express.urlencoded({ extended: true }), (req, res) => {
  const { name, email, password, role, plan } = req.body;
  const limit = plan === 'premium' ? 999999 : plan === 'pro' ? 200 : 30;
  createUser(name, email, password, role, plan, limit);
  res.redirect(BASE + '/admin/usuarios' + (req.body.embed === '1' ? '?embed=1' : ''));
});

router.post('/admin/usuarios/toggle', requireAdmin, express.urlencoded({ extended: true }), (req, res) => {
  const { id } = req.body;
  const user = db.prepare('SELECT active FROM users WHERE id=?').get(id);
  if (user) db.prepare('UPDATE users SET active=? WHERE id=?').run(user.active ? 0 : 1, id);
  res.redirect(BASE + '/admin/usuarios' + (req.body.embed === '1' ? '?embed=1' : ''));
});

// Grava o perfil de acesso de um usuario. Vazio = volta a seguir o plano.
router.post('/admin/usuarios/perfil', requireAdmin, express.json(), (req, res) => {
  try {
    const { id, profile } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'id ausente' });
    const alvo = db.prepare('SELECT id, role FROM users WHERE id=?').get(id);
    if (!alvo) return res.status(404).json({ ok: false, error: 'usuario nao encontrado' });
    // Admin nao recebe perfil: ele sempre tem acesso total, por desenho.
    if (alvo.role === 'admin') return res.json({ ok: true, ignorado: 'admin tem acesso total' });

    const chave = String(profile || '').trim();
    if (chave) {
      const p = accessStore.getProfileByKey(chave);
      if (!p) return res.status(400).json({ ok: false, error: 'perfil inexistente' });
      if (p.is_admin) return res.status(400).json({ ok: false, error: 'nao e possivel atribuir o perfil Admin' });
    }
    db.prepare('UPDATE users SET access_profile=? WHERE id=?').run(chave || null, id);
    console.log('[acesso] perfil do usuario ' + id + ' -> ' + (chave || '(pelo plano)'));
    res.json({ ok: true });
  } catch (e) {
    console.error('[acesso] erro ao salvar perfil:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;