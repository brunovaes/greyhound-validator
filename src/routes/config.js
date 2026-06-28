const express = require('express');
const router = express.Router();
const { db, getUserConfig } = require('../db/database');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_PATH || '/greyhound';

function getLogo() {
  const p = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(p)) return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  return '';
}

function navBar(user, active) {
  const isAdmin = user.role === 'admin';
  return `<nav style="background:#111;border-bottom:1px solid #333;padding:0 20px;display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex">
      <a href="${BASE}" class="nl${active==='analisar'?' na':''}">Analisar</a>
      <a href="${BASE}/historico" class="nl${active==='historico'?' na':''}">Historico</a>
      <a href="${BASE}/config" class="nl${active==='config'?' na':''}">Configuracoes</a>
      ${isAdmin ? `<a href="${BASE}/admin/usuarios" class="nl${active==='admin'?' na':''}">Usuarios</a>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:14px">
      <span style="font-size:11px;color:#666">${user.name} · <span style="color:#${user.plan==='premium'?'a78bfa':user.plan==='pro'?'60a5fa':'888'}">${user.plan}</span></span>
      <a href="${BASE}/logout" style="font-size:11px;color:#666;text-decoration:none;border:1px solid #333;padding:4px 10px;border-radius:4px">Sair</a>
    </div>
  </nav>
  <style>.nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}.nl:hover,.na{color:#22c55e!important;border-bottom-color:#22c55e!important}</style>`;
}

