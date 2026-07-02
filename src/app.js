var raceFiles=[],capFiles=[],results=[],capModalFilesList=[];
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
    var hh='<strong style="color:var(--grn)">'+(r.hora||'-')+'</strong><div class="hora-br">'+convertHora(r.hora)+'</div>';
    var top3=(r.top3&&r.top3.filter(function(x){return x>0;}).length)?'<div class="top3-tag">&#127942; '+r.top3.filter(function(x){return x>0;}).join('-')+'</div>':'';
    var sh=sk?'<span style="color:var(--mut)">Descartada</span>':'<div class="trap-row"><div class="trap-item"><div class="trap-badge '+trapClass(tf)+'">'+tf+'</div><div class="trap-name">'+nf+'</div></div><span class="trap-vs">vs</span><div class="trap-item"><div class="trap-badge '+trapClass(tu)+'">'+tu+'</div><div class="trap-name">'+nu+'</div></div></div>';
    var ph=perfilBadge(r.perfilFav)+(r.perfilUnd?'<br>'+perfilBadge(r.perfilUnd):'');
    var ch=sk?'':'<span class="badge '+bc+'">'+bt+'</span><br><span style="font-size:10px;color:var(--mut)">'+r.pct+'%</span><span class="cbar"><span class="cfill '+fc+'" style="width:'+r.pct+'%"></span></span>';
    var oc=r.needsCap?'obs-cap':'obs-c';
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
      +(sk?'<td style="text-align:center">'+shComPerfil+'</td>':'<td style="text-align:center">'+shComPerfil+'<a class="val-link" onclick="openValModal(\''+r.hora+'|'+r.corrida+'\')">[ver historico]</a></td>')
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

function injectValModal(){var m=document.createElement('div');m.id='val-modal';m.innerHTML='<div id="val-box"><div id="val-hdr"><h3 id="val-title">Historico</h3><button id="val-xbtn" onclick="closeValModal()">X</button></div><div id="val-body"></div></div>';document.body.appendChild(m);m.addEventListener('click',function(e){if(e.target===this)closeValModal();});}
function closeValModal(){var m=document.getElementById('val-modal');if(m)m.classList.remove('open');}
function openValModal(key){var r=results.find(function(x){return x.tipo==='avb'&&x.histFav&&(x.hora+'|'+x.corrida)===key;});if(!r){console.warn('[VAL] nao achou:',key);return;}document.getElementById('val-title').textContent='T'+r.trapFav+' '+r.nameFav+' vs T'+r.trapUnd+' '+r.nameUnd;document.getElementById('val-body').innerHTML=buildDogCard(r.trapFav,r.nameFav,r.perfilFav,r.histFav)+'<div class="val-sep"></div>'+buildDogCard(r.trapUnd,r.nameUnd,r.perfilUnd,r.histUnd);document.getElementById('val-modal').classList.add('open');}
function buildDogCard(trap,nome,perfil,hist){var tc=['','t1','t2','t3','t4','t5','t6'];var pc=function(p){return p===1?' vp1':p===2?' vp2':p===3?' vp3':'';};var rows=(hist||[]).map(function(h){return'<tr><td>'+h.data+'</td><td>'+h.pista+'</td><td>'+h.dist+'m</td><td>['+h.trap+']</td><td>'+(h.split||'')+'</td><td>'+(h.bends||'')+'</td><td class="'+(pc(h.pos).trim())+'">'+(h.pos>0?h.pos+'grau':'Solo')+'</td><td>'+(h.vencedorTm||'')+'</td><td>'+(h.gng||'')+'</td><td>'+(h.peso||'')+'</td><td>'+(h.sp||'')+'</td><td><span class="vcls">'+(h.classe||'')+'</span></td><td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">'+(h.remarks||'').substring(0,45)+'</td><td style="color:#60a5fa;font-weight:600">'+(h.caltm||'-')+'</td></tr>';}).join('');return'<div class="val-dog"><div class="val-dog-hdr"><span class="trap-badge '+tc[trap]+'">'+trap+'</span><span class="val-name">'+nome+'</span>'+(perfil?'<span class="val-perfil">'+perfil+'</span>':'')+'</div><table class="val-tbl"><thead><tr><th>Data</th><th>Pista</th><th>Dis</th><th>Trp</th><th>Split</th><th>Bends</th><th>Fin</th><th>WnTm</th><th>Gng</th><th>Wght</th><th>SP</th><th>Grade</th><th>Remarks</th><th>CalTm</th></tr></thead><tbody>'+rows+'</tbody></table></div>';}

document.addEventListener('DOMContentLoaded',function(){
  injectValModal();
  var vs=document.createElement('style');vs.textContent='#val-modal{position:fixed;inset:0;background:rgba(0,0,0,.75);display:none;align-items:center;justify-content:center;z-index:9000}#val-modal.open{display:flex}#val-box{background:#161b27;border:1px solid rgba(255,255,255,.12);border-radius:14px;width:94vw;max-width:1050px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column}#val-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.08)}#val-hdr h3{font-size:13px;font-weight:700;color:#fff;margin:0}#val-xbtn{background:transparent;border:none;color:#888;font-size:20px;cursor:pointer;padding:0 4px}#val-body{overflow-y:auto;padding:16px 18px;display:flex;gap:14px}.val-dog{flex:1;min-width:0}.val-dog-hdr{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.08)}.val-name{font-size:13px;font-weight:700;color:#fff}.val-perfil{font-size:10px;color:#888;margin-left:4px}.val-sep{width:1px;background:rgba(255,255,255,.07);flex-shrink:0}.val-tbl{width:100%;border-collapse:collapse;font-size:9.5px}.val-tbl th{font-size:8px;color:rgba(255,255,255,.3);text-transform:uppercase;padding:3px 5px;border-bottom:1px solid rgba(255,255,255,.07);white-space:nowrap;text-align:left}.val-tbl td{padding:4px 5px;border-bottom:1px solid rgba(255,255,255,.04);color:rgba(255,255,255,.75);white-space:nowrap}.val-tbl tr:last-child td{border-bottom:none}.vp1{color:#22c55e;font-weight:700}.vp2{color:#60a5fa;font-weight:700}.vp3{color:#f97316;font-weight:700}.vcls{background:rgba(255,255,255,.07);padding:1px 4px;border-radius:3px;font-size:8px}.val-link{font-size:9px;color:rgba(96,165,250,.75);cursor:pointer;display:block;text-align:center;margin-top:3px}';document.head.appendChild(vs);
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
    avbs.sort(function(a,b){return ukHoraParaOrdem(a.hora)-ukHoraParaOrdem(b.hora);});
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