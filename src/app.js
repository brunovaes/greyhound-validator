var raceFiles=[],capFiles=[],results=[],capModalFilesList=[];
var filterState={pista:'',horaMin:'',horaMax:'',confianca:''};
var SS_KEY='ghf_results_v1';
function saveSessionState(){try{sessionStorage.setItem(SS_KEY,JSON.stringify({results:results,raceNames:raceFiles.map(function(f){return f.name;})}));}catch(e){}}
function clearSessionState(){try{sessionStorage.removeItem(SS_KEY);}catch(e){}}
function restoreSessionState(){try{var raw=sessionStorage.getItem(SS_KEY);if(!raw)return false;var data=JSON.parse(raw);if(data&&Array.isArray(data.results)&&data.results.length){results=data.results;return true;}}catch(e){}return false;}

function readB64(file){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(e){res(e.target.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});}
function trapClass(n){return['','t1','t2','t3','t4','t5','t6'][n]||'t1';}
function perfilBadge(p){if(!p)return'';var c=p==='Recuperador'?'p-rec':p==='Fumador'?'p-fum':p==='Frontrunner'?'p-fro':'p-est';var i=p==='Recuperador'?'&#128170;':p==='Fumador'?'&#128684;':p==='Frontrunner'?'&#9889;':'&#10145;';return'<span class="perfil-badge '+c+'">'+i+' '+p+'</span>';}
function convertHora(h){if(!h)return'';var p=h.split(':');var hr=parseInt(p[0]);if(hr>=1&&hr<=9)hr+=12;else if(hr===10||hr===11||hr===12)hr=hr;hr=hr-4;if(hr<0)hr+=24;return hr+':'+p[1];}
function setSt(m){document.getElementById('st').textContent=m;}
function prog(p,t){document.getElementById('pw').style.display='block';document.getElementById('pf').style.width=p+'%';document.getElementById('pt').textContent=t;}
function addFI(name,id){var list=document.getElementById('rlist');var d=document.createElement('div');d.className='fi';d.id='fi-'+id;var sn=name.length>22?name.slice(0,20)+'...':name;d.innerHTML='<span class="fi-name">'+sn+'</span><span class="fi-st fi-load" id="fis-'+id+'">...</span><button class="fi-rm" data-id="'+id+'">x</button>';list.appendChild(d);}
function updFI(id,ok){var el=document.getElementById('fis-'+id);if(!el)return;el.className='fi-st '+(ok?'fi-ok':'fi-err');el.textContent=ok?'OK':'erro';}
function updCards(){var avbs=results.filter(function(r){return r.nivel!=='skip';});var alta=results.filter(function(r){return r.nivel==='alta';}).length;document.getElementById('sp').textContent=raceFiles.length||'-';document.getElementById('sa').textContent=avbs.length||'-';document.getElementById('sal').textContent=alta||'-';}

/* ── helpers de filtro ─────────────────────────────────────── */
function getPista(corrida){
  if(!corrida)return'';
  var p=corrida.trim().split(' ');
  if(p.length>1&&/^[A-Z]\d+$/i.test(p[p.length-1]))return p.slice(0,-1).join(' ');
  return corrida;
}
function horaToMin(h){if(!h)return null;var p=h.split(':');return parseInt(p[0]||0)*60+parseInt(p[1]||0);}
function applyFiltersToAvbs(avbs){
  return avbs.filter(function(r){
    if(filterState.pista&&getPista(r.corrida||'')!==filterState.pista)return false;
    if(filterState.confianca&&r.nivel!==filterState.confianca)return false;
    if(filterState.horaMin||filterState.horaMax){
      var hbr=convertHora(r.hora||'');
      var hMin=horaToMin(hbr);
      if(hMin!==null){
        if(filterState.horaMin&&hMin<horaToMin(filterState.horaMin))return false;
        if(filterState.horaMax&&hMin>horaToMin(filterState.horaMax))return false;
      }
    }
    return true;
  });
}

