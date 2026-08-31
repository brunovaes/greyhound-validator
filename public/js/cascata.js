'use strict';
// ── Painel ADMIN: Cascata de Cortes ──────────────────────────────────────────
//
// Cada corte do motor e' uma PENEIRA numa esteira. O par de galgos desce e, em
// cada peneira, passa ou morre ali. Esta tela deixa mexer nos valores, ver
// quantos pares sobram a cada peneira sobre as corridas REAIS do dia, e aplicar.
//
// Duas coisas que a tela nunca deixa passar em silencio:
//
//   1) RASCUNHO NAO E' PRODUCAO. Tudo que voce arrasta e' simulacao ate clicar
//      em APLICAR. O texto e as cores dizem isso o tempo todo — o risco aqui e'
//      alguem calibrar por meia hora achando que ja esta valendo.
//
//   2) SP e CHANCE nao desligam em producao. Os toggles delas existem so pra
//      simular. Se voce desligar e clicar APLICAR, a tela avisa que aquilo NAO
//      vai junto, em vez de deixar voce descobrir depois pelo resultado.

var BASE_C = (window.BASE_CASCATA || '');
var DIAG = BASE_C + '/robot/diag';

// As 7 peneiras, na ordem da esteira. 'guarda' marca as que nao desligam em
// producao. 'chave' e' o nome do corte no rascunho; categoria nao tem numero.
var PENEIRAS = [
  { id:'sp',        rotulo:'SP colada',            chave:'sp_ratio_max',  op:'<=', min:1,    max:2,    passo:0.01,  guarda:true },
  { id:'categoria', rotulo:'Categoria',            chave:null,            op:'on/off' },
  { id:'caltm',     rotulo:'CalTm',                chave:'caltm_min_dif', op:'>=', min:0,    max:1,    passo:0.01,  unidade:'s' },
  { id:'split',     rotulo:'Split',                chave:'split_min',     op:'>=', min:0,    max:0.30, passo:0.01 },
  { id:'podio',     rotulo:'Pódio',                chave:'podio_min',     op:'>=', min:0,    max:1,    passo:0.05 },
  { id:'fumador',   rotulo:'Fumador (não desaba)', chave:'desaba_min',    op:'<',  min:1,    max:5,    passo:1 },
  { id:'pct',       rotulo:'Chance',               chave:'parelho_pct',   op:'>',  min:50,   max:90,   passo:1, unidade:'%', guarda:true }
];

var estado = {
  regua: 'top',
  cortes: {},
  ativos: {},          // so as 5 do meio vao pro rascunho
  simOff: {},          // sp/pct desligadas SO na simulacao
  data: '',
  ultimoFunil: null,
  aplicando: false
};

// ── util ────────────────────────────────────────────────────────────────────
function $(id){ return document.getElementById(id); }
function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function num(v){ var n = parseFloat(v); return isNaN(n) ? null : n; }

function toast(msg, ok){
  var t = $('casc-toast'); if(!t) return;
  t.textContent = msg;
  t.style.background = ok ? 'rgba(33,171,88,.15)' : 'rgba(239,68,68,.15)';
  t.style.borderColor = ok ? '#21AB58' : '#ef4444';
  t.style.color = ok ? '#21AB58' : '#ef4444';
  t.style.display = 'block';
  clearTimeout(t._t); t._t = setTimeout(function(){ t.style.display='none'; }, 4000);
}

// Debounce: arrastar um slider dispara muita chamada. 500ms, como o contrato
// sugere — o suficiente pra o funil acompanhar sem inundar o servidor.
var _deb = {};
function debounce(chave, fn, ms){
  clearTimeout(_deb[chave]);
  _deb[chave] = setTimeout(fn, ms == null ? 500 : ms);
}

