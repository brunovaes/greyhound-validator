var raceFiles=[],capFiles=[],results=[],capModalFilesList=[];
var filterState={pista:'',horaMin:'',horaMax:'',confianca:'',mostrarSkip:false};
var SS_KEY='ghf_results_v1';
function saveSessionState(){try{sessionStorage.setItem(SS_KEY,JSON.stringify({results:results,raceNames:raceFiles.map(function(f){return f.name;})}));}catch(e){}}
function clearSessionState(){try{sessionStorage.removeItem(SS_KEY);}catch(e){}}
function restoreSessionState(){try{var raw=sessionStorage.getItem(SS_KEY);if(!raw)return false;var data=JSON.parse(raw);if(data&&Array.isArray(data.results)&&data.results.length){results=data.results;return true;}}catch(e){}return false;}

function readB64(file){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(e){res(e.target.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});}
function trapClass(n){return['','t1','t2','t3','t4','t5','t6'][n]||'t1';}
function perfilBadge(p){if(!p)return'';var c=p==='Recuperador'?'p-rec':p==='Fumador'?'p-fum':p==='Frontrunner'?'p-fro':'p-est';var i=p==='Recuperador'?'&#128170;':p==='Fumador'?'&#128684;':p==='Frontrunner'?'&#9889;':'&#10145;';return'<span class="perfil-badge '+c+'">'+i+' '+p+'</span>';}
function ukHoraParaOrdem(h){if(!h)return 9999;var p=h.split(':');var hr=parseInt(p[0]);if(hr>=1&&hr<=9)hr+=12;hr=hr-4;if(hr<0)hr+=24;return hr*60+parseInt(p[1]||0);}
function convertHora(h){if(!h)return'';var p=h.split(':');var hr=parseInt(p[0]);if(hr>=1&&hr<=9)hr+=12;else if(hr===10||hr===11||hr===12)hr=hr;hr=hr-4;if(hr<0)hr+=24;return hr+':'+p[1];}
function setSt(m){document.getElementById('st').textContent=m;}
function prog(p,t){document.getElementById('pw').style.display='block';document.getElementById('pf').style.width=p+'%';document.getElementById('pt').textContent=t;}
function addFI(name,id){var list=document.getElementById('rlist');var d=document.createElement('div');d.className='fi';d.id='fi-'+id;var sn=name.length>22?name.slice(0,20)+'...':name;d.innerHTML='<span class="fi-name">'+sn+'</span><span class="fi-st fi-load" id="fis-'+id+'">...</span><button class="fi-rm" data-id="'+id+'">x</button>';list.appendChild(d);}
function updFI(id,ok){var el=document.getElementById('fis-'+id);if(!el)return;el.className='fi-st '+(ok?'fi-ok':'fi-err');el.textContent=ok?'OK':'erro';}
function updCards(){var avbs=results.filter(function(r){return r.nivel!=='skip';});var alta=results.filter(function(r){return r.nivel==='alta';}).length;document.getElementById('sp').textContent=raceFiles.length||'-';document.getElementById('sa').textContent=avbs.length||'-';document.getElementById('sal').textContent=alta||'-';}

/* filtros */
function getPista(corrida){if(!corrida)return'';var p=corrida.trim().split(' ');if(p.length>1&&/^[A-Z]\d+$/i.test(p[p.length-1]))return p.slice(0,-1).join(' ');return corrida;}
function horaToMin(h){if(!h)return null;var p=h.split(':');return parseInt(p[0]||0)*60+parseInt(p[1]||0);}
function applyFiltersToAvbs(avbs){
  return avbs.filter(function(r){
    if(!filterState.mostrarSkip&&r.nivel==='skip')return false;
    if(filterState.pista&&getPista(r.corrida||'')!==filterState.pista)return false;
    if(filterState.confianca&&r.nivel!==filterState.confianca)return false;
    if(filterState.horaMin||filterState.horaMax){
      var hbr=convertHora(r.hora||'');var hMin=horaToMin(hbr);
      if(hMin!==null){
        if(filterState.horaMin&&hMin<horaToMin(filterState.horaMin))return false;
        if(filterState.horaMax&&hMin>horaToMin(filterState.horaMax))return false;
      }
    }
    return true;
  });
}

/* estilos */
function injectStyles(){
  var css=[
    'thead th{position:sticky!important;top:0!important;z-index:20!important;background:#0d1117!important;}',
    '.ghf-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(4px);}',
    '.ghf-modal-box{background:#161b27;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:32px 36px;width:440px;max-width:92vw;box-shadow:0 24px 64px rgba(0,0,0,.6);}',
    '.ghf-modal-title{font-size:17px;font-weight:700;color:#fff;margin-bottom:6px;}',
    '.ghf-modal-sub{font-size:12px;color:rgba(255,255,255,.4);margin-bottom:20px;}',
    '.ghf-modal-inp{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:9px;color:#fff;padding:11px 15px;font-size:14px;outline:none;box-sizing:border-box;transition:border .2s;}',
    '.ghf-modal-inp:focus{border-color:#00e676;}',
    '.ghf-modal-inp::placeholder{color:rgba(255,255,255,.3);}',
    '.ghf-modal-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:24px;}',
    '.ghf-btn-pri{background:linear-gradient(135deg,#00e676,#00c853);color:#000;border:none;padding:10px 26px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer;transition:opacity .2s;}',
    '.ghf-btn-pri:hover{opacity:.88;}',
    '.ghf-btn-sec{background:rgba(255,255,255,.07);color:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.15);padding:10px 22px;border-radius:9px;font-size:14px;cursor:pointer;}',
    '.ghf-toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);padding:13px 18px 13px 28px;border-radius:11px;font-size:14px;font-weight:600;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap;display:flex;align-items:center;gap:14px;}',
    '.ghf-toast.t-ok{background:linear-gradient(135deg,#00e676,#00c853);color:#000;}',
    '.ghf-toast.t-err{background:#e53935;color:#fff;}',
    '.ghf-toast.t-show{opacity:1;pointer-events:auto;}',
    '.ghf-toast-x{background:rgba(0,0,0,.15);border:none;border-radius:6px;width:22px;height:22px;min-width:22px;color:inherit;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.7;transition:opacity .15s}',
    '.ghf-toast-x:hover{opacity:1}',
    '#filter-panel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;margin-bottom:10px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:8px;}',
    '#filter-panel .fp-group{display:flex;align-items:center;gap:5px;}',
    '#filter-panel .fp-label{font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}',
    '#filter-panel select,#filter-panel input[type=time]{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;color:rgba(255,255,255,.8);font-size:11px;outline:none;cursor:pointer;padding:4px 6px;}',
    '#filter-panel select{min-width:100px;}',
    '#filter-panel input[type=time]{color-scheme:dark;width:78px;}',
    '#filter-panel select:focus,#filter-panel input[type=time]:focus{border-color:rgba(0,230,118,.5);}',
    '#filter-panel select option{background:#1a1f2e;font-size:12px;}',
    '#filter-panel .fp-divider{width:1px;height:16px;background:rgba(255,255,255,.08);flex-shrink:0;margin:0 2px;}',
    '#filter-panel .fp-hora-pair{display:flex;align-items:center;gap:4px;}',
    '#filter-panel .fp-hora-sep{color:rgba(255,255,255,.2);font-size:10px;}',
    '#fp-count{font-size:10px;color:rgba(255,255,255,.25);margin-left:auto;white-space:nowrap;}',
    '#btn-fp-clear{background:transparent;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:15px;padding:2px 4px;line-height:1;transition:color .2s;flex-shrink:0;}',
    '#btn-fp-clear:hover{color:#e53935;}',
    /* popup pós-análise */
    '.ps-ov{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9500;display:none;align-items:center;justify-content:center;}',
    '.ps-ov.open{display:flex;}',
    '.ps-box{background:#111;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:36px 40px;text-align:center;max-width:400px;width:90%;animation:psIn .25s ease;}',
    '@keyframes psIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}',
    '.ps-icon{font-size:52px;margin-bottom:16px;display:block;}',
    '.ps-title{font-size:18px;font-weight:700;color:#fff;margin-bottom:8px;}',
    '.ps-sub{font-size:13px;color:rgba(255,255,255,.5);margin-bottom:24px;line-height:1.6;}',
    '.ps-inp{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:9px;color:#fff;padding:11px 15px;font-size:14px;outline:none;box-sizing:border-box;transition:border .2s;text-align:left;display:block;}',
    '.ps-inp:focus{border-color:#22c55e;}',
    '.ps-inp::placeholder{color:rgba(255,255,255,.3);}',
    '.ps-btns{display:flex;gap:10px;justify-content:center;margin-top:24px;flex-wrap:wrap;}',
    '.ps-btn-pri{background:#22c55e;color:#000;border:none;padding:10px 24px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer;transition:opacity .2s;}',
    '.ps-btn-pri:hover{opacity:.88;}',
    '.ps-btn-sec{background:rgba(255,255,255,.07);color:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.15);padding:10px 20px;border-radius:9px;font-size:14px;cursor:pointer;}',
    '.ps-btn-warn{background:#f97316;color:#000;border:none;padding:10px 20px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer;transition:opacity .2s;}',
    '.ps-btn-warn:hover{opacity:.88;}',
    '.rc-alert{animation:rcAlertBlink 1s ease-in-out infinite;}',
    '@keyframes rcAlertBlink{0%,100%{background:transparent;}50%{background:#1B9D40;}}',
    '.rc-alert-custom{animation:rcAlertBlinkCustom 1s ease-in-out infinite;border-left:3px solid var(--alert-col,#3b82f6);}',
    '@keyframes rcAlertBlinkCustom{0%,100%{background:transparent;}50%{background:var(--alert-col,#3b82f6);}}',
    '.rc-atrasada{animation:rcAtrasadaBlink 1s ease-in-out infinite;border-left:3px solid #eab308;}',
    '.rc-reanalise-badge{display:inline-block;background:#1d4ed8;color:#fff;font-size:8px;font-weight:800;letter-spacing:.4px;padding:1px 5px;border-radius:3px;margin-bottom:3px}',
    '@keyframes rcAtrasadaBlink{0%,100%{background:transparent;}50%{background:rgba(234,179,8,.35);}}',
    '.rc-old{background:rgba(239,68,68,.12)!important;border-left:3px solid #ef4444;}',
    '.rc-old-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.5px;color:#fff;background:#ef4444;padding:1px 6px;border-radius:4px;margin-bottom:3px;}',
    '.rc-suspect-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.5px;color:#000;background:#f59e0b;padding:1px 6px;border-radius:4px;margin-bottom:3px;}',
    '.fp-old-banner{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:#ef4444;font-size:12px;font-weight:700;text-align:center;padding:8px 12px;border-radius:8px;margin-bottom:10px;letter-spacing:.3px;}',
    '.fp-suspect-banner{background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.4);color:#f59e0b;font-size:12px;font-weight:700;text-align:center;padding:8px 12px;border-radius:8px;margin-bottom:10px;letter-spacing:.3px;}',
    '.old-row{background:rgba(239,68,68,.08)!important;}',
    '.old-row td{border-color:rgba(239,68,68,.15)!important;}'
  ].join('');
  var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
}

// Modo simulado de AvBs (?simavb=1). Declarado no TOPO de proposito: o
// shouldShowRace consulta esta flag e roda muito antes do bloco de AvBs.
var _SIM_AVB = (function(){
  try { return new URLSearchParams(location.search).get('simavb') === '1'; } catch(e){ return false; }
})();

var RACAS_EM_TELA = 6;
var STAKE_PADRAO = null;   // unidade padrao vinda da Banca (Configuracoes)
var AUTO_REFRESH_MIN = 1;
var ALERTA_MIN_ANTES = 3;
var TELA_GRACE_MIN = 0;
var SOM_ALERTA = 'sino';
var ALARME_FILTRO = { ativo:0, turno:'', pistas:[], classes:[], regras:[], som:'beep', cor:'azul' };
var CORES_ALARME = { azul:'#3b82f6', roxo:'#8b5cf6', laranja:'#f97316', rosa:'#ec4899' };
var _sysCfgSig = ''; // assinatura da ultima config carregada (detecta mudanca p/ reaplicar o alarme)
// Sinaliza que ESTA tela (analise) ja cuida do alarme — o alertaGlobal.js
// (incluido em todas as paginas) fica passivo aqui pra nao duplicar aviso.
window.__ghAlarmeApp = true;
// Registra o aviso num store compartilhado (localStorage) pra que, ao navegar
// pra outra tela, o alertaGlobal.js nao repita o mesmo aviso.
function registrarAvisoGlobal(key){
  try {
    var now = Date.now(), TTL = 10*60*1000;
    var raw = localStorage.getItem('ghAlerted'); var o = raw ? JSON.parse(raw) : {};
    for (var k in o) { if (o[k] < now) delete o[k]; }
    o[key] = now + TTL; localStorage.setItem('ghAlerted', JSON.stringify(o));
  } catch(e){}
}

// Tres taxas sobre a MESMA chegada, todas via bateuPar no servidor:
//   minha = os AvBs que voce escolheu   (numero grande, e' o que voce apostou)
//   rean  = a principal da reanalise
//   motor = o AvB da analise global original
// A "minha" e' a principal porque reflete o que de fato foi jogado. As outras
// duas ficam menores embaixo, como referencia — no card ha pouco espaco e ele
// e' olhado de relance, no meio da operacao.
// Enquanto voce nao escolher AvBs, "minha" vem vazia: e' o esperado, nao bug.
// Dois valores lado a lado no card: Motor e Reanálise, com o rótulo pequeno
// embaixo de cada um. A versão anterior repetia a informação — o número grande
// era o mesmo "motor" que aparecia na linha de baixo, e o "sem escolhas ainda"
// ocupava espaço sem dizer nada útil.
// A taxa da SUA escolha não entra aqui de propósito: ela só ganha significado
// depois de dezenas de corridas escolhidas, e num card pequeno um número que
// fica vazio por semanas atrapalha mais do que ajuda. Ela vive no Histórico,
// onde há espaço pra explicar.
function _pintaAcertos(el, bloco){
  if(!el || !bloco) return;
  var t = bloco.tres;
  var cor = function(p){ return p==null ? '#666' : (p>=50 ? '#22c55e' : '#ef4444'); };
  var lado = function(rot, o){
    var pct = (o && o.pct!=null) ? o.pct+'%' : '—';
    return '<div style="flex:1;text-align:center;min-width:0">'
      + '<div style="font-size:19px;font-weight:800;line-height:1.1;color:'+cor(o&&o.pct)+'">'+pct+'</div>'
      + '<div style="font-size:8.5px;color:#777;margin-top:1px;white-space:nowrap">'+rot+'</div>'
      + '</div>';
  };

  // Sem o bloco das três taxas (servidor antigo), mantém o número único.
  if(!t){
    el.textContent = bloco.pct==null ? '-' : bloco.pct+'%';
    el.style.color = cor(bloco.pct);
    return;
  }
  el.style.display = 'flex';
  el.style.gap = '10px';
  el.style.alignItems = 'flex-start';
  el.style.justifyContent = 'center';
  el.innerHTML = lado('Motor', t.motor) + lado('Reanálise', t.rean);

  // A linha de referência antiga vira desnecessária: os dois valores já estão
  // no card. Remove pra não sobrar resíduo de render anterior.
  var ref = document.getElementById(el.id + '-ref');
  if(ref) ref.remove();
}

async function loadAcertosResumo() {
  try {
    var r = await fetch(BASE + '/api/acertos-resumo');
    var d = await r.json();
    _pintaAcertos(document.getElementById('acertos-dia'), d.dia);
    _pintaAcertos(document.getElementById('acertos-mes'), d.mes);
  } catch(e) {}
}

async function loadSystemConfig() {
  try {
    var r = await fetch(BASE+'/api/config');
    var c = await r.json();
    if (c.racas_em_tela) RACAS_EM_TELA = parseInt(c.racas_em_tela);
    if (c.banca_unidade_padrao != null) STAKE_PADRAO = c.banca_unidade_padrao;
    if (c.auto_refresh_min) AUTO_REFRESH_MIN = parseInt(c.auto_refresh_min);
    if (c.alerta_min_antes != null) ALERTA_MIN_ANTES = parseInt(c.alerta_min_antes);
    if (c.tela_grace_min != null) TELA_GRACE_MIN = parseInt(c.tela_grace_min);
    if (c.som_alerta) SOM_ALERTA = c.som_alerta;
    ALARME_FILTRO.ativo = c.alarme_filtro_ativo ? 1 : 0;
    ALARME_FILTRO.turno = c.alarme_filtro_turno || '';
    ALARME_FILTRO.pistas = (c.alarme_filtro_pistas||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
    ALARME_FILTRO.classes = (c.alarme_filtro_classes||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
    ALARME_FILTRO.som = c.alarme_filtro_som || 'beep';
    ALARME_FILTRO.cor = c.alarme_filtro_cor || 'azul';
    try { ALARME_FILTRO.regras = c.alarme_filtro_regras ? JSON.parse(c.alarme_filtro_regras) : []; } catch(e){ ALARME_FILTRO.regras = []; }
    if (c.vip_skip_ativo != null) VIP_CFG.ativo = +c.vip_skip_ativo;
    if (c.vip_skip_min_antes != null) VIP_CFG.minAntes = +c.vip_skip_min_antes;
    if (c.vip_skip_alarme != null) VIP_CFG.alarme = +c.vip_skip_alarme;
    if (c.vip_cor_destaque) VIP_CFG.corDestaque = c.vip_cor_destaque;
    if (c.vip_cor_fundo) VIP_CFG.corFundo = c.vip_cor_fundo;
    // Reaplica na hora quando a config muda (ex: salvou o "Alarme para filtro
    // selecionado" em outra aba). Se o alarme/alerta mudou desde o ultimo load,
    // descarta o estado de alerta atual (o aviso padrao e' descartado) e
    // reavalia tudo com as novas regras, sem precisar recarregar a tela.
    var _sig = JSON.stringify(ALARME_FILTRO) + '|' + SOM_ALERTA + '|' + ALERTA_MIN_ANTES;
    if (_sysCfgSig !== '' && _sig !== _sysCfgSig) {
      alertedRaces = {};
      if (typeof checkRaceAlerts === 'function') checkRaceAlerts();
    }
    _sysCfgSig = _sig;
  } catch(e) {}
}

async function autoSaveSession(dateLabel) {
  var avbs = results.filter(function(r){return r.nivel!=='skip'&&r.trapFav>0;});
  if (!avbs.length) return;
  // Reaplica dados preservados de uma sobrescrita (odd/valor/flag/resultados
  // do robo que a sessao antiga ja tinha) — casando por hora+corrida.
  if (preserveDataMap) {
    avbs.forEach(function(r){
      var prev = preserveDataMap[r.hora+'|'+r.corrida];
      if (!prev) return;
      if (prev.odd != null) r.odd = prev.odd;
      if (prev.valor != null) r.valor = prev.valor;
      if (prev.resultado_1 != null) r.r1 = prev.resultado_1;
      if (prev.resultado_2 != null) r.r2 = prev.resultado_2;
      if (prev.resultado_3 != null) r.r3 = prev.resultado_3;
      if (prev.bateu != null) r.hit = prev.bateu;
      if (prev.avb_nao_aberto != null) r.avbNaoAberto = !!prev.avb_nao_aberto;
      if (prev.video_url != null) r.videoUrl = prev.video_url;
    });
    preserveDataMap = null;
  }
  // Fallback para data atual se dateLabel não foi definido
  if (!dateLabel) {
    var now = new Date();
    dateLabel = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
  }
  var name = 'Races ' + dateLabel;
  try {
    // Remove sessão com mesmo nome se existir
    var r = await fetch(BASE+'/api/sessions');
    var sessions = await r.json();
    var existing = sessions.find(function(s){return s.name===name;});
    if (existing) await fetch(BASE+'/api/session/'+existing.id, {method:'DELETE'});
    // Salva nova sessão
    var saveResp = await fetch(BASE+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,races:avbs})});
    var saveData = await saveResp.json().catch(function(){return null;});
    // Busca de volta os IDs das corridas recem-criadas e vincula em `results` —
    // sem isso, edições de Odd/Valor/AvB não aberto feitas depois nunca
    // persistem no banco (saveRaceField exige um id pra saber onde dar o PUT).
    if (saveData && saveData.sessionId) {
      try {
        var racesResp = await fetch(BASE+'/api/session/'+saveData.sessionId+'/races');
        var racesData = await racesResp.json();
        if (racesData && Array.isArray(racesData.races)) {
          racesData.races.forEach(function(dbRace){
            var match = avbs.find(function(x){ return x.hora===dbRace.hora && x.corrida===dbRace.corrida; });
            if (match) match.id = dbRace.id;
          });
        }
      } catch(e) { console.error('[autoSaveSession] erro ao vincular IDs das corridas', e); }
    }
    showToast('\u2713 Sessão "'+name+'" salva no Histórico!', true);
    // Auto-download ZIP na primeira análise do dia
    var a = document.createElement('a');
    a.href = BASE+'/api/pdfs/hoje/zip';
    a.download = name.split('/').join('-')+'.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch(e) { console.error('autoSave erro:', e); }
}

async function autoCheckAndAnalyze() {
  if (raceFiles.length) return;
  if (results.length) return;

  function setFocusLoading(msg) {
    var fc = document.getElementById('focus-col');
    if (fc) fc.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--mut);text-align:center"><div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(34,197,94,.6);text-transform:uppercase">Greyhound Factory</div><div style="width:40px;height:40px;border:3px solid rgba(34,197,94,.2);border-top-color:#22c55e;border-radius:50%;animation:sp .8s linear infinite"></div><div style="font-size:15px;font-weight:700;color:var(--mut2)">'+msg+'</div></div>';
  }
  function setFocusEmpty() {
    var fc = document.getElementById('focus-col');
    if (fc) fc.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--mut);text-align:center"><div style="font-size:48px">📭</div><div style="font-size:15px;font-weight:700;color:var(--mut2)">Nenhuma corrida disponível</div><div style="font-size:12px">O robô ainda não baixou os PDFs de hoje.<br>Verifique a aba Robô.</div></div>';
    setSt('Ainda não existe corridas disponíveis para serem carregadas.');
  }

  // 1. Verifica sessão de hoje (erros não interrompem o fluxo)
  try {
    var now = new Date();
    var todayLabel = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
    var sessionName = 'Races '+todayLabel;
    var sr = await fetch(BASE+'/api/sessions');
    if (sr.ok) {
      var sessions = await sr.json();
      if (Array.isArray(sessions)) {
        var todaySession = sessions.find(function(s){ return s.name===sessionName; });
        if (todaySession) {
          setSt('Carregando sessão de hoje...');
          var dr = await fetch(BASE+'/api/session/'+todaySession.id+'/races');
          var dd = await dr.json();
          if (dd.races && dd.races.length) {
            dd.races.forEach(function(r) {
              results.push({
                tipo:'avb', nivel:r.nivel||'', hora:r.hora||'', hora_br:convertHora(r.hora||'')||r.hora_br||'',
                corrida:r.corrida||'', dist:r.dist||'', trapFav:r.trap_fav||0,
                nameFav:_limpaNome(r.name_fav)||'', trapUnd:r.trap_und||0, nameUnd:_limpaNome(r.name_und)||'',
                pct:r.pct||0, perfilFav:r.perfil_fav||'', perfilUnd:r.perfil_und||'',
                obs:r.obs||'', odd:r.odd||'', valor:r.valor||'', top3:r.top3||'',
                avbNaoAberto: !!r.avb_nao_aberto,
                histAll: r.hist_all?JSON.parse(r.hist_all):[],
                eliminados: r.eliminados?JSON.parse(r.eliminados):[],
                postPick: r.post_pick||'',
                dataCard: r.data_card||null,
                trackFull: r.track_full||null,
                cardSuspect: !!r.card_suspect,
                betEntrou: !!r.bet_entrou,
                betUnidades: r.bet_unidades!=null?r.bet_unidades:(STAKE_PADRAO!=null?STAKE_PADRAO:2.5),
                histFav:r.hist_fav?JSON.parse(r.hist_fav):[], histUnd:r.hist_und?JSON.parse(r.hist_und):[],
                flagAtrasada: !!r.flag_atrasada,
                scores: r.scores || null,
                id:r.id
              });
            });
            updCards();
            setSt(todayLabel+' - '+results.filter(function(r){return r.nivel!=='skip';}).length+' AvBs carregados');
            enterFocusMode();
            return;
          }
        }
      }
    }
  } catch(e) { console.warn('sessao check erro:', e.message); }

  // 2. Sem sessão — busca PDFs
  try {
    var r = await fetch(BASE+'/api/pdfs/hoje');
    var d = await r.json();
    if (!d.count) { setFocusEmpty(); return; }
    var parts = (d.date||'').split('-');
    autoDateLabel = parts.length===3 ? parts[2]+'/'+parts[1]+'/'+parts[0] : d.date;
    var mainEl = document.getElementById('main-layout');
    if (mainEl) mainEl.classList.add('focus-mode');
    setFocusLoading('Analisando '+d.count+' corridas de '+autoDateLabel+'...');
    setSt('Analisando '+d.count+' corridas...');
    await runAnalysis();
  } catch(e) {
    console.error('autoCheckAndAnalyze erro:', e);
    setFocusEmpty();
  }
}

/* ── PAINEL DE FOCO ─────────────────────────────────────────── */
var focusRaceIdx = -1;

function getDogImg(trap, corrida) {
  var pelagens = ['branco', 'caramelo', 'preto', 'mesclado'];
  var seed = 0;
  for (var i = 0; i < (corrida||'').length; i++) seed += corrida.charCodeAt(i);
  seed += (trap||1) * 13;
  var p = pelagens[((seed % pelagens.length) + pelagens.length) % pelagens.length];
  return BASE + '/static/img/dogs/Trap' + (trap||1) + '_' + p + '.png';
}