/* ── injeção de estilos ────────────────────────────────────── */
function injectStyles(){
  var css=[
    /* sticky header */
    'thead th{position:sticky!important;top:0!important;z-index:20!important;background:#0d1117!important;}',

    /* modal overlay */
    '.ghf-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9000;backdrop-filter:blur(4px);}',
    '.ghf-modal-box{background:#161b27;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:32px 36px;width:440px;max-width:92vw;box-shadow:0 24px 64px rgba(0,0,0,.6);}',
    '.ghf-modal-title{font-size:17px;font-weight:700;color:#fff;margin-bottom:6px;letter-spacing:.2px;}',
    '.ghf-modal-sub{font-size:12px;color:rgba(255,255,255,.4);margin-bottom:20px;}',
    '.ghf-modal-inp{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:9px;color:#fff;padding:11px 15px;font-size:14px;outline:none;box-sizing:border-box;transition:border .2s;}',
    '.ghf-modal-inp:focus{border-color:#00e676;}',
    '.ghf-modal-inp::placeholder{color:rgba(255,255,255,.3);}',
    '.ghf-modal-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:24px;}',
    '.ghf-btn-pri{background:linear-gradient(135deg,#00e676,#00c853);color:#000;border:none;padding:10px 26px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer;transition:opacity .2s;}',
    '.ghf-btn-pri:hover{opacity:.88;}',
    '.ghf-btn-sec{background:rgba(255,255,255,.07);color:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.15);padding:10px 22px;border-radius:9px;font-size:14px;cursor:pointer;transition:background .2s;}',
    '.ghf-btn-sec:hover{background:rgba(255,255,255,.12);}',

    /* toast */
    '.ghf-toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);padding:13px 28px;border-radius:11px;font-size:14px;font-weight:600;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap;}',
    '.ghf-toast.t-ok{background:linear-gradient(135deg,#00e676,#00c853);color:#000;}',
    '.ghf-toast.t-err{background:#e53935;color:#fff;}',
    '.ghf-toast.t-show{opacity:1;}',

    /* filter panel — barra discreta */
    '#filter-panel{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;margin-bottom:12px;background:rgba(255,255,255,.025);border-bottom:1px solid rgba(255,255,255,.06);}',
    '#filter-panel .fp-pill{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:5px 12px;cursor:pointer;transition:all .2s;}',
    '#filter-panel .fp-pill:hover{border-color:rgba(0,230,118,.4);background:rgba(0,230,118,.06);}',
    '#filter-panel .fp-pill.active{border-color:rgba(0,230,118,.5);background:rgba(0,230,118,.1);}',
    '#filter-panel .fp-icon{font-size:12px;opacity:.6;}',
    '#filter-panel select,#filter-panel input[type=time]{background:transparent;border:none;color:#fff;font-size:12px;outline:none;cursor:pointer;max-width:120px;padding:0;}',
    '#filter-panel select option{background:#1a1f2e;}',
    '#filter-panel input[type=time]{color-scheme:dark;width:80px;}',
    '.fp-sep{width:1px;height:18px;background:rgba(255,255,255,.1);flex-shrink:0;}',
    '.fp-hora-pair{display:flex;align-items:center;gap:4px;}',
    '.fp-hora-sep{color:rgba(255,255,255,.25);font-size:11px;}',
    '#fp-count{font-size:11px;color:rgba(255,255,255,.3);margin-left:auto;white-space:nowrap;}',
    '#btn-fp-clear{background:transparent;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:18px;padding:2px 4px;line-height:1;transition:color .2s;flex-shrink:0;}',
    '#btn-fp-clear:hover{color:#e53935;}',
  ].join('');
  var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
}

/* ── modal de salvar sessão ───────────────────────────────── */
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
  document.getElementById('save-inp').value='';
  document.getElementById('save-modal').style.display='flex';
  setTimeout(function(){document.getElementById('save-inp').focus();},80);
}
function closeSaveModal(){document.getElementById('save-modal').style.display='none';}
function showToast(msg,ok){
  var t=document.getElementById('ghf-toast');
  t.textContent=msg;t.className='ghf-toast '+(ok?'t-ok':'t-err');
  requestAnimationFrame(function(){t.classList.add('t-show');});
  setTimeout(function(){t.classList.remove('t-show');},2600);
}
async function doSaveSession(){
  var name=document.getElementById('save-inp').value.trim();
  if(!name){document.getElementById('save-inp').focus();return;}
  closeSaveModal();
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  try{
    var resp=await fetch(BASE+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,races:avbs})});
    if(resp.ok){showToast('✓ Sessão "'+name+'" salva!',true);setTimeout(function(){location.reload();},1600);}
    else showToast('Erro ao salvar sessão.',false);
  }catch(e){showToast('Erro ao salvar sessão.',false);}
}