// ── carga inicial ───────────────────────────────────────────────────────────
async function cascIniciar(){
  try {
    var r = await fetch(DIAG + '/cascata-rascunho', { credentials:'same-origin' });
    var d = await r.json();
    var ras = (d && d.rascunho) || {};
    estado.regua  = ras.regua || 'top';
    estado.cortes = Object.assign({}, ras.cortes || {});
    estado.ativos = Object.assign({}, ras.ativos || {});
    var quando = d && d.salvo_em;
    // Sem rascunho, o backend devolve o que esta VALENDO. Dizer de onde veio
    // evita a duvida "isso que estou vendo ja e' producao ou nao?".
    $('casc-origem').textContent = (d && d.tem_rascunho)
      ? ('rascunho salvo em ' + (quando || '?'))
      : 'partindo do que está valendo em produção';
  } catch(e){
    toast('não consegui carregar o rascunho: ' + e.message, false);
  }
  desenharAlavancas();
  await atualizarFunil();
  PENEIRAS.forEach(function(p){ carregarExemplo(p.id); });
}

// ── alavancas ───────────────────────────────────────────────────────────────
function ligada(id){
  if (id === 'sp' || id === 'pct') return !estado.simOff[id];
  return estado.ativos[id] !== false;
}

function desenharAlavancas(){
  var box = $('casc-alavancas'); if(!box) return;
  box.innerHTML = PENEIRAS.map(function(p, i){
    var on = ligada(p.id);
    var val = p.chave ? estado.cortes[p.chave] : null;
    return '<div class="casc-lever' + (on?'':' off') + '" id="lev-'+p.id+'">'
      + '<div class="casc-lever-top">'
      +   '<span class="casc-num">' + (i+1) + '</span>'
      +   '<span class="casc-lever-nome">' + esc(p.rotulo) + '</span>'
      +   (p.guarda ? '<span class="casc-guarda" title="Esta peneira nunca é desligada em produção. O botão aqui vale só para simular.">espinha dorsal</span>' : '')
      +   '<label class="casc-sw"><input type="checkbox" ' + (on?'checked':'') + ' onchange="cascToggle(\'' + p.id + '\', this.checked)"><span></span></label>'
      + '</div>'
      + (p.chave
          ? '<div class="casc-lever-ctl">'
            + '<input type="range" min="'+p.min+'" max="'+p.max+'" step="'+p.passo+'" value="'+(val==null?p.min:val)+'" '
            +   'oninput="cascCorte(\''+p.id+'\', this.value, true)" ' + (on?'':'disabled') + '>'
            + '<input type="number" min="'+p.min+'" max="'+p.max+'" step="'+p.passo+'" value="'+(val==null?'':val)+'" '
            +   'onchange="cascCorte(\''+p.id+'\', this.value)" ' + (on?'':'disabled') + '>'
            + '<span class="casc-op">' + p.op + (p.unidade||'') + '</span>'
          + '</div>'
          : '<div class="casc-lever-ctl casc-sem-num">sem valor: só liga ou desliga</div>')
      + '<div class="casc-ex" id="ex-'+p.id+'">…</div>'
      + '</div>';
  }).join('');
}

function cascToggle(id, on){
  if (id === 'sp' || id === 'pct') {
    // Guarda: nao entra no rascunho nem no APLICAR. So muda a simulacao.
    estado.simOff[id] = !on;
    if (!on) toast('“' + rotuloDe(id) + '” desligada só na simulação. Em produção ela continua valendo.', true);
  } else {
    estado.ativos[id] = on;
    salvarRascunho();
  }
  desenharAlavancas();
  PENEIRAS.forEach(function(p){ carregarExemplo(p.id); });
  atualizarFunil();
}

function rotuloDe(id){
  var p = PENEIRAS.filter(function(x){ return x.id===id; })[0];
  return p ? p.rotulo : id;
}

function cascCorte(id, valor, arrastando){
  var p = PENEIRAS.filter(function(x){ return x.id===id; })[0];
  if (!p || !p.chave) return;
  var v = num(valor); if (v == null) return;
  estado.cortes[p.chave] = v;
  // Espelha slider e caixa numerica sem redesenhar tudo (redesenhar durante o
  // arrasto faria o slider perder o foco a cada pixel).
  var lev = $('lev-'+id);
  if (lev) {
    var r = lev.querySelector('input[type=range]'), n = lev.querySelector('input[type=number]');
    if (r && r.value != v) r.value = v;
    if (n && document.activeElement !== n) n.value = v;
  }
  debounce('corte', function(){ salvarRascunho(); atualizarFunil(); }, arrastando ? 500 : 150);
  debounce('ex-'+id, function(){ carregarExemplo(id); }, 400);
}

