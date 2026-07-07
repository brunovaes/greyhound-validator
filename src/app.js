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
    '.ghf-toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);padding:13px 28px;border-radius:11px;font-size:14px;font-weight:600;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap;}',
    '.ghf-toast.t-ok{background:linear-gradient(135deg,#00e676,#00c853);color:#000;}',
    '.ghf-toast.t-err{background:#e53935;color:#fff;}',
    '.ghf-toast.t-show{opacity:1;}',
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
    '.rc-old{background:rgba(239,68,68,.12)!important;border-left:3px solid #ef4444;}',
    '.rc-old-badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.5px;color:#fff;background:#ef4444;padding:1px 6px;border-radius:4px;margin-bottom:3px;}',
    '.fp-old-banner{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:#ef4444;font-size:12px;font-weight:700;text-align:center;padding:8px 12px;border-radius:8px;margin-bottom:10px;letter-spacing:.3px;}',
    '.old-row{background:rgba(239,68,68,.08)!important;}',
    '.old-row td{border-color:rgba(239,68,68,.15)!important;}'
  ].join('');
  var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
}

var RACAS_EM_TELA = 6;
var AUTO_REFRESH_MIN = 1;

async function loadSystemConfig() {
  try {
    var r = await fetch(BASE+'/api/config');
    var c = await r.json();
    if (c.racas_em_tela) RACAS_EM_TELA = parseInt(c.racas_em_tela);
    if (c.auto_refresh_min) AUTO_REFRESH_MIN = parseInt(c.auto_refresh_min);
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
                nameFav:r.name_fav||'', trapUnd:r.trap_und||0, nameUnd:r.name_und||'',
                pct:r.pct||0, perfilFav:r.perfil_fav||'', perfilUnd:r.perfil_und||'',
                obs:r.obs||'', odd:r.odd||'', valor:r.valor||'', top3:r.top3||'',
                avbNaoAberto: !!r.avb_nao_aberto,
                histAll: r.hist_all?JSON.parse(r.hist_all):[],
                dataCard: r.data_card||null,
                histFav:r.hist_fav?JSON.parse(r.hist_fav):[], histUnd:r.hist_und?JSON.parse(r.hist_und):[],
                id:r.id
              });
            });
            updCards();
            setSt('Sessão '+sessionName+' carregada — '+results.filter(function(r){return r.nivel!=='skip';}).length+' AvBs');
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
  var pelagens = ['branco', 'caramelo', 'preto'];
  var seed = 0;
  for (var i = 0; i < (corrida||'').length; i++) seed += corrida.charCodeAt(i);
  seed += (trap||1) * 13;
  var p = pelagens[((seed % 3) + 3) % 3];
  return BASE + '/static/img/dogs/Trap' + (trap||1) + '_' + p + '.png';
}

function getRaceClass(corrida){var m=(corrida||'').trim().match(/([A-Z]d+)$/i);return m?m[1].toUpperCase():null;}
function getHistByClass(hist,raceClass){if(!raceClass)return hist||[];return(hist||[]).filter(function(h){return(h.classe||'').toUpperCase()===raceClass.toUpperCase();});}
function mediaTempoByClass(hist,raceClass){var f=getHistByClass(hist,raceClass).filter(function(h){return h.caltm&&parseFloat(h.caltm)>0;});if(!f.length)return null;return f.reduce(function(a,h){return a+parseFloat(h.caltm);},0)/f.length;}
function podiosByClass(hist,raceClass){return getHistByClass(hist,raceClass).filter(function(h){return h.pos&&parseInt(h.pos)<=3;}).length;}
function arranqueByClass(hist,raceClass){var f=getHistByClass(hist,raceClass).filter(function(h){return h.split&&parseFloat(h.split)>0;});if(!f.length)return null;return f.reduce(function(a,h){return a+parseFloat(h.split);},0)/f.length;}
function melhorBRT(hist){var f=(hist||[]).filter(function(h){return h.caltm&&parseFloat(h.caltm)>0;});if(!f.length)return{val:null,classe:''};f.sort(function(a,b){return parseFloat(a.caltm)-parseFloat(b.caltm);});return{val:parseFloat(f[0].caltm).toFixed(2),classe:f[0].classe||''};}
function categoriaInfo(hist,raceClass){var rc=(raceClass||'').toUpperCase();var rcNum=parseInt((rc.match(/d+/)||['99'])[0]);if(!hist||!hist.length)return{label:rc||'N/A',ascending:false,fillPct:Math.max(0,(12-rcNum)/11)};var recent=hist[0].classe||rc;var recentNum=parseInt((recent.match(/d+/)||['99'])[0]);var ascending=rcNum<recentNum;return{label:rc+(ascending?'↑':''),ascending:ascending,fillPct:Math.max(0,(12-rcNum)/11)};}
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
  var hbr = r.hora_br || convertHora(r.hora||'');
  if (!hbr) return true;
  var now = new Date();
  var nowMin = now.getHours()*60 + now.getMinutes();
  var parts = hbr.split(':');
  var raceMin = parseInt(parts[0]||0)*60 + parseInt(parts[1]||0);
  return raceMin >= nowMin;
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
  return isOldRaceCard(r) || isUpcoming(r);
}

