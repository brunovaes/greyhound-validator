const express = require('express');
const router = express.Router();
const { db, getUserConfig } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { navBar } = require('./main');
const { designTokensCSS } = require('../utils/designTokens');
const { icon } = require('../utils/icons');
const { NOMES_PISTAS } = require('../utils/nomesPistas');
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
  const config = getUserConfig(user.id, false);
  const CORES_HEX_CFG = { azul:'#3b82f6', roxo:'#8b5cf6', laranja:'#f97316', rosa:'#ec4899' };
  const alarmeCorHex = CORES_HEX_CFG[config.alarme_filtro_cor] || '#3b82f6';
  const pistasAlarme = Object.keys(NOMES_PISTAS).map(function(k){return [k, NOMES_PISTAS[k]];}).sort(function(a,b){return a[1].localeCompare(b[1]);});
  const classesAlarme = ['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12'];
  const alarmePistasSel = String(config.alarme_filtro_pistas||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
  const alarmeClassesSel = String(config.alarme_filtro_classes||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
  const logoB64 = getLogo();

  // Gera o switch liga/desliga de um bloco de configuracao. O input hidden
  // ANTES do checkbox garante que o valor "0" sempre vai no FormData quando
  // desmarcado (checkbox sozinho nao manda nada se desmarcado)
  function blocoToggle(campo, label) {
    const ativo = config[campo] === undefined ? 1 : config[campo];
    return `<div class="bloco-toggle">
      <input type="hidden" name="${campo}" value="0">
      <label class="bloco-switch">
        <input type="checkbox" name="${campo}" value="1" ${ativo ? 'checked' : ''} onchange="toggleBloco(this,'${campo}_fields')">
        <span class="slider"></span>
      </label>
      <span class="bloco-toggle-label" id="${campo}_label" style="color:${ativo ? '#22c55e' : '#888'}">${ativo ? label + ' customizado ativo' : 'Motor fixo (padrão de fábrica) — campos abaixo desativados'}</span>
    </div>`;
  }

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configurações - Greyhound Validator</title>
<style>
${designTokensCSS()}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
nav{background:#0D1117;border-bottom:1px solid #222;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}.nl:hover,.na{color:#22c55e;border-bottom-color:#22c55e}
.content{padding:24px;max-width:1200px;margin:0 auto}
h1{font-size:20px;font-weight:700;margin-bottom:4px}.sub{font-size:13px;color:#888;margin-bottom:20px}
.layout{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
.tabnav{background:#161B27;border:1px solid #222;border-radius:10px;padding:8px;position:sticky;top:16px;display:flex;flex-direction:column;gap:2px}
.tabbtn{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:#888;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;transition:all .15s}
.tabbtn:hover{background:rgba(34,197,94,.08);color:#ccc}
.tabbtn.active{background:rgba(34,197,94,.12);color:#22c55e}
.bloco-toggle{display:flex;align-items:center;gap:10px;background:#161B27;border:1px solid #222;border-radius:8px;padding:10px 14px;margin-bottom:16px}
.bloco-switch{position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0}
.bloco-switch input{opacity:0;width:0;height:0}
.bloco-switch .slider{position:absolute;cursor:pointer;inset:0;background:#333;border-radius:22px;transition:.15s}
.bloco-switch .slider:before{position:absolute;content:"";height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.15s}
.bloco-switch input:checked+.slider{background:#22c55e}
.bloco-switch input:checked+.slider:before{transform:translateX(18px)}
.bloco-toggle-label{font-size:12px;font-weight:600}
.bloco-fields[data-ativo="0"]{opacity:.4;pointer-events:none}
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
.graf-card{background:#0D1117;border:1px solid #222;border-radius:10px;padding:16px;margin-bottom:16px}
.graf-title{font-size:12px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
.toast-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center}
.toast-bg.open{display:flex}
.toast-box{background:#161B27;border:1px solid #22c55e;border-radius:14px;padding:32px 40px;text-align:center;animation:popIn .3s ease}
@keyframes popIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
.toast-icon{font-size:52px;margin-bottom:12px}
.toast-box h3{font-size:17px;color:#f0f0f0;margin-bottom:6px}
.toast-box p{font-size:12px;color:#888}
@media(max-width:800px){.layout{grid-template-columns:1fr}.tabnav{position:static;flex-direction:row;overflow-x:auto;gap:4px;-webkit-overflow-scrolling:touch}.tabnav .tabbtn{width:auto;white-space:nowrap;flex-shrink:0}.content{padding:14px 12px}}
</style></head><body>
<div class="hero">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : ''}</div>
${navBar(user, 'config')}
<div class="content">
<h1>Configurações de Análise</h1>
<p class="sub">Estas configuracoes se aplicam a TODOS os usuarios do sistema.</p>
<div class="alert" id="alert"></div>
<form id="cf">
<div class="layout">

<div class="tabnav">
  <button type="button" class="tabbtn active" data-tab="t-pesos" onclick="showTab('t-pesos')">${icon('sliders',{size:14})} Pesos dos Critérios</button>
  <button type="button" class="tabbtn" data-tab="t-categoria" onclick="showTab('t-categoria')">${icon('layers',{size:14})} Categoria</button>
  <button type="button" class="tabbtn" data-tab="t-filtros" onclick="showTab('t-filtros')">${icon('filter',{size:14})} Filtros de Corrida</button>
  <button type="button" class="tabbtn" data-tab="t-confianca" onclick="showTab('t-confianca')">${icon('shield',{size:14})} Thresholds de Confiança</button>
  <button type="button" class="tabbtn" data-tab="t-motor" onclick="showTab('t-motor')">${icon('gear',{size:14})} Motor de Pontuação</button>
  <button type="button" class="tabbtn" data-tab="t-automacao" onclick="showTab('t-automacao')">${icon('clock',{size:14})} Alarme</button>
  <button type="button" class="tabbtn" data-tab="t-dash" onclick="showTab('t-dash');carregarDashboard()">${icon('trophy',{size:14})} Desempenho (HR)</button>
  <button type="button" class="tabbtn" data-tab="t-graf" onclick="showTab('t-graf');carregarGraf()">${icon('layers',{size:14})} Dashboard</button>
</div>

<div>

<div class="tab-panel active" id="t-pesos">
<div class="section">
<div class="sec-title">Pesos dos Critérios</div>
${blocoToggle('bloco_pesos_ativo', 'Pesos')}
<div class="info-box">Os pesos orientam o Claude sobre qual critério priorizar. Valores maiores = mais importante no raciocinio.</div>
<div class="grid bloco-fields" id="bloco_pesos_ativo_fields" data-ativo="${config.bloco_pesos_ativo===0?'0':'1'}">
${[['peso_caltm','Tempo Final CalTm','Media dos tempos calibrados',config.peso_caltm||5,1,10],
   ['peso_categoria','Categoria','Diferenca de classe nas 3 linhas mais recentes',config.peso_categoria||4,1,10],
   ['peso_bends','Bends / Perfil','Padrao de corrida (Avassalador/Turbo/Recuperador/Estavel/Fumador)',config.peso_bends||3,1,10],
   ['peso_split','Split','Velocidade de saida ate a 1a curva, comparado ao melhor da corrida',config.peso_split||3,1,10],
   ['peso_sp','SP (Starting Price)','Confianca do mercado nas ultimas corridas',config.peso_sp||3,1,10],
   ['peso_remarks','Remarks','Merito + corrida escondida (HiddenRun)',config.peso_remarks||2,1,10],
   ['peso_post_pick','Post Pick (Racing Post)','Indicacao dos 3 melhores no cabecalho do PDF',config.peso_post_pick||2,0,10],
   ['peso_brt','Melhor Tempo BRT','Desempate final',config.peso_brt||1,1,10]].map(([n,l,h,v,mn,mx])=>
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
${blocoToggle('bloco_categoria_ativo', 'Categoria')}
<div class="info-box">
  Controla como a classe historica dos galgos influencia a análise.<br>
  <strong>Diferenca que CalTm pode superar:</strong> quantos níveis de classe o tempo pode compensar entre dois galgos.<br>
  <strong>Niveis no pool:</strong> quantos níveis de diferença em relação a classe do card sao aceitos no historico valido.
</div>
<div class="bloco-fields" id="bloco_categoria_ativo_fields" data-ativo="${config.bloco_categoria_ativo===0?'0':'1'}">
<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
<div class="field">
  <label>Diferenca maxima de categoria que CalTm pode superar</label>
  <select name="max_cat_diff_caltm">
    <option value="0" ${(config.max_cat_diff_caltm||1)===0?'selected':''}>0 — Categoria sempre decide</option>
    <option value="1" ${(config.max_cat_diff_caltm||1)===1?'selected':''}>1 nivel (ex: A5 vs A6)</option>
    <option value="2" ${(config.max_cat_diff_caltm||1)===2?'selected':''}>2 níveis (ex: A5 vs A7)</option>
    <option value="3" ${(config.max_cat_diff_caltm||1)===3?'selected':''}>3 níveis (ex: A5 vs A8)</option>
  </select>
  <span class="hint">Define quando o CalTm pode superar a diferenca de classe entre dois galgos comparados</span>
</div>
<div class="field">
  <label>Niveis diferentes permitidos no pool</label>
  <select name="max_niveis_pool">
    <option value="1" ${(config.max_niveis_pool||2)===1?'selected':''}>1 nivel (apenas classe do card)</option>
    <option value="2" ${(config.max_niveis_pool||2)===2?'selected':''}>2 níveis (ex: A7 aceita A8)</option>
    <option value="3" ${(config.max_niveis_pool||2)===3?'selected':''}>3 níveis (ex: A7 aceita A8 e A9)</option>
    <option value="4" ${(config.max_niveis_pool||2)===4?'selected':''}>4 níveis (histórico amplo)</option>
  </select>
  <span class="hint">Quantos níveis abaixo ou acima da classe do card sao aceitos nas linhas validas do galgo</span>
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
  <label>Gap máximo entre as duas últimas corridas (dias)</label>
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
</div>

<div class="tab-panel" id="t-filtros">
<div class="section">
<div class="sec-title">Filtros de Corrida</div>
${blocoToggle('bloco_filtros_ativo', 'Filtros de Corrida')}
<div class="grid bloco-fields" id="bloco_filtros_ativo_fields" data-ativo="${config.bloco_filtros_ativo===0?'0':'1'}">
<div class="field"><label>Distancia minima (m)</label><input type="number" name="dist_min" value="${config.dist_min}" min="200" max="600"><span class="hint">Corridas abaixo sao descartadas</span></div>
<div class="field"><label>Distancia maxima (m)</label><input type="number" name="dist_max" value="${config.dist_max}" min="400" max="1000"><span class="hint">Corridas acima sao descartadas</span></div>
<div class="field"><label>Mín. corridas na pista/distância exata</label><input type="number" name="min_corridas_uteis" value="${config.min_corridas_uteis}" min="1" max="10"><span class="hint">Quantas linhas do histórico precisam ser na MESMA pista e MESMA distância da corrida de hoje pra considerar o galgo elegível. Abaixo disso, ele é eliminado do AvB.</span></div>
<div class="field"><label>Classes aceitas</label><input type="text" name="classes_aceitas" value="${config.classes_aceitas}"><span class="hint">Separadas por virgula</span></div>
</div>
</div>
</div>

<div class="tab-panel" id="t-confianca">
<div class="section">
<div class="sec-title">Thresholds de Confiança</div>
${blocoToggle('bloco_confianca_ativo', 'Thresholds de Confiança')}
<div class="grid bloco-fields" id="bloco_confianca_ativo_fields" data-ativo="${config.bloco_confianca_ativo===0?'0':'1'}">
<div class="field"><label>Alta confiança (%)</label>
<input type="range" name="pct_alta" min="50" max="90" value="${config.pct_alta}" oninput="upR(this)">
<div style="display:flex;justify-content:space-between"><span class="hint">Minimo para badge Alta</span><span class="rv" id="v_pct_alta">${config.pct_alta}%</span></div></div>
<div class="field"><label>Média confiança (%)</label>
<input type="range" name="pct_media" min="30" max="70" value="${config.pct_media}" oninput="upR(this)">
<div style="display:flex;justify-content:space-between"><span class="hint">Minimo para badge Media</span><span class="rv" id="v_pct_media">${config.pct_media}%</span></div></div>
</div>
</div>
</div>

<div class="tab-panel" id="t-motor">
<div class="section">
<div class="sec-title">Motor de Pontuação</div>
${blocoToggle('bloco_motor_ativo', 'Motor de Pontuação')}
<div class="info-box">Estes parametros controlam o calculo deterministico de scores. O Claude agora so extrai dados brutos — toda a decisao de favorito/ranking/AvB/Back e feita por codigo com base nesses valores.</div>
<div class="grid bloco-fields" id="bloco_motor_ativo_fields" data-ativo="${config.bloco_motor_ativo===0?'0':'1'}">
<div class="field"><label>Ajuste por nivel de classe (s)</label><input type="number" name="ajuste_classe_segundos" value="${config.ajuste_classe_segundos||0.20}" step="0.05" min="0.05" max="0.50"><span class="hint">Ex: galgo em A5 correu em A3 = +0.20s no tempo (normaliza pra comparar)</span></div>
<div class="field"><label>Desconto acidente leve (s)</label><input type="number" name="desconto_acidente_leve" value="${config.desconto_acidente_leve||0.10}" step="0.02" min="0" max="0.30"><span class="hint">Bmp, SAw, MsdBrk — tempo ajustado para baixo</span></div>
<div class="field"><label>Desconto acidente medio (s)</label><input type="number" name="desconto_acidente_medio" value="${config.desconto_acidente_medio||0.20}" step="0.02" min="0" max="0.50"><span class="hint">Crd, FcdCk — desconto maior</span></div>
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
<div class="field"><label>Score mínimo para gerar AvB (pts)</label><input type="number" name="threshold_skip_avb" value="${config.threshold_skip_avb||10}" step="1" min="1" max="30"><span class="hint">Abaixo disso = corrida parelha = skip automatico</span></div>
<div class="field"><label>Score mínimo para gerar Back (pts)</label><input type="number" name="threshold_back" value="${config.threshold_back||25}" step="1" min="10" max="50"><span class="hint">Diferenca entre 1o e 2o colocado — barra alta para Back</span></div>
</div>
</div>

<div class="section">
<div class="sec-title" style="display:flex;align-items:center;gap:8px">${icon('scroll',{size:14})} Documento de Regras</div>
<details style="cursor:pointer">
<summary style="font-size:12px;color:#22c55e;padding:4px 0">Ver como funciona o motor de pontuação (clique para expandir)</summary>
<div style="margin-top:14px;font-size:12px;color:#aaa;line-height:1.8;background:#0D1117;padding:14px;border-radius:8px">
<p style="color:#f0f0f0;font-weight:700;margin-bottom:8px">Como o motor calcula o resultado de cada corrida:</p>

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 1 — Extracao (Claude)</p>
O Claude le o PDF e extrai os dados brutos de cada galgo: historico de corridas, tempos CalTm, remarks, bends, splits, BRT. Zero julgamento nesta fase.

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 2 — Filtro de linhas validas (codigo)</p>
Para cada galgo, cada linha do historico e avaliada. E descartada se: distancia for diferente da corrida atual (&gt;10%), classe invalida (HP, Trial, OR, Solo), acidente gravissimo (Fall, Stmb, RnUp), ou sem CalTm. Se o galgo tiver menos de 3 linhas validas, ele e eliminado da corrida. Se sobrar menos de 4 galgos, a corrida vira Skip.

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 3 — Ajuste de CalTm (codigo)</p>
Cada linha valida tem seu CalTm ajustado: desconto por acidente (Bmp=-${config.desconto_acidente_leve||0.10}s, Crd=-${config.desconto_acidente_medio||0.20}s) e ajuste por nivel de classe (+${config.ajuste_classe_segundos||0.20}s por nivel de diferenca). Os 3 ajustados mais recentes sao agregados com peso por recencia (3x, 2x, 1x) em ${Math.round((config.proporcao_media_caltm||0.60)*100)}% media + ${Math.round((1-(config.proporcao_media_caltm||0.60))*100)}% melhor.

<p style="color:#22c55e;margin-top:12px;margin-bottom:4px">FASE 4 — Score por critério (código)</p>
Cada galgo recebe um score 0-100 em cada critério, multiplicado pelo seu peso:<br>
&bull; <strong>CalTm</strong> (peso ${config.peso_caltm||4}): normalizado pela diferenca para o melhor da corrida (teto ${config.teto_diff_normalizacao||0.50}s)<br>
&bull; <strong>Categoria</strong>: influencia via ajuste de CalTm (${config.ajuste_classe_segundos||0.20}s/nivel) + pool limitado a ${config.max_niveis_pool||2} nível(is) + CalTm pode superar ate ${config.max_cat_diff_caltm||1} nivel(is)<br>
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

<div class="tab-panel" id="t-automacao">

<div class="section">
<div class="sec-title">Alarme para filtro selecionado</div>
<div class="bloco-toggle">
  <input type="hidden" name="alarme_filtro_ativo" value="0">
  <label class="bloco-switch">
    <input type="checkbox" name="alarme_filtro_ativo" value="1" ${config.alarme_filtro_ativo?'checked':''} onchange="var l=this.closest('.bloco-toggle').querySelector('.bloco-toggle-label');l.style.color=this.checked?'#22c55e':'#888';l.textContent=this.checked?'Alarme ativo':'Alarme desligado';var ff=document.getElementById('alarme_filtro_fields');if(ff)ff.setAttribute('data-ativo',this.checked?'1':'0');">
    <span class="slider"></span>
  </label>
  <span class="bloco-toggle-label" style="color:${config.alarme_filtro_ativo?'#22c55e':'#888'}">${config.alarme_filtro_ativo?'Alarme ativo':'Alarme desligado'}</span>
</div>
<div class="info-box">Quando ligado, as corridas que casam com o filtro (turno E pista E classe) piscam na cor escolhida e tocam o som escolhido no tempo do alerta. As demais seguem o alerta normal.</div>
<div class="bloco-fields" id="alarme_filtro_fields" data-ativo="${config.alarme_filtro_ativo?'1':'0'}">
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px">
  <div class="field"><label>Turno</label>
    <select name="alarme_filtro_turno">
      <option value="" ${!config.alarme_filtro_turno?'selected':''}>Todos</option>
      <option value="manha" ${config.alarme_filtro_turno==='manha'?'selected':''}>Manhã</option>
      <option value="tarde" ${config.alarme_filtro_turno==='tarde'?'selected':''}>Tarde</option>
    </select>
  </div>
  <div class="field"><label>Som de Alerta</label>
    <div style="display:flex;gap:8px;align-items:center">
      <select name="alarme_filtro_som" id="alarme_filtro_som" style="flex:1">
        <option value="sino" ${config.alarme_filtro_som==='sino'?'selected':''}>Sino</option>
        <option value="beep" ${config.alarme_filtro_som==='beep'||!config.alarme_filtro_som?'selected':''}>Beep</option>
        <option value="alarme" ${config.alarme_filtro_som==='alarme'?'selected':''}>Alarme</option>
        <option value="suave" ${config.alarme_filtro_som==='suave'?'selected':''}>Suave</option>
      </select>
      <button type="button" onclick="testarSomAlarme()" style="background:#222;color:#fff;border:1px solid #444;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;white-space:nowrap">🔊 Testar</button>
    </div>
  </div>
  <div class="field"><label>Cor de Alerta</label>
    <div style="display:flex;gap:8px;align-items:center">
      <select name="alarme_filtro_cor" id="alarme_filtro_cor" style="flex:1" onchange="previewCorAlarme()">
        <option value="azul" ${config.alarme_filtro_cor==='azul'||!config.alarme_filtro_cor?'selected':''}>Azul</option>
        <option value="roxo" ${config.alarme_filtro_cor==='roxo'?'selected':''}>Roxo</option>
        <option value="laranja" ${config.alarme_filtro_cor==='laranja'?'selected':''}>Laranja</option>
        <option value="rosa" ${config.alarme_filtro_cor==='rosa'?'selected':''}>Rosa</option>
      </select>
      <span id="alarme_cor_preview" style="display:inline-block;width:34px;height:22px;border-radius:5px;flex-shrink:0;background:${alarmeCorHex}"></span>
    </div>
  </div>
</div>
<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
  <div class="field"><label>Pista (várias)</label>
    <div style="max-height:170px;overflow:auto;background:#0D1117;border:1px solid #222;border-radius:6px;padding:8px">
      ${pistasAlarme.map(function(p){return `<label style="display:flex;align-items:center;gap:8px;padding:3px 4px;font-size:12px;color:#ddd;cursor:pointer;white-space:nowrap;text-transform:none;letter-spacing:normal;font-weight:400"><input type="checkbox" class="alarme-pista-cb" value="${p[0]}" ${alarmePistasSel.indexOf(p[0])>=0?'checked':''} onchange="coletaAlarme('pista')" style="width:15px;height:15px;flex-shrink:0;cursor:pointer">${p[1]}</label>`;}).join('')}
    </div>
    <input type="hidden" name="alarme_filtro_pistas" id="alarme_pistas_val" value="${config.alarme_filtro_pistas||''}">
    <div class="hint">Nada marcado = qualquer pista.</div>
  </div>
  <div class="field"><label>Classe (várias)</label>
    <div style="max-height:170px;overflow:auto;background:#0D1117;border:1px solid #222;border-radius:6px;padding:8px">
      ${classesAlarme.map(function(cl){return `<label style="display:flex;align-items:center;gap:8px;padding:3px 4px;font-size:12px;color:#ddd;cursor:pointer;white-space:nowrap;text-transform:none;letter-spacing:normal;font-weight:400"><input type="checkbox" class="alarme-classe-cb" value="${cl}" ${alarmeClassesSel.indexOf(cl)>=0?'checked':''} onchange="coletaAlarme('classe')" style="width:15px;height:15px;flex-shrink:0;cursor:pointer">${cl}</label>`;}).join('')}
    </div>
    <input type="hidden" name="alarme_filtro_classes" id="alarme_classes_val" value="${config.alarme_filtro_classes||''}">
    <div class="hint">Nada marcado = qualquer classe.</div>
  </div>
</div>
</div>
</div>
</div>


<div class="tab-panel" id="t-dash">
<div class="section">
<div class="sec-title">Desempenho — Painel de HR (Taxa de Acerto)</div>
<div class="info-box">Acompanhe o andamento sem baixar nada. HR corrigido pela chegada real, quebrado por <strong>turno</strong>, <strong>pista</strong>, <strong>nº de cães</strong> e <strong>classe</strong>. Verde = confiável (≥65%), âmbar = médio, vermelho = fraco (&lt;50%). ⚠ = resultados suspeitos (label).<br><strong>Horários em BR (Brasília).</strong> As corridas são do Reino Unido (UK = BR + 4h) e já vêm convertidas pro teu relógio. Ex.: um páreo que corre às <strong>17h no UK aparece aqui como 13h BR</strong>. Dois turnos: <strong>Manhã (a partir das 6h)</strong> e <strong>Tarde (a partir das 13h)</strong>, horário BR.</div>
<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
  <div class="field" style="flex:1;min-width:120px"><label style="white-space:nowrap">De</label><input type="date" id="dash_from" onclick="try{this.showPicker()}catch(e){}"></div>
  <div class="field" style="flex:1;min-width:120px"><label style="white-space:nowrap">Até</label><input type="date" id="dash_to" onclick="try{this.showPicker()}catch(e){}"></div>
  <div class="field" style="width:100px;flex-shrink:0"><label style="white-space:nowrap">Manhã (BR)</label><input type="number" id="dash_t1" value="6" min="0" max="23"></div>
  <div class="field" style="width:100px;flex-shrink:0"><label style="white-space:nowrap">Tarde (BR)</label><input type="number" id="dash_t2" value="13" min="0" max="23"></div>
  <button type="button" class="btn-save" style="padding:9px 18px;flex-shrink:0" onclick="carregarDashboard()">↻ Atualizar</button>
</div>
<div style="margin-top:16px;padding-top:14px;border-top:1px solid #222">
<div style="font-size:12px;color:#22c55e;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Cruzar filtros <span style="color:#888;font-weight:400;text-transform:none;letter-spacing:0">— deixe em "Todos" o que não quiser fixar</span></div>
<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
  <div class="field" style="flex:1;min-width:150px"><label style="white-space:nowrap">Turno</label><select id="dash_f_turno" onchange="carregarDashboard()"><option value="">Todos</option></select></div>
  <div class="field" style="flex:1;min-width:150px;position:relative"><label style="white-space:nowrap">Pista (várias)</label>
    <div id="dash_f_pista_box" onclick="togglePistaPanel(event)" style="padding:8px 10px;background:#0D1117;border:1px solid #222;border-radius:6px;color:#f0f0f0;font-size:13px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Todas ▾</div>
    <div id="dash_f_pista_panel" style="display:none;position:absolute;z-index:30;top:100%;left:0;right:0;margin-top:4px;background:#161B27;border:1px solid #333;border-radius:6px;max-height:230px;overflow:auto;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.55)"></div>
  </div>
  <div class="field" style="width:100px;flex-shrink:0"><label style="white-space:nowrap">Nº cães</label><select id="dash_f_caes" onchange="carregarDashboard()"><option value="">Todos</option></select></div>
  <div class="field" style="width:140px;flex-shrink:0;position:relative"><label style="white-space:nowrap">Classe (várias)</label>
    <div id="dash_f_classe_box" onclick="toggleClassePanel(event)" style="padding:8px 10px;background:#0D1117;border:1px solid #222;border-radius:6px;color:#f0f0f0;font-size:13px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Todas ▾</div>
    <div id="dash_f_classe_panel" style="display:none;position:absolute;z-index:30;top:100%;left:0;right:0;margin-top:4px;background:#161B27;border:1px solid #333;border-radius:6px;max-height:230px;overflow:auto;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.55)"></div>
  </div>
  <div class="field" style="width:78px;flex-shrink:0"><label style="white-space:nowrap" title="Mostra só pistas/classes cujo Nº de corridas está no intervalo">Qtd mín</label><input type="number" id="dash_qtd_min" min="1" placeholder="–" title="Nº mínimo de corridas da pista/classe" onchange="carregarDashboard()"></div>
  <div class="field" style="width:80px;flex-shrink:0"><label style="white-space:nowrap" title="Mostra só pistas/classes cujo Nº de corridas está no intervalo">Qtd máx</label><input type="number" id="dash_qtd_max" min="1" placeholder="–" title="Nº máximo de corridas da pista/classe" onchange="carregarDashboard()"></div>
  <button type="button" style="padding:9px 16px;background:transparent;border:1px solid #f97316;color:#f97316;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0" onclick="limparFiltrosDash()">✕ Limpar</button>
</div>
</div>
<div id="dash-content" style="margin-top:18px"><div style="color:#888;font-size:13px">Carregando…</div></div>
</div>
</div>

<div class="tab-panel" id="t-graf">
<div class="section">
<div class="sec-title">Dashboard — Visão Geral</div>
<div class="info-box">Vários gráficos numa tela só, com os mesmos filtros. Curva S acumulando os AvBs do período (abertos, acertados, errados), pizza por pista e desempenho por classe, turno e nº de cães. Tudo por login, com o "bateu" corrigido pela chegada real.</div>
<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:8px">
  <div class="field" style="flex:1;min-width:120px"><label style="white-space:nowrap">De</label><input type="date" id="g_from" onclick="try{this.showPicker()}catch(e){}" onchange="carregarGraf()"></div>
  <div class="field" style="flex:1;min-width:120px"><label style="white-space:nowrap">Até</label><input type="date" id="g_to" onclick="try{this.showPicker()}catch(e){}" onchange="carregarGraf()"></div>
  <div class="field" style="flex:1;min-width:130px"><label style="white-space:nowrap">Turno</label><select id="g_turno" onchange="carregarGraf()"><option value="">Todos</option></select></div>
  <div class="field" style="flex:1;min-width:150px"><label style="white-space:nowrap">Pista</label><select id="g_pista" onchange="carregarGraf()"><option value="">Todas</option></select></div>
  <div class="field" style="flex:1;min-width:120px"><label style="white-space:nowrap">Classe</label><select id="g_classe" onchange="carregarGraf()"><option value="">Todas</option></select></div>
  <button type="button" style="padding:9px 16px;background:transparent;border:1px solid #f97316;color:#f97316;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0" onclick="limparGraf()">✕ Limpar</button>
</div>
<div id="graf-kpis" style="display:flex;gap:12px;flex-wrap:wrap;margin:14px 0"></div>
<div class="graf-card">
  <div class="graf-title">Curva S — AvBs acumulados no período</div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;font-size:11px">
    <span style="display:flex;align-items:center;gap:6px;color:#ccc"><span style="width:16px;height:0;border-top:2px solid #9aa4b2;display:inline-block"></span> Abertos</span>
    <span style="display:flex;align-items:center;gap:6px;color:#ccc"><span style="width:16px;height:0;border-top:2px solid #22c55e;display:inline-block"></span> Acertados</span>
    <span style="display:flex;align-items:center;gap:6px;color:#ccc"><span style="width:16px;height:0;border-top:2px dashed #ef4444;display:inline-block"></span> Errados</span>
  </div>
  <div id="graf-curvas"></div>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
  <div>
    <div class="graf-card">
      <div class="graf-title">Distribuição por Pista (volume de AvBs)</div>
      <div id="graf-pizza"></div>
    </div>
    <div class="graf-card">
      <div class="graf-title">Pistas com mais vitórias (acertos)</div>
      <div id="graf-pizza-vit"></div>
    </div>
  </div>
  <div class="graf-card">
    <div class="graf-title">Desempenho por Classe / Turno / Nº de cães</div>
    <div id="graf-bars"></div>
  </div>
</div>
</div>
</div>

<div class="btn-bar">
  <button type="submit" class="btn-save">Salvar Configurações</button>
  <button type="button" class="btn-reset" onclick="if(confirm('Restaurar padrao?'))location.href='${BASE}/config/reset'">Restaurar Padrao</button>
</div>

</div>
</div>
</form>
</div>

<div class="toast-bg" id="toast-bg">
  <div class="toast-box">
    <div class="toast-icon">&#128077;</div>
    <h3>Configurações salvas com sucesso!</h3>
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
// ===== Dashboard de Desempenho (HR) =====
function dashHrColor(hr){ return hr>=0.65?'#22c55e':(hr<0.5?'#ef4444':'#eab308'); }
function dashKpi(label,val,col){
  return '<div style="background:#0D1117;border:1px solid #222;border-radius:8px;padding:12px 16px;min-width:110px;flex:1">'
    +'<div style="font-size:22px;font-weight:800;color:'+col+'">'+val+'</div>'
    +'<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-top:2px">'+label+'</div></div>';
}
function dashBar(item){
  var pct=Math.round(item.hr*100), col=dashHrColor(item.hr);
  var amCor=item.amostra==='boa'?'#22c55e':(item.amostra==='media'?'#eab308':'#666');
  var err=item.err>0?' <span style="color:#ef4444;font-size:10px" title="resultados suspeitos (label)">⚠'+item.err+'</span>':'';
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">'
    +'<div style="width:135px;flex-shrink:0;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+item.chave+'">'+item.chave+'</div>'
    +'<div style="flex:1;background:#0D1117;border:1px solid #222;border-radius:4px;height:16px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:'+col+';border-radius:3px"></div></div>'
    +'<div style="width:40px;text-align:right;font-weight:700;color:'+col+'">'+pct+'%</div>'
    +'<div style="width:78px;color:#888;font-size:10px">'+item.ac+'/'+item.n+' <span style="color:'+amCor+'">'+item.amostra+'</span>'+err+'</div>'
    +'</div>';
}
function dashSecao(titulo,arr){
  if(!arr||!arr.length) return '';
  return '<div style="margin-bottom:18px"><div style="font-size:12px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">'+titulo+'</div>'+arr.map(dashBar).join('')+'</div>';
}
var dashPistasSel = [], dashPistaDirty = false, dashNomes = {};
function nomePistaCli(code){ return (dashNomes && dashNomes[code]) || code; }
function fecharPistaEComitar(){
  var p=document.getElementById('dash_f_pista_panel'); if(p) p.style.display='none';
  if(dashPistaDirty){ dashPistaDirty=false; carregarDashboard(); }
}
function togglePistaPanel(e){
  if(e&&e.stopPropagation)e.stopPropagation();
  var p=document.getElementById('dash_f_pista_panel'); if(!p) return;
  if(p.style.display==='block'){ fecharPistaEComitar(); } else { p.style.display='block'; }
}
function preenchePistaPanel(pistas){
  var pan=document.getElementById('dash_f_pista_panel'); if(!pan) return;
  dashPistasSel = dashPistasSel.filter(function(p){ return (pistas||[]).indexOf(p)>=0; });
  var h=(pistas||[]).map(function(p){
    var ck = dashPistasSel.indexOf(p)>=0?'checked':'';
    return '<label style="display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:4px 6px;font-size:13px;color:#ddd;cursor:pointer;white-space:nowrap;text-align:left;text-transform:none;letter-spacing:normal;font-weight:400"><input type="checkbox" value="'+p+'" '+ck+' onchange="onPistaCheck(this)" style="margin:0;padding:0;width:16px;height:16px;flex-shrink:0;cursor:pointer">'+nomePistaCli(p)+'</label>';
  }).join('');
  pan.innerHTML = h || '<div style="color:#888;font-size:11px;padding:4px">Sem pistas no período</div>';
  atualizaPistaBox();
}
function onPistaCheck(cb){
  var v=cb.value;
  if(cb.checked){ if(dashPistasSel.indexOf(v)<0) dashPistasSel.push(v); }
  else { dashPistasSel = dashPistasSel.filter(function(p){return p!==v;}); }
  dashPistaDirty=true; atualizaPistaBox();  // NAO recarrega aqui — so ao sair do campo
}
function atualizaPistaBox(){
  var box=document.getElementById('dash_f_pista_box'); if(!box) return;
  if(!dashPistasSel.length) box.textContent='Todas ▾';
  else if(dashPistasSel.length<=2) box.textContent=dashPistasSel.map(nomePistaCli).join(', ')+' ▾';
  else box.textContent=dashPistasSel.length+' pistas ▾';
}
document.addEventListener('click', function(e){
  var box=document.getElementById('dash_f_pista_box'), pan=document.getElementById('dash_f_pista_panel');
  if(pan && pan.style.display==='block' && !pan.contains(e.target) && e.target!==box){ fecharPistaEComitar(); }
});
// ===== Classe (multipla) — mesmo padrao da Pista =====
var dashClassesSel = [], dashClasseDirty = false;
function cmpClasseCli(a,b){ a=String(a); b=String(b); var pa=(a.match(/[A-Za-z]+/)||[''])[0], pb=(b.match(/[A-Za-z]+/)||[''])[0]; if(pa!==pb) return pa.localeCompare(pb); var na=parseInt((a.match(/\d+/)||['0'])[0],10), nb=parseInt((b.match(/\d+/)||['0'])[0],10); if(na!==nb) return na-nb; return a.localeCompare(b); }
function fecharClasseEComitar(){
  var p=document.getElementById('dash_f_classe_panel'); if(p) p.style.display='none';
  if(dashClasseDirty){ dashClasseDirty=false; carregarDashboard(); }
}
function toggleClassePanel(e){
  if(e&&e.stopPropagation)e.stopPropagation();
  var p=document.getElementById('dash_f_classe_panel'); if(!p) return;
  if(p.style.display==='block'){ fecharClasseEComitar(); } else { p.style.display='block'; }
}
function preencheClassePanel(classes){
  var pan=document.getElementById('dash_f_classe_panel'); if(!pan) return;
  var lista=(classes||[]).slice().sort(cmpClasseCli);
  dashClassesSel = dashClassesSel.filter(function(c){ return lista.indexOf(c)>=0; });
  var h=lista.map(function(c){
    var ck = dashClassesSel.indexOf(c)>=0?'checked':'';
    return '<label style="display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:4px 6px;font-size:13px;color:#ddd;cursor:pointer;white-space:nowrap;text-align:left;text-transform:none;letter-spacing:normal;font-weight:400"><input type="checkbox" value="'+c+'" '+ck+' onchange="onClasseCheck(this)" style="margin:0;padding:0;width:16px;height:16px;flex-shrink:0;cursor:pointer">'+c+'</label>';
  }).join('');
  pan.innerHTML = h || '<div style="color:#888;font-size:11px;padding:4px">Sem classes no período</div>';
  atualizaClasseBox();
}
function onClasseCheck(cb){
  var v=cb.value;
  if(cb.checked){ if(dashClassesSel.indexOf(v)<0) dashClassesSel.push(v); }
  else { dashClassesSel = dashClassesSel.filter(function(c){return c!==v;}); }
  dashClasseDirty=true; atualizaClasseBox();  // NAO recarrega aqui — so ao sair do campo
}
function atualizaClasseBox(){
  var box=document.getElementById('dash_f_classe_box'); if(!box) return;
  var sel=dashClassesSel.slice().sort(cmpClasseCli);
  if(!sel.length) box.textContent='Todas ▾';
  else if(sel.length<=3) box.textContent=sel.join(', ')+' ▾';
  else box.textContent=sel.length+' classes ▾';
}
document.addEventListener('click', function(e){
  var box=document.getElementById('dash_f_classe_box'), pan=document.getElementById('dash_f_classe_panel');
  if(pan && pan.style.display==='block' && !pan.contains(e.target) && e.target!==box){ fecharClasseEComitar(); }
});
function dashPreencheSelect(id, valores, sel, prefixoTodos){
  var el=document.getElementById(id); if(!el) return;
  var opts='<option value="">'+prefixoTodos+'</option>';
  (valores||[]).forEach(function(v){ opts+='<option value="'+v+'"'+(String(v)===String(sel||'')?' selected':'')+'>'+v+'</option>'; });
  el.innerHTML=opts;
}
function limparFiltrosDash(){
  ['dash_f_turno','dash_f_caes','dash_qtd_min','dash_qtd_max'].forEach(function(id){var e=document.getElementById(id); if(e)e.value='';});
  dashPistasSel=[]; dashPistaDirty=false; atualizaPistaBox();
  dashClassesSel=[]; dashClasseDirty=false; atualizaClasseBox();
  carregarDashboard();
}
async function carregarDashboard(){
  var cont=document.getElementById('dash-content'); if(!cont) return;
  var f=document.getElementById('dash_from').value, t=document.getElementById('dash_to').value;
  var t1=document.getElementById('dash_t1').value||6, t2=document.getElementById('dash_t2').value||13;
  var fTurno=document.getElementById('dash_f_turno').value, fPista=dashPistasSel.join(',');
  var fCaes=document.getElementById('dash_f_caes').value, fClasse=dashClassesSel.join(',');
  var fQtdMin=document.getElementById('dash_qtd_min').value, fQtdMax=document.getElementById('dash_qtd_max').value;
  cont.innerHTML='<div style="color:#888;font-size:13px">Carregando…</div>';
  var qs=['t1='+t1,'t2='+t2];
  if(f)qs.push('from='+f); if(t)qs.push('to='+t);
  if(fTurno)qs.push('turno='+encodeURIComponent(fTurno));
  if(fPista)qs.push('pista='+encodeURIComponent(fPista));
  if(fCaes)qs.push('caes='+encodeURIComponent(fCaes));
  if(fClasse)qs.push('classe='+encodeURIComponent(fClasse));
  if(fQtdMin)qs.push('qtdMin='+encodeURIComponent(fQtdMin));
  if(fQtdMax)qs.push('qtdMax='+encodeURIComponent(fQtdMax));
  try{
    var r=await fetch('${BASE}/config/desempenho-data?'+qs.join('&'));
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    if(d.error) throw new Error(d.error);
    dashNomes = d.nomes || {};
    dashPreencheSelect('dash_f_turno', d.opcoes.turnos, d.filtros.turno, 'Todos');
    preenchePistaPanel(d.opcoes.pistas);
    dashPreencheSelect('dash_f_caes', d.opcoes.caes, d.filtros.caes, 'Todos');
    preencheClassePanel(d.opcoes.classes);
    var rz=d.resumo;
    var temFiltro=d.filtros.turno||d.filtros.pista||d.filtros.caes||d.filtros.classe||d.filtros.qtdMin||d.filtros.qtdMax;
    var recorte='';
    if(temFiltro){
      var partes=[];
      var qlbl='';
      if(d.filtros.qtdMin&&d.filtros.qtdMax) qlbl='pistas c/ '+d.filtros.qtdMin+'–'+d.filtros.qtdMax+' corridas';
      else if(d.filtros.qtdMax) qlbl='pistas c/ até '+d.filtros.qtdMax+' corridas';
      else if(d.filtros.qtdMin) qlbl='pistas c/ mín. '+d.filtros.qtdMin+' corridas';
      if(qlbl)partes.push(qlbl);
      if(d.filtros.turno)partes.push(d.filtros.turno); if(d.filtros.pista)partes.push('Pista '+d.filtros.pista.split(',').map(nomePistaCli).join(', ')); if(d.filtros.caes)partes.push(d.filtros.caes+' cães'); if(d.filtros.classe)partes.push('Classe '+d.filtros.classe.split(',').join(', '));
      recorte='<div style="font-size:12px;color:#22c55e;margin-bottom:10px;font-weight:600">Recorte: '+partes.join(' · ')+'</div>';
    }
    var aviso='';
    if(rz.total<15){
      aviso='<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:14px">⚠ Amostra insuficiente ('+rz.total+' corrida'+(rz.total===1?'':'s')+') — esse HR é ruído, não conclua nada. Cruzar muitas dimensões esfarela o número; solte algum filtro ou espere volume.</div>';
    }
    var kpi='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">'
      +dashKpi('AvBs resolvidos',rz.total,'#f0f0f0')
      +dashKpi('HR corrigido',rz.total?Math.round(rz.hr*100)+'%':'-',dashHrColor(rz.hr))
      +dashKpi('HR cru',rz.hrCru!=null?Math.round(rz.hrCru*100)+'%':'-','#888')
      +dashKpi('Erros de label',rz.erros,rz.erros>0?'#ef4444':'#22c55e')
      +'</div>';
    var pistaRows=(d.porPista||[]).map(function(x){ return {chave:nomePistaCli(x.chave), n:x.n, ac:x.ac, hr:x.hr, hrCru:x.hrCru, err:x.err, amostra:x.amostra}; });
    var corpo = rz.total? (dashSecao('Por Turno',d.porTurno)+dashSecao('Por Pista (pior → melhor)',pistaRows)+dashSecao('Por Nº de Cães',d.porCaes)+dashSecao('Por Classe',d.porClasse)) : '<div style="color:#888;font-size:13px">Nenhuma corrida nesse recorte.</div>';
    cont.innerHTML=recorte+aviso+kpi+corpo
      +'<div style="font-size:10px;color:#666;margin-top:6px">Amostra: baixa (&lt;15) = ruído · média (15–29) · boa (≥30). Só confie em faixas com amostra boa.</div>';
  }catch(e){ cont.innerHTML='<div style="color:#ef4444;font-size:13px">Erro ao carregar: '+e.message+'</div>'; }
}
// Mesmos 4 sons do app.js (Analisar) — pra poder testar aqui antes de salvar
function tocarSino(ctx){function tone(freq,start,dur){var o=ctx.createOscillator();var g=ctx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(0.3,ctx.currentTime+start+0.02);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+dur);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.05);}tone(1046.5,0,0.25);tone(1318.5,0.15,0.35);}
function tocarBeep(ctx){function tone(freq,start,dur){var o=ctx.createOscillator();var g=ctx.createGain();o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(0.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(0.2,ctx.currentTime+start+0.01);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+dur);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.03);}tone(1500,0,0.08);tone(1500,0.14,0.08);}
function tocarAlarme(ctx){function tone(freq,start,dur){var o=ctx.createOscillator();var g=ctx.createGain();o.type='sawtooth';o.frequency.value=freq;g.gain.setValueAtTime(0.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(0.22,ctx.currentTime+start+0.02);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+dur);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.05);}tone(880,0,0.15);tone(660,0.15,0.15);tone(880,0.30,0.15);tone(660,0.45,0.15);}
function tocarSuave(ctx){var o=ctx.createOscillator();var g=ctx.createGain();o.type='sine';o.frequency.value=700;g.gain.setValueAtTime(0.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.15,ctx.currentTime+0.05);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.6);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime);o.stop(ctx.currentTime+0.65);}
var SONS_TESTE = { sino: tocarSino, beep: tocarBeep, alarme: tocarAlarme, suave: tocarSuave };
function testarSomAlarme(){ try{ var e=document.getElementById('alarme_filtro_som').value; var ctx=new (window.AudioContext||window.webkitAudioContext)(); (SONS_TESTE[e]||tocarSino)(ctx); }catch(err){console.error('[testarSomAlarme]',err);} }
var CORES_ALARME_CFG={azul:'#3b82f6',roxo:'#8b5cf6',laranja:'#f97316',rosa:'#ec4899'};
function previewCorAlarme(){ var s=document.getElementById('alarme_filtro_cor'), pv=document.getElementById('alarme_cor_preview'); if(s&&pv)pv.style.background=CORES_ALARME_CFG[s.value]||'#3b82f6'; }
function coletaAlarme(tipo){ var cls=tipo==='pista'?'alarme-pista-cb':'alarme-classe-cb'; var hid=tipo==='pista'?'alarme_pistas_val':'alarme_classes_val'; var vals=[]; document.querySelectorAll('.'+cls).forEach(function(cb){ if(cb.checked)vals.push(cb.value); }); var h=document.getElementById(hid); if(h)h.value=vals.join(','); }
function testarSom(){
  try {
    var escolha = document.getElementById('som_alerta').value;
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    (SONS_TESTE[escolha]||tocarSino)(ctx);
  } catch(e) { console.error('[testarSom] erro', e); }
}
function upR(input){var n=input.name;var v=document.getElementById('v_'+n);var b=document.getElementById('b_'+n);if(v)v.textContent=input.value+(n.startsWith('pct')?'%':'');if(b)b.style.width=(input.value*10)+'%';}
// Liga/desliga visualmente os campos de um bloco quando o switch muda. NAO
// usa o atributo "disabled" nos inputs — campos disabled ficam de fora do
// FormData no submit, o que faria o valor do usuario se perder ao salvar.
// O bloqueio e' so visual/de interacao, via CSS (pointer-events:none no
// data-ativo="0") — o valor continua sendo enviado normalmente.
function toggleBloco(checkbox, fieldsId){
  var ativo = checkbox.checked;
  var fields = document.getElementById(fieldsId);
  if (fields) fields.setAttribute('data-ativo', ativo ? '1' : '0');
  var campo = checkbox.name;
  var label = document.getElementById(campo+'_label');
  if (label) {
    label.style.color = ativo ? '#22c55e' : '#888';
    var textoBase = label.textContent.replace(' customizado ativo','').replace('Motor fixo (padrão de fábrica) — campos abaixo desativados','');
    label.textContent = ativo ? (textoBase || 'Configuração') + ' customizado ativo' : 'Motor fixo (padrão de fábrica) — campos abaixo desativados';
  }
}
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

// ===== Dashboard (aba "Dashboard"): Curva S + pizza + barras, mesmos filtros =====
var grafNomes = {};
function nomePistaGraf(code){ return (grafNomes && grafNomes[code]) || code; }
function limparGraf(){
  ['g_from','g_to','g_turno','g_pista','g_classe'].forEach(function(id){var e=document.getElementById(id); if(e)e.value='';});
  carregarGraf();
}
async function carregarGraf(){
  var host=document.getElementById('graf-kpis'); if(!host) return;
  var f=document.getElementById('g_from').value, t=document.getElementById('g_to').value;
  var fTurno=document.getElementById('g_turno').value, fPista=document.getElementById('g_pista').value, fClasse=document.getElementById('g_classe').value;
  var qs=['t1=6','t2=13'];
  if(f)qs.push('from='+f); if(t)qs.push('to='+t);
  if(fTurno)qs.push('turno='+encodeURIComponent(fTurno));
  if(fPista)qs.push('pista='+encodeURIComponent(fPista));
  if(fClasse)qs.push('classe='+encodeURIComponent(fClasse));
  host.innerHTML='<div style="color:#888;font-size:13px">Carregando…</div>';
  try{
    var r=await fetch('${BASE}/config/desempenho-data?'+qs.join('&'));
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    if(d.error) throw new Error(d.error);
    grafNomes=d.nomes||{};
    // popular selects (mantendo a selecao atual)
    dashPreencheSelect('g_turno', d.opcoes.turnos, d.filtros.turno, 'Todos');
    dashPreencheSelect('g_classe', d.opcoes.classes, d.filtros.classe, 'Todas');
    (function(){ var el=document.getElementById('g_pista'); if(!el)return; var sel=d.filtros.pista||''; var opts='<option value="">Todas</option>'; (d.opcoes.pistas||[]).forEach(function(p){ opts+='<option value="'+p+'"'+(p===sel?' selected':'')+'>'+nomePistaGraf(p)+'</option>'; }); el.innerHTML=opts; })();
    // KPIs
    var rz=d.resumo;
    host.innerHTML = dashKpi('AvBs resolvidos',rz.total,'#f0f0f0')
      + dashKpi('HR corrigido',rz.total?Math.round(rz.hr*100)+'%':'-',dashHrColor(rz.hr))
      + dashKpi('HR cru',rz.hrCru!=null?Math.round(rz.hrCru*100)+'%':'-','#888')
      + dashKpi('Erros de label',rz.erros,rz.erros>0?'#ef4444':'#22c55e');
    desenharCurvaS(d.serieDiaria);
    desenharPizza(d.porPista, 'graf-pizza', 'n');
    desenharPizza(d.porPista, 'graf-pizza-vit', 'ac');
    var bars=document.getElementById('graf-bars');
    if(bars){ bars.innerHTML = dashSecao('Por Classe',d.porClasse)+dashSecao('Por Turno',d.porTurno)+dashSecao('Por Nº de Cães',d.porCaes) || '<div style="color:#888;font-size:13px">Sem dados.</div>'; if(!bars.innerHTML.trim()) bars.innerHTML='<div style="color:#888;font-size:13px">Sem dados no período.</div>'; }
  }catch(e){ host.innerHTML='<div style="color:#ef4444;font-size:13px">Erro ao carregar: '+e.message+'</div>'; }
}
function desenharCurvaS(serie){
  var host=document.getElementById('graf-curvas'); if(!host) return;
  if(!serie||!serie.length){ host.innerHTML='<div style="color:#888;font-size:13px;padding:20px">Sem dados no período.</div>'; return; }
  var ab=0,ac=0,er=0, pts=serie.map(function(x){ ab+=x.abertos; ac+=x.acertados; er+=x.errados; return {dia:x.dia,ab:ab,ac:ac,er:er}; });
  var W=720,H=260,pl=40,pr=16,ptop=14,pb=32, n=pts.length, maxY=Math.max(1,pts[n-1].ab);
  function X(i){ return pl + (n<=1?(W-pl-pr)/2:(i*(W-pl-pr)/(n-1))); }
  function Y(v){ return ptop + (H-ptop-pb)*(1 - v/maxY); }
  function pathOf(k){ return pts.map(function(p,i){ return (i?'L':'M')+X(i).toFixed(1)+' '+Y(p[k]).toFixed(1); }).join(' '); }
  var grid=''; for(var g=0;g<=4;g++){ var val=Math.round(maxY*g/4), yy=Y(val); grid+='<line x1="'+pl+'" y1="'+yy.toFixed(1)+'" x2="'+(W-pr)+'" y2="'+yy.toFixed(1)+'" stroke="#222" stroke-width="1"/><text x="'+(pl-6)+'" y="'+(yy+3).toFixed(1)+'" fill="#666" font-size="9" text-anchor="end">'+val+'</text>'; }
  function dl(iso){ var p=(iso||'').split('-'); return p.length===3?(p[2]+'/'+p[1]):iso; }
  var idxs=[0,Math.floor((n-1)/2),n-1].filter(function(v,i,a){return a.indexOf(v)===i;});
  var xl=idxs.map(function(i){ return '<text x="'+X(i).toFixed(1)+'" y="'+(H-pb+16)+'" fill="#666" font-size="9" text-anchor="middle">'+dl(pts[i].dia)+'</text>'; }).join('');
  function dots(k,c){ return pts.map(function(p,i){ return '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p[k]).toFixed(1)+'" r="2.5" fill="'+c+'"><title>'+p.dia+' — abertos '+p.ab+' · acertos '+p.ac+' · erros '+p.er+'</title></circle>'; }).join(''); }
  host.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block">'
    + grid
    + '<path d="'+pathOf('ab')+'" fill="none" stroke="#9aa4b2" stroke-width="2"/>'
    + '<path d="'+pathOf('ac')+'" fill="none" stroke="#22c55e" stroke-width="2"/>'
    + '<path d="'+pathOf('er')+'" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="5 4"/>'
    + dots('ab','#9aa4b2') + dots('ac','#22c55e') + dots('er','#ef4444') + xl + '</svg>';
}
function desenharPizza(porPista, hostId, valKey){
  var host=document.getElementById(hostId||'graf-pizza'); if(!host) return;
  valKey = valKey || 'n';
  var arr=(porPista||[]).slice().filter(function(x){return (x[valKey]||0)>0;}).sort(function(a,b){return (b[valKey]||0)-(a[valKey]||0);});
  if(!arr.length){ host.innerHTML='<div style="color:#888;font-size:13px;padding:20px">Sem dados no período.</div>'; return; }
  var TOP=7, top=arr.slice(0,TOP), resto=arr.slice(TOP);
  var slices=top.map(function(x){return {label:nomePistaGraf(x.chave),val:x[valKey]||0};});
  if(resto.length){ slices.push({label:'Outras ('+resto.length+')',val:resto.reduce(function(s,x){return s+(x[valKey]||0);},0)}); }
  var CORES=['#56B4E9','#E69F00','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#888888'];
  var total=slices.reduce(function(s,x){return s+x.val;},0), cx=90,cy=90,r=80, ang=-Math.PI/2, paths='';
  slices.forEach(function(s,i){ var frac=s.val/total, a2=ang+frac*2*Math.PI, col=CORES[i%CORES.length];
    if(frac>=0.999){ paths+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+col+'"><title>'+s.label+': '+s.val+' (100%)</title></circle>'; }
    else { var x1=cx+r*Math.cos(ang),y1=cy+r*Math.sin(ang),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2),large=frac>0.5?1:0;
      paths+='<path d="M'+cx+' '+cy+' L'+x1.toFixed(1)+' '+y1.toFixed(1)+' A'+r+' '+r+' 0 '+large+' 1 '+x2.toFixed(1)+' '+y2.toFixed(1)+' Z" fill="'+col+'" stroke="#0D1117" stroke-width="2"><title>'+s.label+': '+s.val+' ('+Math.round(frac*100)+'%)</title></path>'; }
    ang=a2; });
  var legend=slices.map(function(s,i){ var col=CORES[i%CORES.length]; return '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;margin-bottom:4px"><span style="width:10px;height:10px;border-radius:2px;background:'+col+';flex-shrink:0"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.label+'</span><span style="color:#666">'+Math.round(s.val/total*100)+'%</span></div>'; }).join('');
  host.innerHTML='<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 180 180" width="170" height="170" style="flex-shrink:0">'+paths+'</svg><div style="flex:1;min-width:130px">'+legend+'</div></div>';
}
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
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN monitor_interval_min INTEGER DEFAULT 60").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN monitor_window_start TEXT DEFAULT '07:00'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN monitor_window_end TEXT DEFAULT '20:00'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_unidade_padrao REAL DEFAULT 2.5").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_valor_inicial REAL DEFAULT 1000").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_pct_stop REAL DEFAULT 20").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN banca_aviso_stop TEXT").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN bloco_pesos_ativo INTEGER DEFAULT 1").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN bloco_categoria_ativo INTEGER DEFAULT 1").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN bloco_filtros_ativo INTEGER DEFAULT 1").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN bloco_confianca_ativo INTEGER DEFAULT 1").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN bloco_motor_ativo INTEGER DEFAULT 1").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN final_check_min_antes INTEGER DEFAULT 15").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN peso_sp INTEGER DEFAULT 3").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN peso_split INTEGER DEFAULT 2").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN teto_diff_split REAL DEFAULT 0.15").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN alerta_min_antes INTEGER DEFAULT 3").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN tela_grace_min INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN som_alerta TEXT DEFAULT 'sino'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN alarme_filtro_ativo INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN alarme_filtro_turno TEXT DEFAULT ''").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN alarme_filtro_pistas TEXT DEFAULT ''").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN alarme_filtro_classes TEXT DEFAULT ''").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN alarme_filtro_som TEXT DEFAULT 'beep'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE analysis_config ADD COLUMN alarme_filtro_cor TEXT DEFAULT 'azul'").run(); } catch(e) {}
    db.prepare(`UPDATE analysis_config SET peso_caltm=?,peso_categoria=?,peso_bends=?,peso_remarks=?,peso_sp=?,peso_split=?,peso_brt=?,dist_min=?,dist_max=?,classes_aceitas=?,min_corridas_uteis=?,pct_alta=?,pct_media=?,max_cat_diff_caltm=?,peso_post_pick=?,ajuste_classe_segundos=?,desconto_acidente_leve=?,desconto_acidente_medio=?,proporcao_media_caltm=?,proporcao_melhor_caltm=?,teto_diff_normalizacao=?,threshold_skip_avb=?,threshold_back=?,max_niveis_pool=?,max_linhas_cat_inferior=?,max_dias_gap_nova_cat=?,bloco_pesos_ativo=?,bloco_categoria_ativo=?,bloco_filtros_ativo=?,bloco_confianca_ativo=?,bloco_motor_ativo=?,alarme_filtro_ativo=?,alarme_filtro_turno=?,alarme_filtro_pistas=?,alarme_filtro_classes=?,alarme_filtro_som=?,alarme_filtro_cor=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).run(
      d.peso_caltm||5,d.peso_categoria||4,d.peso_bends||3,d.peso_remarks||2,d.peso_sp||3,d.peso_split||3,d.peso_brt||1,
      d.dist_min,d.dist_max,d.classes_aceitas,d.min_corridas_uteis,
      d.pct_alta,d.pct_media,
      d.max_cat_diff_caltm||1, d.peso_post_pick||2,
      d.ajuste_classe_segundos||0.20, d.desconto_acidente_leve||0.10, d.desconto_acidente_medio||0.20,
      d.proporcao_media_caltm||0.60, 1-(d.proporcao_media_caltm||0.60),
      d.teto_diff_normalizacao||0.50, d.threshold_skip_avb||10, d.threshold_back||25,
      d.max_niveis_pool||2,
      d.max_linhas_cat_inferior||3,
      d.max_dias_gap_nova_cat||14,
      d.bloco_pesos_ativo==='1'||d.bloco_pesos_ativo===1?1:0,
      d.bloco_categoria_ativo==='1'||d.bloco_categoria_ativo===1?1:0,
      d.bloco_filtros_ativo==='1'||d.bloco_filtros_ativo===1?1:0,
      d.bloco_confianca_ativo==='1'||d.bloco_confianca_ativo===1?1:0,
      d.bloco_motor_ativo==='1'||d.bloco_motor_ativo===1?1:0,
      (d.alarme_filtro_ativo==='1'||d.alarme_filtro_ativo===1)?1:0,
      d.alarme_filtro_turno||'',
      d.alarme_filtro_pistas||'',
      d.alarme_filtro_classes||'',
      d.alarme_filtro_som||'beep',
      d.alarme_filtro_cor||'azul',
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

// Exporta a planilha de revisao de derrotas para o intervalo [from,to]
// (AAAA-MM-DD, inclusivo). Ver src/utils/exportDerrotas.js. So admin.
router.get('/export-derrotas', requireAdmin, async (req, res) => {
  try {
    // Require preguicoso e protegido: se o exceljs nao estiver instalado, so
    // esta rota falha (com mensagem clara) — o resto do app continua de pe.
    let buildDerrotasWorkbook;
    try {
      ({ buildDerrotasWorkbook } = require('../utils/exportDerrotas'));
    } catch (e) {
      console.error('[export-derrotas] modulo indisponivel:', e.message);
      return res.status(500).send('Exportacao indisponivel: rode "npm install exceljs" e faca o deploy novamente. (' + e.message + ')');
    }
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(from) || !re.test(to)) {
      return res.status(400).send('Datas inválidas — use o formato AAAA-MM-DD.');
    }
    if (from > to) {
      return res.status(400).send('A data inicial não pode ser maior que a final.');
    }
    const { wb, total } = buildDerrotasWorkbook(req.user.id, from, to);
    const fname = `Derrotas_${from}_a_${to}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('X-Total-Derrotas', String(total));
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[export-derrotas] erro:', err);
    res.status(500).send('Erro ao gerar planilha: ' + err.message);
  }
});

// Exporta o desempenho por contexto (HR por pista / nº de cães / classe),
// com bateu corrigido pela chegada. Datas opcionais (sem elas = all-time).
router.get('/export-desempenho', requireAdmin, async (req, res) => {
  try {
    let buildDesempenhoWorkbook;
    try {
      ({ buildDesempenhoWorkbook } = require('../utils/exportDerrotas'));
    } catch (e) {
      console.error('[export-desempenho] modulo indisponivel:', e.message);
      return res.status(500).send('Exportacao indisponivel: rode "npm install exceljs" e faca o deploy novamente. (' + e.message + ')');
    }
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    if ((from && !re.test(from)) || (to && !re.test(to))) {
      return res.status(400).send('Datas inválidas — use o formato AAAA-MM-DD ou deixe em branco.');
    }
    const { wb, total } = buildDesempenhoWorkbook(req.user.id, from || null, to || null);
    const sufixo = (from || to) ? `${from || 'inicio'}_a_${to || 'hoje'}` : 'geral';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="HR_por_contexto_${sufixo}.xlsx"`);
    res.setHeader('X-Total-AvBs', String(total));
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[export-desempenho] erro:', err);
    res.status(500).send('Erro ao gerar planilha: ' + err.message);
  }
});

// Exporta os dados brutos do backtest em JSON (inclui race_card/trapsCard).
// Datas opcionais (sem elas = todo o historico).
router.get('/export-dados', requireAdmin, (req, res) => {
  try {
    let buildBacktestJson;
    try {
      ({ buildBacktestJson } = require('../utils/exportDerrotas'));
    } catch (e) {
      console.error('[export-dados] modulo indisponivel:', e.message);
      return res.status(500).send('Exportacao indisponivel: ' + e.message);
    }
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    if ((from && !re.test(from)) || (to && !re.test(to))) {
      return res.status(400).send('Datas inválidas — use AAAA-MM-DD ou deixe em branco.');
    }
    const payload = buildBacktestJson(req.user.id, from || null, to || null);
    const sufixo = (from || to) ? `${from || 'inicio'}_a_${to || 'hoje'}` : 'geral';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backtest_motor_${sufixo}.json"`);
    res.send(JSON.stringify(payload));
  } catch (err) {
    console.error('[export-dados] erro:', err);
    res.status(500).send('Erro ao gerar JSON: ' + err.message);
  }
});

// Dados agregados do dashboard de desempenho (JSON). Datas e bordas de turno
// (t1/t2/t3, horas 24h) opcionais.
router.get('/desempenho-data', requireAdmin, (req, res) => {
  try {
    let buildDesempenhoData;
    try {
      ({ buildDesempenhoData } = require('../utils/exportDerrotas'));
    } catch (e) {
      return res.status(500).json({ error: 'módulo indisponível: ' + e.message });
    }
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    if ((from && !re.test(from)) || (to && !re.test(to))) {
      return res.status(400).json({ error: 'datas inválidas (AAAA-MM-DD)' });
    }
    const clampH = (v, d) => { const n = parseInt(v, 10); return (isNaN(n) || n < 0 || n > 23) ? d : n; };
    const turnos = { t1: clampH(req.query.t1, 6), t2: clampH(req.query.t2, 13) };
    const filtros = {
      turno: String(req.query.turno || '').trim(),
      pista: String(req.query.pista || '').trim(),
      caes: String(req.query.caes || '').trim(),
      classe: String(req.query.classe || '').trim(),
      qtdMin: String(req.query.qtdMin || '').trim(),
      qtdMax: String(req.query.qtdMax || '').trim()
    };
    const data = buildDesempenhoData(req.user.id, from || null, to || null, turnos, filtros);
    res.json(data);
  } catch (err) {
    console.error('[desempenho-data] erro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;