function cascRegua(v){
  estado.regua = v;
  // Troca de regua muda os defaults: recarrega do backend em vez de adivinhar.
  debounce('regua', function(){ salvarRascunho(); atualizarFunil(); }, 100);
  desenharAlavancas();
}

// ── rascunho ────────────────────────────────────────────────────────────────
async function salvarRascunho(){
  // ativos vai SO com as 5 do meio: sp e pct nao entram (sao sempre-ligadas).
  var ativos = {};
  ['categoria','caltm','split','podio','fumador'].forEach(function(k){
    ativos[k] = estado.ativos[k] !== false;
  });
  try {
    var r = await fetch(DIAG + '/cascata-rascunho', {
      method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ regua: estado.regua, cortes: estado.cortes, ativos: ativos })
    });
    var d = await r.json();
    if (d && d.ok) $('casc-origem').textContent = 'rascunho salvo agora (nada em produção mudou)';
  } catch(e){ toast('não consegui salvar o rascunho: ' + e.message, false); }
}

// ── funil ───────────────────────────────────────────────────────────────────
function paramsSimulacao(){
  var q = ['regua=' + estado.regua];
  if (estado.data) q.push('date=' + encodeURIComponent(estado.data));
  var mapa = { sp:'sp', caltm:'caltm', split:'split', podio:'podio', fumador:'dmin', pct:'pct' };
  PENEIRAS.forEach(function(p){
    if (!p.chave) return;
    var v = estado.cortes[p.chave];
    if (v != null && mapa[p.id]) q.push(mapa[p.id] + '=' + v);
  });
  if (estado.cortes.desaba_queda != null) q.push('dqueda=' + estado.cortes.desaba_queda);
  // off: as desligadas, incluindo as de guarda (aqui e' simulacao)
  var off = PENEIRAS.filter(function(p){ return !ligada(p.id); }).map(function(p){ return p.id; });
  if (off.length) q.push('off=' + off.join(','));
  return q.join('&');
}

async function atualizarFunil(){
  var alvo = $('casc-funil'); if(!alvo) return;
  alvo.style.opacity = '.45';
  try {
    var r = await fetch(DIAG + '/cascata?' + paramsSimulacao(), { credentials:'same-origin' });
    var d = await r.json();
    estado.ultimoFunil = d;
    desenharFunil(d);
    desenharCorridas(d);
  } catch(e){
    alvo.innerHTML = '<div class="casc-vazio">não consegui carregar o funil: ' + esc(e.message) + '</div>';
  }
  alvo.style.opacity = '1';
}

function desenharFunil(d){
  var alvo = $('casc-funil');
  var f = (d && d.funil) || [];
  if (!f.length) { alvo.innerHTML = '<div class="casc-vazio">sem dados para este dia.</div>'; return; }

  var maior = Math.max.apply(null, f.map(function(x){ return x.entraram||0; })) || 1;

  $('casc-kpi-valem').textContent   = d.corridas_que_valem != null ? d.corridas_que_valem : '—';
  $('casc-kpi-dia').textContent     = (d.corridas_no_dia != null ? d.corridas_no_dia : '—') + ' corridas com histórico';
  $('casc-kpi-pares').textContent   = (d.total_sobreviventes != null ? d.total_sobreviventes : '—')
    + ' de ' + (d.total_avaliados != null ? d.total_avaliados : '—') + ' pares';

  alvo.innerHTML = f.map(function(p, i){
    var ent = p.entraram||0, sob = p.sobraram||0, mor = p.mortos||0;
    var pctSob = maior ? Math.round(sob/maior*100) : 0;
    var pctMor = maior ? Math.round(mor/maior*100) : 0;
    // Peneira que nao corta ninguem merece destaque proprio: ela esta ali
    // ocupando espaco e nao muda nada, e isso e' informacao pra calibrar.
    var inerte = p.ativa && mor === 0;
    return '<div class="casc-step' + (p.ativa?'':' off') + '">'
      + '<div class="casc-step-hd">'
      +   '<span class="casc-num">' + (i+1) + '</span>'
      +   '<strong>' + esc(p.rotulo) + '</strong>'
      +   (p.ativa ? '<span class="casc-corte">' + esc(String(p.corte)) + '</span>'
                   : '<span class="casc-desl">DESLIGADA</span>')
      +   (inerte ? '<span class="casc-inerte" title="Esta peneira está ligada mas não cortou nenhum par hoje.">não cortou nada</span>' : '')
      + '</div>'
      + '<div class="casc-bar" title="' + ent + ' entraram · ' + sob + ' passaram · ' + mor + ' morreram aqui">'
      +   '<i class="casc-viva" style="width:' + pctSob + '%"></i>'
      +   '<i class="casc-morta" style="width:' + pctMor + '%"></i>'
      + '</div>'
      + '<div class="casc-step-ft">'
      +   '<span>' + ent + ' entraram</span>'
      +   '<span class="casc-ok">' + sob + ' passaram</span>'
      +   (mor ? '<span class="casc-ko">' + mor + ' morreram</span>' : '<span class="casc-mut">ninguém morreu</span>')
      + '</div>'
      + '<div class="casc-desc">' + esc(p.descricao||'') + '</div>'
      + '</div>';
  }).join('');
}