/* ── painel de filtros ────────────────────────────────────── */
function injectFilterPanel(){
  var tb=document.getElementById('tb');
  if(!tb)return;
  var fp=document.createElement('div');
  fp.id='filter-panel';fp.style.display='none';
  fp.innerHTML=''
    +'<div class="fp-pill"><span class="fp-icon">&#127937;</span>'
    +'<select id="fp-pista"><option value="">Todas as pistas</option></select></div>'
    +'<div class="fp-sep"></div>'
    +'<div class="fp-pill"><span class="fp-icon">&#128336;</span>'
    +'<div class="fp-hora-pair"><input type="time" id="fp-hora-min" title="Hora mínima BR"><span class="fp-hora-sep">–</span><input type="time" id="fp-hora-max" title="Hora máxima BR"></div></div>'
    +'<div class="fp-sep"></div>'
    +'<div class="fp-pill"><span class="fp-icon">&#127919;</span>'
    +'<select id="fp-conf"><option value="">Confiança</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option><option value="skip">Skip</option></select></div>'
    +'<button id="btn-fp-clear" title="Limpar filtros">✕</button>'
    +'<span id="fp-count"></span>';
  var table=tb.closest('table');
  if(table&&table.parentElement)table.parentElement.insertBefore(fp,table);
  else tb.parentElement.insertBefore(fp,tb);

  document.getElementById('fp-pista').addEventListener('change',function(){filterState.pista=this.value;renderTable();});
  document.getElementById('fp-hora-min').addEventListener('change',function(){filterState.horaMin=this.value;renderTable();});
  document.getElementById('fp-hora-max').addEventListener('change',function(){filterState.horaMax=this.value;renderTable();});
  document.getElementById('fp-conf').addEventListener('change',function(){filterState.confianca=this.value;renderTable();});
  document.getElementById('btn-fp-clear').addEventListener('click',function(){
    filterState={pista:'',horaMin:'',horaMax:'',confianca:''};
    document.getElementById('fp-pista').value='';
    document.getElementById('fp-hora-min').value='';
    document.getElementById('fp-hora-max').value='';
    document.getElementById('fp-conf').value='';
    renderTable();
  });
}

function updateFilterPanel(){
  var fp=document.getElementById('filter-panel');
  if(!fp)return;
  var avbs=results.filter(function(r){return r.tipo==='avb';});
  if(!avbs.length){fp.style.display='none';return;}
  fp.style.display='block';
  // atualiza opções de pista
  var pistaSet={};
  avbs.forEach(function(r){var p=getPista(r.corrida||'');if(p)pistaSet[p]=1;});
  var pistas=Object.keys(pistaSet).sort();
  var sel=document.getElementById('fp-pista');
  if(sel){
    var cur=sel.value;
    sel.innerHTML='<option value="">Todas as pistas</option>';
    pistas.forEach(function(p){var o=document.createElement('option');o.value=p;o.textContent=p;if(p===cur)o.selected=true;sel.appendChild(o);});
  }
  // marca pills como active quando têm filtro ativo
  var pillPista=sel&&sel.closest('.fp-pill');if(pillPista)pillPista.classList.toggle('active',!!filterState.pista);
  var confSel=document.getElementById('fp-conf');var pillConf=confSel&&confSel.closest('.fp-pill');if(pillConf)pillConf.classList.toggle('active',!!filterState.confianca);
  var horaPill=document.querySelector('#fp-hora-min')||null;var pillHora=horaPill&&horaPill.closest('.fp-pill');if(pillHora)pillHora.classList.toggle('active',!!(filterState.horaMin||filterState.horaMax));
  // contador
  var filtered=applyFiltersToAvbs(avbs);
  var countEl=document.getElementById('fp-count');
  if(countEl){
    if(filtered.length<avbs.length)countEl.textContent='Exibindo '+filtered.length+' de '+avbs.length;
    else countEl.textContent=avbs.length+' corridas';
  }
}