function getRaceClass(corrida){var m=(corrida||'').trim().match(/([A-Z]\d+)$/i);return m?m[1].toUpperCase():null;}
// Nome de exibicao da corrida: usa o nome completo da pista (trackFull vindo do
// servidor) + classe -> "Sunderland (A3)". Fallback pro codigo cru quando a
// sessao e' antiga e nao tem trackFull salvo. So EXIBICAO — nunca mexe em
// r.corrida (o motor/filtros continuam usando o codigo).
function corridaDisplay(r){if(!r)return'-';var cls=getRaceClass(r.corrida||'');return r.trackFull?(r.trackFull+(cls?' ('+cls+')':'')):(r.corrida||'-');}
function getHistByClass(hist,raceClass){if(!raceClass)return hist||[];return(hist||[]).filter(function(h){return(h.classe||'').toUpperCase()===raceClass.toUpperCase();});}
function mediaTempoByClass(hist,raceClass){var f=getHistByClass(hist,raceClass).filter(function(h){return h.caltm&&parseFloat(h.caltm)>0;});if(!f.length)return null;return f.reduce(function(a,h){return a+parseFloat(h.caltm);},0)/f.length;}
function podiosByClass(hist,raceClass){return getHistByClass(hist,raceClass).filter(function(h){return h.pos&&parseInt(h.pos)<=3;}).length;}
function arranqueByClass(hist,raceClass){var f=getHistByClass(hist,raceClass).filter(function(h){return h.split&&parseFloat(h.split)>0;});if(!f.length)return null;return f.reduce(function(a,h){return a+parseFloat(h.split);},0)/f.length;}
function melhorBRT(hist){var f=(hist||[]).filter(function(h){return h.caltm&&parseFloat(h.caltm)>0;});if(!f.length)return{val:null,classe:''};f.sort(function(a,b){return parseFloat(a.caltm)-parseFloat(b.caltm);});return{val:parseFloat(f[0].caltm).toFixed(2),classe:f[0].classe||''};}
function categoriaInfo(hist,raceClass){var rc=(raceClass||'').toUpperCase();var rcNum=parseInt((rc.match(/\d+/)||['99'])[0]);if(!hist||!hist.length)return{label:rc||'N/A',ascending:false,fillPct:Math.max(0,(12-rcNum)/11)};var recent=hist[0].classe||rc;var recentNum=parseInt((recent.match(/\d+/)||['99'])[0]);var ascending=rcNum<recentNum;return{label:rc+(ascending?'↑':''),ascending:ascending,fillPct:Math.max(0,(12-rcNum)/11)};}
function renderGauge(label,displayVal,subLabel,fillPct,color){var r=28,circ=2*Math.PI*r;var offset=circ*(1-Math.min(Math.max(fillPct||0,0),1));var dv=displayVal||'-';var fs=dv.length>5?'9':dv.length>3?'10':'12';return'<div class="fp-gauge">'+'<svg width="64" height="64" viewBox="0 0 72 72">'+'<circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="5"/>'+'<circle cx="36" cy="36" r="28" fill="none" stroke="'+color+'" stroke-width="5" '+'stroke-dasharray="'+circ.toFixed(1)+'" stroke-dashoffset="'+offset.toFixed(1)+'" '+'stroke-linecap="round" transform="rotate(-90 36 36)"/>'+(subLabel?'<text x="36" y="33" text-anchor="middle" fill="#fff" font-size="'+fs+'" font-weight="700" font-family="sans-serif">'+dv+'</text>'+'<text x="36" y="47" text-anchor="middle" fill="rgba(255,255,255,.45)" font-size="9" font-family="sans-serif">'+subLabel+'</text>':'<text x="36" y="41" text-anchor="middle" fill="#fff" font-size="'+fs+'" font-weight="700" font-family="sans-serif">'+dv+'</text>')+'</svg>'+'<div class="fp-gauge-lbl">'+label+'</div>'+'</div>';}
function categoriaCountByClassOrBetter(hist, raceClass) {
  if (!raceClass) return (hist||[]).length;
  var rcNum = parseInt((raceClass.match(/\d+/)||['99'])[0]);
  return (hist||[]).filter(function(h) {
    var hNum = parseInt(((h.classe||'').match(/\d+/)||['99'])[0]);
    return hNum <= rcNum;
  }).length;
}

function buildGauges(hist, raceClass, otherHist) {
  var myMt  = mediaTempoByClass(hist, raceClass);
  var otMt  = mediaTempoByClass(otherHist, raceClass);
  var myCat = categoriaCountByClassOrBetter(hist, raceClass);
  var otCat = categoriaCountByClassOrBetter(otherHist, raceClass);
  var myPod = podiosByClass(hist, raceClass);
  var otPod = podiosByClass(otherHist, raceClass);
  var myArr = arranqueByClass(hist, raceClass);
  var otArr = arranqueByClass(otherHist, raceClass);
  var myBrt = melhorBRT(hist);
  var otBrt = melhorBRT(otherHist);

  // Cores comparativas: verde = melhor, vermelho = pior, azul = empate
  function timeCol(my, other) { // menor = melhor
    if (!my && !other) return '#555';
    if (!my) return '#ef4444';   // sem dados = pior
    if (!other) return '#22c55e'; // só eu tenho = melhor
    if (Math.abs(my - other) < 0.01) return '#60a5fa'; // empate = azul
    return my <= other ? '#22c55e' : '#ef4444';
  }
  function cntCol(my, other) { // maior = melhor
    if (my === null || my === undefined) return '#555';
    if (other === null || other === undefined) return '#22c55e';
    if (my === other) return '#60a5fa'; // empate = azul
    return my >= other ? '#22c55e' : '#ef4444';
  }

  var mtColor  = timeCol(myMt, otMt);
  var catColor = cntCol(myCat, otCat);
  var podColor = cntCol(myPod, otPod);
  var arrColor = timeCol(myArr, otArr);
  var brtColor = timeCol(myBrt.val ? parseFloat(myBrt.val) : null, otBrt.val ? parseFloat(otBrt.val) : null);

  var mtFill   = myMt ? Math.max(0,Math.min(1,(35-myMt)/8)) : 0;
  var mtStr    = myMt ? myMt.toFixed(2) : '-';
  var cnt      = getHistByClass(hist, raceClass).length;
  var catFill  = Math.min(myCat/20, 1); // 20 corridas = full
  var podFill  = cnt > 0 ? (myPod > 0 ? Math.min(myPod/cnt, 1) : (otPod > 0 ? 0.08 : 0)) : 0;
  var arrFill  = myArr ? Math.max(0,Math.min(1,(6.0-myArr)/3.5)) : 0; // range real 2.5-6.0s
  var arrStr   = myArr ? myArr.toFixed(2) : '-';
  var brtFill  = myBrt.val ? Math.max(0,Math.min(1,(35-parseFloat(myBrt.val))/8)) : 0;

  return renderGauge('Média de Tempo', mtStr, cnt?'('+cnt+' corr.)':'', mtFill, mtColor)
    + renderGauge('Categoria', String(myCat), raceClass||'', catFill, catColor)
    + renderGauge('Pódios', String(myPod), cnt?'/'+cnt:'', podFill, podColor)
    + renderGauge('Arranque', arrStr, '', arrFill, arrColor)
    + renderGauge('Melhor BRT', myBrt.val||'-', myBrt.classe, brtFill, brtColor);
}

function isUpcoming(r) {
  if (r.flagAtrasada) return true; // marcada como atrasada na mao — nunca some sozinha
  var hbr = r.hora_br || convertHora(r.hora||'');
  if (!hbr) return true;
  var now = new Date();
  var nowMin = now.getHours()*60 + now.getMinutes();
  var parts = hbr.split(':');
  var raceMin = parseInt(parts[0]||0)*60 + parseInt(parts[1]||0);
  return (raceMin + TELA_GRACE_MIN) >= nowMin;
}

function minutesToRace(r) {
  var hbr = r.hora_br || convertHora(r.hora||'');
  if (!hbr) return null;
  var now = new Date();
  var nowMin = now.getHours()*60 + now.getMinutes();
  var parts = hbr.split(':');
  var raceMin = parseInt(parts[0]||0)*60 + parseInt(parts[1]||0);
  return raceMin - nowMin;
}

// Corrida "antiga" = o PDF traz uma data explicita (dataCard, formato
// YYYY-MM-DD) e ela e anterior a hoje. PDFs sem essa data (formato antigo,
// sem o campo) nunca sao marcados como antigos — fica neutro.
function isOldRaceCard(r) {
  if (!r || !r.dataCard) return false;
  var now = new Date();
  var todayStr = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  return r.dataCard < todayStr;
}

// Corrida antiga (data anterior a hoje) SEMPRE deve continuar visivel,
// independente do relogio bater ou nao com o horario dela no card — ela e
// so pra consulta/estudo, nao participa da logica de "ja passou". Corridas
// de hoje (ou sem dataCard) seguem a regra normal de isUpcoming.
function shouldShowRace(r) {
  if (typeof _SIM_AVB !== 'undefined' && _SIM_AVB) return true;
  // Skip que a Carga VIP destravou entra em tela dentro da janela, mesmo
  // sendo skip. So os de MARGEM chegam aqui: skip por falta de historico nao
  // passa no filtro VIP (o backend consulta hist_all IS NOT NULL).
  if (_vipSkipLiberado(r)) return true;
  return isOldRaceCard(r) || isUpcoming(r);
}

function isDayClosed(avbs) {
  // Encerrado quando nao sobra nenhuma corrida futura na sessao carregada
  // (dinamico — nao depende de um horario fixo de corte).
  return !avbs.some(shouldShowRace);
}

var focusRefreshInterval = null;
var alertCheckInterval = null;
var syncFromServerInterval = null;
var serverSyncInterval = null;

// Busca do banco os dados atualizados da sessao de hoje (o que os robos de
// resultado/monitoramento ja tiverem gravado) e atualiza `results` em
// memoria — sem isso, mudancas feitas pelos robos so apareciam depois de
// um F5 manual na pagina.
// Atualiza "Historico do dia" e "Sessoes recentes" no sidebar sem precisar de
// F5 — esses dois so eram montados no carregamento inicial da pagina, entao
// se a aba ficar aberta e o robo salvar a sessao de hoje depois, ficavam
// "congelados" mostrando informacao velha ate a pessoa atualizar manualmente.
async function refreshSidebarSessions() {
  try {
    var r = await fetch(BASE + '/api/sidebar-sessions');
    var d = await r.json();
    var histSlot = document.getElementById('hist-do-dia-slot');
    if (histSlot) {
      histSlot.innerHTML = d.sessaoHojeId
        ? '<a href="'+BASE+'/sessao/'+d.sessaoHojeId+'" class="tabbtn">&#128220; Histórico do dia</a>'
        : '<span class="tabbtn" style="opacity:.4;cursor:not-allowed" title="Ainda nao ha sessao analisada hoje">&#128220; Histórico do dia</span>';
    }
    var sessSlot = document.getElementById('sessoes-recentes-slot');
    if (sessSlot && d.sessions) {
      // slice(0,7): o servidor renderiza 7 na carga inicial, mas o endpoint do
      // refresh devolve mais — a lista crescia sozinha depois do 1o ciclo.
      sessSlot.innerHTML = d.sessions.length
        ? d.sessions.slice(0,7).map(function(s){ return '<a href="'+BASE+'/sessao/'+s.id+'" class="sess-link">'+(s.name||'Sessao '+s.id)+'<span>'+s.total_avbs+' AvBs</span></a>'; }).join('')
        : '<span style="font-size:11px;color:var(--mut)">Nenhuma sessao salva</span>';
    }
  } catch(e) { /* falha silenciosa - nao atrapalha o resto da tela */ }
}

async function syncFromServer() {
  try {
    var now = new Date();
    var todayLabel = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
    var sessionName = 'Races '+todayLabel;
    var sr = await fetch(BASE+'/api/sessions');
    if (!sr.ok) return;
    var sessions = await sr.json();
    var todaySession = Array.isArray(sessions) ? sessions.find(function(s){return s.name===sessionName;}) : null;
    if (!todaySession) return;
    var dr = await fetch(BASE+'/api/session/'+todaySession.id+'/races');
    if (!dr.ok) return;
    var dd = await dr.json();
    if (!dd.races || !Array.isArray(dd.races)) return;

    var focusedKey = (focusRaceIdx>=0 && results[focusRaceIdx]) ? (results[focusRaceIdx].hora+'|'+results[focusRaceIdx].corrida) : null;
    var changedAny = false;
    var changes = [];

    dd.races.forEach(function(r){
      var idx = results.findIndex(function(x){ return x.hora===r.hora && x.corrida===r.corrida; });
      if (idx === -1) return;
      var cur = results[idx];
      var oldNivel = cur.nivel, oldFav = cur.trapFav, oldUnd = cur.trapUnd;
      var oldCioTraps = (cur.eliminados||[]).filter(function(e){return /Cio recente/i.test(e.motivo||'');}).map(function(e){return e.trap;});
      if (cur.trapFav!==r.trap_fav || cur.trapUnd!==r.trap_und || cur.nameFav!==r.name_fav || cur.nameUnd!==r.name_und || cur.pct!==r.pct || cur.nivel!==r.nivel || cur.flagAtrasada!==!!r.flag_atrasada) {
        changedAny = true;
      }
      // _limpaNome aqui, na ENTRADA: o nome vindo do servidor as vezes traz a
      // linha de pedigree inteira ("Nome (M) ltf b Pai-Mae Oct24"). Limpar num
      // ponto so vale mais que caçar as ~10 telas que exibem o nome — bastava
      // esquecer uma pra o problema voltar, e foi o que aconteceu quando
      // tratei so o caminho do aHist.
      cur.nivel = r.nivel; cur.trapFav = r.trap_fav; cur.nameFav = _limpaNome(r.name_fav);
      cur.trapUnd = r.trap_und; cur.nameUnd = _limpaNome(r.name_und); cur.pct = r.pct;
      cur.perfilFav = r.perfil_fav; cur.perfilUnd = r.perfil_und; cur.obs = r.obs;
      cur.odd = r.odd; cur.valor = r.valor; cur.avbNaoAberto = !!r.avb_nao_aberto;
      cur.top3 = r.top3;
      cur.histFav = r.hist_fav?JSON.parse(r.hist_fav):[];
      cur.histUnd = r.hist_und?JSON.parse(r.hist_und):[];
      cur.histAll = r.hist_all?JSON.parse(r.hist_all):[];
      cur.dataCard = r.data_card||null;
      cur.trackFull = r.track_full||cur.trackFull;
      cur.cardSuspect = !!r.card_suspect;
      cur.betEntrou = !!r.bet_entrou;
      cur.betUnidades = r.bet_unidades!=null?r.bet_unidades:(STAKE_PADRAO!=null?STAKE_PADRAO:2.5);
      cur.scores = r.scores || cur.scores;
      // Escolha vinda do banco (campo pessoal). So adota se o cliente ainda
      // nao tem uma: o que esta na tela e' mais recente que o que veio.
      if (!cur.avbEscolhido && r.avb_escolhido) {
        try { var _e = JSON.parse(r.avb_escolhido); if(_e && _e.aTrap!=null) cur.avbEscolhido = { a:_e.aTrap, b:_e.bTrap, odd:_e.odd||null, em:(_e.ts||0)*1000 }; } catch(e){}
      } // achado 14/07/2026 — faltava, relatorio nunca via score atualizado
      try { cur.eliminados = r.eliminados?JSON.parse(r.eliminados):[]; } catch(e){ cur.eliminados = cur.eliminados||[]; }
      cur.flagAtrasada = !!r.flag_atrasada;
      cur.id = r.id;
      cur.finalCheckStatus = r.final_check_status || null;
      cur.finalCheckAt = r.final_check_at || null;
      // Sinaliza reanalise/skip vindos do robo (ex.: checagem final antes da
      // largada) — selo na lista + toast + som, pra nunca apostar no palpite
      // velho. Detecta pela transicao real dos campos (independe do texto que
      // o robo grava em final_check_status).
      var _pista = getPista(cur.corrida) || cur.corrida || '';
      var _hbr = cur.hora_br || convertHora(cur.hora||'') || cur.hora || '';
      if (oldNivel !== 'skip' && cur.nivel === 'skip') {
        cur._reanaliseFlag = { type:'skip', at: Date.now() };
        changes.push({ tipo:'skip', txt: _hbr+' '+_pista+' virou SKIP (card mudou)' });
      } else if (oldNivel !== 'skip' && cur.nivel !== 'skip' && (oldFav !== cur.trapFav || oldUnd !== cur.trapUnd)) {
        cur._reanaliseFlag = { type:'reanalise', at: Date.now() };
        changes.push({ tipo:'reanalise', txt: _hbr+' '+_pista+' reanalisada (fav agora T'+cur.trapFav+')' });
      }
      // Cio recente (item 3): avisa quando a regra passou a descartar um galgo
      // que antes nao estava descartado (ex.: substituto em cio pego pelo robo).
      var _newCio = (cur.eliminados||[]).filter(function(e){return /Cio recente/i.test(e.motivo||'');});
      var _freshCio = _newCio.filter(function(e){ return oldCioTraps.indexOf(e.trap)===-1; });
      if (_freshCio.length) {
        cur._reanaliseFlag = { type:'reanalise', at: Date.now() };
        changes.push({ tipo:'cio', txt: '🩸 '+_hbr+' '+_pista+' — cio recente: '+_freshCio.map(function(e){return 'T'+e.trap;}).join(', ')+' descartada' });
      }
    });

    if (changedAny) {
      refreshFocusMode();
      // So re-mostra a corrida que estava em foco se ela AINDA e valida pra
      // exibir agora (nao passou do horario nesse meio-tempo) — senao, deixa
      // o refreshFocusMode() ja ter avancado sozinho pra proxima, sem forcar
      // de volta uma corrida velha que ja devia ter saido da tela.
      if (focusedKey) {
        var stillIdx = results.findIndex(function(x){ return (x.hora+'|'+x.corrida)===focusedKey; });
        if (stillIdx>=0 && shouldShowRace(results[stillIdx])) {
          renderFocusPanel(results[stillIdx], stillIdx);
        }
      }
      if (changes.length) {
        var _hasSkip = changes.some(function(c){ return c.tipo==='skip'; });
        // Alem do toast (que some em 2,6s), manda cada aviso pro ticker da
        // faixa de baixo. O toast serve pra chamar atencao na hora; o ticker
        // guarda o historico do dia, pra quem estava olhando outra coisa nao
        // perder o que mudou.
        // Os avisos de mudanca vao SO pro ticker da faixa de baixo. O toast
        // flutuante foi removido daqui: ele cobria os gauges da arena e, agora
        // que o ticker guarda o historico do dia, era informacao duplicada.
        // O showToast segue existindo pra confirmacoes de acao (salvar etc).
        if (typeof window.ghTicker === 'function') {
          changes.forEach(function(c){ try { window.ghTicker(c.txt); } catch(e){} });
        } else {
          var _hasSkip2 = changes.some(function(c){ return c.tipo==='skip'; });
          showToast((_hasSkip2?'\u26A0\uFE0F ':'\uD83D\uDD04 ') + changes.map(function(c){ return c.txt; }).join(' \u00B7 '), !_hasSkip2);
        }
      } else {
        showToast('\u2139\uFE0F Alguma corrida foi atualizada automaticamente.', true);
      }
    }
  } catch(e) { console.error('[syncFromServer] erro', e); }
}

// Checagem RAPIDA (a cada 15s) e independente do refresh geral da lista —
// so atualiza a classe de piscar + dispara o som, sem precisar esperar o
// intervalo configurado em Automacao (que pode ser grande demais e "pular"
// a janela de 3 minutos sem nunca cair exatamente nela).
function checkRaceAlerts() {
  document.querySelectorAll('.rc').forEach(function(el) {
    var idx = parseInt(el.getAttribute('data-idx'), 10);
    if (isNaN(idx) || !results[idx]) return;
    var r = results[idx];
    el.classList.toggle('rc-old', isOldRaceCard(r));
    if (isOldRaceCard(r)) { el.classList.remove('rc-alert'); el.classList.remove('rc-alert-custom'); return; } // corrida antiga nunca pisca/soa
    var mins = minutesToRace(r);
    var shouldAlert = mins !== null && mins >= 0 && mins <= ALERTA_MIN_ANTES;
    if (shouldAlert) {
      var custom = matchAlarmeFiltro(r);
      if (custom) {
        el.classList.remove('rc-alert'); el.classList.add('rc-alert-custom');
        el.style.setProperty('--alert-col', CORES_ALARME[ALARME_FILTRO.cor] || '#3b82f6');
      } else {
        el.classList.remove('rc-alert-custom'); el.classList.add('rc-alert');
      }
      var key = raceAlertKey(r);
      if (!alertedRaces[key]) {
        alertedRaces[key] = true;
        avisarCorrida(r, custom);
      }
    } else {
      el.classList.remove('rc-alert'); el.classList.remove('rc-alert-custom');
    }
  });
}

function showDayEndMsg() {
  var focusCol = document.getElementById('focus-col');
  if (focusCol) focusCol.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--mut);text-align:center;padding:40px;margin-left:-85px"><div style="font-size:64px">&#127937;</div><div style="font-size:18px;font-weight:700;color:var(--mut2)">Ciclo do dia encerrado</div><div style="font-size:13px">As corridas de hoje se encerraram e voltaremos amanhã</div></div>';
  var col = document.getElementById('race-list-col');
  if (col) { col.innerHTML = ''; col.style.background = '#0D1117'; col.style.borderRight = 'none'; }
  if (focusRefreshInterval) { clearInterval(focusRefreshInterval); focusRefreshInterval = null; }
  if (alertCheckInterval) { clearInterval(alertCheckInterval); alertCheckInterval = null; }
  if (serverSyncInterval) { clearInterval(serverSyncInterval); serverSyncInterval = null; }
}

// Mensagem especifica pra quando o lote CARREGADO (avulso ou nao) e' inteiro
// composto por corridas de hoje que ja aconteceram (nao antigas — antigas
// tem mensagem/tratamento proprio — so ja passaram do horario hoje mesmo)
function showAllExpiredMsg() {
  var focusCol = document.getElementById('focus-col');
  if (focusCol) focusCol.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--mut);text-align:center;padding:40px;margin-left:-85px"><div style="font-size:64px">&#9200;</div><div style="font-size:18px;font-weight:700;color:var(--mut2)">Corridas encerradas</div><div style="font-size:13px">Favor aguardar o próximo turno.</div></div>';
  var col = document.getElementById('race-list-col');
  if (col) { col.innerHTML = ''; col.style.background = '#0D1117'; col.style.borderRight = 'none'; }
  if (focusRefreshInterval) { clearInterval(focusRefreshInterval); focusRefreshInterval = null; }
  if (alertCheckInterval) { clearInterval(alertCheckInterval); alertCheckInterval = null; }
  if (serverSyncInterval) { clearInterval(serverSyncInterval); serverSyncInterval = null; }
}

function refreshFocusMode() {
  var avbs = results.filter(function(r){return r.nivel!=='skip'&&r.trapFav>0;});
  avbs.sort(function(a,b){return ukHoraParaOrdem(a.hora)-ukHoraParaOrdem(b.hora);});

  // Ciclo encerrado quando nao sobra nenhuma corrida futura na sessao.
  // Se sobrou alguma corrida no lote mas nenhuma e antiga nem futura, e
  // porque sao corridas de hoje que ja aconteceram — mensagem diferente.
  // No simulado, segue em frente mesmo com o dia encerrado — senao nao ha
  // corrida em foco e nao ha o que simular.
  if (!(typeof _SIM_AVB !== 'undefined' && _SIM_AVB) && isDayClosed(avbs)) { avbs.length>0 ? showAllExpiredMsg() : showDayEndMsg(); return; }

  // Sempre mostra as proximas N corridas (RACAS_EM_TELA), nunca corridas ja
  // passadas — exceto corridas antigas (data anterior a hoje), que ficam
  // sempre visiveis independente do horario.
  var toShow = avbs.filter(shouldShowRace).slice(0, RACAS_EM_TELA);

  renderRaceListPanel(toShow);

  // Simulado: se nada esta em foco (dia encerrado, por exemplo), foca a
  // primeira corrida pra haver painel onde desenhar os AvBs de teste.
  if ((typeof _SIM_AVB !== 'undefined' && _SIM_AVB) && focusRaceIdx < 0 && toShow.length) {
    renderFocusPanel(toShow[0], results.indexOf(toShow[0]));
  }

  // Se a corrida em foco já passou, avança para a próxima automaticamente
  // (corridas antigas nunca "avançam" sozinhas — ficam fixas pra consulta)
  if (focusRaceIdx >= 0 && results[focusRaceIdx] && !shouldShowRace(results[focusRaceIdx])) {
    var next = toShow[0];
    if (next) {
      renderFocusPanel(next, results.indexOf(next));
      document.querySelectorAll('.rc').forEach(function(el){el.classList.remove('rc-active');});
      var firstCard = document.querySelector('.rc');
      if (firstCard) firstCard.classList.add('rc-active');
    } else {
      avbs.length>0 ? showAllExpiredMsg() : showDayEndMsg();
    }
  }
}