// ── corridas do dia ─────────────────────────────────────────────────────────
var COR_PENEIRA = { sp:'#f59e0b', categoria:'#a78bfa', caltm:'#60a5fa',
                    split:'#22d3ee', podio:'#f472b6', fumador:'#fb923c', pct:'#ef4444' };

// Filtros da lista de corridas. Ficam num cabecalho com as MESMAS colunas da
// lista, e filtram o que ja foi carregado — nao refazem a chamada, porque o
// funil e a lista tem que continuar falando do mesmo conjunto de corridas.
var filtroCorr = { pista:'', dist:'', vale:'' };

function pistaDe(nome){
  // "Yrmth A9" -> "Yrmth". A classe muda a cada corrida; a pista, nao.
  return String(nome||'').trim().split(' ')[0];
}

// O filtro redesenha a partir do que FOI DESENHADO, guardado aqui, e nao de
// estado.ultimoFunil. Sao a mesma coisa no fluxo normal, mas se um dia
// divergirem o filtro mostraria um conjunto e o funil outro — e ninguem
// perceberia, porque os dois numeros parecem plausiveis.
var corridasNaTela = [];

function cascFiltro(campo, valor){
  filtroCorr[campo] = valor || '';
  redesenharCorridas();
}

function cascLimparFiltro(){
  filtroCorr = { pista:'', dist:'', vale:'' };
  redesenharCorridas();
}

function cabecalhoCorridas(cs){
  var uniq = function(arr){ return arr.filter(function(v,i){ return v && arr.indexOf(v)===i; }).sort(); };
  var pistas = uniq(cs.map(function(c){ return pistaDe(c.corrida); }));
  var dists  = uniq(cs.map(function(c){ return c.dist; }));
  var opt = function(lista, sel){
    return lista.map(function(v){
      return '<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(v)+'</option>';
    }).join('');
  };
  return '<div class="casc-corr-hd">'
    + '<span class="cc-hora">HORA</span>'
    + '<span class="cc-corrida"><select onchange="cascFiltro(\'pista\', this.value)">'
    +   '<option value="">todas as pistas</option>' + opt(pistas, filtroCorr.pista) + '</select></span>'
    + '<span class="cc-dist"><select onchange="cascFiltro(\'dist\', this.value)">'
    +   '<option value="">dist.</option>' + opt(dists, filtroCorr.dist) + '</select></span>'
    + '<span class="cc-pick"><select onchange="cascFiltro(\'vale\', this.value)">'
    +   '<option value="">com e sem AvB</option>'
    +   '<option value="sim"' + (filtroCorr.vale==='sim'?' selected':'') + '>só as que valem</option>'
    +   '<option value="nao"' + (filtroCorr.vale==='nao'?' selected':'') + '>só as que morreram</option>'
    + '</select></span>'
    + '<span class="cc-conta">VIVOS</span>'
    + '</div>';
}

function desenharCorridas(d){
  corridasNaTela = (d && d.corridas) || [];
  redesenharCorridas();
}