/* ── render da tabela (com filtro) ───────────────────────── */
function renderTable(){
  var tb=document.getElementById('tb');
  if(!results.length){tb.innerHTML='<tr><td colspan="11"><div class="empty"><h3>Sem resultados</h3></div></td></tr>';document.getElementById('ab').style.display='none';updateFilterPanel();return;}

  var winMap={};
  results.forEach(function(r){if(r.tipo==='vencedor'&&r.nivel!=='skip'&&r.trapFav)winMap[(r.hora||'')+'_'+(r.corrida||'')]=r;});

  var avbs=results.filter(function(r){return r.tipo==='avb';});
  var filtered=applyFiltersToAvbs(avbs);

  if(!filtered.length){
    tb.innerHTML='<tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida com os filtros selecionados</h3><p style="color:var(--mut);font-size:13px;margin-top:8px">Tente ampliar os filtros</p></div></td></tr>';
    document.getElementById('ab').style.display='flex';
    updateFilterPanel();return;
  }

  var rows='';
  filtered.forEach(function(r){
    var i=avbs.indexOf(r); // mantém índice original
    var sk=r.nivel==='skip';
    var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':r.nivel==='baixa'?'bb':'bs';
    var bt=r.nivel==='alta'?'Alta':r.nivel==='media'?'Media':r.nivel==='baixa'?'Baixa':'Skip';
    var fc=r.pct>=65?'cfg':r.pct>=50?'cfa':'cfr';
    var tf=r.trapFav||0,tu=r.trapUnd||0,nf=r.nameFav||'',nu=r.nameUnd||'';
    var wd=winMap[(r.hora||'')+'_'+(r.corrida||'')];
    var wt=wd?'<div class="win-tag">&#127942; Back T'+wd.trapFav+' '+((wd.nameFav||'').split(' ')[0])+'</div>':'';
    var hh='<strong style="color:var(--grn)">'+(r.hora||'-')+'</strong><div class="hora-br">'+convertHora(r.hora)+'</div>';
    var top3=(r.top3&&r.top3.filter(function(x){return x>0;}).length)?'<div class="top3-tag">&#127942; '+r.top3.filter(function(x){return x>0;}).join('-')+'</div>':'';
    var ch=sk?'':'<span class="badge '+bc+'">'+bt+'</span><br><span style="font-size:10px;color:var(--mut)">'+r.pct+'%</span><span class="cbar"><span class="cfill '+fc+'" style="width:'+r.pct+'%"></span></span>';
    var cap=r.needsCap?'<button class="cap-btn" data-fav="'+nf+'" data-und="'+nu+'">Cap</button>':'<span class="cap-ok">OK</span>';
    var rh=sk?'-':'<input type="text" placeholder="1" data-i="'+i+'" data-f="r1" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="2" data-i="'+i+'" data-f="r2" style="width:50px;margin-bottom:2px"><br><input type="text" placeholder="3" data-i="'+i+'" data-f="r3" style="width:50px">';
    var obsText=(r.obs||'-').replace(/CalTm/gi,'Tempo');
    var obsParts=obsText.split('\\n');
    var obsHtml='<span style="font-size:10px;color:var(--mut)">'+obsParts[0]+'</span>'+(obsParts[1]?'<div style="font-size:11px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.06);font-style:italic">'+obsParts[1]+'</div>':'');
    var perfilFavLabel=r.perfilFav?'<div style="font-size:9px;color:var(--mut);margin-top:2px">'+r.perfilFav+'</div>':'';
    var perfilUndLabel=r.perfilUnd?'<div style="font-size:9px;color:var(--mut);margin-top:2px">'+r.perfilUnd+'</div>':'';
    var shComPerfil=sk?'<span style="color:var(--mut)">Descartada</span>':'<div class="trap-row"><div class="trap-item"><div class="trap-badge '+trapClass(tf)+'">'+tf+'</div><div class="trap-name">'+nf+'</div>'+perfilFavLabel+'</div><span class="trap-vs">vs</span><div class="trap-item"><div class="trap-badge '+trapClass(tu)+'">'+tu+'</div><div class="trap-name">'+nu+'</div>'+perfilUndLabel+'</div></div>';
    var oddValHtml=sk?'-':'<div style="display:flex;flex-direction:column;gap:6px;align-items:center"><div style="display:flex;flex-direction:column;gap:2px;align-items:center"><span style="font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">Odd</span><input type="text" placeholder="-" data-i="'+i+'" data-f="odd" style="width:52px;text-align:center"></div><div style="display:flex;flex-direction:column;gap:2px;align-items:center"><span style="font-size:9px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">Valor R$</span><input type="text" placeholder="0" data-i="'+i+'" data-f="valor" style="width:52px;text-align:center"></div></div>';
    rows+='<tr class="row-avb'+(sk?' sk':'')+'">'
      +'<td style="text-align:center">'+hh+'</td>'
      +'<td><div style="font-weight:700;font-size:12px">'+(r.corrida||'-')+'</div><div style="font-size:10px;color:var(--mut)">'+(r.dist||'')+'</div>'+top3+wt+'</td>'
      +'<td style="text-align:center">'+shComPerfil+'</td>'
      +'<td style="text-align:center">'+ch+'</td>'
      +'<td style="font-size:12px;line-height:1.6">'+obsHtml+'</td>'
      +'<td style="text-align:center">'+oddValHtml+'</td>'
      +'<td style="text-align:center">'+rh+'</td>'
      +'<td style="text-align:center"><select data-i="'+i+'" data-f="hit" style="text-align:center"><option value="">-</option><option value="sim">Sim</option><option value="nao">Nao</option></select></td>'
      +'<td style="text-align:center">'+cap+'</td>'
      +'</tr>';
  });
  tb.innerHTML=rows;
  document.getElementById('ab').style.display='flex';
  updCards();
  updateFilterPanel();
}