// Botao "Atualizar" ao lado de PROXIMAS. Se a tela esta mostrando corridas
// ANTIGAS (PDFs de data anterior, carregados so pra estudo), o Atualizar
// descarta elas e recarrega as corridas de HOJE — e o autoCheckAndAnalyze
// mostra as de hoje OU a mensagem de "encerrado / sem corridas" se o dia
// ja acabou. Se ja esta mostrando as de hoje, so faz o refresh normal.
function atualizarProximas() {
  var avbs = results.filter(function(r){ return r.nivel !== 'skip' && r.trapFav > 0; });
  var soAntigas = avbs.length > 0 && avbs.every(isOldRaceCard);

  if (soAntigas) {
    // Descarta as corridas antigas e volta pro fluxo automatico do dia.
    results = [];
    raceFiles = [];
    capFiles = [];
    focusRaceIdx = -1;
    clearSessionState();
    autoCheckAndAnalyze();   // carrega as de hoje, ou avisa que nao ha corridas
    return;
  }

  // Corridas de hoje (ou nada carregado) -> refresh normal da lista.
  refreshFocusMode();
}

function enterFocusMode() {
  var avbs = results.filter(function(r){return r.nivel!=='skip'&&r.trapFav>0;});
  avbs.sort(function(a,b){return ukHoraParaOrdem(a.hora)-ukHoraParaOrdem(b.hora);});
  if (!avbs.length) return;

  // Ciclo encerrado quando nao sobra nenhuma corrida futura na sessao.
  // Se sobrou corrida no lote mas nenhuma e antiga nem futura, sao corridas
  // de hoje que ja aconteceram — mensagem diferente da generica.
  if (isDayClosed(avbs)) {
    document.getElementById('main-layout').classList.add('focus-mode');
    avbs.length>0 ? showAllExpiredMsg() : showDayEndMsg();
    return;
  }

  var toShow = avbs.filter(shouldShowRace).slice(0, RACAS_EM_TELA);
  document.getElementById('main-layout').classList.add('focus-mode');
  renderRaceListPanel(toShow);
  var next = toShow[0];
  if (next) renderFocusPanel(next, results.indexOf(next));

  // Auto-refresh a cada minuto
  if (focusRefreshInterval) clearInterval(focusRefreshInterval);
  focusRefreshInterval = setInterval(refreshFocusMode, AUTO_REFRESH_MIN * 60000);

  // Sincroniza com o servidor no mesmo ritmo — pega mudanças feitas pelos
  // robôs em background (Monitoramento, Checagem Final) sem precisar
  // recarregar a página na mão. syncFromServer() já existia pronta, só
  // faltava ser chamada de algum lugar.
  if (syncFromServerInterval) clearInterval(syncFromServerInterval);
  // Roda AGORA e a cada refresh. So dentro do setInterval, a lista VIP so
  // chegava no 1o ciclo automatico e quem clicava logo nao via nada.
  carregarVipSet();
  syncFromServerInterval = setInterval(function(){ syncFromServer(); loadAcertosResumo(); carregarVipSet(); }, AUTO_REFRESH_MIN * 60000);

  // Checagem de alerta de proximidade (independente, mais frequente)
  if (alertCheckInterval) clearInterval(alertCheckInterval);
  alertCheckInterval = setInterval(checkRaceAlerts, 15000);
  checkRaceAlerts(); // roda uma vez na hora

  // Sincroniza com o banco a cada 2 min (pega mudancas feitas pelos robos)
  if (serverSyncInterval) clearInterval(serverSyncInterval);
  serverSyncInterval = setInterval(syncFromServer, 120000);
}

// ── AvBs ao vivo: helpers de par ─────────────────────────────────────────────
// O robo de reanalise pode trocar QUAL par aparece na arena grande (a pos 1 do
// ranking muda entre ciclos de 5s). Estes helpers acham nome/perfil/historico
// de um trap qualquer dentro do que o motor ja mandou em r.histAll / r.scores,
// pra arena conseguir se redesenhar pra qualquer dupla.

// Par escolhido pelo usuario (fica) > par ao vivo do momento > fav x und do motor.
// Uma vez que o usuario ESCOLHE, aquele par manda e nao muda mais sozinho —
// e' ele que vai pro historico e pra banca.
function _parEmFoco(r){
  if (r && r.avbEscolhido && r.avbEscolhido.a) return { a:r.avbEscolhido.a, b:r.avbEscolhido.b, escolhido:true };
  if (r && r._parAoVivo && r._parAoVivo.a)     return { a:r._parAoVivo.a, b:r._parAoVivo.b, aoVivo:true };
  return { a: r && r.trapFav || 1, b: r && r.trapUnd || 2 };
}
// ── Fonte do historico: aHist/bHist do robo, com fallback pro histAll ───────
// O robo passou a mandar, em cada avb, o historico completo dos dois galgos do
// par (aHist/bHist). E' a fonte CERTA por dois motivos:
//   1) a reanalise pareia sobre histFull (todos os galgos) e o histAll so tem
//      os que receberam score no motor 1 — um galgo pode existir num e nao no
//      outro, e ai a arena nao conseguia desenhar o par sugerido;
//   2) mesmo pros galgos presentes nos dois, o histAll traz linhasValidas e a
//      reanalise usa o historico completo. A tela mostrava um conjunto de
//      linhas diferente do que gerou a recomendacao — divergencia silenciosa,
//      pior que o painel vazio, porque ninguem percebe.
// O fallback pro histAll fica pras analises antigas e pra janela entre deploys.
// Convencao do robo: A e' sempre o favorito da reanalise.
// O nome que vem no aHist/bHist as vezes traz a linha de pedigree inteira do
// card ("Airfield Thunder (M) bebdw b Out Of Range ASB-Airfield Biddy Jul21").
// Cortamos no marcador de sexo, que fecha o nome. Sem isso o nome estoura a
// largura e empurra o layout da arena.
// Isto e' defesa na tela: o certo e' o motor mandar o nome ja limpo.
// Extrai o NOME do galgo de uma linha que pode vir com o pedigree inteiro do
// card: "Droopys Kendall bkwtkd b Serene Ace-Droopys Berry Apr23 (Ssn 04Apr26)".
//
// A primeira versao cortava so no "(M)"/"(W)" e falhava justamente nos nomes
// que nao trazem o marcador de sexo. Agora usamos varios sinais de onde o
// pedigree COMECA, e paramos no primeiro que aparecer:
//   1) marcador de sexo entre parenteses — "(M)" / "(W)"
//   2) codigo de cor/pelagem do Racing Post: bk, bd, be, f, wbd, bkw, bebdw,
//      bkwtkd etc — tokens curtos so de letras dessas, que nunca sao nome
//   3) "Mes+Ano" da data de nascimento — "Apr23", "Jul21"
//   4) "(Ssn ...)" do cio
//
// Se nada casar, devolve o texto como veio: melhor um nome longo do que um
// nome cortado no lugar errado.
// ── CARGA VIP ─────────────────────────────────────────────────────────────
// Lista as corridas que passaram no filtro de VALOR do motor. E' filtro de
// valor, NAO previsao: as taxas (62%/69%) sao o historico do filtro, nao a
// chance daquela corrida especifica. A tela diz isso de forma explicita —
// numero especifico ("69%") passa sensacao de certeza justamente por ser
// especifico, e aqui o custo de confundir os dois e' dinheiro.
// Conjunto "hora|corrida" das corridas que passaram no filtro VIP. Carregado
// no boot pra a arena poder se destacar mesmo quando voce chega na corrida
// navegando normal, sem ter aberto a lista.
var VIP_SET = new Set();
// Config da Carga VIP (Configuracoes -> aba Alarme). Defaults iguais aos do
// servidor pra a tela funcionar mesmo antes do /api/config responder.
var VIP_CFG = { ativo:1, minAntes:5, alarme:1, corDestaque:'#c084fc', corFundo:'#140B2B' };
// Quais corridas do VIP estao marcadas como skip (e o motivo). O destrave so
// vale pra elas: skip por falta de historico nem chega no filtro, entao aqui
// so entram os de margem apertada.
var VIP_SKIP = new Map();
function carregarVipSet(){
  fetch(BASE + '/api/carga-vip')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){
      if(!d || !d.entradas) return;
      VIP_SET = new Set(d.entradas.map(function(e){ return e.hora + '|' + e.corrida; }));
      VIP_SKIP = new Map();
      d.entradas.forEach(function(e){ if(e.skip) VIP_SKIP.set(e.hora + '|' + e.corrida, e.skip_motivo || ''); });
      // Redesenha o painel se a corrida em foco virou VIP agora.
      var r = results[focusRaceIdx];
      _cssVip();
      if(r && _ehVip(r)) renderFocusPanel(r, focusRaceIdx);
    })
    .catch(function(){});
}
// A corrida e' um skip que a Carga VIP destravou E ja esta dentro da janela?
// Fora da janela ela continua escondida, como qualquer skip.
// Alarme quando um skip destravado ENTRA em tela. Toca uma vez por corrida:
// o ciclo de refresh chama isto de minuto em minuto, e sem a marca o alarme
// repetiria ate a largada.
var _vipAvisados = new Set();
function _avisarVipSkip(r){
  if(!VIP_CFG.alarme || !r) return;
  var k = r.hora + '|' + r.corrida;
  if(_vipAvisados.has(k)) return;
  _vipAvisados.add(k);
  try { playSom(ALARME_FILTRO.som || 'sino'); } catch(e){}
  try { showToast('\u2B50 Carga VIP destravou ' + (r.corrida||'') + ' — o motor tinha marcado como skip por margem.', true); } catch(e){}
  if (typeof window.ghTicker === 'function') {
    try { window.ghTicker('Carga VIP: ' + (r.corrida||'') + ' liberada (skip por margem)'); } catch(e){}
  }
}

function _vipSkipLiberado(r){
  if(!VIP_CFG.ativo || !r) return false;
  if(!VIP_SKIP.has(r.hora + '|' + r.corrida)) return false;
  var min = minutesToRace(r);
  return min !== null && min <= VIP_CFG.minAntes && min >= -2;
}
// CSS do selo VIP, injetado uma vez. Anima OPACIDADE, nao display: piscar
// escondendo empurra o layout a cada meio segundo e cansa a vista.
function _cssVip(){
  var st = document.getElementById('vip-css');
  if(!st){ st = document.createElement('style'); st.id = 'vip-css'; document.head.appendChild(st); }
  var c = VIP_CFG.corDestaque || '#c084fc';
  st.textContent =
    '.vip-selo{display:inline-flex;align-items:center;gap:6px;'
    + 'background:rgba(234,179,8,.14);border:1px solid rgba(234,179,8,.45);color:#eab308;'
    + 'font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;'
    + 'padding:4px 12px;border-radius:14px;animation:vipPisca 1.6s ease-in-out infinite}'
    + '.vip-selo.vip-skip{background:rgba(192,132,252,.14);border-color:' + c + ';color:' + c + '}'
    + '@keyframes vipPisca{0%,100%{opacity:1}50%{opacity:.5}}'
    // Respeita quem pediu menos animacao no sistema: o selo fica visivel, so parado.
    + '@media(prefers-reduced-motion:reduce){.vip-selo{animation:none}}';
}

function _ehVip(r){ return !!(r && VIP_SET.has(r.hora + '|' + r.corrida)); }

function abrirCargaVip(){
  var m = document.getElementById('vip-modal');
  if(!m){
    m = document.createElement('div');
    m.id = 'vip-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:3000;display:flex;align-items:flex-start;justify-content:center;padding:36px 16px;overflow:auto';
    m.addEventListener('click', function(e){ if(e.target===m) fecharCargaVip(); });
    document.body.appendChild(m);
  }
  m.style.display = 'flex';
  m.innerHTML = '<div style="background:#161B27;border:1px solid #2a3140;border-radius:12px;max-width:900px;width:100%;overflow:hidden">'
    + '<div style="padding:18px 22px;color:var(--mut)">Carregando…</div></div>';

  // Le como TEXTO antes do JSON: quando o servidor devolve HTML (rota ausente,
  // sessao expirada, 500), o .json() estoura com "Unexpected token '<'", que
  // nao diz nada a quem esta usando.
  fetch(BASE + '/api/carga-vip', { credentials:'same-origin' })
    .then(function(r){ return r.text().then(function(t){ return { status:r.status, texto:t }; }); })
    .then(function(res){
      var d = null;
      try { d = JSON.parse(res.texto); } catch(e) {}
      if (d) { _pintaCargaVip(d); return; }
      var motivo = res.status === 404 ? 'a rota /api/carga-vip não existe neste servidor'
                 : (res.status === 401 || res.status === 403) ? 'sem permissão (ou sessão expirada — recarregue a página)'
                 : res.status >= 500 ? 'o servidor falhou ao montar a lista'
                 : 'o servidor respondeu algo que não é JSON';
      _vipCorpo('<div style="padding:22px;color:#ef4444;line-height:1.6">'
        + '<div style="font-weight:700;margin-bottom:6px">Não consegui carregar a Carga VIP</div>'
        + '<div style="font-size:12px;color:#f59e0b">HTTP ' + res.status + ' — ' + motivo + '.</div></div>');
    })
    .catch(function(e){ _vipCorpo('<div style="padding:22px;color:#ef4444">Erro de conexão: ' + e.message + '</div>'); });
}
function fecharCargaVip(){
  var m = document.getElementById('vip-modal');
  if(m) m.style.display = 'none';
}
function _vipCorpo(html){
  var m = document.getElementById('vip-modal');
  if(m) m.innerHTML = '<div style="background:#161B27;border:1px solid #2a3140;border-radius:12px;max-width:900px;width:100%;overflow:hidden">' + html + '</div>';
}
function _pintaCargaVip(d){
  if(!d || d.error){ _vipCorpo('<div style="padding:22px;color:#ef4444">' + ((d&&d.error)||'resposta inesperada') + '</div>'); return; }
  var ent = d.entradas || [];

  var cab = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px;border-bottom:1px solid #222">'
    + '<div><div style="font-size:16px;font-weight:800;color:#f0f0f0">&#11088; Carga VIP</div>'
    +   '<div style="font-size:11px;color:var(--mut);margin-top:2px">' + (d.date||'') + ' &middot; ' + (d.total||0) + ' corrida(s) no filtro</div></div>'
    + '<button type="button" onclick="fecharCargaVip()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;line-height:1">&times;</button></div>';

  // O aviso vem ANTES da lista de proposito: depois dela, com os numeros ja
  // lidos, vira rodape que ninguem le.
  var aviso = '<div style="margin:14px 22px 0;padding:11px 14px;background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.25);border-radius:8px;font-size:11.5px;color:#eab308;line-height:1.6">'
    + '<strong>Isto é um filtro de valor, não uma previsão.</strong> As taxas abaixo são o histórico deste filtro em corridas parecidas — não são a chance desta corrida específica. '
    + 'Corrida a corrida, qualquer uma pode perder.'
    + (d.aviso ? '<div style="margin-top:6px;color:#a3894a">' + d.aviso + '</div>' : '')
    + '</div>';

  if(!ent.length){
    _vipCorpo(cab + aviso + '<div style="padding:26px 22px;text-align:center;color:var(--mut);font-size:13px">Nenhuma corrida passou no filtro hoje.</div>');
    return;
  }

  // Ordena pelo horario BR. O motor entrega ordenado por relevancia (Premium
  // primeiro, maior delta no topo), mas na hora de operar o que importa e' a
  // sequencia do dia: a lista serve pra saber o que vem A SEGUIR.
  // A conversao UK->BR pode virar o dia (UK 11:04 = BR 07:04), entao ordenar
  // pela hora UK crua deixaria as corridas da manha no fim da lista.
  ent = ent.slice().sort(function(a, b){
    var ha = a.hora_br || (a.hora ? convertHora(a.hora) : '');
    var hb = b.hora_br || (b.hora ? convertHora(b.hora) : '');
    var m = function(h){ var p = String(h||'').split(':'); return (parseInt(p[0],10)||0)*60 + (parseInt(p[1],10)||0); };
    return m(ha) - m(hb);
  });

  var linhas = ent.map(function(e, i){
    var premium = String(e.nivel||'').toLowerCase() === 'premium';
    var cor = premium ? '#eab308' : '#22c55e';
    // taxa_nivel_pct e' o nome novo; taxa_estimada_pct o antigo. Lemos os dois
    // pra a tela nao ficar sem numero na janela entre os dois deploys.
    var taxa = (e.taxa_nivel_pct != null) ? e.taxa_nivel_pct : e.taxa_estimada_pct;
    var selos = [];
    if(e.selo_pick_frente) selos.push('sai na frente');
    if(e.selo_outro_fuma) selos.push('outro fuma');
    var nums = [];
    if(e.categoria) nums.push(e.categoria);
    if(e.ratio_odd != null) nums.push('odd ' + e.ratio_odd);
    if(e.dt_caltm != null) nums.push('&Delta;t ' + e.dt_caltm);

    // Motivo do skip so aqui, na lista — e' onde voce decide se vale entrar.
    // Na Analisar o Bruno nao quer (pediria atencao no momento errado).
    var MOTIVOS = { margem_insuficiente:'o motor descartou por margem apertada',
                    historico_insuficiente:'o motor descartou por histórico insuficiente' };
    var skipTag = e.skip
      ? '<div style="font-size:9.5px;color:#c084fc;margin-top:2px">&#9888; ' + (MOTIVOS[e.skip_motivo] || ('skip: ' + (e.skip_motivo||'motivo não informado'))) + '</div>'
      : '';

    return '<div class="vip-lin" data-i="' + i + '" data-hora="' + (e.hora||'') + '" data-corrida="' + (e.corrida||'') + '"'
      + ' style="display:flex;align-items:center;gap:12px;padding:11px 22px;border-bottom:1px solid #1e2430;cursor:pointer'
      + (e.skip ? ';background:rgba(192,132,252,.06)' : '') + '"'
      + ' title="Clique para abrir esta corrida na tela">'
      // Hora nas duas linhas, no formato do Historico: BR grande, UK menor.
      // O endpoint manda so a hora UK, entao a BR sai do convertHora() — a
      // MESMA conversao que o resto da tela usa, pra os dois nunca divergirem.
      // Se um dia vier hora_br do servidor, ela tem prioridade.
      + (function(){
          var uk = e.hora || '';
          var br = e.hora_br || (uk ? convertHora(uk) : '');
          return '<div style="width:56px;flex-shrink:0;text-align:center">'
            + '<div style="font-size:14px;font-weight:800;color:#22c55e;line-height:1.1">' + (br || uk || '—') + '</div>'
            + (br && uk && br !== uk ? '<div style="font-size:10px;color:#3f8f5c">' + uk + '</div>' : '')
            + '</div>';
        })()
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:12.5px;color:#f0f0f0;font-weight:600">T' + e.pick_trap + ' ' + _limpaNome(e.pick_nome) + ' <span style="color:#555">vence</span> T' + e.outro_trap + ' ' + _limpaNome(e.outro_nome) + '</div>'
      +   '<div style="font-size:10.5px;color:var(--mut);margin-top:1px">' + (e.corrida||'') + (e.dist?' · '+e.dist:'') + (nums.length?' · '+nums.join(' · '):'') + '</div>'
      +   (selos.length ? '<div style="font-size:9.5px;color:#60a5fa;margin-top:2px">' + selos.join(' · ') + '</div>' : '')
      +   skipTag
      + '</div>'
      + '<div style="text-align:right;flex-shrink:0">'
      +   '<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:' + cor + '">' + (e.nivel||'') + '</div>'
      +   (taxa != null
          ? '<div style="font-size:15px;font-weight:800;color:' + cor + '">~' + taxa + '%</div>'
            + '<div style="font-size:8px;color:#555;white-space:nowrap">histórico do filtro</div>'
          : '')
      + '</div></div>';
  }).join('');

  // Legenda dos niveis: o "niveis" e' um OBJETO por nivel ({criterio,
  // taxa_historica_pct}). Antes concatenavamos ele direto e saia
  // "Valor: [object Object]". Como cada linha ja mostra a taxa, aqui fica so
  // o CRITERIO — o que define o nivel, que e' o que a linha nao diz.
  var legenda = '';
  if (d.niveis && typeof d.niveis === 'object') {
    var partes = Object.keys(d.niveis).map(function(k){
      var v = d.niveis[k] || {};
      var crit = (typeof v === 'object') ? v.criterio : v;
      return crit ? '<strong style="color:' + (k.toLowerCase()==='premium'?'#eab308':'#22c55e') + '">' + k + '</strong>: ' + crit : '';
    }).filter(Boolean);
    if (partes.length) legenda = '<div style="padding:10px 22px 0;font-size:10.5px;color:var(--mut);line-height:1.6">' + partes.join('<br>') + '</div>';
  }

  _vipCorpo(cab + aviso + legenda
    + '<div style="margin-top:10px">' + linhas + '</div>'
    + '<div style="padding:12px 22px;font-size:10.5px;color:#555">Clique numa corrida para abri-la na tela.</div>');
}

// Clique numa linha foca a corrida na Analisar. Delegacao em vez de onclick
// inline: nome de galgo com apostrofo (comum) quebraria o atributo.
document.addEventListener('click', function(ev){
  var lin = ev.target && ev.target.closest ? ev.target.closest('.vip-lin') : null;
  if(!lin) return;
  var hora = lin.getAttribute('data-hora'), corrida = lin.getAttribute('data-corrida');
  var idx = results.findIndex(function(r){ return r.tipo==='avb' && r.hora===hora && r.corrida===corrida; });
  if(idx < 0){ showToast('Essa corrida não está carregada na tela.', false); return; }
  fecharCargaVip();
  renderFocusPanel(results[idx], idx);
});