function redesenharCorridas(){
  var alvo = $('casc-corridas'); if(!alvo) return;
  var todas = corridasNaTela;
  if (!todas.length) { alvo.innerHTML = '<div class="casc-vazio">nenhuma corrida avaliada neste dia.</div>'; return; }

  var cs = todas.filter(function(c){
    if (filtroCorr.pista && pistaDe(c.corrida) !== filtroCorr.pista) return false;
    if (filtroCorr.dist  && String(c.dist) !== String(filtroCorr.dist)) return false;
    if (filtroCorr.vale === 'sim' && !c.entrou) return false;
    if (filtroCorr.vale === 'nao' && c.entrou) return false;
    return true;
  });

  // Quantas o filtro escondeu. Sem isto a lista encolhe e parece que o dia
  // mudou, quando foi so o filtro.
  var escondidas = todas.length - cs.length;
  var aviso = escondidas
    ? '<div class="casc-filtrou">mostrando ' + cs.length + ' de ' + todas.length + ' corridas'
      + ' <button type="button" onclick="cascLimparFiltro()">limpar filtros</button></div>'
    : '';

  alvo.innerHTML = cabecalhoCorridas(todas) + aviso + cs.map(function(c, i){
    var p = c.principal;
    return '<div class="casc-corrida' + (c.entrou?' entrou':'') + '">'
      + '<div class="casc-corrida-hd" onclick="cascAbrir(' + i + ')">'
      +   '<span class="casc-hora cc-hora">' + esc(c.hora) + '</span>'
      +   '<span class="casc-nome cc-corrida">' + esc(c.corrida) + '</span>'
      +   '<span class="casc-mut cc-dist">' + esc(c.dist||'') + '</span>'
      +   (p ? '<span class="casc-pick cc-pick">T' + p.pick_trap + ' × T' + p.outro_trap
              + ' <em>' + (p.pct!=null?p.pct+'%':'') + '</em></span>'
            : '<span class="casc-mut cc-pick">nenhum par sobreviveu</span>')
      +   '<span class="casc-conta cc-conta">' + (c.sobreviventes||0) + '/' + (c.avaliados||0) + '</span>'
      + '</div>'
      + '<div class="casc-pares" id="pares-' + i + '" style="display:none">' + tabelaPares(c) + '</div>'
      + '</div>';
  }).join('');
}

function tabelaPares(c){
  var ps = c.por_par || [];
  if (!ps.length) return '<div class="casc-vazio">sem pares avaliados.</div>';
  var n = function(v, casas){ return v==null ? '—' : (typeof v==='number' ? v.toFixed(casas==null?2:casas) : v); };
  return '<table class="casc-tbl"><thead><tr>'
    + '<th>par</th><th>destino</th><th>SP</th><th>CalTm</th><th>split</th><th>pódio</th><th>desaba</th><th>cat</th><th>chance</th>'
    + '</tr></thead><tbody>'
    + ps.map(function(p){
        var cor = p.vivo ? '#21AB58' : (COR_PENEIRA[p.morreu_em] || '#666');
        return '<tr>'
          + '<td><strong>T' + p.pick_trap + '</strong> ' + esc(p.pick_nome||'')
          +   ' <span class="casc-mut">×</span> <strong>T' + p.outro_trap + '</strong> ' + esc(p.outro_nome||'') + '</td>'
          + '<td><span class="casc-destino" style="border-color:' + cor + ';color:' + cor + '">'
          +   (p.vivo ? 'passou' : esc(p.morreu_rotulo || p.morreu_em || 'morreu')) + '</span></td>'
          + '<td>' + n(p.ratio_sp) + '</td>'
          + '<td>' + n(p.caltm_dif) + '</td>'
          + '<td>' + n(p.split_dif) + '</td>'
          + '<td>' + n(p.podio_dif, 3) + '</td>'
          + '<td>' + (p.desaba_count==null?'—':p.desaba_count) + '</td>'
          + '<td>' + (p.cat_pick==null?'—':(p.cat_pick + ' vs ' + p.cat_outro)) + '</td>'
          + '<td><strong>' + (p.pct==null?'—':p.pct+'%') + '</strong></td>'
          + '</tr>';
      }).join('')
    + '</tbody></table>';
}