async function runChunk(files, caps){
  var fd=new FormData();
  files.forEach(function(f){fd.append('pdfs',new Blob([Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0))],{type:'application/pdf'}),f.name);});
  caps.forEach(function(f){fd.append('caps',new Blob([Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0))],{type:f.mime}),f.name);});
  console.log('[runChunk] enviando '+files.length+' PDFs...');
  var resp=await fetch(BASE+'/api/analyze',{method:'POST',body:fd});
  console.log('[runChunk] resp.ok='+resp.ok+' status='+resp.status);
  if(!resp.ok){var e=await resp.json();throw new Error(e.error||'Erro '+resp.status);}
  var reader=resp.body.getReader();
  var decoder=new TextDecoder();
  var buffer='';
  var evtCount=0;
  while(true){
    var _r=await reader.read();
    if(_r.done){console.log('[runChunk] stream done, eventos:'+evtCount);break;}
    buffer+=decoder.decode(_r.value,{stream:true});
    var lines=buffer.split('\n');
    buffer=lines.pop();
    for(var li=0;li<lines.length;li++){
      var line=lines[li].trim();
      if(!line.startsWith('data:')) continue;
      try{
        var evt=JSON.parse(line.slice(5).trim());
        evtCount++;
        console.log('[runChunk] evt:'+evt.type+(evt.races?' races:'+evt.races.length:''));
        if(evt.type==='races'){results=results.concat(evt.races||[]);renderTable();saveSessionState();updCards();}
        else if(evt.type==='limitReached'){alert('Limite de analises atingido!');return false;}
        else if(evt.type==='error'){throw new Error(evt.error);}
      }catch(pe){console.warn('[runChunk] parse err:',pe.message);}
    }
  }
  return true;
}