function _limpaNome(n){
  if(!n) return '';
  var txt = String(n).trim();

  // 1) sexo entre parenteses fecha o nome
  var mSexo = txt.match(/^(.*?\((?:M|W)\))/);
  if (mSexo) return mSexo[1].trim();

  var toks = txt.split(/\s+/);
  var CORES = /^(?:bk|bd|be|f|w|bkw|wbk|bdw|wbd|bew|wbe|bebdw|bkwtkd|bkbd|bebd|dkbd|lgbd|bkwbd)$/i;
  var MESANO = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{2}$/i;

  for (var k = 1; k < toks.length; k++) {      // k=1: o 1o token e' sempre parte do nome
    var t = toks[k];
    if (CORES.test(t) || MESANO.test(t) || /^\(Ssn/i.test(t)) {
      return toks.slice(0, k).join(' ').trim();
    }
  }
  return txt;
}

function _avbDoPar(r, ta, tb){
  var l = (r && r._avbsAoVivo) || [];
  return l.find(function(x){ return String(x.aTrap)===String(ta) && String(x.bTrap)===String(tb); })
      || l.find(function(x){ return String(x.aTrap)===String(tb) && String(x.bTrap)===String(ta); })
      || null;
}
// Devolve {nome, perfil, historico} do trap, preferindo o que veio no avb.
function _dadosDoTrap(r, trap, parA, parB){
  var avb = (parA != null) ? _avbDoPar(r, parA, parB) : null;
  if (avb) {
    if (avb.aHist && String(avb.aHist.trap)===String(trap)) return avb.aHist;
    if (avb.bHist && String(avb.bHist.trap)===String(trap)) return avb.bHist;
    // sem aHist/bHist (robo antigo): usa ao menos nome e perfil do avb
    if (String(avb.aTrap)===String(trap)) return { trap:trap, nome:avb.aNome, perfil:avb.aPerfil, historico:null };
    if (String(avb.bTrap)===String(trap)) return { trap:trap, nome:avb.bNome, perfil:avb.bPerfil, historico:null };
  }
  return null;
}

function _nomeDoTrap(r, trap, parA, parB){
  if(!r || trap==null) return '';
  var _d = _dadosDoTrap(r, trap, parA, parB);
  if (_d && _d.nome != null && _d.nome !== '') return _limpaNome(_d.nome);
  if(String(trap)===String(r.trapFav)) return _limpaNome(r.nameFav)||'';
  if(String(trap)===String(r.trapUnd)) return _limpaNome(r.nameUnd)||'';
  var g=(r.histAll||[]).find(function(x){return String(x.trap)===String(trap);});
  if(g && g.nome) return g.nome;
  var sc=(r.scores||[]).find(function(x){return String(x.trap)===String(trap);});
  return (sc && sc.nome) || '';
}
function _histDoTrap(r, trap, parA, parB){
  if(!r || trap==null) return null;
  var _d = _dadosDoTrap(r, trap, parA, parB);
  if (_d && _d.historico && _d.historico.length) return _d.historico;
  if(String(trap)===String(r.trapFav) && r.histFav) return r.histFav;
  if(String(trap)===String(r.trapUnd) && r.histUnd) return r.histUnd;
  var g=(r.histAll||[]).find(function(x){return String(x.trap)===String(trap);});
  return g ? (g.historico||[]) : null;
}
function _perfilDoTrap(r, trap, parA, parB){
  if(!r || trap==null) return '';
  var _d = _dadosDoTrap(r, trap, parA, parB);
  if (_d && _d.perfil != null && _d.perfil !== '') return _d.perfil;
  if(String(trap)===String(r.trapFav)) return r.perfilFav||'';
  if(String(trap)===String(r.trapUnd)) return r.perfilUnd||'';
  var sc=(r.scores||[]).find(function(x){return String(x.trap)===String(trap);});
  return (sc && sc.perfil) || '';
}
// O motor entrega odd/avaliacao com nomes diferentes conforme a versao
// (oddAvenceB/enginePct no robo atual, odd/avaliacao no contrato do handoff).
// Lemos os dois pra tela nao quebrar quando o motor migrar.
// Odd do par que esta na arena, guardada pelo ultimo ciclo do poller.
function _parOddAtual(r, ta, tb){
  // 1) odd do ultimo ciclo do robo pra ESTE par
  var l=(r&&r._avbsAoVivo)||[];
  var achado=l.find(function(x){return String(x.aTrap)===String(ta)&&String(x.bTrap)===String(tb);});
  if(achado) return _avbOdd(achado);
  // 2) se o par pedido e' justamente o escolhido, usa a odd guardada na escolha
  if(r&&r.avbEscolhido&&String(r.avbEscolhido.a)===String(ta)&&String(r.avbEscolhido.b)===String(tb)) return r.avbEscolhido.odd||null;
  // 3) nao ha odd conhecida — devolve null pra o campo ficar vazio em vez de
  //    manter um valor de outro par (dado errado passa despercebido)
  return null;
}
function _avbOdd(a){ return a && (a.oddAvenceB != null ? a.oddAvenceB : a.odd); }
// Dois percentuais distintos, entregues pelo robo:
//   reanalisePct  = motor 2, reanalise par-a-par (pode vir null em analise antiga)
//   motorOrigPct  = motor 1, analise global original, ja orientada pro favorito do par
// Mantemos enginePct/avaliacao como fallback pra nao quebrar com dado antigo.
function _avbRean(a){ return a && a.reanalisePct != null ? a.reanalisePct : null; }
function _avbMotorOrig(a){
  if(!a) return null;
  if(a.motorOrigPct != null) return a.motorOrigPct;
  return a.enginePct != null ? a.enginePct : (a.avaliacao != null ? a.avaliacao : null);
}
function _avbMotor(a){ return _avbRean(a) != null ? _avbRean(a) : _avbMotorOrig(a); }

function renderFocusPanel(r, idx) {
  var focusCol = document.getElementById('focus-col');
  if (!focusCol) return;
  focusRaceIdx = idx;

  var tf = r.trapFav || 1, tu = r.trapUnd || 2;
  // Passa pelo _limpaNome tambem aqui: ate agora so o caminho do aHist era
  // limpo, e o nome que vem direto do r.nameFav/nameUnd chegava cru quando o
  // motor gravou a linha de pedigree inteira. O sintoma e' o nome ocupando
  // tres linhas e empurrando o layout da arena.
  var nf = _limpaNome(r.nameFav) || 'Favorito', nu = _limpaNome(r.nameUnd) || 'Underdog';
  var tc = ['','t1','t2','t3','t4','t5','t6'];
  var hbr = r.hora_br || convertHora(r.hora||'');
  var conf = r.pct || 0;
  var nivel = r.nivel || '';
  var confClass = nivel==='alta'?'ba':nivel==='media'?'bm':'bb';

  var histF = r.histFav || [];
  var histU = r.histUnd || [];
  var raceClass = getRaceClass(r.corrida||'');
  var perfF = r.perfilFav || '';
  var perfU = r.perfilUnd || '';
  var perfColorF = perfF==='Frontrunner'?'#f97316':perfF==='Recuperador'?'#22c55e':perfF==='Fumador'?'#ef4444':'#60a5fa';
  var perfColorU = perfU==='Frontrunner'?'#f97316':perfU==='Recuperador'?'#22c55e':perfU==='Fumador'?'#ef4444':'#60a5fa';

  var imgF = getDogImg(tf, r.corrida||'');
  var imgU = getDogImg(tu, r.corrida||'x');

  // Sem uso no painel desde que a linha de analise saiu do rodape. Mantida
  // porque r.obs continua alimentando a tabela e o Historico — e' so esta
  // variavel local que ficou ociosa.
  var obs = (r.obs||'').replace(/CalTm/gi,'Tempo');   // eslint-disable-line no-unused-vars
  var oldBanner = isOldRaceCard(r) ? '<div class="fp-old-banner">&#9888; Esta corrida é de uma data anterior a hoje ('+r.dataCard.split('-').reverse().join('/')+') — apenas para consulta/estudo, não é uma corrida ao vivo.</div>' : '';
  var suspectBanner = r.cardSuspect ? '<div class="fp-suspect-banner">&#9888; Essa corrida sumiu da lista ao vivo antes do horário — a pista pode ter sido cancelada hoje. Confira manualmente antes de confiar nesse AvB.</div>' : '';

  // Titulo: "3:44 - Newcastle (A3) - 480m" (hora UK, nome completo da pista,
  // classe, distancia). Se a sessao for antiga e nao tiver trackFull salvo
  // (campo novo), cai pro formato curto de antes.
  var tituloCorrida = r.trackFull
    ? (r.hora||'') + ' - ' + r.trackFull + (raceClass ? ' ('+raceClass+')' : '') + ' - ' + (r.dist||'') + 'm'
    : (r.corrida||'-');

  // Par mostrado na arena grande. Comeca no fav x und do motor e pode ser
  // trocado ao vivo pelo robo de reanalise (a pos 1 do ranking muda entre
  // ciclos) ou pela escolha do usuario. So a ARENA muda — podio, gauges de
  // contexto e o resto do painel continuam do original.
  var _par = _parEmFoco(r);
  // ATENCAO ao fallback: antes era "_nomeDoTrap(r,tf) || nf", e quando o trap
  // novo NAO era encontrado o || caia no nome do galgo ORIGINAL — resultado:
  // os dois lados da arena mostravam o mesmo galgo, sem nenhum erro visivel.
  // Agora so troca o par se os DOIS lados forem encontrados de verdade.
  var _achouA = _nomeDoTrap(r, _par.a, _par.a, _par.b) !== '' || _histDoTrap(r, _par.a, _par.a, _par.b) !== null;
  var _achouB = _nomeDoTrap(r, _par.b, _par.a, _par.b) !== '' || _histDoTrap(r, _par.b, _par.a, _par.b) !== null;
  if (_achouA && _achouB) {
    tf = _par.a; tu = _par.b;
    nf = _nomeDoTrap(r, tf, tf, tu);
    nu = _nomeDoTrap(r, tu, tf, tu);
    histF = _histDoTrap(r, tf, tf, tu) || [];
    histU = _histDoTrap(r, tu, tf, tu) || [];
    perfF = _perfilDoTrap(r, tf, tf, tu) || '';
    perfU = _perfilDoTrap(r, tu, tf, tu) || '';
    perfColorF = perfF==='Frontrunner'?'#f97316':perfF==='Recuperador'?'#22c55e':perfF==='Fumador'?'#ef4444':'#60a5fa';
    perfColorU = perfU==='Frontrunner'?'#f97316':perfU==='Recuperador'?'#22c55e':perfU==='Fumador'?'#ef4444':'#60a5fa';
    imgF = getDogImg(tf, r.corrida||'');
    imgU = getDogImg(tu, r.corrida||'x');
  } else if (_par.escolhido || _par.aoVivo) {
    // Par novo veio do robo mas os galgos nao estao no histAll/scores desta
    // corrida (analise antiga, card trocado). Mantem o par original e avisa no
    // console em vez de desenhar dois galgos iguais em silencio.
    console.warn('[arena] par ' + _par.a + 'x' + _par.b + ' sem dados nesta corrida; mantendo ' + tf + 'x' + tu);
  }
  // Guarda o par que a arena DE FATO desenhou. O chip do topo e o botao
  // "Analisar disputa" leem daqui, e nao do _parEmFoco: quando os galgos do
  // par sugerido nao existem na analise, a arena mantem o original — sem este
  // registro o chip anunciava T1xT2 enquanto a arena mostrava T3xT5.
  r._parNaTela = { a: tf, b: tu };

  focusCol.innerHTML =
    // Os banners (corrida antiga / card suspeito) foram pro RODAPE. Eles sao
    // persistentes — ficam ate voce trocar de corrida — e no topo empurravam
    // a arena pra baixo o tempo todo. La embaixo ocupam o espaco que sobrou
    // da linha de analise e da faixa do ao vivo, que sairam.
    '<div class="fp-hdr" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">'
    + '<div><div class="fp-race-title">'+tituloCorrida+'</div>'
    + '<div class="fp-race-meta">'+(r.dist||'')+'m &middot; '+hbr+' BR &middot; <span class="badge '+confClass+'">'+conf+'% '+nivel+'</span></div></div>'
    // Selo VIP centralizado no cabecalho: identifica a corrida de relance,
    // mesmo quando voce chegou nela navegando e nao pela lista.
    + (_ehVip(r)
      ? '<div style="flex:1;text-align:center;padding-top:4px"><span class="vip-selo' + (_vipSkipLiberado(r)?' vip-skip':'') + '">&#11088; Carga VIP</span></div>'
      : '')
    + '<div id="fp-odds-hdr" style="text-align:right;min-width:110px;flex-shrink:0"></div>'
    + '</div>'
    + '<div class="fp-arena-wrap" style="display:flex;gap:12px;align-items:flex-start">'
    + '<div class="fp-arena-col" style="flex:1 1 auto;min-width:0">'
    + '<div class="fp-arena" style="flex:1 1 70%">'
    // Dog fav (esquerda, corre para direita)
    + '<div class="fp-dog-side">'
    + '<img class="fp-dog-img" src="'+imgF+'" alt="'+nf+'" onerror="this.style.opacity=\'.2\'">'
    + '<div class="fp-dog-name">'+nf+'</div>'
    + (perfF?'<div class="fp-dog-perfil" style="color:'+perfColorF+'">'+perfF+'</div>':'')
    + '</div>'
    // Centro
    + '<div class="fp-center">'
    + '<div class="fp-vence-lbl">VENCE</div>'
    + '<div class="fp-vence-arrow">&#9658;</div>'
    + '<button type="button" class="alt-analisar" data-a="'+tf+'" data-b="'+tu+'" style="margin-top:8px;font-size:11px;font-weight:700;color:#fff;background:#161b27;border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:5px 12px;cursor:pointer;white-space:nowrap;letter-spacing:.3px">Analisar disputa</button>'
    + '<button type="button" class="alt-entrar" data-a="'+tf+'" data-b="'+tu+'" data-odd="'+(_parOddAtual(r,tf,tu)||'')+'" style="margin-top:5px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:4px;cursor:pointer;background:'+(_parEmFoco(r).escolhido?'#1d4ed8':'transparent')+';border:1px solid '+(_parEmFoco(r).escolhido?'#1d4ed8':'#22c55e')+';color:'+(_parEmFoco(r).escolhido?'#fff':'#22c55e')+'">'+(_parEmFoco(r).escolhido?'ESCOLHIDO':'Entrar')+'</button>'
    + (_parEmFoco(r).escolhido ? _botaoApostar(r) : '')
    + '</div>'
    // Dog und (direita, espelhado — corre para esquerda)
    + '<div class="fp-dog-side fp-dog-und">'
    + '<img class="fp-dog-img" src="'+imgU+'" alt="'+nu+'" onerror="this.style.opacity=\'.2\'">'
    + '<div class="fp-dog-name">'+nu+'</div>'
    + (perfU?'<div class="fp-dog-perfil" style="color:'+perfColorU+'">'+perfU+'</div>':'')
    + '</div>'
    + '</div>'
    + '<div class="fp-gauges-row">'
    + '<div class="fp-gauges-grp">' + buildGauges(histF, raceClass, histU) + '</div>'
    + '<div class="fp-gauges-div"></div>'
    + '<div class="fp-gauges-grp">' + buildGauges(histU, raceClass, histF) + '</div>'
    + '</div>'
    + '</div>'
    + '<div id="fp-alts" style="display:none;flex:0 0 33%;min-width:260px;flex-direction:column;gap:10px;align-self:center"></div>'
    + '</div>'
    // Odd / Apostei+Unidades / AvB nao aberto — tudo numa unica linha flat,
    // sem sub-grupos empilhados (isso e o que causava o desalinhamento antes)
    + '<div class="fp-inputs-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    // Odd e Stake NAO salvam mais a cada tecla. Antes o "oninput" gravava
    // direto no banco, entao um numero digitado pela metade ja virava aposta
    // registrada. Agora ficam locais ate voce apertar "Entrei!", que e' o
    // unico momento em que a entrada vai pro Historico e pra Banca.
    + '<span style="font-size:11px;color:var(--mut2);display:flex;align-items:center;gap:6px">Odd <input type="text" id="fp-odd" placeholder="-" value="'+(r.odd||'')+'" oninput="marcaEntradaSuja()" style="width:52px;text-align:center"></span>'
    // Stake ja vem com a unidade padrao configurada na Banca; da pra mudar na
    // hora sem alterar o padrao.
    + '<span style="font-size:11px;color:var(--mut2);display:flex;align-items:center;gap:6px">Stake <input type="text" id="fp-stake" placeholder="-" value="'+(r.betUnidades!=null&&r.betUnidades!==''?r.betUnidades:(STAKE_PADRAO!=null?STAKE_PADRAO:''))+'" oninput="marcaEntradaSuja()" style="width:52px;text-align:center"></span>'
    + '<button type="button" id="fp-entrei" onclick="confirmarEntrada()" style="font-size:11px;font-weight:700;padding:4px 14px;border-radius:5px;cursor:pointer;white-space:nowrap;'
    +   (r.betEntrou ? 'background:#22c55e;border:1px solid #22c55e;color:#000' : 'background:transparent;border:1px solid #22c55e;color:#22c55e')
    +   '">'+(r.betEntrou ? '✓ Entrei' : 'Entrei !')+'</button>'
    // "AvB não aberto" oculto por enquanto (pedido do Bruno). O input continua
    // no DOM pra nao quebrar quem le o valor; so nao aparece.
    + '<label style="display:none"><input type="checkbox" id="fp-avb-nao-aberto" '+(r.avbNaoAberto?'checked':'')+'></label>'
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:#eab308;white-space:nowrap"><input type="checkbox" id="fp-atrasada" style="cursor:pointer;margin:0" '+(r.flagAtrasada?'checked':'')+' onchange="updateFocusField(\'flag_atrasada\',this.checked?1:0)"> 🚩 Atrasada</label>'
    + '<a onclick="openRelatorioModal(\''+r.hora+'|'+r.corrida+'\')" title="Relatório detalhado da análise (scores, eliminados, desempates)" style="cursor:pointer;line-height:1;margin-left:auto"><img src="'+BASE+'/static/img/icone_relatorio.png" style="width:18px;height:18px;vertical-align:middle"></a>'
    + '<a onclick="openAllDogsModal(\''+r.hora+'|'+r.corrida+'\')" title="Ver corrida completa (6 galgos)" style="cursor:pointer;line-height:1"><img src="'+BASE+'/static/img/icone_pdf.png" style="width:18px;height:18px;vertical-align:middle"></a>'
    + '</div>'
    // RODAPE do painel. Substitui a linha de analise (obs) e a faixa "AvBs ao
    // vivo — betwinner", que saíram: a arena e os cards de alternativa ja
    // mostram par, odd, mercado e edge, entao as duas so repetiam informacao.
    // No lugar entram os banners persistentes (corrida antiga / card suspeito),
    // que antes ficavam no topo empurrando a arena pra baixo.
    + ((oldBanner || suspectBanner)
        ? '<div style="margin-top:8px">' + oldBanner + suspectBanner + '</div>'
        : '')
    + '<div id="fp-odds-live" style="display:none"></div>';

  // Fundo roxo nas corridas da Carga VIP. Vai por style inline de proposito:
  // a cor vem de var(--bg) no CSS da tela, e sobrescrever aqui evita depender
  // de qual regra vence. Sempre reseta no else — senao a corrida seguinte
  // herdaria o roxo da anterior.
  focusCol.style.background = _ehVip(r) ? (VIP_CFG.corFundo || '#140B2B') : '';
  if (_vipSkipLiberado(r)) _avisarVipSkip(r);

  startOddsLive(r);
}

// ── AvBs ao vivo do betwinner no painel de foco ──────────────────────────────
// Puxa /robot/odds/live de 5 em 5s e mostra os AvBs da corrida em foco: ao vivo
// (odd + % mercado + % motor + edge + tendencia) ou, antes de abrir, os sugeridos.
var _oddsLiveTimer = null;
function startOddsLive(r){
  if (_oddsLiveTimer) { clearInterval(_oddsLiveTimer); _oddsLiveTimer = null; }
  renderOddsLive(r);
  _oddsLiveTimer = setInterval(function(){ renderOddsLive(r); }, 5000);
}
// NAO ESTA MAIS EM USO: as linhas de AvB do rodape sairam quando a arena e os
// cards de alternativa passaram a mostrar a mesma informacao. Mantido de
// proposito — e' codigo do chat do motor, e apagar funcao alheia ja gerou
// estrago aqui antes. Se o motor confirmar que nao precisa, pode sair.
function _avbRow(par, odd, mercado, motor, edge, trend){
  var seta = trend==='subiu'?'<span style="color:#ef4444">&#9650;</span>':trend==='desceu'?'<span style="color:#22c55e">&#9660;</span>':'';
  var edgeStr = (edge==null)?'':'<span style="color:'+(edge>0?'#22c55e':(edge<0?'#ef4444':'var(--mut)'))+';font-weight:700">'+(edge>0?'+':'')+edge+'</span>';
  var parts = [];
  if(odd!=null) parts.push('odd '+odd);
  if(mercado!=null) parts.push('mkt '+mercado+'%');
  if(motor!=null) parts.push('motor '+motor+'%');
  return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:3px 0;gap:10px;border-bottom:1px solid rgba(255,255,255,.04)">'
    + '<span style="color:#cbd5e1;font-weight:600">'+par+'</span>'
    + '<span style="color:var(--mut);display:flex;gap:7px;align-items:center;white-space:nowrap">'+parts.join(' &middot; ')+' '+edgeStr+' '+seta+'</span>'
    + '</div>';
}
// Card compacto de uma alternativa (pos 2 e 3): os 2 galgos, a seta VENCE, os
// numeros do mercado e os dois botoes. Sem onclick inline com aspas — os dados
// vao em data-* e um listener unico trata o clique (aspas escapadas dentro de
// template literal ja derrubaram tela neste projeto).
// Botao "Apostar" que leva pra corrida na casa. Quando o robo passar a
// entregar URL por AvB (hoje e' por corrida), basta o _linkBetwinner mudar.
function _botaoApostar(r){
  var snap = r && r._snapAoVivo;
  var link = _linkBetwinner(snap);
  if(!link) return '';
  // O _linkBetwinner agora sempre devolve algo: com bwUrl abre a CORRIDA, sem
  // ele cai na secao ao vivo de galgo. Sao coisas diferentes e o rotulo diz
  // qual e' — clicar esperando a corrida e cair numa lista, sem aviso, e' o
  // tipo de surpresa ruim numa acao que envolve dinheiro.
  var direto = !!(snap && (snap.bwUrl || snap.urlBetwinner));
  return '<a href="'+link+'" target="_blank" rel="noopener"'
    + ' title="'+(direto ? 'Abre esta corrida na BetWinner' : 'Abre a seção ao vivo de galgos (a corrida exata não foi mapeada)')+'"'
    + ' style="display:block;margin-top:5px;text-align:center;font-size:10px;font-weight:700;padding:4px;border-radius:4px;'
    + 'background:'+(direto ? '#22c55e' : 'transparent')+';color:'+(direto ? '#000' : '#22c55e')+';'
    + (direto ? '' : 'border:1px solid rgba(34,197,94,.45);')
    + 'text-decoration:none">'+(direto ? 'Entre na BW' : 'Ao vivo na BW')+'</a>';
}

function _cardAlternativa(r, a, escolhidoAtual){
  var ta=a.aTrap, tb=a.bTrap;
  var odd=_avbOdd(a), motor=_avbMotor(a);
  var ehEscolhido = escolhidoAtual && String(escolhidoAtual.a)===String(ta) && String(escolhidoAtual.b)===String(tb);
  var opaco = (escolhidoAtual && !ehEscolhido) ? 'opacity:.35;' : '';
  var borda = ehEscolhido ? '#1d4ed8' : 'var(--bdr2)';
  var seta = a.trend==='subiu'?'<span style="color:#ef4444">&#9650;</span>':a.trend==='desceu'?'<span style="color:#22c55e">&#9660;</span>':'';
  var edge = a.edge;
  var edgeStr = (edge==null)?'':'<span style="color:'+(edge>0?'#22c55e':(edge<0?'#ef4444':'var(--mut)'))+';font-weight:700">'+(edge>0?'+':'')+edge+'%</span>';
  var selo = a.valor ? '<span style="font-size:9px;color:#eab308;font-weight:800">&#9733; valor</span>' : '';
  // Ordem: reanalise, motor original, mercado, odd, edge. Quando nao ha
  // reanalise (analise antiga), some a "rean" e fica so o motor original.
  var rean=_avbRean(a), motorOrig=_avbMotorOrig(a);
  var nums=[];
  if(rean!=null) nums.push('rean <strong style="color:#22c55e">'+rean+'%</strong>');
  if(motorOrig!=null) nums.push('motor '+motorOrig+'%');
  if(a.marketPct!=null) nums.push('mkt '+a.marketPct+'%');
  if(odd!=null) nums.push('odd <strong style="color:#cbd5e1">'+odd+'</strong>');

  return '<div class="fp-alt-card" style="'+opaco+'background:var(--sur2);border:1px solid '+borda+';border-radius:8px;padding:7px 8px">'
    + '<div style="display:flex;align-items:center;justify-content:center;gap:4px">'
    +   '<img src="'+getDogImg(ta, r.corrida||'')+'" style="height:78px;object-fit:contain" alt="T'+ta+'">'
    +   '<div style="text-align:center;line-height:1"><div style="font-size:9px;color:var(--mut2);font-weight:700;letter-spacing:.5px">VENCE</div>'
    +   '<div style="font-size:11px;color:#22c55e">&#9658;</div></div>'
    +   '<img src="'+getDogImg(tb, r.corrida||'x')+'" style="height:78px;object-fit:contain;transform:scaleX(-1)" alt="T'+tb+'">'
    + '</div>'
    + '<div style="font-size:10px;color:#cbd5e1;text-align:center;font-weight:600;margin-top:3px">T'+ta+' '+(a.aNome||'')+' &times; T'+tb+' '+(a.bNome||'')+'</div>'
    + '<div style="font-size:9px;color:var(--mut);text-align:center;display:flex;gap:5px;justify-content:center;align-items:center;flex-wrap:wrap;margin-top:2px">'
    +   nums.join(' &middot; ') + ' ' + edgeStr + ' ' + seta + ' ' + selo + '</div>'
    + '<div style="display:flex;gap:4px;margin-top:5px">'
    +   '<button type="button" class="alt-analisar" data-a="'+ta+'" data-b="'+tb+'" style="flex:1;font-size:9px;padding:3px;background:#161b27;border:1px solid var(--bdr2);color:#cbd5e1;border-radius:4px;cursor:pointer">Analisar</button>'
    +   '<button type="button" class="alt-entrar" data-a="'+ta+'" data-b="'+tb+'" data-odd="'+(odd!=null?odd:'')+'" style="flex:1;font-size:9px;padding:3px;background:'+(ehEscolhido?'#1d4ed8':'transparent')+';border:1px solid '+(ehEscolhido?'#1d4ed8':'#22c55e')+';color:'+(ehEscolhido?'#fff':'#22c55e')+';border-radius:4px;cursor:pointer;font-weight:700">'+(ehEscolhido?'ESCOLHIDO':'Entrar')+'</button>'
    + '</div>'
    // O link da casa so aparece no AvB ESCOLHIDO. Hoje ele e' por CORRIDA (o
    // robo monta pelo gameId), entao repeti-lo nos tres cards apontaria tres
    // vezes pro mesmo lugar. Mostrando so no escolhido, ele aparece justo
    // quando serve: na hora de ir apostar.
    + (ehEscolhido ? _botaoApostar(r) : '')
    + '</div>';
}

// "Analisar disputa" de QUALQUER par, nao so o fav x und. Mesma tabela, par
// parametrizavel — o buildDogCard ja aceita qualquer galgo.
function openValModalPar(key, trapA, trapB){
  var r=results.find(function(x){return x.tipo==='avb'&&(x.hora+'|'+x.corrida)===key;});
  if(!r){console.warn('[VAL-PAR] nao achou:',key);return;}
  var nA=_nomeDoTrap(r,trapA,trapA,trapB), nB=_nomeDoTrap(r,trapB,trapA,trapB);
  var hA=_histDoTrap(r,trapA,trapA,trapB), hB=_histDoTrap(r,trapB,trapA,trapB);
  document.getElementById('val-title').textContent='T'+trapA+' '+(nA||'?')+' vs T'+trapB+' '+(nB||'?');
  var body=document.getElementById('val-body');
  body.classList.remove('val-compact');
  // Quando um dos galgos nao tem historico nesta corrida, mostra um aviso no
  // lugar da tabela vazia. Antes o lado simplesmente vinha em branco, e nao
  // dava pra saber se o galgo era ruim ou se o dado nao existia.
  var cardOuAviso = function(trap, nome, hist){
    if (hist && hist.length) return buildDogCard(trap, nome, _perfilDoTrap(r,trap,trapA,trapB), hist);
    return '<div style="padding:18px;text-align:center;color:rgba(255,255,255,.45);font-size:12px">'
      + '<strong style="color:#eab308">T'+trap+(nome?' '+nome:'')+'</strong><br>'
      + 'sem histórico disponível nesta corrida.<br>'
      + '<span style="font-size:11px;color:rgba(255,255,255,.3)">O robô sugeriu este galgo, mas ele não está na análise carregada '
      + '(card trocado ou análise anterior à reanálise).</span></div>';
  };
  body.innerHTML = cardOuAviso(trapA,nA,hA) + '<div class="val-sep"></div>' + cardOuAviso(trapB,nB,hB);
  document.getElementById('val-modal').classList.add('open');
}

// Listener unico pros botoes das alternativas e da arena.
document.addEventListener('click', function(ev){
  var t=ev.target; if(!t||!t.classList) return;
  var r=results[focusRaceIdx]; if(!r) return;
  var key=r.hora+'|'+r.corrida;
  if(t.classList.contains('alt-analisar')){
    openValModalPar(key, parseInt(t.getAttribute('data-a'),10), parseInt(t.getAttribute('data-b'),10));
  } else if(t.classList.contains('alt-entrar')){
    escolherAvb(parseInt(t.getAttribute('data-a'),10), parseInt(t.getAttribute('data-b'),10), t.getAttribute('data-odd'));
  }
});

// ESCOLHER um AvB. Regra: UM por corrida — escolher outro substitui.
// O que muda: o par registrado (fav/und) e a odd. O PODIO e o resto da analise
// ficam como o motor calculou. Uma vez escolhido, a arena para de trocar
// sozinha: aquele par e' o que vai pro Historico e pra Banca.
// Caixa de confirmacao propria, no visual do app. O confirm() do navegador
// aparece colado na barra de endereco, com fonte do sistema, e destoa da tela
// inteira — num fluxo de 5 minutos antes da largada isso atrapalha mais do
// que ajuda.
function _confirmarNaTela(titulo, texto, rotuloOk, aoConfirmar){
  var velho = document.getElementById('gf-confirm'); if(velho) velho.remove();
  var bg = document.createElement('div');
  bg.id = 'gf-confirm';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:4000;display:flex;align-items:center;justify-content:center;padding:20px';
  bg.innerHTML =
    '<div style="background:#161B27;border:1px solid #2a3140;border-radius:12px;padding:22px 24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6)">'
    + '<div style="font-size:15px;font-weight:700;color:#f0f0f0;margin-bottom:8px">'+titulo+'</div>'
    + '<div style="font-size:12.5px;color:#9aa4b2;line-height:1.6;margin-bottom:18px">'+texto+'</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    +   '<button type="button" id="gf-confirm-nao" style="padding:8px 16px;background:transparent;border:1px solid #2a3140;color:#9aa4b2;border-radius:6px;font-size:12px;cursor:pointer">Cancelar</button>'
    +   '<button type="button" id="gf-confirm-sim" style="padding:8px 18px;background:#22c55e;border:none;color:#000;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">'+rotuloOk+'</button>'
    + '</div></div>';
  document.body.appendChild(bg);
  var fechar = function(){ bg.remove(); };
  bg.querySelector('#gf-confirm-nao').addEventListener('click', fechar);
  bg.querySelector('#gf-confirm-sim').addEventListener('click', function(){ fechar(); aoConfirmar(); });
  bg.addEventListener('click', function(e){ if(e.target===bg) fechar(); });   // clique fora fecha
}

// Aplica a odd no campo e persiste. Valor vazio limpa o campo — e' o que deve
// acontecer quando nao ha odd conhecida pro par que ficou na arena.
function _aplicarOdd(valor){
  var el=document.getElementById('fp-odd');
  var v = (valor==null || valor==='') ? '' : String(valor);
  if(el) el.value = v;
  updateFocusField('odd', v);
}

// Persiste o AvB escolhido no banco, como campo PESSOAL. Ate agora ele vivia
// so em memoria/sessionStorage: recarregar a pagina perdia a escolha e o
// Historico nao tinha o que ler.
// Guarda o snapshot inteiro (par + odd + percentuais) porque a odd e os % do
// momento da escolha sao o que importa depois — daqui a uma hora o mercado ja
// mudou e nao da mais pra reconstruir.
function _persistirEscolha(r, escolha){
  if(!r || !r.id) return;                       // corrida ainda nao salva
  var txt = escolha ? JSON.stringify(escolha) : '';
  fetch(BASE+'/api/race/'+r.id, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ avb_escolhido: txt })
  }).catch(function(e){ console.error('[avb] falhou ao salvar a escolha', e); });
}

