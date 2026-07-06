const express = require('express');
const router = express.Router();
const { db, getUserConfig } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const BASE = process.env.BASE_PATH || '/greyhound';

function getLogo() {
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(logoPath)) return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  return '';
}

// CONFIG SO PARA ADMIN
router.get('/', requireAdmin, (req, res) => {
  const user = req.user;
  const config = getUserConfig(user.id);
  const logoB64 = getLogo();

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configuracoes - Greyhound Validator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
nav{background:#0D1117;border-bottom:1px solid #222;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}.nl:hover,.na{color:#22c55e;border-bottom-color:#22c55e}
.content{padding:24px;max-width:1200px;margin:0 auto}
h1{font-size:20px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:#888;margin-bottom:20px}
.layout{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
.tabnav{background:#161B27;border:1px solid #222;border-radius:10px;padding:8px;position:sticky;top:16px;display:flex;flex-direction:column;gap:2px}
.tabbtn{display:block;width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:#888;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;transition:all .15s}
.tabbtn:hover{background:rgba(34,197,94,.08);color:#ccc}
.tabbtn.active{background:rgba(34,197,94,.12);color:#22c55e}
.tab-panel{display:none}
.tab-panel.active{display:block}
.section{background:#161B27;border:1px solid #222;border-radius:10px;padding:20px;margin-bottom:16px}
.sec-title{font-size:13px;font-weight:700;color:#22c55e;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.field input,.field textarea,.field select{padding:8px 10px;background:#0D1117;border:1px solid #222;border-radius:6px;color:#f0f0f0;font-size:13px;width:100%}
.field input:focus,.field textarea:focus,.field select:focus{outline:none;border-color:#22c55e}
.field input[type=range]{padding:4px 0;cursor:pointer}
.field textarea{min-height:70px;resize:vertical;font-family:monospace;font-size:11px}
.rv{font-size:11px;color:#f97316;font-weight:700;margin-top:2px}
.hint{font-size:10px;color:#666;margin-top:2px;line-height:1.4}
.pbar{width:100%;height:4px;background:#0D1117;border-radius:2px;overflow:hidden;margin-top:4px}
.pfill{height:100%;background:#22c55e;border-radius:2px;transition:width .3s}
.btn-bar{display:flex;align-items:center;gap:10px;position:sticky;bottom:0;background:#0D1117;padding:14px 0;margin-top:4px;border-top:1px solid #222}
.btn-save{padding:12px 28px;background:#22c55e;color:#000;font-weight:700;font-size:14px;border:none;border-radius:6px;cursor:pointer}
.btn-save:hover{background:#16a34a}
.btn-reset{padding:12px 20px;background:transparent;color:#888;font-size:13px;border:1px solid #222;border-radius:6px;cursor:pointer}
.alert{padding:12px 16px;border-radius:6px;font-size:13px;margin-bottom:16px;display:none}
.alert.ok{background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2)}
.alert.er{background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)}
.info-box{background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.2);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#f97316;line-height:1.6}
.toast-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center}
.toast-bg.open{display:flex}
.toast-box{background:#161B27;border:1px solid #22c55e;border-radius:14px;padding:32px 40px;text-align:center;animation:popIn .3s ease}
@keyframes popIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
.toast-icon{font-size:52px;margin-bottom:12px}
.toast-box h3{font-size:17px;color:#f0f0f0;margin-bottom:6px}
.toast-box p{font-size:12px;color:#888}
@media(max-width:800px){.layout{grid-template-columns:1fr}.tabnav{position:static;flex-direction:row;overflow-x:auto}}
</style></head><body>
<div class="hero">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : ''}</div>
<nav>
  <div>
    <a href="${BASE}" class="nl">Analisar</a>
    <a href="${BASE}/historico" class="nl">Historico</a>
    <a href="${BASE}/config" class="nl na">Configuracoes</a>
    <a href="${BASE}/robot" class="nl">Robo</a>
    <a href="${BASE}/admin/usuarios" class="nl">Usuarios</a>
    <a href="${BASE}/live" class="nl">Live</a>
  </div>
  <span style="font-size:11px;color:#666;padding:12px">${user.name} &middot; <a href="${BASE}/logout" style="color:#666;text-decoration:none">Sair</a></span>
</nav>
<div class="content">
<h1>Configuracoes de Analise</h1>
<p class="sub">Estas configuracoes se aplicam a TODOS os usuarios do sistema.</p>
<div class="alert" id="alert"></div>
<form id="cf">
<div class="layout">

<div class="tabnav">
  <button type="button" class="tabbtn active" data-tab="t-pesos" onclick="showTab('t-pesos')">Pesos dos Criterios</button>
  <button type="button" class="tabbtn" data-tab="t-categoria" onclick="showTab('t-categoria')">Categoria</button>
  <button type="button" class="tabbtn" data-tab="t-filtros" onclick="showTab('t-filtros')">Filtros de Corrida</button>
  <button type="button" class="tabbtn" data-tab="t-confianca" onclick="showTab('t-confianca')">Thresholds de Confianca</button>
  <button type="button" class="tabbtn" data-tab="t-motor" onclick="showTab('t-motor')">Motor de Pontuacao</button>
  <button type="button" class="tabbtn" data-tab="t-remarks" onclick="showTab('t-remarks')">Remarks</button>
  <button type="button" class="tabbtn" data-tab="t-automacao" onclick="showTab('t-automacao')">Automacao</button>
</div>

<div>

<div class="tab-panel active" id="t-pesos">
<div class="section">
<div class="sec-title">Pesos dos Criterios</div>
<div class="info-box">Os pesos orientam o Claude sobre qual criterio priorizar. Valores maiores = mais importante no raciocinio.</div>
<div class="grid">
${[['peso_caltm','Tempo Final CalTm','Media dos tempos calibrados',config.peso_caltm,1,10],
   ['peso_bends','Bends / Arranque','Perfil e evolucao nas marcacoes',config.peso_bends,1,10],
   ['peso_remarks','Remarks','Combinacoes positivas e negativas',config.peso_remarks,1,10],
   ['peso_brt','Melhor Tempo BRT','Desempate final',config.peso_brt,1,10],
   ['peso_post_pick','Post Pick (Racing Post)','Indicacao dos 3 melhores no cabecalho do PDF',config.peso_post_pick||0,0,10]].map(([n,l,h,v,mn,mx])=>
`<div class="field"><label>${l}</label>
<input type="range" name="${n}" min="${mn}" max="${mx}" value="${v}" oninput="upR(this)">
<div style="display:flex;justify-content:space-between;align-items:center"><span class="hint">${h}</span><span class="rv" id="v_${n}">${v}</span></div>
<div class="pbar"><div class="pfill" id="b_${n}" style="width:${v*10}%"></div></div>
</div>`).join('')}
</div>
</div>
</div>

<div class="tab-panel" id="t-categoria">
<div class="section">
<div class="sec-title">Categoria</div>
<div class="info-box">
  Controla como a classe historica dos galgos influencia a analise.<br>
  <strong>Diferenca que CalTm pode superar:</strong> quantos niveis de classe o tempo pode compensar entre dois galgos.<br>
  <strong>Niveis no pool:</strong> quantos niveis de diferenca em relacao a classe do card sao aceitos no historico valido.
</div>
<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
<div class="field">
  <label>Diferenca maxima de categoria que CalTm pode superar</label>
  <select name="max_cat_diff_caltm">
    <option value="0" ${(config.max_cat_diff_caltm||1)===0?'selected':''}>0 — Categoria sempre decide</option>
    <option value="1" ${(config.max_cat_diff_caltm||1)===1?'selected':''}>1 nivel (ex: A5 vs A6)</option>
    <option value="2" ${(config.max_cat_diff_caltm||1)===2?'selected':''}>2 niveis (ex: A5 vs A7)</option>
    <option value="3" ${(config.max_cat_diff_caltm||1)===3?'selected':''}>3 niveis (ex: A5 vs A8)</option>
  </select>
  <span class="hint">Define quando o CalTm pode superar a diferenca de classe entre dois galgos comparados</span>
</div>
<div class="field">
  <label>Niveis diferentes permitidos no pool</label>
  <select name="max_niveis_pool">
    <option value="1" ${(config.max_niveis_pool||2)===1?'selected':''}>1 nivel (apenas classe do card)</option>
    <option value="2" ${(config.max_niveis_pool||2)===2?'selected':''}>2 niveis (ex: A7 aceita A8)</option>
    <option value="3" ${(config.max_niveis_pool||2)===3?'selected':''}>3 niveis (ex: A7 aceita A8 e A9)</option>
    <option value="4" ${(config.max_niveis_pool||2)===4?'selected':''}>4 niveis (historico amplo)</option>
  </select>
  <span class="hint">Quantos niveis abaixo ou acima da classe do card sao aceitos nas linhas validas do galgo</span>
</div>
</div>
<div style="margin-top:14px;padding-top:14px;border-top:1px solid #222">
<div class="info-box" style="margin-bottom:12px">
  <strong>Novo na categoria com gap:</strong> elimina galgo que tem <strong>${config.max_linhas_cat_inferior||3} corridas</strong> em categoria inferior antes da ultima, que nao foi vitorioso na ultima corrida ou ficou mais de <strong>${config.max_dias_gap_nova_cat||14} dias</strong> parado entre as duas ultimas corridas validas.
</div>
<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
<div class="field">
  <label>Max. corridas em cat. inferior antes da ultima</label>
  <select name="max_linhas_cat_inferior">
    <option value="2" ${(config.max_linhas_cat_inferior||3)===2?'selected':''}>2 corridas</option>
    <option value="3" ${(config.max_linhas_cat_inferior||3)===3?'selected':''}>3 corridas (padrao)</option>
    <option value="4" ${(config.max_linhas_cat_inferior||3)===4?'selected':''}>4 corridas</option>
    <option value="5" ${(config.max_linhas_cat_inferior||3)===5?'selected':''}>5 corridas</option>
    <option value="99" ${(config.max_linhas_cat_inferior||3)===99?'selected':''}>Desativado</option>
  </select>
  <span class="hint">Quantas linhas em categoria inferior (excluindo a ultima) sao toleradas antes de eliminar o galgo</span>
</div>
<div class="field">
  <label>Gap maximo entre as duas ultimas corridas (dias)</label>
  <select name="max_dias_gap_nova_cat">
    <option value="7"  ${(config.max_dias_gap_nova_cat||14)===7 ?'selected':''}>7 dias</option>
    <option value="14" ${(config.max_dias_gap_nova_cat||14)===14?'selected':''}>14 dias (padrao)</option>
    <option value="21" ${(config.max_dias_gap_nova_cat||14)===21?'selected':''}>21 dias</option>
    <option value="28" ${(config.max_dias_gap_nova_cat||14)===28?'selected':''}>28 dias</option>
  </select>
  <span class="hint">Se o gap entre as duas ultimas corridas validas for maior que este valor, o galgo e eliminado</span>
</div>
</div>
</div>
</div>
</div>

<div class="tab-panel" id="t-filtros">
<div class="section">
<div class="sec-title">Filtros de Corrida</div>
<div class="grid">
<div class="field"><label>Distancia minima (m)</label><input type="number" name="dist_min" value="${config.dist_min}" min="200" max="600"><span class="hint">Corridas abaixo sao descartadas</span></div>
<div class="field"><label>Distancia maxima (m)</label><input type="number" name="dist_max" value="${config.dist_max}" min="400" max="1000"><span class="hint">Corridas acima sao descartadas</span></div>
<div class="field"><label>Min. corridas uteis</label><input type="number" name="min_corridas_uteis" value="${config.min_corridas_uteis}" min="1" max="10"><span class="hint">Abaixo disso solicita capivara</span></div>
<div class="field"><label>Classes aceitas</label><input type="text" name="classes_aceitas" value="${config.classes_aceitas}"><span class="hint">Separadas por virgula</span></div>
</div>
</div>
</div>

<div class="tab-panel" id="t-confianca">
<div class="section">
<div class="sec-title">Thresholds de Confianca</div>
<div class="grid">
<div class="field"><label>Alta confianca (%)</label>
<input type="range" name="pct_alta" min="50" max="90" value="${config.pct_alta}" oninput="upR(this)">
<div style="display:flex;justify-content:space-between"><span class="hint">Minimo para badge Alta</span><span class="rv" id="v_pct_alta">${config.pct_alta}%</span></div></div>
<div class="field"><label>Media confianca (%)</label>
<input type="range" name="pct_media" min="30" max="70" value="${config.pct_media}" oninput="upR(this)">
<div style="display:flex;justify-content:space-between"><span class="hint">Minimo para badge Media</span><span class="rv" id="v_pct_media">${config.pct_media}%</span></div></div>
<div class="field"><label>CalTm significativo (s)</label><input type="number" name="diff_caltm_significativa" value="${config.diff_caltm_significativa}" step="0.05" min="0.1" max="1"><span class="hint">Acima disso = vantagem clara</span></div>
<div class="field"><label>CalTm empate (s)</label><input type="number" name="diff_caltm_empate" value="${config.diff_caltm_empate}" step="0.02" min="0.02" max="0.3"><span class="hint">Abaixo disso = empate tecnico</span></div>
</div>
</div>
</div>

<div class="tab-panel" id="t-motor">
<div class="section">
<div class="sec-title">Motor de Pontuacao</div>
<div class="info-box">Estes parametros controlam o calculo deterministico de scores. O Claude agora so extrai dados brutos — toda a decisao de favorito/ranking/AvB/Back e feita por codigo com base nesses valores.</div>
<div class="grid">
<div class="field"><label>Ajuste por nivel de classe (s)</label><input type="number" name="ajuste_classe_segundos" value="${config.ajuste_classe_segundos||0.20}" step="0.05" min="0.05" max="0.50"><span class="hint">Ex: galgo em A5 correu em A3 = +0.20s no tempo (normaliza pra comparar)</span></div>
<div class="field"><label>Desconto acidente leve (s)</label><input type="number" name="desconto_acidente_leve" value="${config.desconto_acidente_leve||0.10}" step="0.02" min="0" max="0.30"><span class="hint">Bmp, SAw, MsdBrk — tempo ajustado para baixo</span></div>
<div class="field"><label>Desconto acidente medio (s)</label><input type="number" name="desconto_acidente_medio" value="${config.desconto_acidente_medio||0.20}" step="0.02" min="0" max="0.50"><span class="hint">Crd, FcdCk — desconto maior</span></div>
<div class="field"><label>Desconto acidente grave (s)</label><input type="number" name="desconto_acidente_grave" value="${config.desconto_acidente_grave||0.35}" step="0.05" min="0" max="0.70"><span class="hint">BdBmp, Stmb — desconto maximo</span></div>
<div class="field"><label>Teto normalizacao CalTm (s)</label><input type="number" name="teto_diff_normalizacao" value="${config.teto_diff_normalizacao||0.50}" step="0.05" min="0.20" max="1.00"><span class="hint">Diferenca maxima relevante entre galgos (acima disso = 0 pts)</span></div>
<div class="field"><label>Proporcao media / melhor CalTm</label>
  <select name="proporcao_media_caltm">
    <option value="0.50" ${(config.proporcao_media_caltm||0.60)==0.50?'selected':''}>50% media + 50% melhor</option>
    <option value="0.60" ${(config.proporcao_media_caltm||0.60)==0.60?'selected':''}>60% media + 40% melhor (padrao)</option>
    <option value="0.70" ${(config.proporcao_media_caltm||0.60)==0.70?'selected':''}>70% media + 30% melhor</option>
    <option value="0.80" ${(config.proporcao_media_caltm||0.60)==0.80?'selected':''}>80% media + 20% melhor</option>
  </select>
  <span class="hint">Consistencia vs potencial — maior proporcao de media = mais conservador</span>
</div>
<div class="field"><label>Score minimo para gerar AvB (pts)</label><input type="number" name="threshold_skip_avb" value="${config.threshold_skip_avb||10}" step="1" min="1" max="30"><span class="hint">Abaixo disso = corrida parelha = skip automatico</span></div>
<div class="field"><label>Score minimo para gerar Back (pts)</label><input type="number" name="threshold_back" value="${config.threshold_back||25}" step="1" min="10" max="50"><span class="hint">Diferenca entre 1o e 2o colocado — barra alta para Back</span></div>
</div>
</div>

<div class="section">
<div class="sec-title">&#128196; Documento de Regras</div>
<details style="cursor:pointer">
<summary style="font-size:12px;color:#22c55e;padding:4px 0">Ver como funciona o motor de pontuacao (clique para expandir)</summary>
<div style="margin-top:14px;font-size:12px;color:#aaa;line-height:1.8;background:#0D1117;padding:14px;border-radius:8px">
<p style="color:#f0f0f0;font-weight:700;margin-bottom:8px">Como o motor calcula o resultado de cada corrida:</p>

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 1 — Extracao (Claude)</p>
O Claude le o PDF e extrai os dados brutos de cada galgo: historico de corridas, tempos CalTm, remarks, bends, splits, BRT. Zero julgamento nesta fase.

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 2 — Filtro de linhas validas (codigo)</p>
Para cada galgo, cada linha do historico e avaliada. E descartada se: distancia for diferente da corrida atual (&gt;10%), classe invalida (HP, Trial, OR, Solo), acidente gravissimo (Fall, Stmb, RnUp), ou sem CalTm. Se o galgo tiver menos de 3 linhas validas, ele e eliminado da corrida. Se sobrar menos de 4 galgos, a corrida vira Skip.

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 3 — Ajuste de CalTm (codigo)</p>
Cada linha valida tem seu CalTm ajustado: desconto por acidente (Bmp=-${config.desconto_acidente_leve||0.10}s, Crd=-${config.desconto_acidente_medio||0.20}s) e ajuste por nivel de classe (+${config.ajuste_classe_segundos||0.20}s por nivel de diferenca). Os 3 ajustados mais recentes sao agregados com peso por recencia (3x, 2x, 1x) em ${Math.round((config.proporcao_media_caltm||0.60)*100)}% media + ${Math.round((1-(config.proporcao_media_caltm||0.60))*100)}% melhor.

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 4 — Score por criterio (codigo)</p>
Cada galgo recebe um score 0-100 em cada criterio, multiplicado pelo seu peso:<br>
&bull; <strong>CalTm</strong> (peso ${config.peso_caltm||4}): normalizado pela diferenca para o melhor da corrida (teto ${config.teto_diff_normalizacao||0.50}s)<br>
&bull; <strong>Categoria</strong>: influencia via ajuste de CalTm (${config.ajuste_classe_segundos||0.20}s/nivel) + pool limitado a ${config.max_niveis_pool||2} nivel(is) + CalTm pode superar ate ${config.max_cat_diff_caltm||1} nivel(is)<br>
&bull; <strong>Bends/Perfil</strong> (peso ${config.peso_bends||3}): Recuperador=90pts, Frontrunner=80pts, Estavel=60pts, Fumador=20pts + bonus por split<br>
&bull; <strong>Remarks</strong> (peso ${config.peso_remarks||3}): combos muito positivos +30pts, positivos +15pts, negativos -20pts<br>
&bull; <strong>BRT</strong> (peso ${config.peso_brt||1}): comparativo entre galgos, penalizado se BRT em classe muito diferente ou galgo fora de forma<br>
&bull; <strong>Post Pick</strong> (peso ${config.peso_post_pick||0}): 1a escolha=100pts, 2a=75pts, 3a=55pts, fora=30pts

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 5 — Ranking e decisao (codigo)</p>
Score final = soma ponderada / soma dos pesos. Galgos ordenados do maior para o menor score.<br>
&bull; <strong>AvB</strong>: 1o vs ultimo. Se diferenca &lt; ${config.threshold_skip_avb||10}pts = Skip automatico (corrida parelha).<br>
&bull; <strong>Back</strong>: So gerado se diferenca entre 1o e 2o &gt; ${config.threshold_back||25}pts (vantagem absurda).
</div>
</details>
</div>
</div>

<div class="tab-panel" id="t-remarks">
<div class="section">
<div class="sec-title">Remarks — Listas Customizadas</div>
<div class="grid" style="grid-template-columns:1fr 1fr">
<div class="field"><label>Combinacoes muito positivas</label><textarea name="remarks_muito_positivos">${config.remarks_muito_positivos}</textarea><span class="hint">Ex: SAw+RnOn,Bmp+RnOn</span></div>
<div class="field"><label>Remarks positivos</label><textarea name="remarks_positivos">${config.remarks_positivos}</textarea></div>
<div class="field"><label>Atenuantes (nao penalizar)</label><textarea name="remarks_atenuantes">${config.remarks_atenuantes}</textarea><span class="hint">Acidentes externos</span></div>
<div class="field"><label>Remarks negativos</label><textarea name="remarks_negativos">${config.remarks_negativos}</textarea></div>
</div>
</div>
</div>

<div class="tab-panel" id="t-automacao">
<div class="section">
<div class="sec-title">Automacao — Robos e Visibilidade</div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
  <div class="field">
    <label>Refresh automático da tela (min)</label>
    <input type="number" name="auto_refresh_min" value="${config.auto_refresh_min||1}" min="1" max="60">
    <div class="hint">A cada quantos minutos atualiza o painel de corridas automaticamente</div>
  </div>
  <div class="field">
    <label>Corridas exibidas em tela</label>
    <input type="number" name="racas_em_tela" value="${config.racas_em_tela||6}" min="1" max="20">
    <div class="hint">Quantidade fixa de proximas corridas mostradas na lista da aba Analisar (as que ja passaram saem da lista automaticamente)</div>
  </div>
  <div class="field">
    <label>Intervalo do Robô de Resultados (min)</label>
    <input type="number" name="results_interval_min" value="${config.results_interval_min||30}" min="10" max="120">
    <div class="hint">A cada quantos minutos o robô atualiza os resultados</div>
  </div>
  <div class="field">
    <label>Início da janela de resultados (BRT)</label>
    <input type="time" name="results_window_start" value="${config.results_window_start||'09:00'}">
    <div class="hint">Horário BRT de início das atualizações automáticas</div>
  </div>
  <div class="field">
    <label>Fim da janela de resultados (BRT)</label>
    <input type="time" name="results_window_end" value="${config.results_window_end||'18:30'}">
    <div class="hint">Horário BRT de encerramento das atualizações automáticas</div>
  </div>
  <div class="field">
    <label>Hora de execução do Robô de PDFs (BRT)</label>
    <input type="time" name="pdf_cron_time" value="${config.pdf_cron_time||'13:30'}">
    <div class="hint">Horário BRT em que o robô baixa os PDFs do dia seguinte</div>
  </div>
</div>
</div>
</div>

<div class="btn-bar">
  <button type="submit" class="btn-save">Salvar Configuracoes</button>
  <button type="button" class="btn-reset" onclick="if(confirm('Restaurar padrao?'))location.href='${BASE}/config/reset'">Restaurar Padrao</button>
</div>

</div>
</div>
</form>
</div>

<div class="toast-bg" id="toast-bg">
  <div class="toast-box">
    <div class="toast-icon">&#128077;</div>
    <h3>Configuracoes salvas com sucesso!</h3>
    <p>As alteracoes ja estao em vigor para todos os usuarios.</p>
  </div>
</div>

<script>
function showTab(id){
  document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.tabbtn').forEach(function(b){b.classList.remove('active');});
  document.getElementById(id).classList.add('active');
  document.querySelector('.tabbtn[data-tab="'+id+'"]').classList.add('active');
}
function upR(input){var n=input.name;var v=document.getElementById('v_'+n);var b=document.getElementById('b_'+n);if(v)v.textContent=input.value+(n.startsWith('pct')?'%':'');if(b)b.style.width=(input.value*10)+'%';}
document.getElementById('cf').addEventListener('submit',async function(e){
  e.preventDefault();
  var data=Object.fromEntries(new FormData(this));
  var al=document.getElementById('alert');
  try{
    var r=await fetch('${BASE}/config/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(r.ok){
      var tb=document.getElementById('toast-bg');
      tb.classList.add('open');
      setTimeout(function(){tb.classList.remove('open');},2200);
    }
    else throw new Error('Erro ao salvar');
  }catch(err){al.className='alert er';al.textContent='Erro: '+err.message;al.style.display='block';}
});
</script></body></html>`);
});

router.post('/save', requireAdmin, express.json(), (req, res) => {
  try {
    const user = req.user;
    const d = req.body;
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN max_cat_diff_caltm INTEGER DEFAULT 1').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN peso_post_pick INTEGER DEFAULT 0').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN ajuste_classe_segundos REAL DEFAULT 0.20').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN desconto_acidente_leve REAL DEFAULT 0.10').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN desconto_acidente_medio REAL DEFAULT 0.20').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN desconto_acidente_grave REAL DEFAULT 0.35').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN proporcao_media_caltm REAL DEFAULT 0.60').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN proporcao_melhor_caltm REAL DEFAULT 0.40').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN teto_diff_normalizacao REAL DEFAULT 0.50').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN threshold_skip_avb REAL DEFAULT 10.0').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN threshold_back REAL DEFAULT 25.0').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN max_niveis_pool INTEGER DEFAULT 2').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN max_linhas_cat_inferior INTEGER DEFAULT 3').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN max_dias_gap_nova_cat INTEGER DEFAULT 14').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE analysis_config ADD COLUMN racas_em_tela INTEGER DEFAULT 6').run(); } catch(e) {}
    db.prepare(`UPDATE analysis_config SET peso_caltm=?,peso_bends=?,peso_remarks=?,peso_brt=?,dist_min=?,dist_max=?,classes_aceitas=?,min_corridas_uteis=?,pct_alta=?,pct_media=?,diff_caltm_significativa=?,diff_caltm_empate=?,remarks_muito_positivos=?,remarks_positivos=?,remarks_atenuantes=?,remarks_negativos=?,max_cat_diff_caltm=?,peso_post_pick=?,ajuste_classe_segundos=?,desconto_acidente_leve=?,desconto_acidente_medio=?,desconto_acidente_grave=?,proporcao_media_caltm=?,proporcao_melhor_caltm=?,teto_diff_normalizacao=?,threshold_skip_avb=?,threshold_back=?,max_niveis_pool=?,max_linhas_cat_inferior=?,max_dias_gap_nova_cat=?,auto_refresh_min=?,racas_em_tela=?,results_interval_min=?,results_window_start=?,results_window_end=?,pdf_cron_time=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).run(
      d.peso_caltm,d.peso_bends,d.peso_remarks,d.peso_brt,
      d.dist_min,d.dist_max,d.classes_aceitas,d.min_corridas_uteis,
      d.pct_alta,d.pct_media,d.diff_caltm_significativa,d.diff_caltm_empate,
      d.remarks_muito_positivos,d.remarks_positivos,d.remarks_atenuantes,d.remarks_negativos,
      d.max_cat_diff_caltm||1, d.peso_post_pick||0,
      d.ajuste_classe_segundos||0.20, d.desconto_acidente_leve||0.10, d.desconto_acidente_medio||0.20, d.desconto_acidente_grave||0.35,
      d.proporcao_media_caltm||0.60, 1-(d.proporcao_media_caltm||0.60),
      d.teto_diff_normalizacao||0.50, d.threshold_skip_avb||10, d.threshold_back||25,
      d.max_niveis_pool||2,
      d.max_linhas_cat_inferior||3,
      d.max_dias_gap_nova_cat||14,
      d.auto_refresh_min||1,
      d.racas_em_tela||6,
      d.results_interval_min||30,
      d.results_window_start||'09:00',
      d.results_window_end||'18:30',
      d.pdf_cron_time||'13:30',
      user.id
    );
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/reset', requireAdmin, (req, res) => {
  const user = req.user;
  db.prepare('DELETE FROM analysis_config WHERE user_id=?').run(user.id);
  const { getUserConfig } = require('../db/database');
  getUserConfig(user.id);
  res.redirect(BASE + '/config');
});

module.exports = router;