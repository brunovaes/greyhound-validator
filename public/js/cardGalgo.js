// ============================================================================
// public/js/cardGalgo.js — card de historico de um galgo (tabela de corridas
// anteriores), usado pelo painel "Analisar disputa".
//
// POR QUE ESTE ARQUIVO EXISTE
// Este mesmo card ja existia em DOIS lugares: buildDogCard() no src/app.js
// (tela Analisar) e svCard() aqui, que morava embutido no <script> da tela
// /sessao dentro do main.js. Quando a Carga VIP passou a precisar do mesmo
// painel, a escolha era criar uma TERCEIRA copia ou extrair. Tres copias de
// uma tabela que precisa ficar visualmente igual nas tres telas e' divergencia
// garantida: alguem ajusta uma coluna num lugar e as outras ficam pra tras.
//
// O codigo abaixo saiu do main.js sem nenhuma alteracao, so mudou de lugar.
// Os nomes das funcoes continuam os mesmos (svCard, svExtrairRemarks,
// svClassRank) e continuam globais, entao a tela /sessao segue chamando
// exatamente como chamava.
//
// O CSS correspondente (.sv-*) esta em cssCardGalgo(), no main.js, e e'
// injetado pelas duas telas.
//
// Arquivo estatico de proposito: dentro de template literal, aspas e \n se
// resolvem errado com facilidade, e o node --check nao enxerga o erro.
// ============================================================================
'use strict';

function svExtrairRemarks(mixed){
  if(!mixed)return'';
  var ci=mixed.indexOf(',');
  if(ci>=0){var ws=mixed.lastIndexOf(' ',ci)+1;return mixed.substring(ws);}
  var tokens=mixed.trim().split(' ');
  for(var i=tokens.length-1;i>=0;i--){if(tokens[i]&&tokens[i][0]===tokens[i][0].toUpperCase()&&tokens[i][0]!==tokens[i][0].toLowerCase())return tokens.slice(i).join(' ');}
  return mixed;
}
function svClassRank(c){var m=(c||'').match(/A(\d+)/i);return m?parseInt(m[1]):999;}
// NOME DO GALGO, limpo (Bruno, 11/09/2026).
//
// O PDF traz o nome grudado na ficha de criacao: "Golden Lion (W) ltbd d Dorotas
// Wildcat-Golden Mist Jun24". O sistema ja tratava isso — _limpaNome existe no
// app.js e no cargaVip.js — mas este card recebia o nome CRU do hist_full e
// mostrava a ficha inteira.
//
// Esta e a versao do cargaVip.js, nao a do app.js: a do app.js lista as cores
// uma a uma e nao cobre "ltbd"; esta reconhece cor como token minusculo de 2 a 6
// letras do alfabeto de cores, que e uma regra e nao uma lista pra manter.
//
// Idempotente de proposito: nome ja limpo passa inteiro. Assim da pra chamar sem
// precisar saber se quem chamou ja tratou.
function svLimpaNome(n){
  if(!n) return '';
  var txt=String(n).trim();
  var mSexo=txt.match(/^(.*?\((?:M|W)\))/);
  if(mSexo) return mSexo[1].trim();
  var toks=txt.split(/\s+/);
  var MESANO=/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{2}$/i;
  var CORGEN=/^[bdefgklrtw]{2,6}$/;
  for(var k=1;k<toks.length;k++){
    var t=toks[k];
    if((t===t.toLowerCase()&&CORGEN.test(t))||MESANO.test(t)||/^\(Ssn/i.test(t)) return toks.slice(0,k).join(' ').trim();
  }
  return txt;
}
function svCard(trap,nome,perfil,hist){
  var tc=['','t1','t2','t3','t4','t5','t6'];
  // Limpa AQUI, na exibicao, e nao na gravacao: corrigir so na origem deixaria
  // toda corrida ja analisada com a ficha de criacao na tela pra sempre.
  nome=svLimpaNome(nome);
  if(!hist||!hist.length)return'<div class="sv-dog"><div class="sv-dog-hdr"><span class="trap-badge '+tc[trap||0]+'" style="width:26px;height:26px;font-size:12px">'+trap+'</span><span class="sv-name">'+(nome||'')+'</span></div><p style="color:rgba(255,255,255,.3);font-size:11px;padding:8px 0">Sem histórico</p></div>';
  // Calcular melhores valores para destaques
  var caltms=hist.filter(function(h){return h.caltm!=null&&parseFloat(h.caltm)>0;}).map(function(h){return parseFloat(h.caltm);});
  var bestCaltm=caltms.length?Math.min.apply(null,caltms):null;
  var bestClass=Math.min.apply(null,hist.map(function(h){return svClassRank(h.classe);}));
  var rows=hist.map(function(h){
    var rem=svExtrairRemarks(h.remarks||'');
    var ct=(h.caltm!=null&&h.caltm!==''&&parseFloat(h.caltm)>0)?parseFloat(h.caltm).toFixed(2):'-';
    var isBestCt=bestCaltm&&ct!=='-'&&parseFloat(ct)===bestCaltm;
    var isBestCl=svClassRank(h.classe)===bestClass&&bestClass<999;
    return'<tr>'
      +'<td class="sv-td-date">'+h.data+'</td>'
      +'<td class="sv-td-track">'+h.pista+'</td>'
      +'<td class="sv-td-muted" style="text-align:center">'+h.dist+'m</td>'
      +'<td class="sv-td-muted" style="text-align:center">['+h.trap+']</td>'
      +'<td class="sv-td-muted" style="text-align:center">'+(h.split||'')+'</td>'
      +'<td class="sv-bends">'+(h.bends||'')+'</td>'
      +'<td class="sv-td-muted" style="text-align:center">'+(h.pos||'-')+'</td>'
      +'<td class="sv-td-rem">'+rem+'</td>'
      +'<td style="text-align:center"><span class="sv-grade"'+(isBestCl?' style="color:#f97316;border-color:rgba(249,115,22,.4);background:rgba(249,115,22,.1)"':'')+'>'+( h.classe||'')+'</span></td>'
      +'<td class="sv-caltm"'+(isBestCt?' style="color:#fbbf24"':'')+'>'+ct+'</td>'
      +'</tr>';
  }).join('');
  return'<div class="sv-dog">'
    +'<div class="sv-dog-hdr">'
    +'<span class="trap-badge '+tc[trap||0]+'" style="width:26px;height:26px;font-size:12px">'+trap+'</span>'
    +'<span class="sv-name">'+(nome||'')+'</span>'
    +(perfil?'<span class="sv-perfil">'+perfil+'</span>':'')
    +'</div>'
    +'<table class="sv-tbl">'
    +'<colgroup>'
    +'<col style="width:40px"><col style="width:40px"><col style="width:40px">'
    +'<col style="width:30px"><col style="width:40px"><col style="width:35px">'
    +'<col style="width:25px"><col style="width:60px"><col style="width:30px"><col style="width:40px">'
    +'</colgroup>'
    +'<thead><tr><th>Date</th><th>Track</th><th>Dis</th><th>Trp</th><th>Split</th><th>Bends</th><th>Fin</th><th>Remarks</th><th>Grade</th><th>CalTm</th></tr></thead>'
    +'<tbody>'+rows+'</tbody></table>'
    +'</div>';
}