// Monta o snapshot a partir do AvB ao vivo daquele par, pra guardar os
// numeros do momento junto com a escolha.
function _snapshotDoPar(r, ta, tb, odd){
  var l=(r&&r._avbsAoVivo)||[];
  var a=l.find(function(x){ return String(x.aTrap)===String(ta) && String(x.bTrap)===String(tb); }) || {};
  return {
    aTrap: ta, aNome: _nomeDoTrap(r, ta, ta, tb),
    bTrap: tb, bNome: _nomeDoTrap(r, tb, ta, tb),
    odd: (odd!=null && odd!=='') ? parseFloat(odd) : (_avbOdd(a)||null),
    marketPct: a.marketPct!=null ? a.marketPct : null,
    reanalisePct: _avbRean(a),
    motorOrigPct: _avbMotorOrig(a),
    edge: a.edge!=null ? a.edge : null,
    ts: Math.round(Date.now()/1000)
  };
}

function escolherAvb(trapA, trapB, odd){
  var idx=focusRaceIdx, r=results[idx];
  if(!r) return;
  var jaEra = r.avbEscolhido && String(r.avbEscolhido.a)===String(trapA) && String(r.avbEscolhido.b)===String(trapB);

  if(jaEra){
    _confirmarNaTela(
      'Desfazer a escolha?',
      'A corrida volta a seguir o AvB mais bem avaliado no momento pela reanalise, e a odd acompanha esse par.',
      'Desfazer',
      function(){
        r.avbEscolhido = null;
        _persistirEscolha(r, null);
        // A odd tem que acompanhar o par que fica na arena. Sem isto o campo
        // guardava a odd do AvB desfeito — dado errado, e silencioso.
        var p = _parEmFoco(r);
        _aplicarOdd(_parOddAtual(r, p.a, p.b));
        saveSessionState();
        renderFocusPanel(r, idx);
      }
    );
    return;
  }

  r.avbEscolhido={ a:trapA, b:trapB, odd:(odd||null), em:Date.now() };
  _aplicarOdd(odd);
  saveSessionState();
  renderFocusPanel(r, idx);   // redesenha arena + alternativas com o novo estado
}

// Link pra corrida no betwinner. O robo ainda nao entrega a URL real — quando
// entregar (ex.: snap.urlBetwinner ou montada pelo gameId), troca so aqui.
function _linkBetwinner(snap){
  if(!snap) return null;
  if(snap.bwUrl) return snap.bwUrl;            // deep-link real do robo (/br/live/...-slug/...-slug) — abre a corrida
  if(snap.urlBetwinner) return snap.urlBetwinner;
  // Fallback: sem deep-link, abre a SECAO ao vivo de galgo (o gameId sozinho nao
  // monta URL valida — precisa do segmento da liga). Bruno clica na corrida ativa.
  return 'https://betwinner1.com/br/live/greyhound-racing/';
}

// ── SIMULADOR (so pra testar a tela sem depender do robo) ───────────────────
// Liga com ?simavb=1 na URL, ou chamando simAvb() no console. Desliga com
// ?simavb=0 ou simAvb(false). Monta 3 AvBs falsos com os traps reais da
// corrida em foco, pra dar pra ver arena + 2 alternativas + odds + escolha
// sem precisar mexer no relogio nem esperar o mercado abrir.

function simAvb(liga){
  _SIM_AVB = (liga !== false);
  console.log('[sim] AvBs simulados', _SIM_AVB ? 'LIGADOS' : 'desligados');
  var r = results[focusRaceIdx];
  if (r) renderFocusPanel(r, focusRaceIdx);
  return _SIM_AVB;
}
function _snapSimulado(r){
  // Usa os traps que existem de verdade na corrida, pra imagem e historico
  // baterem. Se a corrida tiver poucos galgos, repete o que houver.
  var traps = (r.histAll||[]).map(function(g){ return g.trap; }).filter(function(t){ return t!=null; });
  if (traps.length < 4) traps = [r.trapFav||1, r.trapUnd||2, 3, 4, 5, 6];
  var nome = function(t){ return _nomeDoTrap(r, t) || ('Galgo T'+t); };
  var mk = function(pos, ta, tb, motor, odd, mercado, trend, valor){
    return { pos:pos, aTrap:ta, aNome:nome(ta), bTrap:tb, bNome:nome(tb),
             enginePct:motor, avaliacao:motor, oddAvenceB:odd, odd:odd,
             marketPct:mercado, edge:Math.round((motor-mercado)*10)/10,
             trend:trend, valor:valor,
             flags:{ trapVazia:[], cioRecente:null, obs:'' } };
  };
  return {
    gameId: 999999, pista: getPista(r.corrida||''), analiseCorrida: r.corrida,
    raceNum:'Race SIM', estado:'ao_vivo',
    statusLine:'SIMULADO — inicia dentro de 3 minutos',
    avbs: [
      mk(1, traps[0], traps[1], 68, 1.55, 61.2, 'desceu', true),
      mk(2, traps[2] || traps[0], traps[3] || traps[1], 59, 1.90, 55.4, 'subiu', false),
      mk(3, traps[1], traps[4] || traps[2] || traps[0], 54, 2.10, 52.1, 'igual', false)
    ],
    sugeridos: []
  };
}

function renderOddsLive(r){
  // Modo simulado: nao chama o robo, monta o snapshot na hora.
  if (_SIM_AVB) { _pintaOddsLive(r, { corridas:[ _snapSimulado(r) ] }); return; }

  var box = document.getElementById('fp-odds-live');
  if(!box || !r) return;
  fetch(BASE+'/robot/odds/live', { credentials:'same-origin' })
    .then(function(res){ return res.ok ? res.json() : null; })
    .then(function(d){ _pintaOddsLive(r, d); })
    .catch(function(){});
}

// Desenha o bloco ao vivo a partir de um snapshot — venha ele do robo ou do
// simulador. Mantido separado justamente pra os dois caminhos produzirem
// EXATAMENTE a mesma tela (se divergissem, o teste deixaria de valer).
function _pintaOddsLive(r, d){
  (function(){
      var box2 = document.getElementById('fp-odds-live'); if(!box2) return;
      if(!d){ box2.innerHTML=''; return; }
      var lista = d.corridas||[];
      var pista = getPista(r.corrida||'');
      var snap = lista.find(function(c){ return c.analiseCorrida===r.corrida; })
             || lista.find(function(c){ return c.pista===pista; });
      if(!snap){
        box2.innerHTML = '<div style="border-top:1px solid var(--bdr2);margin-top:6px;padding-top:8px;font-size:10px;color:var(--mut);display:flex;justify-content:space-between;gap:8px">'
          + '<span style="color:#f59e0b;font-weight:800;text-transform:uppercase;letter-spacing:.5px">&#9889; AvBs ao vivo — betwinner</span>'
          + '<span>aguardando esta corrida abrir (ou pista ainda não mapeada)</span></div>';
        var hb0 = document.getElementById('fp-odds-hdr'); if(hb0) hb0.innerHTML='';
        var ba0 = document.getElementById('fp-alts'); if(ba0){ ba0.innerHTML=''; ba0.style.display='none'; }
        return;
      }
      var avbs = snap.avbs||[], sug = snap.sugeridos||[];
      var hb = document.getElementById('fp-odds-hdr');
      if(hb){
        if(avbs.length){
          // O chip segue o AvB ESCOLHIDO. Sem isto ele mostrava sempre o
          // avbs[0] do robo, entao escolher uma alternativa deixava o topo da
          // tela exibindo par e odd de OUTRA disputa — dado errado no lugar
          // mais visivel.
          // A principal e' a de pos===1 (o robo ja rankeia). Cai no primeiro da
          // lista se o campo pos ainda nao vier.
          var top = avbs.find(function(x){ return x.pos === 1; }) || avbs[0];
          // O chip tem que refletir o par QUE ESTA NA ARENA. Se a arena nao
          // conseguiu trocar (galgo fora do histAll), procura o avb daquele
          // par; nao achando, o chip nao mostra par nenhum em vez de anunciar
          // uma disputa que a tela nao esta exibindo.
          if (r._parNaTela) {
            var _naTela = avbs.find(function(x){
              return String(x.aTrap)===String(r._parNaTela.a) && String(x.bTrap)===String(r._parNaTela.b);
            });
            if (_naTela) top = _naTela;
            else if (top && (String(top.aTrap)!==String(r._parNaTela.a) || String(top.bTrap)!==String(r._parNaTela.b))) {
              top = null;   // divergiu e nao ha avb do par exibido
            }
          }
          if (top && r.avbEscolhido) {
            var _ach = avbs.find(function(x){
              return String(x.aTrap)===String(r.avbEscolhido.a) && String(x.bTrap)===String(r.avbEscolhido.b);
            });
            if (_ach) top = _ach;
          }
          // top pode ser null quando a arena nao conseguiu trocar o par: nesse
          // caso o chip mostra so "AO VIVO", sem numeros, em vez de anunciar
          // uma disputa diferente da que esta na tela.
          if (!top) {
            // Chip sem numeros: a arena nao conseguiu trocar o par, e anunciar
            // uma disputa diferente da que esta na tela seria pior que nao
            // anunciar nada. Sem "return" aqui de proposito — o resto do
            // poller (alternativas, rodape) tem que continuar rodando.
            hb.innerHTML = '<div style="font-size:9px;color:#22c55e;font-weight:800;letter-spacing:.5px">&#9889; AO VIVO</div>';
          } else {
          var e = top.edge;
          var edgeH = (e==null)?'':' &middot; <span style="color:'+(e>0?'#22c55e':(e<0?'#ef4444':'var(--mut)'))+';font-weight:700">edge '+(e>0?'+':'')+e+'</span>';
          hb.innerHTML = '<div style="font-size:9px;color:#22c55e;font-weight:800;letter-spacing:.5px">&#9889; AO VIVO</div>'
            + '<div style="font-size:12px;color:#cbd5e1;font-weight:700;white-space:nowrap">T'+top.aTrap+'&times;T'+top.bTrap+' &middot; '+top.oddAvenceB+'</div>'
            + '<div style="font-size:9px;color:var(--mut);white-space:nowrap">'
            +   (_avbRean(top)!=null ? 'rean <span style="color:#22c55e;font-weight:700">'+_avbRean(top)+'%</span> &middot; ' : '')
            +   (_avbMotorOrig(top)!=null ? 'motor '+_avbMotorOrig(top)+'% &middot; ' : '')
            +   'mkt '+top.marketPct+'%'+edgeH+'</div>';
                  }
        } else if(sug.length){
          var s0 = sug[0];
          hb.innerHTML = '<div style="font-size:9px;color:#f59e0b;font-weight:800;letter-spacing:.5px">&#9889; SUGERIDO</div>'
            + '<div style="font-size:12px;color:#cbd5e1;font-weight:700;white-space:nowrap">T'+s0.aTrap+'&times;T'+s0.bTrap+'</div>'
            + '<div style="font-size:9px;color:var(--mut)">motor '+s0.enginePct+'%</div>';
        } else { hb.innerHTML=''; }
      }
      // ── Alternativas (pos 2 e 3) + par da arena ──────────────────────────
      // A lista ja vem ranqueada do motor: o primeiro e' a arena grande, os
      // demais viram cards a direita (maximo 2, total 3).
      r._avbsAoVivo = avbs.length ? avbs : sug;
      r._snapAoVivo = snap;   // guarda o snapshot pro link da casa
      var box3 = document.getElementById('fp-alts');
      var lista3 = avbs.length ? avbs : sug;
      // Depois da hora exata da largada, as alternativas somem e fica so a
      // principal: nao ha mais o que escolher, e manter 3 opcoes na tela
      // convida a clicar em algo que ja nao vale.
      var _largou = snap.startTs && (Date.now()/1000 >= snap.startTs);
      if(box3){
        if(lista3.length > 1 && !_largou){
          box3.innerHTML = lista3.slice(1,3).map(function(a){ return _cardAlternativa(r, a, r.avbEscolhido); }).join('');
          box3.style.display = 'flex';   // so ocupa espaco quando ha alternativa
        } else { box3.innerHTML=''; box3.style.display='none'; }
      }
      // A pos 1 pode mudar de um ciclo pro outro. Se mudou E o usuario ainda
      // nao escolheu nada, a arena grande se redesenha pro novo par.
      if(lista3.length && !r.avbEscolhido){
        var top1 = lista3[0];
        var mudou = !r._parAoVivo || String(r._parAoVivo.a)!==String(top1.aTrap) || String(r._parAoVivo.b)!==String(top1.bTrap);
        if(mudou){
          r._parAoVivo = { a: top1.aTrap, b: top1.bTrap };
          renderFocusPanel(r, focusRaceIdx);   // re-render completo com o novo par
          return;                              // o proprio re-render dispara o ciclo de novo
        }
      }
      // O bloco de baixo virou so uma FAIXA DE STATUS. As linhas de AvB que
      // ficavam aqui foram removidas de proposito: depois que a arena e os
      // cards de alternativa passaram a mostrar par, odd, mercado, motor e
      // edge, este bloco so repetia a mesma informacao ocupando tela.
      // Fica o que nao existe em outro lugar: o link pra casa e o status
      // ("inicia dentro de X minutos").
      var link = _linkBetwinner(snap);
      var temAvb = (avbs.length || sug.length);
      box2.innerHTML =
        '<div style="border-top:1px solid var(--bdr2);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:10px">'
        + '<span style="color:#f59e0b;font-weight:800;text-transform:uppercase;letter-spacing:.5px">&#9889; AvBs ao vivo — betwinner'
        +   (link ? ' <a href="'+link+'" target="_blank" rel="noopener" style="color:#60a5fa;font-weight:700;text-transform:none;letter-spacing:0">abrir na casa &#8599;</a>' : '')
        + '</span>'
        + '<span style="color:var(--mut)">' + (snap.statusLine || (temAvb ? '' : 'sem AvB aberto ainda')) + '</span>'
        + '</div>';
  })();
}

// Nomes de campo usados no front (results[i]) as vezes diferem da coluna no
// banco (ex: r1/r2/r3/hit -> resultado_1/resultado_2/resultado_3/bateu).
var FIELD_DB_MAP = { r1:'resultado_1', r2:'resultado_2', r3:'resultado_3', hit:'bateu' };
// Mapeia campo em snake_case (nome no banco/data-f) pro nome camelCase usado
// no objeto `results` em memoria
var LOCAL_FIELD_MAP = { avb_nao_aberto: 'avbNaoAberto', bet_entrou: 'betEntrou', bet_unidades: 'betUnidades', flag_atrasada: 'flagAtrasada' };

// Atualiza um campo da corrida em memoria (sessionStorage) e, se a corrida ja
// existe no banco (tem id — ou seja, a sessao ja foi salva no Historico),
// persiste na hora via PUT /api/race/:id. Assim Odd, aposta e a flag "AvB nao
// aberto" ficam sempre sincronizados com o Historico, sem precisar reanalisar.
function saveRaceField(idx, field, value) {
  if (idx < 0 || !results[idx]) return;
  var localField = LOCAL_FIELD_MAP[field] || field;
  results[idx][localField] = value;
  saveSessionState();
  var id = results[idx].id;
  if (!id) return; // ainda nao foi salva no Historico — vai junto no proximo save
  var dbField = FIELD_DB_MAP[field] || field;
  var body = {};
  body[dbField] = value;
  fetch(BASE+'/api/race/'+id, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).catch(function(e){ console.error('[saveRaceField] erro ao persistir', field, e); });
}

// ── Entrada na aposta: so grava quando voce confirma ──────────────────────
// Antes a Odd salvava a cada tecla (oninput -> banco). Um numero digitado pela
// metade ja virava aposta registrada no Historico e na Banca, e apagar depois
// nao desfazia direito. Agora Odd e Stake ficam locais ate o "Entrei !".
function marcaEntradaSuja(){
  var b = document.getElementById('fp-entrei');
  if(!b) return;
  b.style.background = 'transparent';
  b.style.borderColor = '#eab308';
  b.style.color = '#eab308';
  b.textContent = 'Entrei !';
  b.title = 'Há alteração não confirmada — clique para salvar';
}

function confirmarEntrada(){
  var r = results[focusRaceIdx];
  if(!r) return;
  var elOdd = document.getElementById('fp-odd');
  var elStk = document.getElementById('fp-stake');
  var odd = elOdd ? String(elOdd.value||'').trim().replace(',','.') : '';
  var stk = elStk ? String(elStk.value||'').trim().replace(',','.') : '';

  if(!odd){
    // Sem odd nao ha entrada. Avisar e' melhor que gravar uma aposta sem preco.
    if(elOdd){ elOdd.style.borderColor = '#ef4444'; setTimeout(function(){ elOdd.style.borderColor=''; }, 1500); }
    showToast('Preencha a Odd antes de confirmar a entrada.', false);
    return;
  }
  if(isNaN(parseFloat(odd))){ showToast('Odd inválida.', false); return; }
  if(stk && isNaN(parseFloat(stk))){ showToast('Stake inválida.', false); return; }

  // Grava os tres juntos: odd, stake e a marca de que houve entrada. E' o
  // bet_entrou que faz a corrida contar como aposta no Historico e na Banca.
  updateFocusField('odd', odd);
  if(stk) updateFocusField('bet_unidades', stk);
  updateFocusField('bet_entrou', 1);
  r.odd = odd; if(stk) r.betUnidades = stk; r.betEntrou = 1;

  var b = document.getElementById('fp-entrei');
  if(b){
    b.style.background = '#22c55e'; b.style.borderColor = '#22c55e'; b.style.color = '#000';
    b.textContent = '✓ Entrei'; b.title = 'Entrada confirmada';
  }
  showToast('Entrada confirmada: odd ' + odd + (stk ? ' · stake ' + stk : ''), true);
  saveSessionState();
}

function updateFocusField(field, value) {
  saveRaceField(focusRaceIdx, field, value);
  // Desmarcar "atrasada" pode fazer a corrida sumir da lista na hora (se ja
  // passou do horario) — sem isso, ela ficava presa em tela ate o proximo
  // ciclo automatico. Achado 14/07/2026, pedido do Bruno.
  if (field === 'flag_atrasada' && !value) {
    refreshFocusMode();
  }
}

// Alerta de proximidade da corrida (3 min antes): som de sino + piscar o card.
// Sino gerado via Web Audio API (sem precisar de arquivo de audio externo).
var alertedRaces = {};

// 4 sons prontos, escolhidos via SOM_ALERTA (configuravel em Configuracoes)
function tocarSino(ctx) {
  function tone(freq, start, dur) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime+start);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime+start+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+start+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime+start);
    o.stop(ctx.currentTime+start+dur+0.05);
  }
  tone(1046.5, 0, 0.25);    // C6
  tone(1318.5, 0.15, 0.35); // E6
}
function tocarBeep(ctx) {
  function tone(freq, start, dur) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime+start);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+start+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+start+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime+start);
    o.stop(ctx.currentTime+start+dur+0.03);
  }
  tone(1500, 0, 0.08);
  tone(1500, 0.14, 0.08);
}
function tocarAlarme(ctx) {
  function tone(freq, start, dur) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime+start);
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime+start+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+start+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime+start);
    o.stop(ctx.currentTime+start+dur+0.05);
  }
  tone(880, 0, 0.15); tone(660, 0.15, 0.15);
  tone(880, 0.30, 0.15); tone(660, 0.45, 0.15);
}
function tocarSuave(ctx) {
  var o = ctx.createOscillator();
  var g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = 700;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime+0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.6);
  o.connect(g); g.connect(ctx.destination);
  o.start(ctx.currentTime);
  o.stop(ctx.currentTime+0.65);
}
var SONS_DISPONIVEIS = { sino: tocarSino, beep: tocarBeep, alarme: tocarAlarme, suave: tocarSuave };