function isDayClosed(avbs) {
  // Encerrado quando nao sobra nenhuma corrida futura na sessao carregada
  // (dinamico — nao depende de um horario fixo de corte).
  return !avbs.some(shouldShowRace);
}

var focusRefreshInterval = null;
var alertCheckInterval = null;

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
    if (isOldRaceCard(r)) { el.classList.remove('rc-alert'); return; } // corrida antiga nunca pisca/soa
    var mins = minutesToRace(r);
    var shouldAlert = mins !== null && mins >= 0 && mins <= 3;
    if (shouldAlert) {
      el.classList.add('rc-alert');
      var key = raceAlertKey(r);
      if (!alertedRaces[key]) {
        alertedRaces[key] = true;
        playBellSound();
      }
    } else {
      el.classList.remove('rc-alert');
    }
  });
}

function showDayEndMsg() {
  var focusCol = document.getElementById('focus-col');
  if (focusCol) focusCol.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--mut);text-align:center;padding:40px"><div style="font-size:64px">&#127937;</div><div style="font-size:18px;font-weight:700;color:var(--mut2)">Ciclo do dia encerrado</div><div style="font-size:13px">As corridas de hoje se encerraram e voltaremos amanhã</div></div>';
  var col = document.getElementById('race-list-col');
  if (col) col.innerHTML = '';
  if (focusRefreshInterval) { clearInterval(focusRefreshInterval); focusRefreshInterval = null; }
  if (alertCheckInterval) { clearInterval(alertCheckInterval); alertCheckInterval = null; }
}

function refreshFocusMode() {
  var avbs = results.filter(function(r){return r.nivel!=='skip'&&r.trapFav>0;});
  avbs.sort(function(a,b){return ukHoraParaOrdem(a.hora)-ukHoraParaOrdem(b.hora);});

  // Ciclo encerrado quando nao sobra nenhuma corrida futura na sessao
  if (isDayClosed(avbs)) { showDayEndMsg(); return; }

  // Sempre mostra as proximas N corridas (RACAS_EM_TELA), nunca corridas ja
  // passadas — exceto corridas antigas (data anterior a hoje), que ficam
  // sempre visiveis independente do horario.
  var toShow = avbs.filter(shouldShowRace).slice(0, RACAS_EM_TELA);

  renderRaceListPanel(toShow);

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
      showDayEndMsg();
    }
  }
}