router.get('/', (req, res) => {
  const user = req.user;
  const config = getUserConfig(user.id);
  const logoB64 = getLogo();

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configuracoes - Greyhound Validator</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:130px;object-fit:cover;object-position:center 30%;display:block}.content{padding:24px;max-width:820px;margin:0 auto}h1{font-size:20px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:#888;margin-bottom:24px}.section{background:#111;border:1px solid #333;border-radius:10px;padding:20px;margin-bottom:16px}.sec-title{font-size:13px;font-weight:700;color:#22c55e;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:5px}.field label{font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.4px}.field input,.field textarea,.field select{padding:8px 10px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#f0f0f0;font-size:13px;width:100%}.field input:focus,.field textarea:focus,.field select:focus{outline:none;border-color:#22c55e}.field input[type=range]{padding:4px 0;cursor:pointer}.field textarea{min-height:70px;resize:vertical;font-family:monospace;font-size:11px}.rv{font-size:11px;color:#f97316;font-weight:700;margin-top:2px}.hint{font-size:10px;color:#666;margin-top:2px;line-height:1.4}.pbar{width:100%;height:4px;background:#222;border-radius:2px;overflow:hidden;margin-top:4px}.pfill{height:100%;background:#22c55e;border-radius:2px;transition:width .3s}.btn-save{padding:12px 28px;background:#22c55e;color:#000;font-weight:700;font-size:14px;border:none;border-radius:6px;cursor:pointer;margin-top:20px}.btn-save:hover{background:#16a34a}.btn-reset{padding:12px 20px;background:transparent;color:#888;font-size:13px;border:1px solid #333;border-radius:6px;cursor:pointer;margin-top:20px;margin-left:10px}.btn-reset:hover{color:#f0f0f0}.alert{padding:12px 16px;border-radius:6px;font-size:13px;margin-bottom:16px;display:none}.alert.ok{background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2)}.alert.er{background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)}</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user,'config')}
<div class="content">
<h1>Configuracoes de Analise</h1>
<p class="sub">Ajuste os parametros que o Claude usa para analisar suas corridas.</p>
<div class="alert" id="alert"></div>
<form id="cf">
<div class="section">
<div class="sec-title">Pesos dos Criterios</div>
<div class="grid">
${[['peso_categoria','Categoria','Galho validado na classe atual',config.peso_categoria],['peso_caltm','Tempo Final CalTm','Media dos tempos calibrados',config.peso_caltm],['peso_bends','Bends / Arranque','Perfil e evolucao nas marcacoes',config.peso_bends],['peso_remarks','Remarks','Combinacoes positivas e negativas',config.peso_remarks],['peso_brt','Melhor Tempo BRT','Desempate final',config.peso_brt]].map(([n,l,h,v])=>`
<div class="field"><label>${l}</label>
<input type="range" name="${n}" min="1" max="10" value="${v}" oninput="upR(this)">
<div style="display:flex;justify-content:space-between;align-items:center"><span class="hint">${h}</span><span class="rv" id="v_${n}">${v}</span></div>
<div class="pbar"><div class="pfill" id="b_${n}" style="width:${v*10}%"></div></div>
</div>`).join('')}
</div>
</div>

<div class="section">
<div class="sec-title">Filtros de Corrida</div>
<div class="grid">
<div class="field"><label>Distancia minima (m)</label><input type="number" name="dist_min" value="${config.dist_min}" min="200" max="600"><span class="hint">Corridas abaixo sao descartadas</span></div>
<div class="field"><label>Distancia maxima (m)</label><input type="number" name="dist_max" value="${config.dist_max}" min="400" max="1000"><span class="hint">Corridas acima sao descartadas</span></div>
<div class="field"><label>Min. corridas uteis</label><input type="number" name="min_corridas_uteis" value="${config.min_corridas_uteis}" min="1" max="10"><span class="hint">Abaixo disso solicita capivara</span></div>
<div class="field"><label>Classes aceitas</label><input type="text" name="classes_aceitas" value="${config.classes_aceitas}"><span class="hint">Separadas por virgula</span></div>
</div>
</div>

<div class="section">
<div class="sec-title">Thresholds de Confianca</div>
<div class="grid">
<div class="field"><label>Alta confianca (%)</label><input type="range" name="pct_alta" min="50" max="90" value="${config.pct_alta}" oninput="upR(this)"><div style="display:flex;justify-content:space-between"><span class="hint">Minimo para badge Alta</span><span class="rv" id="v_pct_alta">${config.pct_alta}%</span></div></div>
<div class="field"><label>Media confianca (%)</label><input type="range" name="pct_media" min="30" max="70" value="${config.pct_media}" oninput="upR(this)"><div style="display:flex;justify-content:space-between"><span class="hint">Minimo para badge Media</span><span class="rv" id="v_pct_media">${config.pct_media}%</span></div></div>
<div class="field"><label>CalTm significativo (s)</label><input type="number" name="diff_caltm_significativa" value="${config.diff_caltm_significativa}" step="0.05" min="0.1" max="1"><span class="hint">Acima disso = vantagem clara</span></div>
<div class="field"><label>CalTm empate (s)</label><input type="number" name="diff_caltm_empate" value="${config.diff_caltm_empate}" step="0.02" min="0.02" max="0.3"><span class="hint">Abaixo disso = empate tecnico</span></div>
</div>
</div>

<div class="section">
<div class="sec-title">Remarks</div>
<div class="grid" style="grid-template-columns:1fr 1fr">
<div class="field"><label>Combinacoes muito positivas</label><textarea name="remarks_muito_positivos">${config.remarks_muito_positivos}</textarea><span class="hint">Ex: SAw+RnOn,Bmp+RnOn</span></div>
<div class="field"><label>Remarks positivos</label><textarea name="remarks_positivos">${config.remarks_positivos}</textarea></div>
<div class="field"><label>Atenuantes (nao penalizar)</label><textarea name="remarks_atenuantes">${config.remarks_atenuantes}</textarea><span class="hint">Acidentes externos</span></div>
<div class="field"><label>Remarks negativos</label><textarea name="remarks_negativos">${config.remarks_negativos}</textarea></div>
</div>
</div>

<div><button type="submit" class="btn-save">Salvar Configuracoes</button><button type="button" class="btn-reset" onclick="if(confirm('Restaurar padrao?'))location.href='${BASE}/config/reset'">Restaurar Padrao</button></div>
</form>
</div>
<script>
function upR(input){var n=input.name;var v=document.getElementById('v_'+n);var b=document.getElementById('b_'+n);if(v)v.textContent=input.value+(n.startsWith('pct')?'%':'');if(b)b.style.width=(input.value*10)+'%';}
document.getElementById('cf').addEventListener('submit',async function(e){
  e.preventDefault();
  var data=Object.fromEntries(new FormData(this));
  var al=document.getElementById('alert');
  try{
    var r=await fetch('${BASE}/config/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok){al.className='alert ok';al.textContent='Configuracoes salvas!';al.style.display='block';setTimeout(function(){al.style.display='none';},3000);}
    else throw new Error('Erro ao salvar');
  }catch(err){al.className='alert er';al.textContent='Erro: '+err.message;al.style.display='block';}
});
</script></body></html>`);
});

router.post('/save', express.json(), (req, res) => {
  try {
    const user = req.user;
    const d = req.body;
    db.prepare(`UPDATE analysis_config SET peso_categoria=?,peso_caltm=?,peso_bends=?,peso_remarks=?,peso_brt=?,dist_min=?,dist_max=?,classes_aceitas=?,min_corridas_uteis=?,pct_alta=?,pct_media=?,diff_caltm_significativa=?,diff_caltm_empate=?,remarks_muito_positivos=?,remarks_positivos=?,remarks_atenuantes=?,remarks_negativos=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).run(
      d.peso_categoria,d.peso_caltm,d.peso_bends,d.peso_remarks,d.peso_brt,
      d.dist_min,d.dist_max,d.classes_aceitas,d.min_corridas_uteis,
      d.pct_alta,d.pct_media,d.diff_caltm_significativa,d.diff_caltm_empate,
      d.remarks_muito_positivos,d.remarks_positivos,d.remarks_atenuantes,d.remarks_negativos,
      user.id
    );
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/reset', (req, res) => {
  const user = req.user;
  db.prepare('DELETE FROM analysis_config WHERE user_id=?').run(user.id);
  getUserConfig(user.id); // recria com padrão
  res.redirect(BASE + '/config');
});

module.exports = router;