// AudioContext unico e reaproveitado. Criado/retomado num gesto do usuario, o
// som continua tocando mesmo com a aba em segundo plano — um AudioContext novo
// criado com a aba escondida nasce suspenso e nao toca.
var _audioCtx = null;
function getAudioCtx(){
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  } catch(e) { return null; }
}
// Retoma o audio e pede permissao de notificacao no primeiro gesto do usuario
// (navegadores exigem gesto). Roda uma vez.
var _alertInit = false;
function initAlertaUserGesto(){
  if (_alertInit) return; _alertInit = true;
  getAudioCtx();
  prepararSonsAudio(); // gera os sons como <audio> (tocam em background) e destrava no gesto
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}
}
// Notificacao de desktop — aparece mesmo com a aba minimizada / voce em outra
// tela. So dispara quando a aba NAO esta visivel, pra nao duplicar aviso quando
// voce ja esta olhando o sistema.
function notificarCorrida(r, custom){
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    var hbr = r.hora_br || convertHora(r.hora||'');
    var titulo = custom ? 'Alarme — corrida chegando' : 'Corrida chegando';
    var corpo = (r.corrida||'') + (hbr ? (' · ' + hbr) : '');
    // silent:true tira o "ding" padrao do Windows — quem toca e' o SOM ESCOLHIDO
    // (via <audio>), pra voce ouvir o som configurado e nao o do sistema.
    var n = new Notification(titulo, { body: corpo, tag: raceAlertKey(r), silent: true });
    n.onclick = function(){ try { window.focus(); n.close(); } catch(e){} };
    setTimeout(function(){ try { n.close(); } catch(e){} }, 20000);
  } catch(e){}
}
// Fallback universal (mesmo sem permissao de notificacao): pisca o titulo da
// aba enquanto a aba esta em segundo plano, pra chamar atencao na barra.
var _tituloOrig = null, _tituloFlashTimer = null;
function flashTituloAlerta(){
  try {
    if (!document.hidden || _tituloFlashTimer) return;
    if (_tituloOrig === null) _tituloOrig = document.title;
    var on = true;
    _tituloFlashTimer = setInterval(function(){
      document.title = on ? '🔔 Corrida chegando!' : (_tituloOrig || 'Greyhound Factory');
      on = !on;
    }, 1000);
  } catch(e){}
}
function pararFlashTitulo(){
  if (_tituloFlashTimer){ clearInterval(_tituloFlashTimer); _tituloFlashTimer = null; }
  if (_tituloOrig !== null){ document.title = _tituloOrig; _tituloOrig = null; }
}
// ==== Sons como <audio> (data URI WAV) ====================================
// Web Audio puro pode ser estrangulado/suspenso com a aba em segundo plano, e
// aí o unico som que sobra é o "ding" do sistema. Renderizamos os 4 sons uma
// vez (com os MESMOS timbres do Web Audio) para WAV e tocamos via <audio>, que
// roda de forma confiavel em background — assim voce ouve o SOM ESCOLHIDO.
var SOM_AUDIO = {}, _somAudioProntos = false;
function _bufToWavDataURI(buffer){
  var ch = buffer.getChannelData(0), sr = buffer.sampleRate, len = ch.length;
  var ab = new ArrayBuffer(44 + len*2), view = new DataView(ab);
  function ws(o,s){ for (var i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)); }
  ws(0,'RIFF'); view.setUint32(4, 36+len*2, true); ws(8,'WAVE'); ws(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,sr,true); view.setUint32(28,sr*2,true); view.setUint16(32,2,true);
  view.setUint16(34,16,true); ws(36,'data'); view.setUint32(40,len*2,true);
  var off = 44;
  for (var i=0;i<len;i++,off+=2){ var s=Math.max(-1,Math.min(1,ch[i])); view.setInt16(off, s<0?s*0x8000:s*0x7FFF, true); }
  var bytes = new Uint8Array(ab), bin=''; for (var j=0;j<bytes.length;j++) bin += String.fromCharCode(bytes[j]);
  return 'data:audio/wav;base64,' + btoa(bin);
}
function _renderSom(fn, dur){
  return new Promise(function(resolve, reject){
    try {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) return reject('no-oac');
      var sr = 44100, oac = new OAC(1, Math.ceil(sr*dur), sr);
      fn(oac);
      oac.startRendering().then(function(buf){ resolve(_bufToWavDataURI(buf)); }).catch(reject);
    } catch(e){ reject(e); }
  });
}
// WAV de 10ms em silencio. Serve so pra dar um play() SINCRONO dentro do
// gesto do usuario: no iOS (Safari e tambem o Chrome, que usa WebKit por
// baixo) um <audio> so fica destravado se o play() acontecer no MESMO tick
// do toque. Depois de destravado, trocar o .src mantem a liberacao.
var _SILENCIO_WAV = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function prepararSonsAudio(){
  if (_somAudioProntos) return; _somAudioProntos = true;
  var specs = [['sino',tocarSino,0.7],['beep',tocarBeep,0.35],['alarme',tocarAlarme,0.75],['suave',tocarSuave,0.75]];

  // PASSO 1 (sincrono, dentro do gesto): cria os <audio> ja com o silencio e
  // toca. E' isto que destrava o autoplay no iOS. Antes, o new Audio()/play()
  // acontecia no .then() do render — assincrono, fora do gesto — e por isso o
  // alarme ficava mudo no celular sem dar erro nenhum. O botao "Testar" do
  // Configuracoes funcionava porque ali o play() e' sincrono no clique.
  specs.forEach(function(s){
    try {
      var a = new Audio(_SILENCIO_WAV);
      a.preload = 'auto';
      SOM_AUDIO[s[0]] = a;
      var p = a.play();
      if (p && p.then) p.then(function(){ try { a.pause(); a.currentTime = 0; } catch(e){} }).catch(function(){});
    } catch(e){}
  });

  // PASSO 2 (assincrono): quando o timbre real terminar de ser renderizado,
  // so troca o .src do elemento que JA esta destravado. Nunca criar um Audio
  // novo aqui, senao o destravamento se perde.
  specs.forEach(function(s){
    _renderSom(s[1], s[2]).then(function(uri){
      var a = SOM_AUDIO[s[0]];
      if (a) { try { a.src = uri; a.load(); } catch(e){} }
      else { try { var b = new Audio(uri); b.preload = 'auto'; SOM_AUDIO[s[0]] = b; } catch(e){} }
    }).catch(function(){});
  });
}
// Dispara todos os avisos de uma corrida que entrou na janela de alerta.
function avisarCorrida(r, custom){
  playSom(custom ? ALARME_FILTRO.som : SOM_ALERTA);
  notificarCorrida(r, custom);
  flashTituloAlerta();
  registrarAvisoGlobal(raceAlertKey(r));
}

function playBellSound() {
  try {
    var ctx = getAudioCtx(); if (!ctx) return;
    var fn = SONS_DISPONIVEIS[SOM_ALERTA] || tocarSino;
    fn(ctx);
  } catch(e) { console.error('[playBellSound] erro', e); }
}

function raceAlertKey(r) {
  return (r.hora||'') + '|' + (r.corrida||'');
}
// Alarme para filtro selecionado (Configuracoes > Automacao): cor + som proprios
function alarmeTurnoDaCorrida(r){
  var hbr = r.hora_br || convertHora(r.hora||'');
  var h = parseInt((hbr||'').split(':')[0], 10);
  if (isNaN(h)) return '';
  return h < 13 ? 'manha' : 'tarde';
}

// Casa a corrida contra a LISTA de regras. Cada regra e' uma combinacao
// fechada (turno + pista + classes), entao "Youghal A5,A6" nao dispara em
// outra pista nem em outra classe — que era o problema do filtro unico, que
// cruzava tudo com tudo. Basta UMA regra casar.
// Campo vazio dentro da regra = "qualquer". Lista vazia = cai no filtro
// antigo (compatibilidade com quem ja tinha configurado).
function ALARME_CASA_REGRAS(regras, turnoCorrida, pista, classe){
  if (!regras || !regras.length) return null;   // null = "use o filtro antigo"
  for (var i=0;i<regras.length;i++){
    var g=regras[i]||{};
    if (g.turno && g.turno !== turnoCorrida) continue;
    if (g.pista && g.pista !== pista) continue;
    var cs=(g.classes||[]).map(function(c){return String(c).toUpperCase();});
    if (cs.length && cs.indexOf(classe) < 0) continue;
    return true;
  }
  return false;
}
function matchAlarmeFiltro(r){
  if (!ALARME_FILTRO.ativo) return false;
  var _pista = (r.corrida||'').trim().split(' ')[0];
  var _classe = (getRaceClass(r.corrida||'') || '').toUpperCase();
  var _porRegra = ALARME_CASA_REGRAS(ALARME_FILTRO.regras, alarmeTurnoDaCorrida(r), _pista, _classe);
  if (_porRegra !== null) return _porRegra;
  if (ALARME_FILTRO.turno && alarmeTurnoDaCorrida(r) !== ALARME_FILTRO.turno) return false;
  // pista = codigo do Racing Post = 1a palavra de corrida (mesma convencao do motor/HR)
  var pista = (r.corrida||'').trim().split(' ')[0];
  var classe = (getRaceClass(r.corrida||'') || '').toUpperCase();
  if (ALARME_FILTRO.pistas.length && ALARME_FILTRO.pistas.indexOf(pista) < 0) return false;
  if (ALARME_FILTRO.classes.length && ALARME_FILTRO.classes.map(function(c){return c.toUpperCase();}).indexOf(classe) < 0) return false;
  return true;
}
function playSom(nome){
  try {
    // Preferimos o <audio> (toca em background); Web Audio e' o fallback.
    var a = SOM_AUDIO[nome];
    if (a) {
      try { a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function(){ _playSomWebAudio(nome); }); return; } catch(e){}
    }
    _playSomWebAudio(nome);
  } catch(e) { console.error('[playSom] erro', e); }
}
function _playSomWebAudio(nome){
  try { var ctx = getAudioCtx(); if (!ctx) return; (SONS_DISPONIVEIS[nome] || tocarSino)(ctx); } catch(e){}
}

function renderRaceListPanel(avbs) {
  var col = document.getElementById('race-list-col');
  if (!col) return;
  col.innerHTML = '<div style="padding:8px 12px;border-bottom:1px solid var(--bdr2);display:flex;align-items:center;justify-content:space-between;background:var(--sur2)">'
    + '<span style="font-size:10px;color:var(--mut2);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Próximas</span>'
    + '<button onclick="atualizarProximas()" style="font-size:11px;background:none;border:none;color:var(--grn);cursor:pointer;padding:0">&#8635; Atualizar</button>'
    + '</div>';
  var first = true;
  var tc = ['','t1','t2','t3','t4','t5','t6'];
  avbs.forEach(function(r, i) {
    var hbr = r.hora_br || convertHora(r.hora||'');
    var rIdx = results.indexOf(r);
    var div = document.createElement('div');
    var isOld = isOldRaceCard(r);
    var mins = minutesToRace(r);
    var isAlerting = !isOld && mins !== null && mins >= 0 && mins <= ALERTA_MIN_ANTES;
    var alertCustom = isAlerting && matchAlarmeFiltro(r);
    div.className = 'rc' + (first ? ' rc-active' : '') + (isAlerting ? (alertCustom ? ' rc-alert-custom' : ' rc-alert') : '') + (isOld ? ' rc-old' : '') + (r.flagAtrasada ? ' rc-atrasada' : '');
    if (alertCustom) { div.style.setProperty('--alert-col', CORES_ALARME[ALARME_FILTRO.cor] || '#3b82f6'); }
    if (isAlerting) {
      var key = raceAlertKey(r);
      if (!alertedRaces[key]) {
        alertedRaces[key] = true;
        avisarCorrida(r, alertCustom);
      }
    }
    div.setAttribute('data-idx', rIdx);
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    var top3Val = r.top3 ? (Array.isArray(r.top3) ? r.top3.filter(function(x){return x>0;}).join('-') : r.top3) : '';
    var top3Html = top3Val ? '<div style="text-align:center;margin-top:3px"><span class="top3-tag" style="font-size:9px;padding:1px 5px;display:inline-flex;align-items:center;gap:3px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h2.5a1 1 0 0 1 1 1.2A4 4 0 0 1 17 9"/><path d="M7 5H4.5a1 1 0 0 0-1 1.2A4 4 0 0 0 7 9"/></svg> '+top3Val+'</span></div>' : '';
    div.innerHTML += '<div style="flex:1;min-width:0">'
      + (first ? '<div class="rc-next-badge">PRÓXIMA</div>' : '')
      + (isOld ? '<div class="rc-old-badge">CORRIDA ANTIGA</div>' : '')
      + (r.cardSuspect ? '<div class="rc-suspect-badge">⚠ PISTA PODE TER CANCELADO</div>' : '')
      + (r._reanaliseFlag && r._reanaliseFlag.type==='reanalise' && (Date.now()-r._reanaliseFlag.at)<300000 ? '<div class="rc-reanalise-badge">🔄 REANALISADA</div>' : '')
      + '<div class="rc-time">'+hbr+'</div>'
      + '<div class="rc-name">'+corridaDisplay(r)+'</div>'
      + '<div class="rc-meta">'+(r.dist||'')+'m</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;padding-left:6px">'
      + '<div style="display:flex;align-items:center;gap:3px">'
      + '<span class="trap-badge '+tc[r.trapFav||1]+'" style="width:22px;height:22px;font-size:10px">'+(r.trapFav||'?')+'</span>'
      + '<span style="font-size:9px;color:var(--mut)">vs</span>'
      + '<span class="trap-badge '+tc[r.trapUnd||2]+'" style="width:22px;height:22px;font-size:10px">'+(r.trapUnd||'?')+'</span>'
      + '</div>'
      + top3Html
      + '</div>';
    div.addEventListener('click', function() {
      document.querySelectorAll('.rc').forEach(function(el){el.classList.remove('rc-active');});
      div.classList.add('rc-active');
      renderFocusPanel(r, rIdx);
    });
    col.appendChild(div);
    first = false;
  });
  if (!avbs.length) {
    col.innerHTML += '<div style="padding:20px;text-align:center;color:var(--mut);font-size:12px">Nenhuma corrida futura</div>';
  }
}

function toggleTableView() {
  var main = document.getElementById('main-layout');
  if (main.classList.contains('focus-mode')) {
    main.classList.remove('focus-mode');
  } else {
    enterFocusMode();
  }
}

/* ── FIM PAINEL DE FOCO ─────────────────────────────────────── */

/* ── Popup pós-análise (3 etapas) ───────────────────────────────────── */
function injectPostSaveModal(){
  var d=document.createElement('div');
  d.innerHTML='<div id="ps-modal" class="ps-ov">'
    +'<div class="ps-box" id="ps-box">'
    +'<span class="ps-icon" id="ps-icon">&#128190;</span>'
    +'<div class="ps-title" id="ps-title">Sessão analisada!</div>'
    +'<div class="ps-sub" id="ps-sub"></div>'
    +'<input class="ps-inp" id="ps-inp" type="text" maxlength="80" style="display:none" placeholder="Ex.: Races 03/07/2026">'
    +'<div class="ps-btns" id="ps-btns"></div>'
    +'</div></div>';
  document.body.appendChild(d);
  document.getElementById('ps-modal').addEventListener('click',function(e){if(e.target===this)closePsModal();});
}
function closePsModal(){var m=document.getElementById('ps-modal');if(m)m.classList.remove('open');}
function openPsModal(){
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  var alta=results.filter(function(r){return r.nivel==='alta';}).length;
  showPsStep1(avbs.length,alta);
  document.getElementById('ps-modal').classList.add('open');
}
function showPsStep1(avbs,alta){
  document.getElementById('ps-icon').textContent='\uD83D\uDCBE';
  document.getElementById('ps-title').textContent='Sessão analisada!';
  document.getElementById('ps-sub').innerHTML='<strong style="color:#22c55e">'+avbs+'</strong> AvBs encontrados, <strong style="color:#f97316">'+alta+'</strong> de alta confiança.<br>Deseja salvar esta sessão no Histórico?';
  document.getElementById('ps-inp').style.display='none';
  var btns=document.getElementById('ps-btns');
  btns.innerHTML='';
  var no=document.createElement('button');no.className='ps-btn-sec';no.textContent='Não, obrigado';no.onclick=showPsDeclineMsg;btns.appendChild(no);
  var yes=document.createElement('button');yes.className='ps-btn-pri';yes.textContent='Sim, salvar ✓';yes.onclick=showPsStep2;btns.appendChild(yes);
}
function showPsDeclineMsg(){
  document.getElementById('ps-icon').textContent='\u2705';
  document.getElementById('ps-title').textContent='Ok';
  document.getElementById('ps-sub').textContent='Suas corridas só ficarão disponíveis na aba Analisar.';
  document.getElementById('ps-inp').style.display='none';
  var btns=document.getElementById('ps-btns');
  btns.innerHTML='';
  var ok=document.createElement('button');ok.className='ps-btn-pri';ok.textContent='OK';ok.onclick=finishDeclineSave;btns.appendChild(ok);
}
function clearUploadedPdfList(){
  raceFiles=[];
  var list=document.getElementById('rlist');
  if(list) list.innerHTML='';
}
function finishDeclineSave(){
  closePsModal();
  // Lista ja foi limpa logo apos a analise terminar (clearUploadedPdfList),
  // mas chama de novo aqui por segurança caso algo tenha sido re-adicionado.
  clearUploadedPdfList();
}
function showPsStep2(){
  document.getElementById('ps-icon').textContent='\u270F\uFE0F';
  document.getElementById('ps-title').textContent='Nome da sessão';
  document.getElementById('ps-sub').innerHTML='Escolha um nome para identificar esta análise no Histórico.<br><small style="color:#f97316">O padrão "Races DD/MM/AAAA" é reservado para as sessões automáticas do robô — não pode ser usado aqui.</small>';
  var inp=document.getElementById('ps-inp');
  inp.style.display='block';
  var now=new Date();
  var dd=String(now.getDate()).padStart(2,'0'), mm=String(now.getMonth()+1).padStart(2,'0'), yyyy=now.getFullYear();
  var hh=String(now.getHours()).padStart(2,'0'), mi=String(now.getMinutes()).padStart(2,'0');
  // Sugestao de nome DIFERENTE do padrao "Races DD/MM/AAAA" usado pelas sessoes
  // automaticas do robo, pra nao colidir/sobrescrever sem querer.
  inp.value='Avulsa '+dd+'/'+mm+'/'+yyyy+' '+hh+'h'+mi;
  setTimeout(function(){inp.focus();inp.select();},80);
  var btns=document.getElementById('ps-btns');
  btns.innerHTML='';
  var back=document.createElement('button');back.className='ps-btn-sec';back.textContent='← Voltar';back.onclick=function(){var avbs=results.filter(function(r){return r.tipo==='avb';});var alta=results.filter(function(r){return r.nivel==='alta';}).length;showPsStep1(avbs.length,alta);};btns.appendChild(back);
  var ok=document.createElement('button');ok.className='ps-btn-pri';ok.textContent='Salvar';ok.onclick=psSaveCheck;btns.appendChild(ok);
  inp.onkeydown=function(e){if(e.key==='Enter')psSaveCheck();if(e.key==='Escape')closePsModal();};
}
var RESERVED_SESSION_NAME_RE = /^races\s+\d{1,2}\/\d{1,2}\/\d{4}$/i;
async function psSaveCheck(){
  var name=document.getElementById('ps-inp').value.trim();
  if(!name){document.getElementById('ps-inp').focus();return;}
  // Bloqueia o padrao reservado das sessoes automaticas do robo — corridas
  // avulsas (upload manual) nunca podem usar esse nome, pra nao arriscar
  // sobrescrever a sessao automatica do dia sem querer.
  if(RESERVED_SESSION_NAME_RE.test(name)){
    showToast('Esse nome é reservado para as sessões automáticas do robô. Escolha outro nome pra corridas avulsas.', false);
    document.getElementById('ps-inp').focus();
    document.getElementById('ps-inp').select();
    return;
  }
  try{
    var r=await fetch(BASE+'/api/sessions');
    var sessions=await r.json();
    var existing=sessions.find(function(s){return s.name.trim().toLowerCase()===name.toLowerCase();});
    if(existing){showPsStep3(name,existing.id);}
    else{await psSaveNew(name);}
  }catch(e){await psSaveNew(name);}
}
function showPsStep3(name,existingId){
  document.getElementById('ps-icon').textContent='\u26A0\uFE0F';
  document.getElementById('ps-title').textContent='Nome já existe';
  document.getElementById('ps-sub').innerHTML='Já existe uma sessão chamada <strong style="color:#fff">"'+name+'"</strong>.<br>O que deseja fazer?';
  document.getElementById('ps-inp').style.display='none';
  var btns=document.getElementById('ps-btns');
  btns.innerHTML='';
  var cancel=document.createElement('button');cancel.className='ps-btn-sec';cancel.textContent='Cancelar';cancel.onclick=closePsModal;btns.appendChild(cancel);
  var update=document.createElement('button');update.className='ps-btn-warn';update.textContent='Atualizar';update.title='Mantém o nome e substitui os dados';update.onclick=async function(){await psReplace(name,existingId);};btns.appendChild(update);
  var replace=document.createElement('button');replace.className='ps-btn-pri';replace.textContent='Substituir';replace.title='Remove a sessão antiga e cria uma nova';replace.onclick=async function(){await psReplace(name,existingId);};btns.appendChild(replace);
}
async function psSaveNew(name){
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  try{
    var r=await fetch(BASE+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,races:avbs})});
    if(r.ok){closePsModal();showToast('\u2713 Sessão "'+name+'" salva!',true);setTimeout(function(){location.reload();},1600);}
    else showToast('Erro ao salvar sessão.',false);
  }catch(e){showToast('Erro ao salvar sessão.',false);}
}
async function psReplace(name,oldId){
  try{await fetch(BASE+'/api/session/'+oldId,{method:'DELETE'});}catch(e){}
  await psSaveNew(name);
}

/* modal salvar */
function injectSaveModal(){
  var d=document.createElement('div');
  d.innerHTML='<div id="save-modal" class="ghf-modal-ov" style="display:none">'
    +'<div class="ghf-modal-box">'
    +'<div class="ghf-modal-title">&#128190; Salvar sessão</div>'
    +'<div class="ghf-modal-sub">Dê um nome para identificar esta análise no Histórico</div>'
    +'<input id="save-inp" class="ghf-modal-inp" type="text" placeholder="Ex.: Races 28/06/2026" maxlength="80">'
    +'<div class="ghf-modal-foot">'
    +'<button id="save-cancel" class="ghf-btn-sec">Cancelar</button>'
    +'<button id="save-ok" class="ghf-btn-pri">Salvar</button>'
    +'</div></div></div>'
    +'<div id="ghf-toast" class="ghf-toast"></div>';
  document.body.appendChild(d);
  document.getElementById('save-cancel').addEventListener('click',closeSaveModal);
  document.getElementById('save-ok').addEventListener('click',doSaveSession);
  document.getElementById('save-inp').addEventListener('keydown',function(e){if(e.key==='Enter')doSaveSession();if(e.key==='Escape')closeSaveModal();});
  document.getElementById('save-modal').addEventListener('click',function(e){if(e.target===this)closeSaveModal();});
}
function openSaveModal(){
  var now=new Date();
  var dd=String(now.getDate()).padStart(2,'0');
  var mm=String(now.getMonth()+1).padStart(2,'0');
  var yyyy=now.getFullYear();
  document.getElementById('save-inp').value='Races '+dd+'/'+mm+'/'+yyyy;
  document.getElementById('save-modal').style.display='flex';
  setTimeout(function(){var inp=document.getElementById('save-inp');inp.focus();inp.select();},80);
}
function closeSaveModal(){document.getElementById('save-modal').style.display='none';}
var toastHideTimer = null;
function hideToast(){
  var t=document.getElementById('ghf-toast');
  t.classList.remove('t-show');
  if(toastHideTimer){clearTimeout(toastHideTimer);toastHideTimer=null;}
}
function showToast(msg,ok){
  var t=document.getElementById('ghf-toast');
  if(!t) return;
  t.innerHTML='<span>'+msg+'</span><button class="ghf-toast-x" onclick="hideToast()" aria-label="Fechar">&#x2715;</button>';
  t.className='ghf-toast '+(ok?'t-ok':'t-err');

  // Encaixa o toast na FAIXA DE AVISOS, abaixo da barra de Odd, em vez de
  // flutuar sobre a tela. Flutuando ele cobria justamente a barra de Odd e
  // Stake — o lugar onde voce precisa clicar depois de ler o aviso.
  // O posicionamento vai por style inline de proposito: o CSS do .ghf-toast
  // vive em outro arquivo e usa position:fixed; sobrescrever aqui garante o
  // encaixe sem depender de qual regra vence.
  var col = document.querySelector('.focus-col');
  if (col) {
    if (t.parentNode !== col) col.appendChild(t);
    t.style.cssText = 'position:static;display:flex;align-items:center;justify-content:space-between;'
      + 'gap:10px;width:100%;margin:0;padding:7px 12px;border-radius:0;font-size:11px;'
      + 'box-shadow:none;transform:none;left:auto;right:auto;bottom:auto;top:auto;z-index:auto;'
      + 'border-top:1px solid rgba(255,255,255,.08);'
      + (ok ? 'background:rgba(34,197,94,.12);color:#22c55e' : 'background:rgba(239,68,68,.12);color:#ef4444');
  }

  if(toastHideTimer){clearTimeout(toastHideTimer);}
  requestAnimationFrame(function(){t.classList.add('t-show');});
  toastHideTimer=setTimeout(function(){
    t.classList.remove('t-show');
    if(col && t.parentNode===col) t.style.display='none';   // libera o espaco
    toastHideTimer=null;
  },2600);
}
async function doSaveSession(){
  var name=document.getElementById('save-inp').value.trim();
  if(!name){document.getElementById('save-inp').focus();return;}
  closeSaveModal();
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  try{
    var resp=await fetch(BASE+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,races:avbs})});
    if(resp.ok){showToast('\u2713 Sessão "'+name+'" salva!',true);setTimeout(function(){location.reload();},1600);}
    else showToast('Erro ao salvar sessão.',false);
  }catch(e){showToast('Erro ao salvar sessão.',false);}
}