function enterFocusMode() {
  var avbs = results.filter(function(r){return r.nivel!=='skip'&&r.trapFav>0;});
  avbs.sort(function(a,b){return ukHoraParaOrdem(a.hora)-ukHoraParaOrdem(b.hora);});
  if (!avbs.length) return;

  // Ciclo encerrado quando nao sobra nenhuma corrida futura na sessao
  if (isDayClosed(avbs)) {
    document.getElementById('main-layout').classList.add('focus-mode');
    showDayEndMsg();
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

  // Checagem de alerta de proximidade (independente, mais frequente)
  if (alertCheckInterval) clearInterval(alertCheckInterval);
  alertCheckInterval = setInterval(checkRaceAlerts, 15000);
  checkRaceAlerts(); // roda uma vez na hora
}

function renderFocusPanel(r, idx) {
  var focusCol = document.getElementById('focus-col');
  if (!focusCol) return;
  focusRaceIdx = idx;

  var tf = r.trapFav || 1, tu = r.trapUnd || 2;
  var nf = r.nameFav || 'Favorito', nu = r.nameUnd || 'Underdog';
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

  var obs = (r.obs||'').replace(/CalTm/gi,'Tempo');
  var oldBanner = isOldRaceCard(r) ? '<div class="fp-old-banner">&#9888; Esta corrida é de uma data anterior a hoje ('+r.dataCard.split('-').reverse().join('/')+') — apenas para consulta/estudo, não é uma corrida ao vivo.</div>' : '';

  focusCol.innerHTML =
    oldBanner
    + '<div class="fp-hdr">'
    + '<div><div class="fp-race-title">'+(r.corrida||'-')+'</div>'
    + '<div class="fp-race-meta">'+(r.dist||'')+'m &middot; '+hbr+' BR &middot; <span class="badge '+confClass+'">'+conf+'% '+nivel+'</span></div></div>'
    + '</div>'
    + '<div class="fp-arena">'
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
    + '<button onclick="openValModal(\''+r.hora+'|'+r.corrida+'\')" style="margin-top:8px;font-size:11px;font-weight:700;color:#fff;background:#161b27;border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:5px 12px;cursor:pointer;white-space:nowrap;letter-spacing:.3px">Analisar disputa</button>'
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
    // Odd / Valor / AvB nao aberto
    + '<div class="fp-inputs-row">'
    + '<div class="fp-inp-group">Odd <input type="text" id="fp-odd" placeholder="-" value="'+(r.odd||'')+'" oninput="updateFocusField(\'odd\',this.value)"></div>'
    + '<div class="fp-inp-group">Valor R$ <input type="text" id="fp-val" placeholder="-" value="'+(r.valor||'')+'" oninput="updateFocusField(\'valor\',this.value)"></div>'
    + '<div class="fp-inp-group fp-check-group" style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:8px"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--mut2);white-space:nowrap"><input type="checkbox" id="fp-avb-nao-aberto" style="cursor:pointer" '+(r.avbNaoAberto?'checked':'')+' onchange="updateFocusField(\'avb_nao_aberto\',this.checked?1:0)"> AvB não aberto</label>'
    + '<a onclick="openAllDogsModal(\''+r.hora+'|'+r.corrida+'\')" title="Ver corrida completa (6 galgos)" style="cursor:pointer;font-size:16px;line-height:1;margin-left:auto">&#128196;</a></div>'
    + '</div>'
    + (obs ? '<div class="fp-obs">'+obs+'</div>' : '');
}

// Nomes de campo usados no front (results[i]) as vezes diferem da coluna no
// banco (ex: r1/r2/r3/hit -> resultado_1/resultado_2/resultado_3/bateu).
var FIELD_DB_MAP = { r1:'resultado_1', r2:'resultado_2', r3:'resultado_3', hit:'bateu' };

// Atualiza um campo da corrida em memoria (sessionStorage) e, se a corrida ja
// existe no banco (tem id — ou seja, a sessao ja foi salva no Historico),
// persiste na hora via PUT /api/race/:id. Assim Odd, Valor e a flag "AvB nao
// aberto" ficam sempre sincronizados com o Historico, sem precisar reanalisar.
function saveRaceField(idx, field, value) {
  if (idx < 0 || !results[idx]) return;
  var localField = field === 'avb_nao_aberto' ? 'avbNaoAberto' : field;
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

function updateFocusField(field, value) {
  saveRaceField(focusRaceIdx, field, value);
}

// Alerta de proximidade da corrida (3 min antes): som de sino + piscar o card.
// Sino gerado via Web Audio API (sem precisar de arquivo de audio externo).
var alertedRaces = {};

function playBellSound() {
  try {
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
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
    tone(1046.5, 0, 0.25);   // C6
    tone(1318.5, 0.15, 0.35); // E6
  } catch(e) { console.error('[playBellSound] erro', e); }
}

function raceAlertKey(r) {
  return (r.hora||'') + '|' + (r.corrida||'');
}

function renderRaceListPanel(avbs) {
  var col = document.getElementById('race-list-col');
  if (!col) return;
  col.innerHTML = '<div style="padding:8px 12px;border-bottom:1px solid var(--bdr2);display:flex;align-items:center;justify-content:space-between;background:var(--sur2)">'
    + '<span style="font-size:10px;color:var(--mut2);text-transform:uppercase;letter-spacing:.5px;font-weight:700">Próximas</span>'
    + '<button onclick="refreshFocusMode()" style="font-size:11px;background:none;border:none;color:var(--grn);cursor:pointer;padding:0">&#8635; Atualizar</button>'
    + '</div>';
  var first = true;
  var tc = ['','t1','t2','t3','t4','t5','t6'];
  avbs.forEach(function(r, i) {
    var hbr = r.hora_br || convertHora(r.hora||'');
    var rIdx = results.indexOf(r);
    var div = document.createElement('div');
    var isOld = isOldRaceCard(r);
    var mins = minutesToRace(r);
    var isAlerting = !isOld && mins !== null && mins >= 0 && mins <= 3;
    div.className = 'rc' + (first ? ' rc-active' : '') + (isAlerting ? ' rc-alert' : '') + (isOld ? ' rc-old' : '');
    if (isAlerting) {
      var key = raceAlertKey(r);
      if (!alertedRaces[key]) {
        alertedRaces[key] = true;
        playBellSound();
      }
    }
    div.setAttribute('data-idx', rIdx);
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';
    if (first) focusRaceIdx = rIdx;
    var top3Val = r.top3 ? (Array.isArray(r.top3) ? r.top3.filter(function(x){return x>0;}).join('-') : r.top3) : '';
    var top3Html = top3Val ? '<div style="text-align:center;margin-top:3px"><span class="top3-tag" style="font-size:9px;padding:1px 5px">&#127942; '+top3Val+'</span></div>' : '';
    div.innerHTML += '<div style="flex:1;min-width:0">'
      + (first ? '<div class="rc-next-badge">PRÓXIMA</div>' : '')
      + (isOld ? '<div class="rc-old-badge">CORRIDA ANTIGA</div>' : '')
      + '<div class="rc-time">'+hbr+'</div>'
      + '<div class="rc-name">'+(r.corrida||'-')+'</div>'
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
function showToast(msg,ok){var t=document.getElementById('ghf-toast');t.textContent=msg;t.className='ghf-toast '+(ok?'t-ok':'t-err');requestAnimationFrame(function(){t.classList.add('t-show');});setTimeout(function(){t.classList.remove('t-show');},2600);}
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
.val-tbl{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;font-family:sans-serif}
.val-tbl thead tr{border-bottom:1px solid rgba(255,255,255,.08)}
.val-tbl th{font-size:12px;font-weight:600;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.4px;padding:5px 4px;text-align:center;white-space:nowrap;font-family:sans-serif}
.val-tbl td{padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.04);color:rgba(255,255,255,.78);vertical-align:middle;text-align:center;font-family:sans-serif;font-size:12px}
.val-tbl tr:last-child td{border-bottom:none}
.val-tbl tr:hover td{background:rgba(255,255,255,.025)}
.val-td-date{color:rgba(255,255,255,.6);font-size:12px;text-align:left;font-family:sans-serif}
.val-td-track{color:rgba(255,255,255,.7);font-size:12px;text-align:center;font-family:sans-serif}
.val-td-muted{color:rgba(255,255,255,.4);font-size:12px;text-align:center;font-family:sans-serif}
.val-td-bends{font-family:sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,.85);text-align:center}
.val-td-rem{color:rgba(255,255,255,.45);font-size:11px;text-align:left;font-family:sans-serif;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.val-badge-grade{display:inline-block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 4px;font-size:12px;color:rgba(255,255,255,.55);font-family:sans-serif}
.val-td-caltm{color:#60a5fa;font-weight:700;font-size:12px;text-align:center;font-family:sans-serif}
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
  document.getElementById('val-title').textContent='Corrida completa — '+(r.corrida||'');
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
    var top3=(function(){if(!r.top3)return'';var v=Array.isArray(r.top3)?r.top3.filter(function(x){return x>0;}).join('-'):r.top3;return v?'<div class="top3-tag">&#127942; '+v+'</div>':'';}());
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
    var oddValHtml=sk?'-':'<div style="display:flex;flex-direction:column;gap:6px;align-items:center"><div style="display:flex;flex-direction:column;gap:2px;align-items:center"><span style="font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">Odd</span><input type="text" placeholder="-" value="'+(r.odd||'')+'" data-i="'+i+'" data-f="odd" style="width:52px;text-align:center"></div><div style="display:flex;flex-direction:column;gap:2px;align-items:center"><span style="font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">Valor R$</span><input type="text" placeholder="0" value="'+(r.valor||'')+'" data-i="'+i+'" data-f="valor" style="width:52px;text-align:center"></div><div style="display:flex;align-items:center;justify-content:space-between;width:100%"><label style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--mut);cursor:pointer;white-space:nowrap"><input type="checkbox" data-i="'+i+'" data-f="avb_nao_aberto" style="cursor:pointer" '+(r.avbNaoAberto?'checked':'')+'> Não aberto</label><a onclick="openAllDogsModal(\''+r.hora+'|'+r.corrida+'\')" title="Ver corrida completa (6 galgos)" style="cursor:pointer;font-size:13px;line-height:1;margin-left:auto">&#128196;</a></div></div>';
    var valLink=sk?'':'<a class="val-link" onclick="openValModal(\''+r.hora+'|'+r.corrida+'\')">[ver historico]</a>';
    rows+='<tr class="row-avb'+(sk?' sk':'')+(isOldRaceCard(r)?' old-row':'')+'">'
      +'<td style="text-align:center;vertical-align:middle">'+hh+'</td>'
      +'<td style="vertical-align:middle"><div style="font-weight:700;font-size:12px">'+(r.corrida||'-')+'</div><div style="font-size:10px;color:var(--mut)">'+(r.dist||'')+'</div>'+top3+wt+'</td>'
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
      if(!d.count){setSt('Ainda não existe corridas disponíveis para serem carregadas.');return;}
      var dateParts=(d.date||'').split('-');
      var dateLabel=dateParts.length===3?dateParts[2]+'/'+dateParts[1]:d.date;
      setSt(d.count+' corridas do dia '+dateLabel+' encontradas. Iniciando análise...');
      usandoPasta=true;
    }catch(e){setSt('Ainda não existe corridas disponíveis para serem carregadas.');return;}
  }
  document.getElementById('btngo').disabled=true;
  document.getElementById('btngo').innerHTML='<span class="spinner"></span>Analisando...';
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
    var oldDates = Array.from(new Set(results.filter(function(r){return isOldRaceCard(r);}).map(function(r){return r.dataCard;})));
    if (oldDates.length) {
      var datesLabel = oldDates.map(function(d){var p=d.split('-');return p[2]+'/'+p[1]+'/'+p[0];}).join(', ');
      setTimeout(function(){
        showToast('\u26A0\uFE0F Corridas de data anterior a hoje ('+datesLabel+') — disponíveis só para consulta na aba Analisar, não serão salvas no Histórico.', false);
      }, 900);
    }

    // Corrida antiga NUNCA e salva no Historico nem oferece a opcao de salvar
    // — serve so como referencia/estudo na aba Analisar. Nenhuma configuracao
    // de tempo/refresh/auto-save se aplica a essas corridas.
    if (oldDates.length) {
      // nao salva, nao pergunta — fica so disponivel na aba Analisar
    } else if(usandoPasta){
      // Fluxo automático — salva direto sem popup
      setTimeout(function(){autoSaveSession(autoDateLabel);},1600);
    } else {
      // Upload manual — pergunta se quer salvar
      setTimeout(function(){openPsModal();},1600);
    }
  }catch(ex){setSt('Erro: '+ex.message);alert('Erro: '+ex.message);document.getElementById('pw').style.display='none';}
  document.getElementById('btngo').disabled=false;
  document.getElementById('btngo').innerHTML='Analisar Corridas';
  try{document.querySelectorAll('nav a, .nl').forEach(function(a){a.style.pointerEvents='';a.style.opacity='';});}catch(e){}
}

document.addEventListener('DOMContentLoaded',async function(){
  injectStyles();
  injectPostSaveModal();
  injectSaveModal();
  injectValModal();
  injectFilterPanel();

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
  if(restoreSessionState()){
    updCards();
    setSt('Restaurado: '+results.filter(function(r){return r.nivel!=='skip';}).length+' AvBs');
    enterFocusMode();
  } else {
    setTimeout(autoCheckAndAnalyze, 100);
  }

  document.getElementById('race-input').addEventListener('change',async function(){
    for(var i=0;i<this.files.length;i++){var file=this.files[i],id='f'+Date.now()+i;addFI(file.name,id);try{var b64=await readB64(file);raceFiles.push({name:file.name,b64:b64,id:id,mime:'application/pdf'});updFI(id,true);}catch(e){updFI(id,false);}}updCards();
  });
  document.getElementById('rz').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
  document.getElementById('rz').addEventListener('dragleave',function(){this.classList.remove('drag');});
  document.getElementById('rz').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag');var inp=document.getElementById('race-input');inp.files=e.dataTransfer.files;inp.dispatchEvent(new Event('change'));});
  document.getElementById('rlist').addEventListener('click',function(e){if(e.target.classList.contains('fi-rm')){var id=e.target.getAttribute('data-id');raceFiles=raceFiles.filter(function(f){return f.id!==id;});var el=document.getElementById('fi-'+id);if(el)el.remove();updCards();}});
  document.getElementById('btngo').addEventListener('click',runAnalysis);
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
});