function cascAbrir(i){
  var el = $('pares-' + i); if(!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── exemplo didatico de cada corte ──────────────────────────────────────────
async function carregarExemplo(id){
  var alvo = $('ex-' + id); if(!alvo) return;
  var p = PENEIRAS.filter(function(x){ return x.id===id; })[0];
  var v = (p && p.chave) ? estado.cortes[p.chave] : null;
  try {
    var url = DIAG + '/cascata-exemplo?corte=' + id + (v!=null ? '&valor=' + v : '');
    var r = await fetch(url, { credentials:'same-origin' });
    var d = await r.json();
    var e = d && d.exemplo;
    if (!e) { alvo.innerHTML = ''; return; }
    var caso = function(x, ok){
      if (!x) return '';
      return '<div class="casc-caso ' + (ok?'ok':'ko') + '">'
        + '<span class="casc-caso-tag">' + (ok?'passa':'morre') + '</span>'
        + '<span class="casc-caso-txt">' + esc(x.legenda||'') + '</span>'
        + '<span class="casc-caso-num">' + esc(String(x.valor_medido)) + ' ' + esc(e.operador||'') + ' ' + esc(String(e.corte)) + '</span>'
        + '</div>';
    };
    alvo.innerHTML = '<div class="casc-explica">' + esc(e.explica||'') + '</div>'
      + caso(e.passa, true) + caso(e.falha, false);
  } catch(err){ alvo.innerHTML = ''; }
}

// ── aplicar ─────────────────────────────────────────────────────────────────
function resumoDoQueMuda(){
  var linhas = [];
  var f = estado.ultimoFunil;
  var atual = (f && f.cortes) || {};
  PENEIRAS.forEach(function(p){
    if (!p.chave) return;
    var novo = estado.cortes[p.chave], velho = atual[p.chave];
    if (novo != null && velho != null && String(novo) !== String(velho)) {
      linhas.push(p.rotulo + ': ' + velho + ' → ' + novo);
    }
  });
  ['categoria','caltm','split','podio','fumador'].forEach(function(k){
    var on = estado.ativos[k] !== false;
    var era = f && f.ativos ? f.ativos[k] !== false : null;
    if (era != null && era !== on) linhas.push(rotuloDe(k) + (on ? ': passa a filtrar' : ': deixa de filtrar'));
  });
  return linhas;
}

async function cascAplicar(){
  if (estado.aplicando) return;
  var linhas = resumoDoQueMuda();
  var guardaOff = ['sp','pct'].filter(function(id){ return estado.simOff[id]; }).map(rotuloDe);

  var texto = linhas.length
    ? linhas.join('\n')
    : 'Nenhuma diferença em relação ao que já está valendo.';
  if (guardaOff.length) {
    texto += '\n\nATENÇÃO: ' + guardaOff.join(' e ')
      + (guardaOff.length>1 ? ' estão desligadas' : ' está desligada')
      + ' na simulação, mas isso NÃO vai junto: em produção elas continuam valendo.';
  }
  if (!confirm('APLICAR em produção?\n\n' + texto + '\n\nO motor passa a usar esses valores no próximo ciclo.')) return;

  estado.aplicando = true;
  var btn = $('casc-aplicar'); if(btn){ btn.disabled = true; btn.textContent = 'aplicando…'; }
  try {
    var ativos = {};
    ['categoria','caltm','split','podio','fumador'].forEach(function(k){ ativos[k] = estado.ativos[k] !== false; });
    var r = await fetch(DIAG + '/cascata-aplicar', {
      method:'POST', credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ regua: estado.regua, cortes: estado.cortes, ativos: ativos })
    });
    var d = await r.json();
    if (d && d.ok) {
      toast('aplicado. O motor usa esses valores no próximo ciclo.', true);
      $('casc-origem').textContent = 'aplicado em produção agora';
      atualizarFunil();
    } else {
      toast('não aplicou: ' + ((d && d.erro) || 'resposta inesperada'), false);
    }
  } catch(e){ toast('não aplicou: ' + e.message, false); }
  estado.aplicando = false;
  if(btn){ btn.disabled = false; btn.textContent = 'APLICAR em produção'; }
}

function cascData(v){ estado.data = v || ''; atualizarFunil(); }

document.addEventListener('DOMContentLoaded', cascIniciar);