/* modal validar dados no pdf */
function injectValModal(){
  var m=document.createElement('div');m.id='val-modal';
  m.innerHTML='<div id="val-box"><div id="val-hdr"><h3 id="val-title">Histórico</h3><button id="val-xbtn" onclick="closeValModal()">&#x2715;</button></div><div id="val-body"></div></div>';
  document.body.appendChild(m);
  m.addEventListener('click',function(e){if(e.target===this)closeValModal();});
  var vs=document.createElement('style');
  vs.textContent=`
#val-modal{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center;z-index:9000}
#val-modal.open{display:flex}
#val-box{background:#12172a;border:1px solid rgba(255,255,255,.1);border-radius:12px;width:88vw;max-width:920px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(0,0,0,.7)}
#val-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.07);background:#161b2e}
#val-hdr h3{font-size:12px;font-weight:600;color:rgba(255,255,255,.85);margin:0;flex:1;text-align:center;letter-spacing:.2px}
#val-xbtn{background:transparent;border:none;color:rgba(255,255,255,.3);font-size:16px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0;transition:color .15s}
#val-xbtn:hover{color:#fff}
#val-body{padding:12px 16px;display:flex;flex-direction:column;gap:0;background:#12172a}
#val-body.val-compact .val-dog{width:100%}
#val-body.val-compact .val-dog-hdr{margin-bottom:1px;gap:5px}
#val-body.val-compact .val-dog-hdr .trap-badge{width:18px;height:18px;font-size:9px}
#val-body.val-compact .val-name{font-size:11px}
#val-body.val-compact .val-tbl th{padding:1px 3px;font-size:9px;line-height:1.1}
#val-body.val-compact .val-tbl td{padding:0px 3px;font-size:9px;line-height:1.05}
#val-body.val-compact .val-td-rem{font-size:8px;max-width:90px}
#val-body.val-compact .val-sep{margin:2px 0}
#val-body.val-compact{max-height:85vh;overflow-y:auto;gap:0}
.val-dog{width:100%}
.val-dog-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:0}
.val-dog-hdr .trap-badge{width:26px;height:26px;font-size:12px;font-weight:700;flex-shrink:0}
.val-name{font-size:13px;font-weight:700;color:#fff;letter-spacing:.1px}
.val-perfil{font-size:10px;color:rgba(255,255,255,.35);margin-left:6px;font-weight:400}
.val-sep{height:1px;background:rgba(255,255,255,.06);margin:10px 0}
.val-tbl{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;font-family:var(--font-body)}
.val-tbl thead tr{border-bottom:1px solid rgba(255,255,255,.08)}
.val-tbl th{font-size:12px;font-weight:600;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.4px;padding:5px 4px;text-align:center;white-space:nowrap;font-family:var(--font-body)}
.val-tbl td{padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.04);color:rgba(255,255,255,.78);vertical-align:middle;text-align:center;font-family:var(--font-body);font-size:12px}
.val-tbl tr:last-child td{border-bottom:none}
.val-tbl tr:hover td{background:rgba(255,255,255,.025)}
.val-td-date{color:rgba(255,255,255,.6);font-size:12px;text-align:left;font-family:var(--font-body)}
.val-td-track{color:rgba(255,255,255,.7);font-size:12px;text-align:center;font-family:var(--font-body)}
.val-td-muted{color:rgba(255,255,255,.4);font-size:12px;text-align:center;font-family:var(--font-body)}
.val-td-bends{font-family:var(--font-body);font-size:12px;font-weight:700;color:rgba(255,255,255,.85);text-align:center}
.val-td-rem{color:rgba(255,255,255,.45);font-size:11px;text-align:left;font-family:var(--font-body);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.val-badge-grade{display:inline-block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 4px;font-size:12px;color:rgba(255,255,255,.55);font-family:var(--font-body)}
.val-td-caltm{color:#60a5fa;font-weight:700;font-size:12px;text-align:center;font-family:var(--font-body)}
@media(max-width:768px){
  #val-box{width:96vw;max-width:96vw;max-height:90vh;overflow:hidden}
  #val-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 8px}
  .val-dog{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .val-tbl{table-layout:auto;width:auto;min-width:640px}
  #val-body.val-compact{max-height:90vh}
  #val-body.val-compact .val-tbl{min-width:640px}
  #val-body.val-compact .val-tbl th{font-size:11px;padding:3px 4px;line-height:1.2}
  #val-body.val-compact .val-tbl td{font-size:11px;padding:3px 4px;line-height:1.2}
  #val-body.val-compact .val-td-rem{font-size:10px;max-width:140px}
  #val-body.val-compact .val-dog-hdr .trap-badge{width:22px;height:22px;font-size:11px}
  #val-body.val-compact .val-name{font-size:12px}
}
.val-link{font-size:9px;color:rgba(96,165,250,.6);cursor:pointer;display:block;text-align:center;margin-top:4px;letter-spacing:.1px}
.val-link:hover{color:#60a5fa}.t1{background:radial-gradient(circle at 35% 35%,#ff4444,#c00 60%,#8b0000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.4)}.t2{background:radial-gradient(circle at 35% 35%,#4488ff,#1a3db5 60%,#0a1f6b);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.3)}.t3{background:radial-gradient(circle at 35% 35%,#fff,#d0d0d0 60%,#a0a0a0);color:#111;box-shadow:inset -2px -2px 4px rgba(0,0,0,.2),inset 1px 1px 3px rgba(255,255,255,.8)}.t4{background:radial-gradient(circle at 35% 35%,#444,#1a1a1a 60%,#000);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.6),inset 1px 1px 3px rgba(255,255,255,.15)}.t5{background:radial-gradient(circle at 35% 35%,#ffaa00,#e07000 60%,#a04800);color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.3),inset 1px 1px 3px rgba(255,255,255,.4)}.t6{background:radial-gradient(circle at 50% 50%,#cc0000 0%,#cc0000 38%,transparent 38%),repeating-linear-gradient(90deg,#111 0%,#111 50%,#f0f0f0 50%,#f0f0f0 100%) 0/10px;color:#fff;box-shadow:inset -2px -2px 4px rgba(0,0,0,.4),inset 1px 1px 3px rgba(255,255,255,.2)}
`;
  document.head.appendChild(vs);
}
function closeValModal(){var m=document.getElementById('val-modal');if(m)m.classList.remove('open');}
function openValModal(key){
  var r=results.find(function(x){return x.tipo==='avb'&&x.histFav&&(x.hora+'|'+x.corrida)===key;});
  if(!r){console.warn('[VAL] nao achou:',key);return;}
  document.getElementById('val-title').textContent='T'+r.trapFav+' '+r.nameFav+' vs T'+r.trapUnd+' '+r.nameUnd;
  document.getElementById('val-body').classList.remove('val-compact');
  document.getElementById('val-body').innerHTML=buildDogCard(r.trapFav,r.nameFav,r.perfilFav,r.histFav)+'<div class="val-sep"></div>'+buildDogCard(r.trapUnd,r.nameUnd,r.perfilUnd,r.histUnd);
  document.getElementById('val-modal').classList.add('open');
}
function openAllDogsModal(key){
  var r=results.find(function(x){return x.tipo==='avb'&&(x.hora+'|'+x.corrida)===key;});
  if(!r){console.warn('[ALLDOGS] nao achou:',key);return;}
  var all=r.histAll&&r.histAll.length?r.histAll:null;
  document.getElementById('val-title').textContent='Corrida completa — '+corridaDisplay(r);
  document.getElementById('val-body').classList.add('val-compact');
  if(!all){
    document.getElementById('val-body').innerHTML='<div style="padding:24px;text-align:center;color:rgba(255,255,255,.4);font-size:12px">Histórico completo não disponível para esta corrida (sessão salva antes deste recurso).</div>';
  } else {
    document.getElementById('val-body').innerHTML=all.map(function(g,i){
      var card=buildDogCard(g.trap,g.nome,'',g.historico,true);
      return card+(i<all.length-1?'<div class="val-sep"></div>':'');
    }).join('');
  }
  document.getElementById('val-modal').classList.add('open');
}
// Relatorio tecnico da analise — 100% gerado por parametro (le os dados ja
// calculados pelo motor: scores, eliminados, histAll), sem chamar IA nenhuma.
// Mesma logica que eu (Claude) apliquei manualmente ao ler um PDF, so que
// aqui e' o proprio motor que ja calculou tudo — o relatorio so organiza.
async function openRelatorioModal(key){
  // Sempre sincroniza com o servidor ANTES de montar o relatorio — a copia
  // local (results) pode estar desatualizada (carregada antes de algum
  // conserto/reprocessamento no backend), e o relatorio processado errado
  // nunca teria como saber disso sem buscar de novo. Achado 14/07/2026.
  document.getElementById('val-title').textContent = 'Relatório de Análise';
  document.getElementById('val-body').classList.remove('val-compact');
  document.getElementById('val-body').innerHTML = '<div style="padding:24px;text-align:center;color:rgba(255,255,255,.4);font-size:12px">Carregando…</div>';
  document.getElementById('val-modal').classList.add('open');
  try { await syncFromServer(); } catch(e) {}
  var r=results.find(function(x){return x.tipo==='avb'&&(x.hora+'|'+x.corrida)===key;});
  if(!r){
    document.getElementById('val-body').innerHTML = '<div style="padding:24px;text-align:center;color:rgba(255,255,255,.4);font-size:12px">Não encontrei essa corrida depois de sincronizar (pode ter saído da lista de hoje). Tenta fechar e abrir de novo.</div>';
    return;
  }
  document.getElementById('val-title').textContent='Relatório de Análise — '+corridaDisplay(r)+' '+(r.hora||'');
  // Nunca deixa a tela travada em "Carregando" se algo quebrar aqui dentro —
  // mostra o erro de verdade, pra dar pra investigar (achado 14/07/2026,
  // depois de um caso que travava sem nenhuma pista do que aconteceu).
  try {
    document.getElementById('val-body').innerHTML=buildRelatorioHtml(r);
  } catch(e) {
    console.error('[RELATORIO] erro ao montar', e);
    document.getElementById('val-body').innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444;font-size:12px">Erro ao montar o relatório: '+(e.message||e)+'<br><br><span style="color:rgba(255,255,255,.4);font-size:11px">Manda esse texto pro Claude — isso ajuda a achar a causa.</span></div>';
  }
}
// Resumo humanizado — mesma logica do relatorio tecnico, so que organizada
// como texto corrido (paragrafo), tipo um comentario de analista. 100% por
// template/condicional, sem chamar IA nenhuma.
function buildResumoHumanizado(r){
  if (!r.scores || !r.scores.length || r.nivel==='skip') return '';
  var fav = r.scores.find(function(g){return g.trap===r.trapFav;});
  var und = r.scores.find(function(g){return g.trap===r.trapUnd;});
  if (!fav || !und) return '';

  var partes = [];
  partes.push('AvB: T'+r.trapFav+' '+(r.nameFav||'')+' (Favorito) vs T'+r.trapUnd+' '+(r.nameUnd||'')+' (Underdog) — '+r.pct+'% ('+(r.nivel==='alta'?'Alta':'Média')+' confiança).');

  // 2o colocado do ranking (pra comentario de Back)
  var segundo = (r.scores[0] && r.scores[0].trap===r.trapFav) ? r.scores[1] : r.scores[0];
  if (r.vencedor) {
    partes.push('Recomendação de Back também — a vantagem de '+(r.nameFav||'')+' se estende até o 2º colocado, não só sobre o Underdog.');
  } else if (segundo) {
    if (segundo.score > fav.score) {
      partes.push('Sem recomendação de Back (T'+segundo.trap+' '+(segundo.nome||'')+', o 2º colocado, na verdade tem score bruto maior que o Favorito — a diferença virou negativa, provavelmente por causa do desempate).');
    } else {
      partes.push('Sem recomendação de Back — a vantagem sobre o 2º colocado (T'+segundo.trap+' '+(segundo.nome||'')+') não foi grande o suficiente.');
    }
  }

  // Curiosidade do Post Pick — top3 pode chegar como array (analise ao vivo,
  // recem-calculada) OU como string "3-1-6-4-5" (lida do banco, formato de
  // armazenamento) — normaliza pra array sempre, antes de usar .slice/.join.
  // Achado 14/07/2026: quebrava toda vez que vinha do banco (string).
  var top3Arr = Array.isArray(r.top3) ? r.top3 : (typeof r.top3 === 'string' && r.top3 ? r.top3.split('-').map(Number).filter(function(n){return n>0;}) : []);
  if (r.postPick && top3Arr.length>=3) {
    var picks = r.postPick.split('-').map(Number).filter(function(n){return n>0;});
    var top3Str = top3Arr.slice(0,3).join('-');
    var bateuExato = picks.length>=3 && picks[0]===top3Arr[0] && picks[1]===top3Arr[1] && picks[2]===top3Arr[2];
    var mesmosTres = picks.length>=3 && picks.slice(0,3).sort().join(',')===top3Arr.slice(0,3).sort().join(',');
    if (bateuExato) {
      partes.push('Curiosamente, o top 3 bateu exatamente com o Post Pick do Racing Post ('+r.postPick+').');
    } else if (mesmosTres) {
      partes.push('Os mesmos 3 galgos do Post Pick do Racing Post ('+r.postPick+') aparecem no top 3 do motor, só em ordem diferente ('+top3Str+').');
    }
  }

  // Eliminados relevantes
  if (r.eliminados && r.eliminados.length) {
    partes.push((r.eliminados.length===1?'Vale notar que 1 galgo foi eliminado':'Vale notar que '+r.eliminados.length+' galgos foram eliminados')+' antes do cálculo (detalhes abaixo).');
  }

  return partes.join(' ');
}
// Odd media do galgo (2 ultimas SPs na pista/dist), vinda do motor. Pode ser
// null quando o galgo nao tem SP registrado — nesse caso mostra travessao em
// vez de zero, que seria lido como "odd 0" e nao como "sem dado".
function _fmtOdd(v){
  return (v == null || v === '') ? '—' : Number(v).toFixed(2);
}

function buildRelatorioHtml(r){
  var sec = 'padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08)';
  var title = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#22c55e;margin-bottom:10px';
  var html = '';

  if (!r.scores || !r.scores.length) {
    return '<div style="padding:24px;text-align:center;color:rgba(255,255,255,.4);font-size:12px">Relatório detalhado não disponível para esta corrida (sessão salva antes deste recurso, ou corrida descartada antes do cálculo de scores).</div>';
  }

  // Resumo humanizado (paragrafo de abertura)
  var resumo = buildResumoHumanizado(r);
  if (resumo) {
    html += '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(34,197,94,.04)"><div style="font-size:13px;color:#eee;line-height:1.6">'+resumo+'</div></div>';
  }

  // Eliminados
  if (r.eliminados && r.eliminados.length) {
    html += '<div style="'+sec+'"><div style="'+title+'">Galgos eliminados antes do cálculo</div>';
    html += r.eliminados.map(function(e){
      var _cio = /Cio recente/i.test(e.motivo||'');
      if (_cio) {
        return '<div style="font-size:12px;color:#fca5a5;padding:4px 0;background:rgba(239,68,68,.08);border-left:2px solid #ef4444;padding-left:6px;border-radius:3px;margin:2px 0"><span style="margin-right:4px">🩸</span><strong style="color:#ef4444">T'+e.trap+'</strong> — '+e.motivo+'</div>';
      }
      return '<div style="font-size:12px;color:#ccc;padding:4px 0"><strong style="color:#ef4444">T'+e.trap+'</strong> — '+e.motivo+'</div>';
    }).join('');
    html += '</div>';
  }

  // Tabela de scores
  html += '<div style="'+sec+'"><div style="'+title+'">Scores calculados (motor fixo/configurado)</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="color:#888;text-align:left">'
    + '<th style="padding:4px 6px">Trap</th><th style="padding:4px 6px">Galgo</th><th style="padding:4px 6px;text-align:center">CalTm</th><th style="padding:4px 6px;text-align:center">Categoria</th><th style="padding:4px 6px;text-align:center">Bends</th><th style="padding:4px 6px;text-align:center">Split</th><th style="padding:4px 6px;text-align:center">Remarks</th><th style="padding:4px 6px;text-align:center">SP</th><th style="padding:4px 6px;text-align:center" title="Odd decimal média das 2 últimas SPs na pista/distância">Odd méd</th><th style="padding:4px 6px;text-align:center">BRT</th><th style="padding:4px 6px;text-align:center">Post Pick</th><th style="padding:4px 6px;text-align:center">Final</th></tr></thead><tbody>';
  html += r.scores.map(function(g){
    var s = g.scores||{};
    var isFav = g.trap===r.trapFav, isUnd = g.trap===r.trapUnd;
    var rowStyle = 'border-top:1px solid rgba(255,255,255,.06)' + (isFav?';background:rgba(34,197,94,.08)':(isUnd?';background:rgba(239,68,68,.08)':''));
    var tag = isFav?' <span style="color:#22c55e;font-size:9px">FAV</span>':(isUnd?' <span style="color:#ef4444;font-size:9px">UND</span>':'');
    return '<tr style="'+rowStyle+'"><td style="padding:5px 6px">T'+g.trap+'</td><td style="padding:5px 6px">'+(g.nome||'')+tag+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.caltm!=null?s.caltm:'-')+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.categoria!=null?s.categoria:'-')+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.bends!=null?s.bends:'-')+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.split!=null?s.split:'-')+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.remarks!=null?s.remarks:'-')+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.sp!=null?s.sp:'-')+'</td>'
      // Odd media vem no galgo (g.oddMedia), nao no bloco de scores: e' dado de
      // mercado, nao criterio de pontuacao. Null vira travessao — mostrar 0
      // seria lido como "odd zero" em vez de "sem dado".
      +'<td style="padding:5px 6px;text-align:center;color:#cbd5e1">'+_fmtOdd(g.oddMedia)+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.brt!=null?s.brt:'-')+'</td>'
      +'<td style="padding:5px 6px;text-align:center">'+(s.postPick!=null?s.postPick:'-')+'</td>'
      +'<td style="padding:5px 6px;text-align:center;font-weight:700">'+g.score+'</td></tr>';
  }).join('');
  html += '</tbody></table></div>';

  // Desempates (quando a diferenca entre colocados adjacentes e <= 5 pts)
  var tbNotes = [];
  for (var i=1;i<r.scores.length;i++) {
    var diff = r.scores[i-1].score - r.scores[i].score;
    if (diff <= 5) {
      tbNotes.push('T'+r.scores[i-1].trap+' ('+r.scores[i-1].nome+') vs T'+r.scores[i].trap+' ('+r.scores[i].nome+'): diferença de apenas '+diff.toFixed(1)+' pts no score bruto — desempate aplicado (ordem: nota de CalTm → nota de Categoria).');
    }
  }
  if (tbNotes.length) {
    html += '<div style="'+sec+'"><div style="'+title+'">Desempates aplicados (score final ≤ 5 pts de diferença)</div>';
    html += tbNotes.map(function(t){return '<div style="font-size:12px;color:#ccc;padding:4px 0">'+t+'</div>';}).join('');
    html += '</div>';
  }

  // Decisao final
  html += '<div style="padding:16px 20px">';
  if (r.nivel === 'skip') {
    html += '<div style="font-size:12px;color:#f97316;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:8px;padding:12px">Corrida marcada como <strong>Skip</strong> — margem insuficiente pra indicação confiável.</div>';
  } else {
    html += '<div style="font-size:13px;color:#fff;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:8px;padding:14px">'
      // Odd media de cada lado ao lado do nome. Com o modo avb_parelho o
      // trapFav/trapUnd ja e' o par de odds mais proximas, entao ver as duas
      // juntas mostra na hora o quao equilibrada e' a disputa.
      + 'Favorito: <strong style="color:#22c55e">T'+r.trapFav+' '+(r.nameFav||'')+'</strong> <span style="color:#9aa4b2">('+_fmtOdd(r.oddFav)+')</span> vence Underdog: <strong style="color:#ef4444">T'+r.trapUnd+' '+(r.nameUnd||'')+'</strong> <span style="color:#9aa4b2">('+_fmtOdd(r.oddUnd)+')</span><br>'
      + 'Confiança: <strong>'+r.pct+'% ('+r.nivel+')</strong>'
      + (r.vencedor ? '<br><span style="color:#22c55e;font-weight:700">★ Recomendação de Back</span>' : '')
      + '</div>';
  }
  html += '</div>';

  return html;
}
function extrairRemarks(mixed){
  if(!mixed)return'';
  var commaIdx=mixed.indexOf(',');
  if(commaIdx>=0){var wordStart=mixed.lastIndexOf(' ',commaIdx)+1;return mixed.substring(wordStart);}
  var tokens=mixed.trim().split(' ');
  for(var i=tokens.length-1;i>=0;i--){if(/^[A-Z]/.test(tokens[i]))return tokens.slice(i).join(' ');}
  return mixed;
}
function buildDogCard(trap,nome,perfil,hist,compact){
  var tc=['','t1','t2','t3','t4','t5','t6'];
  function classRank(c){var m=(c||'').match(/A(\d+)/i);return m?parseInt(m[1]):999;}
  var caltms=(hist||[]).filter(function(h){return h.caltm!=null&&parseFloat(h.caltm)>0;}).map(function(h){return parseFloat(h.caltm);});
  var bestCaltm=caltms.length?Math.min.apply(null,caltms):null;
  var bestClass=Math.min.apply(null,(hist||[]).map(function(h){return classRank(h.classe);}));
  var rows=(hist||[]).map(function(h){
    var rem=extrairRemarks(h.remarks||'');
    var ct=(h.caltm!=null&&h.caltm!==''&&parseFloat(h.caltm)>0)?parseFloat(h.caltm).toFixed(2):'-';
    var isBestCt=bestCaltm&&ct!=='-'&&parseFloat(ct)===bestCaltm;
    var isBestCl=classRank(h.classe)===bestClass&&bestClass<999;
    return'<tr>'
      +'<td class="val-td-date">'+h.data+'</td>'
      +'<td class="val-td-track">'+h.pista+'</td>'
      +'<td class="val-td-muted" style="text-align:center">'+h.dist+'m</td>'
      +'<td class="val-td-muted" style="text-align:center">['+h.trap+']</td>'
      +'<td class="val-td-muted" style="text-align:center">'+(h.split||'')+'</td>'
      +'<td class="val-td-bends">'+(h.bends||'')+'</td>'
      +'<td class="val-td-muted" style="text-align:center">'+(h.pos||'-')+'</td>'
      +'<td class="val-td-rem">'+rem+'</td>'
      +'<td style="text-align:center"><span class="val-badge-grade"'+(isBestCl?' style="color:#f97316;border-color:rgba(249,115,22,.4);background:rgba(249,115,22,.1)"':'')+'>'+( h.classe||'')+'</span></td>'
      +'<td class="val-td-caltm"'+(isBestCt?' style="color:#fbbf24"':'')+'>'+ct+'</td>'
      +'</tr>';
  }).join('');
  var cw=compact?['32','32','28','20','28','24','18','44','20','30']:['40','40','40','30','40','35','25','60','30','40'];
  return'<div class="val-dog">'
    +'<div class="val-dog-hdr">'
    +'<span class="trap-badge '+tc[trap]+'">'+trap+'</span>'
    +'<span class="val-name">'+nome+'</span>'
    +(perfil?'<span class="val-perfil">'+perfil+'</span>':'')
    +'</div>'
    +'<table class="val-tbl">'
    +'<colgroup>'
    +'<col style="width:'+cw[0]+'px"><col style="width:'+cw[1]+'px"><col style="width:'+cw[2]+'px">'
    +'<col style="width:'+cw[3]+'px"><col style="width:'+cw[4]+'px"><col style="width:'+cw[5]+'px">'
    +'<col style="width:'+cw[6]+'px"><col style="width:'+cw[7]+'px"><col style="width:'+cw[8]+'px"><col style="width:'+cw[9]+'px">'
    +'</colgroup>'
    +'<thead><tr>'
    +'<th>Date</th><th>Track</th><th>Dis</th><th>Trp</th>'
    +'<th>Split</th><th>Bends</th><th>Fin</th><th>Remarks</th><th>Grade</th><th>CalTm</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody></table>'
    +'</div>';
}

/* filtro panel */
function injectFilterPanel(){
  var tb=document.getElementById('tb');if(!tb)return;
  var fp=document.createElement('div');fp.id='filter-panel';fp.style.display='none';
  fp.innerHTML=''
    +'<div class="fp-group"><span class="fp-label">Pista</span>'
    +'<select id="fp-pista"><option value="">Todas as pistas</option></select></div>'
    +'<div class="fp-divider"></div>'
    +'<div class="fp-group"><span class="fp-label">Hor\u00e1rio BR</span>'
    +'<div class="fp-hora-pair"><input type="time" id="fp-hora-min" title="De"><span class="fp-hora-sep">\u2013</span><input type="time" id="fp-hora-max" title="At\u00e9"></div></div>'
    +'<div class="fp-divider"></div>'
    +'<div class="fp-group"><span class="fp-label">Confian\u00e7a</span>'
    +'<select id="fp-conf"><option value="">Todas</option><option value="alta">Alta</option><option value="media">M\u00e9dia</option><option value="baixa">Baixa</option><option value="skip">Skip</option></select></div>'
    +'<div class="fp-divider"></div>'+'<div class="fp-group"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:rgba(255,255,255,.5);font-size:11px"><input type="checkbox" id="fp-skip" style="accent-color:#22c55e;cursor:pointer"> Descartadas</label></div>'+'<button id="btn-fp-clear" title="Limpar filtros">\u00d7</button>'
    +'<span id="fp-count"></span>';
  var table=tb.closest('table');
  if(table&&table.parentElement)table.parentElement.insertBefore(fp,table);
  else tb.parentElement.insertBefore(fp,tb);
  document.getElementById('fp-pista').addEventListener('change',function(){filterState.pista=this.value;renderTable();});
  var skipEl=document.getElementById('fp-skip');if(skipEl)skipEl.addEventListener('change',function(){filterState.mostrarSkip=this.checked;renderTable();});
  document.getElementById('fp-hora-min').addEventListener('change',function(){filterState.horaMin=this.value;renderTable();});
  document.getElementById('fp-hora-max').addEventListener('change',function(){filterState.horaMax=this.value;renderTable();});
  document.getElementById('fp-conf').addEventListener('change',function(){filterState.confianca=this.value;renderTable();});
  document.getElementById('btn-fp-clear').addEventListener('click',function(){
    filterState={pista:'',horaMin:'',horaMax:'',confianca:''};
    document.getElementById('fp-pista').value='';
    document.getElementById('fp-hora-min').value='';
    document.getElementById('fp-hora-max').value='';
    document.getElementById('fp-conf').value='';
    var skipCb=document.getElementById('fp-skip');if(skipCb)skipCb.checked=false;
    filterState.mostrarSkip=false;
    renderTable();
  });
}
function updateFilterPanel(){
  var fp=document.getElementById('filter-panel');if(!fp)return;
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  if(!avbs.length){fp.style.display='none';return;}
  fp.style.display='flex';
  var pistaSet={};avbs.forEach(function(r){var p=getPista(r.corrida||'');if(p)pistaSet[p]=1;});
  var pistas=Object.keys(pistaSet).sort();
  var sel=document.getElementById('fp-pista');
  if(sel){var cur=sel.value;sel.innerHTML='<option value="">Todas as pistas</option>';pistas.forEach(function(p){var o=document.createElement('option');o.value=p;o.textContent=p;if(p===cur)o.selected=true;sel.appendChild(o);});}
  var filtered=applyFiltersToAvbs(avbs);
  var countEl=document.getElementById('fp-count');
  if(countEl){if(filtered.length<avbs.length)countEl.textContent='Exibindo '+filtered.length+' de '+avbs.length;else countEl.textContent=avbs.length+' corridas';}
}