async function runAnalysis(){
  if(!raceFiles.length){alert('Carregue pelo menos um PDF.');return;}
  document.getElementById('btngo').disabled=true;
  document.getElementById('btngo').innerHTML='<span class="spinner"></span>Analisando...';
  try{document.querySelectorAll('nav a, .nl').forEach(function(a){a.style.pointerEvents='none';a.style.opacity='0.3';});}catch(e){}
  prog(5,'Preparando...');
  results=[];
  filterState={pista:'',horaMin:'',horaMax:'',confianca:''};
  var CHUNK=30;
  var chunks=[];
  for(var ci=0;ci<raceFiles.length;ci+=CHUNK) chunks.push(raceFiles.slice(ci,ci+CHUNK));
  try{
    for(var chunkIdx=0;chunkIdx<chunks.length;chunkIdx++){
      prog(Math.round(5+(chunkIdx/chunks.length)*90),'Grupo '+(chunkIdx+1)+'/'+chunks.length+' ('+chunks[chunkIdx].length+' PDFs)...');
      var ok=await runChunk(chunks[chunkIdx],chunkIdx===0?capFiles:[]);
      if(ok===false) break;
    }
    var avbs=results.filter(function(r){return r.nivel!=='skip';}).length;
    setSt('Concluido: '+avbs+' AvBs de '+results.length+' corridas');
    prog(100,'');
    setTimeout(function(){document.getElementById('pw').style.display='none';},1200);
  }catch(ex){setSt('Erro: '+ex.message);alert('Erro: '+ex.message);document.getElementById('pw').style.display='none';}
  document.getElementById('btngo').disabled=false;
  document.getElementById('btngo').innerHTML='Analisar Corridas';
  try{document.querySelectorAll('nav a, .nl').forEach(function(a){a.style.pointerEvents='';a.style.opacity='';});}catch(e){}
}

document.addEventListener('DOMContentLoaded',function(){
  injectStyles();
  injectSaveModal();
  injectFilterPanel();

  if(restoreSessionState()){renderTable();updCards();setSt('Restaurado: '+results.filter(function(r){return r.nivel!=='skip';}).length+' AvBs');}
  document.getElementById('race-input').addEventListener('change',async function(){
    for(var i=0;i<this.files.length;i++){var file=this.files[i],id='f'+Date.now()+i;addFI(file.name,id);try{var b64=await readB64(file);raceFiles.push({name:file.name,b64:b64,id:id,mime:'application/pdf'});updFI(id,true);}catch(e){updFI(id,false);}}updCards();
  });
  document.getElementById('rz').addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
  document.getElementById('rz').addEventListener('dragleave',function(){this.classList.remove('drag');});
  document.getElementById('rz').addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag');var inp=document.getElementById('race-input');inp.files=e.dataTransfer.files;inp.dispatchEvent(new Event('change'));});
  document.getElementById('rlist').addEventListener('click',function(e){if(e.target.classList.contains('fi-rm')){var id=e.target.getAttribute('data-id');raceFiles=raceFiles.filter(function(f){return f.id!==id;});var el=document.getElementById('fi-'+id);if(el)el.remove();updCards();}});
  document.getElementById('btngo').addEventListener('click',runAnalysis);
  document.getElementById('btn-clear').addEventListener('click',function(){
    raceFiles=[];capFiles=[];results=[];
    filterState={pista:'',horaMin:'',horaMax:'',confianca:''};
    clearSessionState();
    document.getElementById('rlist').innerHTML='';
    document.getElementById('tb').innerHTML='<tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida analisada</h3></div></td></tr>';
    document.getElementById('ab').style.display='none';
    document.getElementById('pw').style.display='none';
    var fp=document.getElementById('filter-panel');if(fp)fp.style.display='none';
    setSt('');updCards();
  });

  // ── Salvar sessão: modal customizado ──
  document.getElementById('btn-save').addEventListener('click',function(){
    var avbs=results.filter(function(r){return r.tipo==='avb';});
    if(!avbs.length){showToast('Nenhuma corrida para salvar.',false);return;}
    openSaveModal();
  });

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
        +'<td style="text-align:center;vertical-align:middle"><strong>'+convertHora(r.hora||'-')+'</strong><br><small style="color:#666">'+( r.hora||'')+'</small></td>'
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