/* render tabela */
function renderTable(){
  var tb=document.getElementById('tb');
  if(!results.length){tb.innerHTML='<tr><td colspan="11"><div class="empty"><h3>Sem resultados</h3></div></td></tr>';document.getElementById('ab').style.display='none';updateFilterPanel();return;}
  var winMap={};
  results.forEach(function(r){if(r.tipo==='vencedor'&&r.nivel!=='skip'&&r.trapFav)winMap[(r.hora||'')+'_'+(r.corrida||'')]=r;});
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  avbs.sort(function(a,b){return ukHoraParaOrdem(a.hora)-ukHoraParaOrdem(b.hora);});
  var filtered=applyFiltersToAvbs(avbs);
  if(!filtered.length){
    tb.innerHTML='<tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida com os filtros selecionados</h3><p style="color:var(--mut);font-size:13px;margin-top:8px">Tente ampliar os filtros</p></div></td></tr>';
    document.getElementById('ab').style.display='flex';updateFilterPanel();return;
  }
  var rows='';
  filtered.forEach(function(r){
    var i=avbs.indexOf(r);
    var sk=r.nivel==='skip';
    var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':r.nivel==='baixa'?'bb':'bs';
    var bt=r.nivel==='alta'?'Alta':r.nivel==='media'?'Media':r.nivel==='baixa'?'Baixa':'Skip';
    var fc=r.pct>=65?'cfg':r.pct>=50?'cfa':'cfr';
    var tf=r.trapFav||0,tu=r.trapUnd||0,nf=r.nameFav||'',nu=r.nameUnd||'';
    var wd=winMap[(r.hora||'')+'_'+(r.corrida||'')];
    var wt=wd?'<div class="win-tag">&#127942; Back T'+wd.trapFav+' '+((wd.nameFav||'').split(' ')[0])+'</div>':'';
    var hh='<strong style="color:var(--grn)">'+(r.hora||'-')+'</strong><div class="hora-br">'+convertHora(r.hora)+'</div>';
    var top3=(function(){if(!r.top3)return'';var v=Array.isArray(r.top3)?r.top3.filter(function(x){return x>0;}).join('-'):r.top3;return v?'<div class="top3-tag" style="display:inline-flex;align-items:center;gap:4px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h2.5a1 1 0 0 1 1 1.2A4 4 0 0 1 17 9"/><path d="M7 5H4.5a1 1 0 0 0-1 1.2A4 4 0 0 0 7 9"/></svg> '+v+'</div>':'';}());
    var ch=sk?'':'<span class="badge '+bc+'">'+bt+'</span><br><span style="font-size:10px;color:var(--mut)">'+r.pct+'%</span><span class="cbar"><span class="cfill '+fc+'" style="width:'+r.pct+'%"></span></span>';
    var cap=r.needsCap?'<button class="cap-btn" data-fav="'+nf+'" data-und="'+nu+'">Cap</button>':'<span class="cap-ok">OK</span>';
    var rh=sk?'-':'<input type="text" placeholder="1" data-i="'+i+'" data-f="r1" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="2" data-i="'+i+'" data-f="r2" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="3" data-i="'+i+'" data-f="r3" style="width:50px">';
    var obsText=(r.obs||'-').replace(/CalTm/gi,'Tempo');
    var obsParts=obsText.split('\n');
    var obsHtml='<span style="font-size:10px;color:var(--mut)">'+obsParts[0]+'</span>'+(obsParts[1]?'<div style="font-size:11px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.06);font-style:italic">'+obsParts[1]+'</div>':'');
    var fn=function(n){return(n||'').split(' ')[0];};
    var perfilFavLabel=r.perfilFav?'<div style="font-size:9px;color:var(--mut);margin-top:2px">'+r.perfilFav+'</div>':'';
    var perfilUndLabel=r.perfilUnd?'<div style="font-size:9px;color:var(--mut);margin-top:2px">'+r.perfilUnd+'</div>':'';
    var shComPerfil=sk?'<span style="color:var(--mut)">Descartada</span>':
      '<div style="display:flex;align-items:flex-start;justify-content:center;gap:10px">'
        +'<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:60px">'
          +'<div class="trap-badge '+trapClass(tf)+'" style="width:28px;height:28px;font-size:13px">'+tf+'</div>'
          +'<div style="font-size:10px;font-weight:600;color:rgba(255,255,255,.85);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px">'+fn(nf)+'</div>'
          +(r.perfilFav?'<div style="font-size:9px;color:var(--mut);text-align:center">'+r.perfilFav+'</div>':'')
        +'</div>'
        +'<div style="font-size:10px;color:var(--mut);padding-top:8px">vs</div>'
        +'<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:60px">'
          +'<div class="trap-badge '+trapClass(tu)+'" style="width:28px;height:28px;font-size:13px">'+tu+'</div>'
          +'<div style="font-size:10px;font-weight:600;color:rgba(255,255,255,.85);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px">'+fn(nu)+'</div>'
          +(r.perfilUnd?'<div style="font-size:9px;color:var(--mut);text-align:center">'+r.perfilUnd+'</div>':'')
        +'</div>'
      +'</div>';
    var oddValHtml=sk?'-':'<div style="display:flex;flex-direction:column;gap:6px;align-items:center"><div style="display:flex;flex-direction:column;gap:2px;align-items:center"><span style="font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">Odd</span><input type="text" placeholder="-" value="'+(r.odd||'')+'" data-i="'+i+'" data-f="odd" style="width:52px;text-align:center"></div><div style="display:flex;align-items:center;justify-content:space-between;width:100%"><label style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--mut);cursor:pointer;white-space:nowrap"><input type="checkbox" data-i="'+i+'" data-f="avb_nao_aberto" style="cursor:pointer" '+(r.avbNaoAberto?'checked':'')+'> Não aberto</label><a onclick="openRelatorioModal(\''+r.hora+'|'+r.corrida+'\')" title="Relatório detalhado da análise" style="cursor:pointer;line-height:1;margin-left:auto"><img src="'+BASE+'/static/img/icone_relatorio.png" style="width:15px;height:15px;vertical-align:middle"></a><a onclick="openAllDogsModal(\''+r.hora+'|'+r.corrida+'\')" title="Ver corrida completa (6 galgos)" style="cursor:pointer;line-height:1"><img src="'+BASE+'/static/img/icone_pdf.png" style="width:15px;height:15px;vertical-align:middle"></a></div></div>';
    var valLink=sk?'':'<a class="val-link" onclick="openValModal(\''+r.hora+'|'+r.corrida+'\')">[ver historico]</a>';
    rows+='<tr class="row-avb'+(sk?' sk':'')+(isOldRaceCard(r)?' old-row':'')+'">'
      +'<td style="text-align:center;vertical-align:middle">'+hh+'</td>'
      +'<td style="vertical-align:middle"><div style="font-weight:700;font-size:12px">'+corridaDisplay(r)+'</div><div style="font-size:10px;color:var(--mut)">'+(r.dist||'')+'</div>'+top3+wt+'</td>'
      +'<td style="text-align:center;vertical-align:middle">'+shComPerfil+'<div style="margin-top:4px">'+valLink+'</div></td>'
      +'<td style="text-align:center;vertical-align:middle">'+ch+'</td>'
      +'<td style="font-size:11px;line-height:1.5;vertical-align:middle;padding-left:12px">'+obsHtml+'</td>'
      +'<td style="text-align:center;vertical-align:middle">'+oddValHtml+'</td>'
      +'<td style="text-align:center;vertical-align:middle">'+rh+'</td>'
      +'<td style="text-align:center;vertical-align:middle"><select data-i="'+i+'" data-f="hit" style="text-align:center"><option value="">-</option><option value="sim">Sim</option><option value="nao">Nao</option></select></td>'
      +'<td style="text-align:center;vertical-align:middle">'+cap+'</td>'
      +'</tr>';
  });
  tb.innerHTML=rows;
  document.getElementById('ab').style.display='flex';
  updCards();updateFilterPanel();
}

async function runChunk(files,caps){
  var fd=new FormData();
  files.forEach(function(f){fd.append('pdfs',new Blob([Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0))],{type:'application/pdf'}),f.name);});
  caps.forEach(function(f){fd.append('caps',new Blob([Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0))],{type:f.mime}),f.name);});
  var resp=await fetch(BASE+'/api/analyze',{method:'POST',body:fd});
  if(!resp.ok){var e=await resp.json();throw new Error(e.error||'Erro '+resp.status);}
  var reader=resp.body.getReader(),decoder=new TextDecoder(),buffer='',evtCount=0;
  while(true){
    var _r=await reader.read();if(_r.done)break;
    buffer+=decoder.decode(_r.value,{stream:true});
    var lines=buffer.split('\n');buffer=lines.pop();
    for(var li=0;li<lines.length;li++){
      var line=lines[li].trim();if(!line.startsWith('data:'))continue;
      try{
        var evt=JSON.parse(line.slice(5).trim());evtCount++;
        if(evt.type==='races'){results=results.concat(evt.races||[]);renderTable();saveSessionState();updCards();}
        else if(evt.type==='limitReached'){alert('Limite de analises atingido!');return false;}
        else if(evt.type==='error'){throw new Error(evt.error);}
      }catch(pe){console.warn('[runChunk] parse err:',pe.message);}
    }
  }
  return true;
}

async function runAnalysis(){
  // Ponto 3: verifica se já existe sessão do dia ao usar pasta automática
  if(!raceFiles.length){
    var now=new Date();
    var todayLabel=String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
    var sessionName='Races '+todayLabel;
    try{
      var sr=await fetch(BASE+'/api/sessions');
      var sessions=await sr.json();
      var existing=sessions.find(function(s){return s.name===sessionName;});
      if(existing){
        showOverwriteConfirmModal(sessionName, existing.id);
        return;
      }
    }catch(e){}
  }
  await proceedAnalysis();
}

// Mostra o modal perguntando se quer sobrescrever a sessao de hoje ja existente
// (reaproveita o mesmo modal ps-* usado no fluxo de salvar sessao manual)
function showOverwriteConfirmModal(sessionName, existingId){
  var modal=document.getElementById('ps-modal');
  if(!modal){
    // Fallback, caso o modal nao tenha sido injetado por algum motivo
    if(confirm('Já existe uma sessão carregada com o mesmo nome para hoje ("'+sessionName+'"). Deseja sobrescrever?')){
      overwriteAndAnalyze(existingId);
    }
    return;
  }
  document.getElementById('ps-icon').textContent='\u26A0\uFE0F';
  document.getElementById('ps-title').textContent='Sessão já existe';
  document.getElementById('ps-sub').innerHTML='Já existe uma sessão carregada com o mesmo nome para hoje: <strong style="color:#fff">"'+sessionName+'"</strong>.<br>Deseja sobrescrever? A sessão atual será apagada e uma nova análise será feita.';
  document.getElementById('ps-inp').style.display='none';
  var btns=document.getElementById('ps-btns');
  btns.innerHTML='';
  var cancel=document.createElement('button');cancel.className='ps-btn-sec';cancel.textContent='Cancelar';cancel.onclick=closePsModal;btns.appendChild(cancel);
  var yes=document.createElement('button');yes.className='ps-btn-warn';yes.textContent='Sim, sobrescrever';yes.onclick=function(){overwriteAndAnalyze(existingId);};btns.appendChild(yes);
  modal.classList.add('open');
}

// Guarda temporariamente os dados de resultado/odd/valor/flag da sessao
// antiga entre o momento em que o usuario confirma a sobrescrita e o
// momento em que a nova sessao e salva — pra nao perder o que o robo de
// resultados e/ou o proprio usuario ja tinham preenchido.
var preserveDataMap = null;

async function overwriteAndAnalyze(existingId){
  closePsModal();
  preserveDataMap = null;
  try {
    var resp = await fetch(BASE+'/api/session/'+existingId+'/races');
    var data = await resp.json();
    if (data && Array.isArray(data.races)) {
      preserveDataMap = {};
      data.races.forEach(function(r){
        var key = r.hora+'|'+r.corrida;
        preserveDataMap[key] = {
          odd: r.odd, valor: r.valor,
          resultado_1: r.resultado_1, resultado_2: r.resultado_2, resultado_3: r.resultado_3,
          bateu: r.bateu, avb_nao_aberto: r.avb_nao_aberto, video_url: r.video_url
        };
      });
    }
  } catch(e) { console.error('[overwriteAndAnalyze] erro ao carregar dados da sessao anterior', e); }
  // Nao deleta aqui na frente — se a nova analise nao encontrar PDFs/AvBs
  // por algum motivo, a sessao antiga precisa continuar existindo. O
  // autoSaveSession() (chamado no final da analise) ja faz delete-e-recria
  // com o mesmo nome com seguranca, só quando ha dados novos de fato — e
  // agora tambem reaplica os dados preservados acima antes de salvar.
  await proceedAnalysis();
}

async function proceedAnalysis(){
  var usandoPasta=false;
  if(!raceFiles.length){
    setSt('Verificando corridas disponíveis...');
    try{
      var r=await fetch(BASE+'/api/pdfs/hoje');
      var d=await r.json();
      if(!d.count){
        setSt('');
        results = [];
        focusRaceIdx = -1;
        saveSessionState();
        showAllExpiredMsg();
        return;
      }
      var dateParts=(d.date||'').split('-');
      var dateLabel=dateParts.length===3?dateParts[2]+'/'+dateParts[1]:d.date;
      setSt(d.count+' corridas do dia '+dateLabel+' encontradas. Iniciando análise...');
      usandoPasta=true;
    }catch(e){
      setSt('');
      results = [];
      focusRaceIdx = -1;
      saveSessionState();
      showAllExpiredMsg();
      return;
    }
  }
  var _btngo=document.getElementById('btngo'); if(_btngo){_btngo.disabled=true;_btngo.innerHTML='<span class="spinner"></span>Analisando...';}
  try{document.querySelectorAll('nav a, .nl').forEach(function(a){a.style.pointerEvents='none';a.style.opacity='0.3';});}catch(e){}
  prog(5,'Preparando...');results=[];filterState={pista:'',horaMin:'',horaMax:'',confianca:'',mostrarSkip:false};
  try{
    if(usandoPasta){
      // Análise da pasta — chama sem arquivos, servidor lê da pasta
      prog(10,'Lendo PDFs da pasta...');
      var ok=await runChunk([],[]);
      if(ok===false){}
    } else {
      var CHUNK=30,chunks=[];
      for(var ci=0;ci<raceFiles.length;ci+=CHUNK)chunks.push(raceFiles.slice(ci,ci+CHUNK));
      for(var chunkIdx=0;chunkIdx<chunks.length;chunkIdx++){
        prog(Math.round(5+(chunkIdx/chunks.length)*90),'Grupo '+(chunkIdx+1)+'/'+chunks.length+' ('+chunks[chunkIdx].length+' PDFs)...');
        var ok2=await runChunk(chunks[chunkIdx],chunkIdx===0?capFiles:[]);
        if(ok2===false)break;
      }
    }
    var avbs=results.filter(function(r){return r.nivel!=='skip';}).length;
    setSt('Concluido: '+avbs+' AvBs de '+results.length+' corridas');
    prog(100,'');setTimeout(function(){document.getElementById('pw').style.display='none';},1200);
    setTimeout(function(){enterFocusMode();},800);

    // Limpa a lista de PDFs carregados assim que a analise termina — tanto
    // pra corridas de hoje quanto antigas, nao precisa esperar a escolha de
    // salvar/nao salvar.
    clearUploadedPdfList();

    // Avisa se alguma das corridas carregadas for de data anterior a hoje
    var avbList = results.filter(function(r){return r.nivel!=='skip'&&r.trapFav>0;});
    var oldDates = Array.from(new Set(avbList.filter(function(r){return isOldRaceCard(r);}).map(function(r){return r.dataCard;})));
    if (oldDates.length) {
      var datesLabel = oldDates.map(function(d){var p=d.split('-');return p[2]+'/'+p[1]+'/'+p[0];}).join(', ');
      setTimeout(function(){
        showToast('\u26A0\uFE0F Corridas de data anterior a hoje ('+datesLabel+') — disponíveis só para consulta na aba Analisar, não serão salvas no Histórico.', false);
      }, 900);
    }

    // Corridas de hoje que ja aconteceram (nao antigas — so ja passou o
    // horario) tambem nao devem ser salvas nem oferecer a opcao de salvar.
    var allExpiredToday = avbList.length>0 && !oldDates.length && !avbList.some(isUpcoming);
    if (allExpiredToday) {
      setTimeout(function(){
        showToast('\u23F1\uFE0F As corridas carregadas já foram realizadas hoje. Selecione corridas ainda vigentes.', false);
      }, 900);
    }

    // Corrida antiga ou ja realizada hoje NUNCA e salva no Historico nem
    // oferece a opcao de salvar — serve so como referencia/estudo na aba
    // Analisar. Nenhuma configuracao de tempo/refresh/auto-save se aplica.
    if (oldDates.length || allExpiredToday) {
      // nao salva, nao pergunta — fica so disponivel na aba Analisar
    } else if(usandoPasta){
      // Fluxo automático — salva direto sem popup
      setTimeout(function(){autoSaveSession(autoDateLabel);},1600);
    } else {
      // Upload manual — pergunta se quer salvar
      setTimeout(function(){openPsModal();},1600);
    }
  }catch(ex){setSt('Erro: '+ex.message);alert('Erro: '+ex.message);document.getElementById('pw').style.display='none';}
  var _btngoR=document.getElementById('btngo'); if(_btngoR){_btngoR.disabled=false;_btngoR.innerHTML='&#9889; Automaticamente';}
  try{document.querySelectorAll('nav a, .nl').forEach(function(a){a.style.pointerEvents='';a.style.opacity='';});}catch(e){}
}

document.addEventListener('DOMContentLoaded',async function(){
  injectStyles();
  injectPostSaveModal();
  injectSaveModal();
  injectValModal();
  injectFilterPanel();

  // Alerta em segundo plano: retoma o audio e pede permissao de notificacao no
  // primeiro gesto (exigencia dos navegadores). E para de piscar o titulo assim
  // que voce volta pra aba.
  ['click','keydown','touchstart'].forEach(function(ev){ document.addEventListener(ev, initAlertaUserGesto); });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) pararFlashTitulo(); });

  // Entra imediatamente no foco com loading — ANTES de qualquer await
  var mainEl = document.getElementById('main-layout');
  if (mainEl) mainEl.classList.add('focus-mode');
  var focusColEl = document.getElementById('focus-col');
  if (focusColEl) focusColEl.innerHTML =
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--mut);text-align:center">'
    +'<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(34,197,94,.6);text-transform:uppercase">Greyhound Factory</div>'
    +'<div style="width:40px;height:40px;border:3px solid rgba(34,197,94,.2);border-top-color:#22c55e;border-radius:50%;animation:sp .8s linear infinite"></div>'
    +'<div style="font-size:15px;font-weight:700;color:var(--mut2)">Carregando corridas do dia...</div>'
    +'</div>';

  await loadSystemConfig();
  loadAcertosResumo();
  if(restoreSessionState()){
    updCards();
    setSt('Restaurado: '+results.filter(function(r){return r.nivel!=='skip';}).length+' AvBs');
    enterFocusMode();
    // Sincroniza com o servidor na hora, mesmo restaurando do cache — sem
    // isso, qualquer mudanca feita em OUTRA tela (ex: marcar "atrasada" no
    // Historico) enquanto essa aba ficou fechada/em segundo plano so
    // apareceria depois do proximo ciclo automatico (ate 1 min de atraso).
    // Achado 14/07/2026.
    syncFromServer();
  } else {
    setTimeout(autoCheckAndAnalyze, 100);
  }

  document.getElementById('race-input').addEventListener('change',async function(){
    if (!this.files.length) return;
    for(var i=0;i<this.files.length;i++){var file=this.files[i],id='f'+Date.now()+i;addFI(file.name,id);try{var b64=await readB64(file);raceFiles.push({name:file.name,b64:b64,id:id,mime:'application/pdf'});updFI(id,true);}catch(e){updFI(id,false);}}updCards();
    // Dispara a analise direto, sem precisar clicar em outro botao
    runAnalysis();
  });
  document.getElementById('rz').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
  document.getElementById('rz').addEventListener('dragleave',function(){this.classList.remove('drag');});
  document.getElementById('rz').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag');var inp=document.getElementById('race-input');inp.files=e.dataTransfer.files;inp.dispatchEvent(new Event('change'));});
  document.getElementById('rlist').addEventListener('click',function(e){if(e.target.classList.contains('fi-rm')){var id=e.target.getAttribute('data-id');raceFiles=raceFiles.filter(function(f){return f.id!==id;});var el=document.getElementById('fi-'+id);if(el)el.remove();updCards();}});
  var _bgClick=document.getElementById('btngo'); if(_bgClick)_bgClick.addEventListener('click',runAnalysis);
  document.getElementById('tb').addEventListener('input',function(e){var el=e.target,i=parseInt(el.getAttribute('data-i')),f=el.getAttribute('data-f');if(!isNaN(i)&&f&&results[i]){saveRaceField(i,f,el.value);}});
  document.getElementById('tb').addEventListener('change',function(e){var el=e.target,i=parseInt(el.getAttribute('data-i')),f=el.getAttribute('data-f');if(!isNaN(i)&&f&&results[i]){var val=el.type==='checkbox'?(el.checked?1:0):el.value;saveRaceField(i,f,val);if(f==='hit'){el.style.color=el.value==='sim'?'var(--grn)':el.value==='nao'?'var(--red)':'var(--txt)';}}});
  document.getElementById('tb').addEventListener('click',function(e){if(e.target.classList.contains('cap-btn')){document.getElementById('cm-body').textContent='Carregue capivara de '+e.target.getAttribute('data-fav');document.getElementById('cap-modal-list').innerHTML='';document.getElementById('cap-st').style.display='none';document.getElementById('btn-cap-ok').disabled=true;capModalFilesList=[];document.getElementById('cap-modal').classList.add('open');}});
  document.getElementById('cap-modal-inp').addEventListener('change',async function(){for(var i=0;i<this.files.length;i++){var file=this.files[i],id='cm'+Date.now()+i;try{var b64=await readB64(file);var isImg=/\.(jpg|jpeg|png|webp)$/i.test(file.name);capModalFilesList.push({name:file.name,b64:b64,id:id,mime:isImg?file.type:'application/pdf',isImg:isImg});var d=document.createElement('div');d.className='fi';d.innerHTML='<span class="fi-name">'+file.name+'</span><span class="fi-st fi-ok">OK</span>';document.getElementById('cap-modal-list').appendChild(d);document.getElementById('btn-cap-ok').disabled=false;}catch(e){alert('Erro ao ler.');}}});
  document.getElementById('btn-cap-cancel').addEventListener('click',function(){document.getElementById('cap-modal').classList.remove('open');});
  document.addEventListener('paste',async function(e){
    if(!document.getElementById('cap-modal').classList.contains('open'))return;
    var items=(e.clipboardData||e.originalEvent.clipboardData).items;
    for(var i=0;i<items.length;i++){if(items[i].type.indexOf('image')!==-1){var file=items[i].getAsFile();var id='cm'+Date.now();try{var b64=await readB64(file);capModalFilesList.push({name:'capivara-colada.png',b64:b64,id:id,mime:'image/png',isImg:true});var d=document.createElement('div');d.className='fi';d.innerHTML='<span class="fi-name">&#128247; Imagem colada</span><span class="fi-st fi-ok">OK</span>';document.getElementById('cap-modal-list').appendChild(d);var st=document.getElementById('cap-st');st.className='cap-st ok';st.textContent='Imagem colada com sucesso!';st.style.display='block';document.getElementById('btn-cap-ok').disabled=false;}catch(err){console.error('Erro ao colar:',err);}}}
  });
  document.getElementById('btn-cap-ok').addEventListener('click',async function(){if(!capModalFilesList.length)return;capFiles=capModalFilesList.slice();document.getElementById('cap-modal').classList.remove('open');await runAnalysis();});
  document.getElementById('btn-pdf-ready-ok').addEventListener('click',function(){document.getElementById('pdf-ready-modal').classList.remove('open');});
  document.getElementById('btn-exp').addEventListener('click',function(){
    var h='Hora,HoraBR,Corrida,Dist,TrapFav,Favorito,TrapUnd,Underdog,Conf,Nivel,PerfilFav,PerfilUnd,Obs,Odd,Valor,1o,2o,3o,Bateu';
    var avbs=results.filter(function(r){return r.tipo==='avb';});
    var rows=avbs.map(function(r){return[r.hora,convertHora(r.hora),r.corrida,r.dist,r.trapFav||'',r.nameFav||'',r.trapUnd||'',r.nameUnd||'',r.pct,r.nivel,r.perfilFav||'',r.perfilUnd||'',r.obs||'',r.odd||'',r.valor||'',r.r1||'',r.r2||'',r.r3||'',r.hit||''].join(',');});
    var b=new Blob([[h].concat(rows).join(String.fromCharCode(10))],{type:'text/csv'});
    var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='greyhound_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
  });

  // Mantem "Historico do dia" e "Sessoes recentes" sempre atualizados, mesmo
  // se a aba ficar aberta e o robo salvar a sessao de hoje so depois
  refreshSidebarSessions();
  setInterval(refreshSidebarSessions, 90000);

  // Re-le a config do sistema periodicamente pra que mudancas salvas em
  // Configuracoes (ex: "Alarme para filtro selecionado", som/tempo de alerta)
  // passem a valer nesta tela sem precisar recarregar a pagina.
  setInterval(loadSystemConfig, 30000);
});