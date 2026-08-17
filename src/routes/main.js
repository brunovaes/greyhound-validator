const express = require('express');
const router = express.Router();
const { db, getUserConfig } = require('../db/database');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');
const { can } = require('../access/store');
const { planLabel } = require('../utils/plans');
const { designTokensCSS } = require('../utils/designTokens');
const { nomeCorridaCompleto, nomePista } = require('../utils/nomesPistas');

const BASE = process.env.BASE_PATH || '/greyhound';
const { CANONICO, aplicarPessoais } = require('../db/compartilhado');
const { exigirAcesso } = require('../middleware/acesso');

function getLogo() {
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(logoPath)) return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  return '';
}

function navBar(user, active) {
  const isAdmin = user.role === 'admin';
  return `<nav id="topnav" style="position:relative;background:#111;border-bottom:1px solid #333;padding:0 20px;display:flex;align-items:center;justify-content:space-between">
    <button id="nav-burger" onclick="toggleNav()" aria-label="Menu" style="display:none;background:none;border:none;color:#e9edf2;font-size:22px;cursor:pointer;padding:10px 8px;line-height:1">&#9776;</button>
    <div id="nav-links" style="display:flex">
      ${can(user,'screen.analisar') ? `<a href="${BASE}" class="nl${active==='analisar'?' na':''}">Analisar</a>` : ''}
      ${can(user,'screen.banca') ? `<a href="${BASE}/banca" class="nl${active==='banca'?' na':''}">Banca</a>` : ''}
      ${isAdmin ? `<a href="${BASE}/config" class="nl${active==='config'?' na':''}">Configurações</a>` : ''}
      ${isAdmin ? `<a href="${BASE}/robot" class="nl${active==='robot'?' na':''}">Painel Admin</a>` : ''}
      ${can(user,'screen.live') ? `<a href="${BASE}/live" class="nl${active==='live'?' na':''}">Live</a>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:14px">
      <a href="${BASE}" id="race-alert-badge" style="display:none;align-items:center;gap:6px;font-size:11px;color:#f97316;text-decoration:none;border:1px solid rgba(249,115,22,.4);background:rgba(249,115,22,.1);border-radius:20px;padding:3px 10px;animation:blink 1.2s ease-in-out infinite">
        <span style="display:inline-block;width:7px;height:7px;background:#f97316;border-radius:50%"></span>
        <span id="race-alert-txt">Corrida em breve</span>
      </a>
      <a href="${BASE}/robot" id="results-badge" style="display:none;align-items:center;gap:6px;font-size:11px;color:#a78bfa;text-decoration:none;border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.1);border-radius:20px;padding:3px 10px;animation:blink 1.5s ease-in-out infinite">
        <span style="display:inline-block;width:7px;height:7px;background:#a78bfa;border-radius:50%"></span>
        <span>Robô Resultados rodando...</span>
      </a>
      <a href="${BASE}/robot" id="robot-badge" style="display:none;align-items:center;gap:6px;font-size:11px;color:#60a5fa;text-decoration:none;border:1px solid rgba(96,165,250,.3);background:rgba(96,165,250,.08);border-radius:20px;padding:3px 10px;animation:blink 1.5s ease-in-out infinite">
        <span style="display:inline-block;width:7px;height:7px;background:#60a5fa;border-radius:50%"></span>
        <span id="robot-badge-txt">Robô rodando...</span>
      </a>
      <span id="nav-userinfo" style="font-size:11px;color:#666">${user.name} · <span style="color:#${user.plan==='premium'?'a78bfa':user.plan==='pro'?'60a5fa':'888'}">${planLabel(user.plan)}</span> · ${user.analyses_used}/${user.analyses_limit===999999?'∞':user.analyses_limit} analises</span>
      <a href="${BASE}/logout" style="font-size:11px;color:#666;text-decoration:none;border:1px solid #333;padding:4px 10px;border-radius:4px">Sair</a>
    </div>
  </nav>
  <script src="${BASE}/static/js/alertaGlobal.js" defer></script>
  <!-- Faixa de avisos dos robos. Nasce OCULTA de proposito: so a tela
       Analisar a exibe (o CSS dela liga o display). Nas outras telas estes
       avisos so ocupavam espaco — sao sobre o dia de corridas, e o Painel
       Admin ou o Configuracoes nao tem o que fazer com eles. -->
  <div id="gf-ticker"><div class="gf-tk-mov"></div></div>
  <div id="gf-avisos" style="display:none">
  <div id="res-banner" style="display:none;align-items:center;justify-content:space-between;padding:8px 20px;background:rgba(249,115,22,.06);border-bottom:1px solid rgba(249,115,22,.15)">
    <span class="gf-rotulo" style="color:#f97316">Robô de Resultados</span><span class="gf-txt gf-completo" style="font-size:12px;color:#f97316">🏁 <strong><span id="res-banner-cnt">0</span> resultados</strong> atualizados às <strong><span id="res-banner-time">--:--</span></strong></span>
    <div style="display:flex;align-items:center;gap:10px">
      <a href="${BASE}/historico" style="font-size:11px;color:#f97316;text-decoration:none;border:1px solid rgba(249,115,22,.3);padding:3px 10px;border-radius:4px;font-weight:600">Ver Histórico →</a>
      <button onclick="dismissResBanner()" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;line-height:1">×</button>
    </div>
  </div>
  <div id="mon-banner" style="display:none;align-items:center;justify-content:space-between;padding:8px 20px;background:rgba(96,165,250,.06);border-bottom:1px solid rgba(96,165,250,.15)">
    <span class="gf-rotulo" style="color:#60a5fa">Robô de Monitoramento</span><span class="gf-txt gf-completo" style="font-size:12px;color:#60a5fa">🔎 <strong><span id="mon-banner-cnt">0</span> mudança(s) no card</strong> detectada(s) às <strong><span id="mon-banner-time">--:--</span></strong> — <span id="mon-banner-reanalyzed"></span></span>
    <div style="display:flex;align-items:center;gap:10px">
      <a href="${BASE}/robot" style="font-size:11px;color:#60a5fa;text-decoration:none;border:1px solid rgba(96,165,250,.3);padding:3px 10px;border-radius:4px;font-weight:600">Ver Robô →</a>
      <button onclick="dismissMonBanner()" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;line-height:1">×</button>
    </div>
  </div>
  <div id="suspicious-banner" style="display:none;align-items:center;justify-content:space-between;padding:8px 20px;background:rgba(239,68,68,.1);border-bottom:1px solid rgba(239,68,68,.3)">
    <span class="gf-rotulo" style="color:#ef4444">Checagem Final</span><span class="gf-txt gf-completo" style="font-size:12px;color:#ef4444">⚠️ <strong>Rodada suspeita</strong> — <span id="suspicious-banner-msg"></span></span>
    <div style="display:flex;align-items:center;gap:10px">
      <a href="${BASE}/robot" style="font-size:11px;color:#ef4444;text-decoration:none;border:1px solid rgba(239,68,68,.4);padding:3px 10px;border-radius:4px;font-weight:600">Ver Robô →</a>
      <button onclick="dismissSuspiciousBanner()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;line-height:1;opacity:.7" title="Fechar (reaparece se continuar suspeito depois)">×</button>
    </div>
  </div>
  <div id="stop-banner" style="display:none;align-items:center;justify-content:space-between;padding:8px 20px;background:rgba(239,68,68,.12);border-bottom:1px solid rgba(239,68,68,.35)">
    <span class="gf-rotulo" style="color:#ef4444">Stop de Banca</span><span class="gf-txt gf-completo" style="font-size:12px;color:#ef4444">&#128721; <strong>Stop do dia atingido</strong> — <span id="stop-banner-msg"></span></span>
    <div style="display:flex;align-items:center;gap:10px">
      <a href="${BASE}/banca" style="font-size:11px;color:#ef4444;text-decoration:none;border:1px solid rgba(239,68,68,.4);padding:3px 10px;border-radius:4px;font-weight:600">Ver Banca →</a>
      <button onclick="dismissStopBanner()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;line-height:1;opacity:.7" title="Fechar (reaparece amanha se acontecer de novo)">×</button>
    </div>
  </div>
  </div>
  <style>
    .nl{padding:12px 18px;color:#888;text-decoration:none;font-size:13px;border-bottom:2px solid transparent;display:inline-block}
    .nl:hover,.na{color:#22c55e!important;border-bottom-color:#22c55e!important}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.5}}
    /* ===== Mobile: menu vira hamburguer e os avisos de robo somem ===== */
    @media(max-width:768px){
      #nav-burger{display:block!important}
      #topnav{padding:0 10px}
      #nav-links{display:none!important;position:absolute;top:100%;left:0;right:0;flex-direction:column;background:#111;border-bottom:1px solid #333;box-shadow:0 10px 26px rgba(0,0,0,.55);z-index:60}
      #nav-links.open{display:flex!important}
      #nav-links .nl{padding:13px 18px;border-bottom:1px solid #222!important;border-left:2px solid transparent}
      #nav-links .nl.na{border-left-color:#22c55e!important}
      #nav-userinfo{display:none!important}
      #race-alert-badge,#results-badge,#robot-badge{display:none!important}
      #res-banner,#mon-banner,#suspicious-banner,#stop-banner{display:none!important}
    }
  </style>
  <script>

// ── Faixa de avisos: 1 ocupa tudo, 2 dividem ao meio, 3 dividem em tres ───
// Os banners mudam de display por JS espalhado pelo arquivo (cada robo mexe no
// seu). Em vez de caçar cada ponto, observamos a faixa e reagimos: sempre que
// um aparece ou some, recalculamos as classes que o CSS usa pra dividir.
(function(){
  var faixa = document.getElementById('gf-avisos');
  if(!faixa) return;
  // So a tela Analisar tem a coluna de foco. Nas outras a faixa fica oculta,
  // como nasceu — sao avisos sobre o dia de corridas, nao tem o que fazer no
  // Painel Admin ou no Configuracoes.
  var col = document.querySelector('.focus-col');
  if(!col) return;
  var ticker = document.getElementById('gf-ticker');
  if(ticker) col.appendChild(ticker);
  // Move a faixa pro fim da coluna de foco: assim ela fica colada no que vem
  // antes (a barra de Odd) em qualquer zoom, em vez de ancorada na janela.
  col.appendChild(faixa);

  function visiveis(){
    return Array.prototype.filter.call(faixa.children, function(d){
      return d.style.display && d.style.display !== 'none';
    });
  }
  function atualizar(){
    var v = visiveis();
    faixa.style.display = v.length ? 'flex' : 'none';
    faixa.classList.toggle('solo',  v.length === 1);
    faixa.classList.toggle('multi', v.length > 1);
    // Banner na tela = ticker sai. Faixa livre = ticker volta, se houver aviso.
    if (ticker) ticker.classList.toggle('on', v.length === 0 && _tkItens.length > 0);
    // Um aviso que sumiu nao pode continuar "aberto" segurando a faixa.
    if (faixa.classList.contains('expandido')) {
      var ab = faixa.querySelector('.aberto');
      if (!ab || ab.style.display === 'none') fechar();
    }
  }
  function fechar(){
    faixa.classList.remove('expandido');
    var ab = faixa.querySelector('.aberto');
    if (ab) ab.classList.remove('aberto');
  }
  // Clique no TEXTO expande. O botao de acao e o × continuam funcionando
  // normalmente porque nao estao na area clicavel.
  faixa.addEventListener('click', function(ev){
    var txt = ev.target.closest && ev.target.closest('.gf-txt');
    if(!txt) return;
    var box = txt.closest('div[id$="-banner"]');
    if(!box) return;
    if (box.classList.contains('aberto')) { fechar(); return; }
    fechar();
    box.classList.add('aberto');
    faixa.classList.add('expandido');
  });

  // ── Alimentacao do ticker ────────────────────────────────────────────────
  // O app.js empurra os avisos do monitoramento aqui (reanalise, skip, cio).
  // Antes eles viravam um toast que sumia em 2,6s — se voce estivesse olhando
  // outra coisa, perdia. Agora ficam rolando ate o fim do dia.
  var _tkItens = [];
  var _TK_MAX = 30;   // teto: evita a faixa virar um log infinito
  window.ghTicker = function(txt){
    if(!txt) return;
    var agora = new Date();
    var hh = String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');
    _tkItens.unshift('<span class="gf-tk-item"><span class="gf-tk-hora">' + hh + '</span> ' + txt + '</span>');
    if(_tkItens.length > _TK_MAX) _tkItens.length = _TK_MAX;
    var mov = ticker && ticker.querySelector('.gf-tk-mov');
    // Duplica a lista pra a volta do loop nao deixar um buraco na faixa.
    if(mov) mov.innerHTML = _tkItens.join('') + _tkItens.join('');
    atualizar();
  };

  // Observa mudancas de style nos 4 banners — e' assim que sabemos que um
  // apareceu ou sumiu, sem precisar alterar o codigo de cada robo.
  var obs = new MutationObserver(atualizar);
  Array.prototype.forEach.call(faixa.children, function(d){
    obs.observe(d, { attributes:true, attributeFilter:['style'] });
  });
  atualizar();
})();

  function toggleNav(){var m=document.getElementById('nav-links'); if(m) m.classList.toggle('open');}
  (function() {
    var BASE = '${BASE}';
    var badge = document.getElementById('robot-badge');
    var badgeTxt = document.getElementById('robot-badge-txt');
    var pdfBanner = document.getElementById('pdf-banner');
    function downloadAndAnalyze() {
      var a = document.createElement('a');
      a.href = BASE + '/api/pdfs/hoje/zip';
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { window.location.href = BASE; }, 1000);
    }
    function dismissPdfBanner() {
      document.getElementById('pdf-banner').style.display = 'none';
      var key = 'pdf_banner_dismissed_' + new Date().toISOString().slice(0,10);
      try { localStorage.setItem(key, 'true'); } catch(e) {}
    }
    function dismissResBanner() {
      var banner = document.getElementById('res-banner');
      banner.style.display = 'none';
      try { localStorage.setItem('res_banner_dismissed', banner.dataset.lastRun || ''); } catch(e) {}
    }
    function dismissMonBanner() {
      var banner = document.getElementById('mon-banner');
      banner.style.display = 'none';
      try { localStorage.setItem('mon_banner_dismissed', banner.dataset.lastRun || ''); } catch(e) {}
    }
    function dismissSuspiciousBanner() {
      var banner = document.getElementById('suspicious-banner');
      var msg = document.getElementById('suspicious-banner-msg').textContent || '';
      banner.style.display = 'none';
      try { localStorage.setItem('suspicious_banner_dismissed', msg); } catch(e) {}
    }
    function dismissStopBanner() {
      var banner = document.getElementById('stop-banner');
      var today = new Date().toISOString().slice(0,10);
      banner.style.display = 'none';
      try { localStorage.setItem('stop_banner_dismissed', today); } catch(e) {}
    }
    function checkStopBanner() {
      var today = new Date().toISOString().slice(0,10);
      fetch(BASE + '/banca/data?view=day&date=' + today).then(function(r){return r.json();}).then(function(d){
        var banner = document.getElementById('stop-banner');
        if (!banner || !d.ok || !d.stopHit) { if(banner) banner.style.display='none'; return; }
        var dismissed = false;
        try { dismissed = localStorage.getItem('stop_banner_dismissed') === today; } catch(e) {}
        if (dismissed) return;
        document.getElementById('stop-banner-msg').textContent = d.avisoStop + ' (prejuízo hoje: ' + d.pctDia.toFixed(1) + '%, limite: ' + d.pctStop + '%)';
        banner.style.display = 'flex';
      }).catch(function(){});
    }
    function checkRobots() {
      Promise.all([
        fetch(BASE + '/robot/status').then(function(r){return r.json();}).catch(function(){return {};}),
        fetch(BASE + '/robot/results/status').then(function(r){return r.json();}).catch(function(){return {};}),
        fetch(BASE + '/robot/monitor/status').then(function(r){return r.json();}).catch(function(){return {};})
      ]).then(function(results) {
        var pdf = results[0]; var res = results[1]; var mon = results[2];
        var resultsBadge = document.getElementById('results-badge');
        if (resultsBadge) resultsBadge.style.display = res.running ? 'flex' : 'none';
        if (pdf.running) {
          badge.style.display = 'flex';
          badgeTxt.textContent = 'Robô PDF: ' + (pdf.progress||0) + '/' + (pdf.total||'?');
        } else if (mon.running) {
          badge.style.display = 'flex';
          badgeTxt.textContent = 'Robô Monitoramento: ' + (mon.processed||0) + ' verificadas...';
        } else {
          badge.style.display = 'none';
        }
        // Invariante de sanidade: rodada suspeita (taxa de falha alta) fica
        // visivel aqui mesmo, sem precisar abrir a aba Robo
        var susBanner = document.getElementById('suspicious-banner');
        if (susBanner) {
          var reasons = [];
          if (res.suspicious) reasons.push('Resultados: ' + res.suspiciousReason);
          if (mon.suspicious) reasons.push('Monitoramento: ' + mon.suspiciousReason);
          if (reasons.length) {
            var reasonsText = reasons.join(' | ');
            document.getElementById('suspicious-banner-msg').textContent = reasonsText;
            var dismissed = false;
            try { dismissed = localStorage.getItem('suspicious_banner_dismissed') === reasonsText; } catch(e) {}
            susBanner.style.display = dismissed ? 'none' : 'flex';
          } else {
            susBanner.style.display = 'none';
          }
        }
      });
    }
    function checkPdfBanner() {
      fetch(BASE + '/api/pdfs/hoje').then(function(r){return r.json();}).then(function(d){
        if (d.count > 0 && pdfBanner) {
          var key = 'pdf_banner_dismissed_' + new Date().toISOString().slice(0,10);
          var dismissed = false;
          try { dismissed = localStorage.getItem(key) === 'true'; } catch(e) {}
          if (dismissed) return;
          document.getElementById('pdf-banner-cnt').textContent = d.count;
          pdfBanner.style.display = 'flex';
        }
      }).catch(function(){});
    }
    function checkResultsBanner() {
      fetch(BASE + '/robot/results/status').then(function(r){return r.json();}).then(function(d){
        if (!d.lastRun || !d.updated) return;
        var resBanner = document.getElementById('res-banner');
        if (!resBanner) return;
        var dismissed = false;
        try { dismissed = localStorage.getItem('res_banner_dismissed') === d.lastRun; } catch(e) {}
        if (dismissed) return;
        var lastRun = new Date(d.lastRun);
        var diff = (Date.now() - lastRun) / 60000;
        if (diff < 35) {
          var h = String(lastRun.getHours()).padStart(2,'0');
          var m = String(lastRun.getMinutes()).padStart(2,'0');
          document.getElementById('res-banner-time').textContent = h + ':' + m;
          document.getElementById('res-banner-cnt').textContent = d.updated;
          resBanner.dataset.lastRun = d.lastRun;
          resBanner.style.display = 'flex';
        }
      }).catch(function(){});
    }
    function checkMonitorBanner() {
      fetch(BASE + '/robot/monitor/status').then(function(r){return r.json();}).then(function(d){
        if (!d.lastRun || !d.changed) return;
        var monBanner = document.getElementById('mon-banner');
        if (!monBanner) return;
        var dismissed = false;
        try { dismissed = localStorage.getItem('mon_banner_dismissed') === d.lastRun; } catch(e) {}
        if (dismissed) return;
        var lastRun = new Date(d.lastRun);
        var diff = (Date.now() - lastRun) / 60000;
        if (diff < 70) {
          var h = String(lastRun.getHours()).padStart(2,'0');
          var m = String(lastRun.getMinutes()).padStart(2,'0');
          document.getElementById('mon-banner-time').textContent = h + ':' + m;
          document.getElementById('mon-banner-cnt').textContent = d.changed;
          document.getElementById('mon-banner-reanalyzed').textContent = d.reanalyzed ? (d.reanalyzed + ' reanalisada(s) automaticamente') : 'confira manualmente';
          monBanner.dataset.lastRun = d.lastRun;
          monBanner.style.display = 'flex';
        }
      }).catch(function(){});
    }
    checkRobots();
    checkPdfBanner();
    checkResultsBanner();
    checkMonitorBanner();
    checkStopBanner();
    setInterval(function(){ checkRobots(); checkResultsBanner(); checkMonitorBanner(); checkStopBanner(); }, 60000);
    setInterval(checkRobots, 4000);

    // ── Alerta de corrida proxima, em QUALQUER pagina do site (nao so na
    // Analisar) — pedido do Bruno em 14/07/2026. Usa sessionStorage pra nao
    // repetir o som pra mesma corrida ao navegar entre paginas.
    var alertedRacesGlobal = {};
    try { var stored = sessionStorage.getItem('alertedRacesGlobal'); if (stored) alertedRacesGlobal = JSON.parse(stored); } catch(e) {}
    function salvarAlertedRacesGlobal() { try { sessionStorage.setItem('alertedRacesGlobal', JSON.stringify(alertedRacesGlobal)); } catch(e) {} }

    function tocarSino(ctx){function tone(freq,start,dur){var o=ctx.createOscillator();var g=ctx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(0.3,ctx.currentTime+start+0.02);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+dur);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.05);}tone(1046.5,0,0.25);tone(1318.5,0.15,0.35);}
    function tocarBeep(ctx){function tone(freq,start,dur){var o=ctx.createOscillator();var g=ctx.createGain();o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(0.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(0.2,ctx.currentTime+start+0.01);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+dur);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.03);}tone(1500,0,0.08);tone(1500,0.14,0.08);}
    function tocarAlarme(ctx){function tone(freq,start,dur){var o=ctx.createOscillator();var g=ctx.createGain();o.type='sawtooth';o.frequency.value=freq;g.gain.setValueAtTime(0.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(0.22,ctx.currentTime+start+0.02);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+dur);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+dur+0.05);}tone(880,0,0.15);tone(660,0.15,0.15);tone(880,0.30,0.15);tone(660,0.45,0.15);}
    function tocarSuave(ctx){var o=ctx.createOscillator();var g=ctx.createGain();o.type='sine';o.frequency.value=700;g.gain.setValueAtTime(0.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.15,ctx.currentTime+0.05);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.6);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime);o.stop(ctx.currentTime+0.65);}
    var SONS_GLOBAIS = { sino: tocarSino, beep: tocarBeep, alarme: tocarAlarme, suave: tocarSuave };
    function tocarSomAlertaGlobal(escolha) {
      try { var ctx = new (window.AudioContext||window.webkitAudioContext)(); (SONS_GLOBAIS[escolha]||tocarSino)(ctx); } catch(e) {}
    }

    function minutosAteAgoraGlobal(horaBr) {
      if (!horaBr) return null;
      var now = new Date();
      var nowMin = now.getHours()*60+now.getMinutes();
      var p = horaBr.split(':');
      var raceMin = parseInt(p[0]||0)*60+parseInt(p[1]||0);
      return raceMin - nowMin;
    }

    function checkRaceProximity() {
      fetch(BASE + '/api/proxima-corrida').then(function(r){return r.json();}).then(function(d){
        var badge = document.getElementById('race-alert-badge');
        if (!badge || !d.races || !d.races.length) { if(badge) badge.style.display='none'; return; }
        var alertaMin = d.alerta_min_antes || 3;
        var proxima = null, proximaMin = 999;
        d.races.forEach(function(r) {
          var mins = minutosAteAgoraGlobal(r.hora_br);
          if (mins !== null && mins >= 0 && mins <= alertaMin && mins < proximaMin) { proxima = r; proximaMin = mins; }
        });
        if (!proxima) { badge.style.display = 'none'; return; }
        document.getElementById('race-alert-txt').textContent = proxima.corrida + ' em ' + proximaMin + ' min';
        badge.style.display = 'flex';
        // O SOM saiu daqui de proposito. Este bloco cuida so do SELO no menu.
        // Quem toca e' o app.js (tela Analisar) ou o alertaGlobal.js (demais
        // telas) — os dois respeitam o "Alarme para filtro selecionado"
        // (turno/pista/classe, som e cor), coisa que este trecho antigo nunca
        // fez. Manter os dois tocando duplicava o aviso.
      }).catch(function(){});
    }
    checkRaceProximity();
    setInterval(checkRaceProximity, 15000);
    // Expor funções de dismiss globalmente
    window.dismissPdfBanner = dismissPdfBanner;
    window.dismissResBanner = dismissResBanner;
    window.dismissMonBanner = dismissMonBanner;
    window.dismissSuspiciousBanner = dismissSuspiciousBanner;
    window.dismissStopBanner = dismissStopBanner;
    window.downloadAndAnalyze = downloadAndAnalyze;
  })();
  </script>`;
}

// Serve o JS do cliente como arquivo separado
router.get('/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(require('path').join(__dirname, '../../src/app.js'));
});

// ─── PWA / Web Push ────────────────────────────────────────────────────────
// O service worker PRECISA ser servido daqui (BASE + '/sw.js') e nao de
// /static/js/. Um service worker so controla paginas ABAIXO do caminho de onde
// foi entregue: servido de /greyhound/static/js/, o escopo seria
// /greyhound/static/ e ele nao controlaria tela nenhuma do sistema.
router.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache');   // SW velho em cache e' fonte classica de dor de cabeca
  res.sendFile(require('path').join(__dirname, '../../public/sw.js'));
});

// Manifest do PWA. Gerado aqui em vez de arquivo estatico porque precisa do
// BASE_PATH real nas URLs.
router.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.json({
    name: 'Greyhound Factory',
    short_name: 'Greyhound Factory',   // o iOS anexa este nome a toda notificacao ("from ...")
    description: 'Analise de corridas de galgos',
    start_url: BASE + '/',
    scope: BASE + '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0D1117',
    theme_color: '#0D1117',
    icons: [
      { src: BASE + '/static/img/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: BASE + '/static/img/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ]
  });
});

router.get('/', exigirAcesso('screen.analisar'), (req, res) => {
  const user = req.user;
  const config = getUserConfig(user.id);
  // Sessoes e corridas sao do SISTEMA: le sempre o canonico, nao o login.
  const sessions = db.prepare('SELECT * FROM race_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 7').all(CANONICO);
  // new Date() roda no SERVIDOR (Railway = UTC), nao no relogio do Bruno.
  // Sem o ajuste de -3h, depois das 21h BRT o servidor ja calcula a data de
  // AMANHA (UTC ja virou o dia seguinte), fazendo o "Historico do dia" achar
  // que nao existe sessao de hoje mesmo ela existindo.
  const hojeStr = (function(){ var n=new Date(Date.now() - 3*60*60*1000); return String(n.getUTCDate()).padStart(2,'0')+'/'+String(n.getUTCMonth()+1).padStart(2,'0')+'/'+n.getUTCFullYear(); })();
  const sessaoHoje = sessions.find(s => s.name === 'Races ' + hojeStr);
  const stats = db.prepare("SELECT COUNT(*) as t, SUM(CASE WHEN bateu='sim' THEN 1 ELSE 0 END) as a FROM races WHERE user_id=? AND bateu IS NOT NULL AND bateu!=''").get(CANONICO);
  const taxa = stats.t > 0 ? Math.round(stats.a/stats.t*100) : 0;
  const logoB64 = getLogo();

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Greyhound Validator</title>
<!-- PWA: esta e' a start_url do manifest, entao e' daqui que o "Adicionar a
     Tela de Inicio" do Safari deve ser feito. No iOS o Web Push SO funciona a
     partir do icone instalado, nunca da aba normal do navegador. -->
<link rel="manifest" href="${BASE}/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Greyhound Factory">
<meta name="theme-color" content="#0D1117">
<link rel="apple-touch-icon" sizes="180x180" href="${BASE}/static/img/icon-180.png">
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>

/* ── Faixa de avisos, LADO A LADO, colada abaixo da barra de Odd ───────────
   NAO usa position:fixed de proposito. Fixed ancora na JANELA, entao com zoom
   o conteudo terminava mais acima e sobrava um vao entre a barra de Odd e a
   faixa. Aqui ela entra no fluxo normal da coluna de foco: fica sempre colada
   no que vem antes, em qualquer zoom, e ocupa a largura toda da area util.

   1 aviso ocupa tudo; 2 dividem ao meio; 3 dividem em tres. Sem empilhamento,
   nao ha o que se sobrepor (antes o "bottom" era chutado em multiplos de 38px
   e um cobria o outro — chegou a cobrir a propria barra de Odd). */
#gf-avisos{
  display:none;gap:1px;background:rgba(255,255,255,.06);
  border-top:1px solid rgba(255,255,255,.06);
}
#gf-avisos > div{
  flex:1 1 0;min-width:0;                 /* min-width:0 permite truncar o texto */
  align-items:center;justify-content:space-between;gap:8px;
  padding:7px 12px;border:none!important;
}
/* Expandido: o clicado toma a faixa e os outros somem. */
#gf-avisos.expandido > div{display:none!important}
#gf-avisos.expandido > div.aberto{display:flex!important;flex:1 1 100%}
/* Texto cortado quando divide a faixa, inteiro quando sozinho ou expandido. */
#gf-avisos .gf-txt{
  flex:1;min-width:0;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;
}
#gf-avisos.expandido .gf-txt,#gf-avisos.solo .gf-txt{white-space:normal;font-size:12px}
/* Nome do robo: so aparece quando ha mais de um aviso dividindo a faixa. */
#gf-avisos .gf-rotulo{display:none;font-weight:800;font-size:10px;letter-spacing:.3px;white-space:nowrap;cursor:pointer}
#gf-avisos.multi .gf-rotulo{display:inline}
#gf-avisos.multi:not(.expandido) .gf-completo{display:none}


/* ── Ticker: avisos do monitoramento rolando na faixa ──────────────────────
   So aparece quando a faixa esta LIVRE. Assim que qualquer banner surge, ele
   sai de cena — banners tem prioridade porque exigem acao (tem botao) e ficam
   ate voce fechar, enquanto texto em movimento e' dificil de ler sob pressao,
   justo quando faltam minutos pra corrida. */
#gf-ticker{
  display:none;overflow:hidden;white-space:nowrap;
  background:rgba(96,165,250,.05);border-top:1px solid rgba(96,165,250,.15);
  padding:6px 0;font-size:11px;color:#9aa4b2;
}
#gf-ticker.on{display:block}
#gf-ticker .gf-tk-mov{
  display:inline-block;padding-left:100%;
  animation:gfTicker 30s linear infinite;
}
/* Pausa no hover: da pra ler um aviso especifico sem esperar dar a volta. */
#gf-ticker:hover .gf-tk-mov{animation-play-state:paused}
#gf-ticker .gf-tk-item{margin-right:44px}
#gf-ticker .gf-tk-hora{color:#60a5fa;font-weight:700}
@keyframes gfTicker{
  0%{transform:translateX(0)}
  100%{transform:translateX(-100%)}
}

${designTokensCSS()}
.main{display:grid;grid-template-columns:250px 1fr;min-height:calc(100vh - 175px)}
.main.focus-mode{grid-template-columns:250px 170px 1fr}
@media(max-width:768px){
  .main,.main.focus-mode{grid-template-columns:1fr;min-height:0}
  .sidebar{border-right:none;border-bottom:1px solid var(--bdr2)}
  .main.focus-mode .race-list-col{border-right:none;border-bottom:1px solid var(--bdr2);max-height:340px}
  .main.focus-mode .focus-col{min-width:0}
  .content{padding:12px 10px}
  .tw{max-width:100%}
}
.sidebar{background:var(--sur);border-right:1px solid var(--bdr2);padding:16px;display:flex;flex-direction:column;gap:11px;overflow-y:auto}
.sidebar h2{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--mut)}
.tabnav{background:#161B27;border:1px solid #222;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:2px}
.tabbtn{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;background:none;border:none;color:#888;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;transition:all .15s;text-decoration:none;box-sizing:border-box}
.tabbtn:hover{background:rgba(34,197,94,.08);color:#ccc}
.tabbtn.active{background:rgba(34,197,94,.12);color:#22c55e}
.uz{border:2px dashed var(--bdr2);border-radius:8px;padding:16px 12px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.uz:hover,.uz.drag{border-color:var(--grn);background:rgba(34,197,94,.08)}
.uz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.uz strong{color:var(--grn);display:block;font-size:12px;margin-bottom:2px}.uz p{font-size:10px;color:var(--mut2);line-height:1.4}
.flist{display:flex;flex-direction:column;gap:4px;max-height:90px;overflow-y:auto;margin-top:5px}
.fi{display:flex;align-items:center;gap:5px;background:var(--sur2);border:1px solid var(--bdr);border-radius:5px;padding:4px 8px;font-size:10px}
.fi-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fi-st{font-size:9px;padding:1px 6px;border-radius:8px;flex-shrink:0}
.fi-ok{background:rgba(34,197,94,.15);color:var(--grn)}.fi-load{background:rgba(249,115,22,.15);color:var(--org)}.fi-err{background:rgba(239,68,68,.12);color:var(--red)}
.fi-rm{background:none;border:none;color:var(--mut);cursor:pointer;font-size:13px;padding:0}.fi-rm:hover{color:var(--red)}
.btn-go{width:100%;padding:11px;background:var(--grn);color:#000;font-weight:700;font-size:13px;border:none;border-radius:var(--rad);cursor:pointer}
.btn-go:hover{background:var(--grn2)}.btn-go:disabled{opacity:.35;cursor:not-allowed}
.btn-sm{width:100%;padding:6px;background:transparent;color:var(--grn);font-size:11px;border:1px solid rgba(34,197,94,.3);border-radius:var(--rad);cursor:pointer;font-weight:600;transition:all .2s;display:none}
.dv{height:1px;background:var(--bdr2)}
.sess-link{display:block;font-size:11px;color:var(--mut2);text-decoration:none;padding:3px 0;border-bottom:1px solid var(--bdr)}
.sess-link:hover{color:var(--grn)}.sess-link span{float:right;color:var(--mut)}
.content{padding:18px;overflow-y:auto}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.kpi{background:var(--sur);border:1px solid var(--bdr2);border-radius:8px;padding:10px 14px;position:relative;overflow:hidden}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.kpi.g::before{background:var(--grn)}.kpi.o::before{background:var(--org)}.kpi.b::before{background:#3b82f6}.kpi.p::before{background:#8b5cf6}
.kpi-label{font-size:10px;color:var(--mut2);margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px}
.kpi-val{font-size:22px;font-weight:700}.kpi.g .kpi-val{color:var(--grn)}.kpi.o .kpi-val{color:var(--org)}.kpi.b .kpi-val{color:#60a5fa}.kpi.p .kpi-val{color:#a78bfa}
.pw{margin-bottom:10px;display:none}.pb{height:3px;background:var(--bdr2);border-radius:2px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,var(--grn),var(--org));transition:width .4s}.pt{font-size:11px;color:var(--mut2);margin-top:3px}
.st{font-size:12px;color:var(--mut2);margin-bottom:8px;min-height:16px}
.tw{overflow-x:auto;border:1px solid var(--bdr2);border-radius:8px}
table{width:100%;border-collapse:collapse;min-width:880px}thead{background:var(--sur2)}
th{padding:9px 10px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--bdr2);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid var(--bdr);vertical-align:middle}tr:last-child td{border-bottom:none}
tr.row-avb td{background:rgba(34,197,94,.03)}tr.row-avb td:first-child{border-left:3px solid var(--grn)}tr.row-avb:hover td{background:rgba(34,197,94,.08)}
tr.sk td{opacity:.35}tr.sk td:first-child{border-left:3px solid var(--bdr2)}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
.ba{background:rgba(34,197,94,.15);color:var(--grn);border:1px solid rgba(34,197,94,.3)}
.bm{background:rgba(249,115,22,.12);color:var(--org);border:1px solid rgba(249,115,22,.25)}
.bb{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.25)}
.bs{background:rgba(100,100,100,.1);color:var(--mut2);border:1px solid var(--bdr2)}
.cbar{width:48px;height:3px;background:var(--bdr2);border-radius:2px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:4px}
.cfill{height:100%;border-radius:2px}.cfg{background:var(--grn)}.cfa{background:var(--org)}.cfr{background:var(--red)}
.trap-row{display:flex;align-items:center;gap:6px}.trap-item{display:flex;flex-direction:column;align-items:center;gap:2px}
.trap-name{font-size:9px;color:var(--mut);text-align:center;max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.trap-vs{color:var(--mut);font-size:12px;font-weight:600}
.obs-c{font-size:11px;color:var(--mut2);line-height:1.5}
.obs-cap{font-size:11px;color:var(--org);line-height:1.5}
td input[type=text]{width:50px;padding:3px 6px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:4px;color:var(--txt);font-size:11px}
td input:focus{outline:none;border-color:var(--grn)}
td select{padding:3px 6px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:4px;color:var(--txt);font-size:11px;cursor:pointer}
.cap-btn{font-size:10px;padding:3px 9px;border:1px solid var(--org);border-radius:4px;background:rgba(249,115,22,.08);color:var(--org);cursor:pointer;font-weight:600}
.cap-ok{font-size:11px;color:var(--grn)}
.empty{text-align:center;padding:50px 20px;color:var(--mut)}.empty h3{font-size:15px;color:var(--mut2);margin-bottom:6px}
.empty p{font-size:12px;line-height:1.6;max-width:380px;margin:0 auto}
.ab{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
.bexp{padding:7px 14px;background:var(--sur2);border:1px solid var(--bdr2);color:var(--mut2);border-radius:var(--rad);cursor:pointer;font-size:12px}
.bexp:hover{border-color:var(--grn);color:var(--grn)}
.bsave{padding:7px 14px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--grn);border-radius:var(--rad);cursor:pointer;font-size:12px;font-weight:600}
.bsave:hover{background:rgba(34,197,94,.2)}
/* ── Race list column ── */
.race-list-col{display:none;background:var(--sur);border-right:1px solid var(--bdr2);overflow-y:auto}
.main.focus-mode .race-list-col{display:block}
.main.focus-mode .content{display:none}
.main.focus-mode .focus-col{display:flex}
.focus-col{display:none;flex-direction:column;overflow-y:auto;background:var(--bg);flex:1}
.rc{padding:7px 10px;border-bottom:1px solid var(--bdr2);cursor:pointer;transition:all .15s;border-left:3px solid transparent;position:relative}
.rc:hover{background:rgba(34,197,94,.05);border-left-color:rgba(34,197,94,.3)}
.rc.rc-active{background:rgba(34,197,94,.09);border-left-color:var(--grn)}
.rc-time{font-size:16px;font-weight:700;color:var(--grn);line-height:1.1}
.rc-name{font-size:10px;color:rgba(255,255,255,.8);margin:3px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc-next-badge{display:block;font-size:8px;background:var(--grn);color:#000;border-radius:3px;padding:1px 5px;font-weight:700;margin-bottom:4px;align-self:flex-start}
.rc-traps{display:flex;align-items:center;gap:4px}
/* ── Focus panel ── */
.fp-hdr{padding:10px 18px;border-bottom:1px solid var(--bdr2);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;min-height:52px;background:var(--sur)}
.fp-race-title{font-size:14px;font-weight:700;color:#fff}
.fp-race-meta{font-size:11px;color:var(--mut2);margin-top:1px}
.fp-toggle-tbl{padding:4px 10px;font-size:11px;background:transparent;border:1px solid var(--bdr2);color:var(--mut2);border-radius:4px;cursor:pointer}
.fp-toggle-tbl:hover{border-color:var(--grn);color:var(--grn)}
.fp-arena{display:flex;align-items:flex-end;padding:12px 20px 0;gap:0;flex-shrink:0;background:radial-gradient(ellipse at center bottom,rgba(34,197,94,.04) 0%,transparent 70%)}
.fp-dog-side{flex:1;display:flex;flex-direction:column;align-items:center;padding-bottom:8px}
.fp-dog-img{height:190px;object-fit:contain;max-width:100%;filter:drop-shadow(0 8px 24px rgba(0,0,0,.5));transition:all .3s}
.fp-dog-und .fp-dog-img{transform:scaleX(-1)}
.fp-dog-name{font-size:17px;font-weight:700;color:#fff;margin-top:6px;text-align:center}
.fp-dog-perfil{font-size:11px;font-weight:600;margin-top:3px;text-align:center;letter-spacing:.3px;opacity:.85}
.fp-dog-trap{margin-bottom:6px}
.fp-center{width:80px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:28px;gap:2px}
.fp-vence-lbl{font-size:8px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.3);text-transform:uppercase}
.fp-vence-arrow{font-size:26px;color:var(--grn);animation:pulse-arrow 1.5s ease-in-out infinite}
@keyframes pulse-arrow{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.9)}}
.fp-gauges-row{display:flex;justify-content:space-around;padding:8px 16px 10px;flex-shrink:0;gap:4px}
.fp-gauges-grp{display:flex;gap:8px;flex:1;justify-content:center}
.fp-gauges-div{width:1px;background:var(--bdr2);margin:0 8px;align-self:stretch}
.fp-gauge{display:flex;flex-direction:column;align-items:center;gap:2px}
.fp-gauge-lbl{font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.4px;text-align:center}
.fp-inputs-row{display:flex;gap:12px;padding:8px 18px;border-top:1px solid var(--bdr2);align-items:center;flex-wrap:wrap;flex-shrink:0;background:var(--sur)}
.fp-inp-group{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mut2)}
.fp-inp-group input{width:64px;padding:4px 8px;background:var(--sur2);border:1px solid var(--bdr2);border-radius:4px;color:var(--txt);font-size:12px;font-weight:600}
.fp-inp-group input:focus{outline:none;border-color:var(--grn)}
.fp-conf-badge{padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700}
.fp-obs{padding:8px 18px 12px;font-size:11px;color:var(--mut2);line-height:1.6;border-top:1px solid var(--bdr2);flex-shrink:0;overflow-y:auto;max-height:90px}
.pdf-ready-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:1000;align-items:center;justify-content:center}
.pdf-ready-modal.open{display:flex}
.pdf-ready-box{background:#111;border:1px solid #333;border-radius:12px;padding:28px 32px;text-align:center;max-width:420px;border-top:3px solid #22c55e}
.pdf-ready-icon{font-size:48px;margin-bottom:12px}
.pdf-ready-box h3{font-size:17px;font-weight:700;color:#f0f0f0;margin-bottom:8px}
.pdf-ready-box p{font-size:13px;color:#888;margin-bottom:20px;line-height:1.6}
.pdf-ready-ok{padding:10px 28px;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:6px;cursor:pointer;font-size:14px}
.pdf-ready-ok:hover{background:#16a34a}
@media print{
  .hero,.sidebar,.kpis,.pw,.st,.ab,nav,.bexp,.bsave,#btn-print,.cap-btn,.fi-rm,
  .col-sel-full,.col-perf,.col-res,.col-bat,.col-cap,.col-odd,
  th.th-sel,th.th-perf,th.th-res,th.th-bat,th.th-cap,th.th-odd,
  td.td-sel,td.td-perf,td.td-res,td.td-bat,td.td-cap,td.td-odd{display:none!important}
  body{background:#fff!important;color:#000!important;font-size:10px!important}
  .tw{border:none!important}
  table{min-width:unset!important;width:100%!important;font-size:9px!important}
  th{color:#333!important;background:#f0f0f0!important;padding:4px 6px!important;font-size:8px!important}
  td{color:#000!important;border-color:#ddd!important;padding:4px 6px!important;font-size:9px!important}
  .main{display:block!important}
  .content{padding:4px!important}
  .badge{border:1px solid #999!important;color:#000!important;background:#eee!important;font-size:8px!important}
  .trap-badge{border:1px solid #999!important;color:#000!important;background:#eee!important;width:18px!important;height:18px!important;font-size:9px!important}
  .trap-name{display:none!important}
  tr.sk{display:none!important}
  .obs-c,.obs-cap{max-width:none!important;font-size:9px!important;color:#000!important}
  .perfil-badge{display:none!important}
  .win-tag,.hora-br,.top3-tag{display:none!important}
}

.modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;align-items:flex-start;justify-content:center;padding-top:60px;overflow-y:auto}
.modal-bg.open{display:flex}.modal{background:var(--sur);border:1px solid var(--bdr2);border-radius:10px;padding:22px;width:500px;max-width:95vw;border-top:3px solid var(--org)}
.modal h3{font-size:15px;font-weight:700;color:var(--org);margin-bottom:6px}.modal p{font-size:12px;color:var(--mut2);margin-bottom:14px;line-height:1.6}
.modal-upload{border:2px dashed var(--bdr2);border-radius:8px;padding:16px;text-align:center;cursor:pointer;position:relative;margin-bottom:10px;transition:all .2s}
.modal-upload:hover{border-color:var(--org);background:rgba(249,115,22,.08)}
.modal-upload input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.modal-upload strong{color:var(--org);display:block;font-size:12px;margin-bottom:3px}
.cap-st{font-size:12px;padding:6px 10px;border-radius:5px;margin-bottom:8px;display:none}
.cap-st.ok{background:rgba(34,197,94,.1);color:var(--grn)}.cap-st.er{background:rgba(239,68,68,.1);color:var(--red)}
.flist-modal{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;max-height:120px;overflow-y:auto}
.modal-acts{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}
.bok{padding:9px 20px;background:var(--grn);color:#000;font-weight:700;border:none;border-radius:var(--rad);cursor:pointer}.bok:hover{background:var(--grn2)}
.bca{padding:9px 14px;background:transparent;color:var(--mut2);border:1px solid var(--bdr2);border-radius:var(--rad);cursor:pointer}
.spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(0,0,0,.2);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
/* ==== Ajustes mobile Analisar (itens 1-3) — no fim para vencer as regras base ==== */
@media(max-width:768px){
  .sidebar{border-right:none!important}
  .sess-recentes-box{display:none!important}
  .acertos-sidebar{display:none!important}
  .acertos-mobile{display:flex!important}
  .fp-gauges-row{display:none!important}
  .fp-dog-name{font-size:13px!important}
  .fp-dog-perfil{font-size:10px!important}
  /* Esconde "Carregar PDFs" no mobile (o robo coleta os PDFs automaticamente) */
  #rz{display:none!important}
  /* Centraliza as mensagens do painel (ex: "Corridas encerradas"): no desktop
     elas usam margin-left:-85px pra compensar a coluna Proximas; no mobile isso
     jogava o texto pra esquerda. */
  .focus-col > div{margin-left:0!important}
  /* Modal de confronto/relatorio (injetado pelo app.js): em tela cheia no
     mobile usando a altura real do aparelho, rolando ate o fim (corrige o
     corte do iOS). !important pra vencer o estilo que o app.js injeta depois. */
  #val-modal{align-items:stretch!important;padding:10px!important}
  #val-box{width:100%!important;max-width:100%!important;height:100%!important;max-height:100%!important;overflow:hidden!important}
  #val-hdr{flex-shrink:0!important}
  #val-body{flex:1 1 auto!important;min-height:0!important;height:auto!important;overflow-x:auto!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch}
  #val-body.val-compact{max-height:none!important}
  /* Conteudo do relatorio/confronto: alinhado a esquerda e sem centralizar,
     pra rolagem horizontal comecar mostrando o inicio (nome do galgo) */
  #val-body > *{margin-left:0!important;margin-right:0!important}
  .val-dog{overflow-x:visible!important}
  .val-tbl{table-layout:auto!important;width:auto!important;min-width:560px!important}
}
</style></head><body>
<div class="hero">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Validator">` : '<div style="height:130px;background:#000;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#22c55e">GREYHOUND VALIDATOR</div>'}</div>
${navBar(user, 'analisar')}
<div class="main" id="main-layout">
  <!-- Botao "Automaticamente" foi removido da UI, mas o app.js (servido de src/app.js)
       ainda pode referenciar #btngo. Este elemento oculto evita erro de JS
       (getElementById('btngo') nunca retorna null). -->
  <button id="btngo" style="display:none" aria-hidden="true" tabindex="-1"></button>
  <div class="sidebar">
    <div style="margin-bottom:-3px">
      <h2>Analisar corridas</h2>
      <div class="tabnav">
        <label class="tabbtn active" id="rz" for="race-input">
          <input type="file" accept=".pdf" multiple id="race-input" style="display:none">
          &#128193; Carregar PDF
        </label>
        ${can(user,'analisar.carga_vip') ? `<a href="${BASE}/carga-vip" class="tabbtn" id="btn-carga-vip">&#11088; Carga VIP</a>` : ''}
        <a href="${BASE}/historico" class="tabbtn">&#128220; Históricos</a>
      </div>
      <div class="flist" id="rlist"></div>
    </div>
    <div class="dv"></div>
    ${sessaoHoje ? `<a href="${BASE}/sessao/${sessaoHoje.id}" class="st-link" title="Abrir a sessao de hoje" style="text-decoration:none;display:block">` : ''}<div class="st" id="st" style="font-size:11px;color:var(--mut2);text-align:center;margin:-4px 0 -2px;min-height:16px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>${sessaoHoje ? `</a>` : ''}
    <button class="btn-sm" id="btn-clear" style="display:none">Limpar</button>
    <div class="dv"></div>
    <div class="sess-recentes-box">
      <h2 style="margin-bottom:6px">Sessoes recentes</h2>
      <div id="sessoes-recentes-slot">${sessions.map(s => `<a href="${BASE}/sessao/${s.id}" class="sess-link">${s.name||'Sessao '+s.id}<span>${s.total_avbs} AvBs</span></a>`).join('') || '<span style="font-size:11px;color:var(--mut)">Nenhuma sessao salva</span>'}</div>
    </div>
    <div class="acertos-box acertos-sidebar" style="display:flex;gap:8px;margin-top:8px">
      <div style="flex:1;background:#161B27;border:1px solid #262b38;border-radius:8px;padding:10px 8px;text-align:center">
        <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Acertos do dia</div>
        <div id="acertos-dia" class="acertos-dia-val" style="font-size:20px;font-weight:700;color:#666">-</div>
      </div>
      <div style="flex:1;background:#161B27;border:1px solid #262b38;border-radius:8px;padding:10px 8px;text-align:center">
        <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Acertos do mês</div>
        <div id="acertos-mes" class="acertos-mes-val" style="font-size:20px;font-weight:700;color:#666">-</div>
      </div>
    </div>
  </div>
  <div class="race-list-col" id="race-list-col"></div>
  <div class="focus-col" id="focus-col"></div>
  <div class="content">
    <div class="pw" id="pw"><div class="pb"><div class="pf" id="pf" style="width:0%"></div></div><div class="pt" id="pt"></div></div>
    <div class="kpis">
      <div class="kpi b"><div class="kpi-label">PDFs carregados</div><div class="kpi-val" id="sp">-</div></div>
      <div class="kpi g"><div class="kpi-label">Corridas AvB</div><div class="kpi-val" id="sa">-</div></div>
      <div class="kpi o"><div class="kpi-label">Alta confianca</div><div class="kpi-val" id="sal">-</div></div>
      <div class="kpi p"><div class="kpi-label">Taxa acerto geral</div><div class="kpi-val">${taxa}%</div></div>
    </div>
    <div class="tw">
      <table><thead><tr>
        <th style="width:75px;text-align:center">Hora</th><th style="width:130px;text-align:center">Corrida</th><th style="width:170px;text-align:center">Selecao</th><th style="width:85px;text-align:center">Confianca</th><th style="text-align:left;padding-left:12px">Observacao</th><th style="width:105px;text-align:center">Odd / Valor</th><th style="width:105px;text-align:center">Resultado</th><th style="width:65px;text-align:center">Bateu</th><th style="width:50px;text-align:center">Cap</th>
      </tr></thead>
      <tbody id="tb"><tr><td colspan="11"><div class="empty"><h3>Nenhuma corrida analisada</h3><p>Carregue PDFs e clique em Analisar.</p></div></td></tr></tbody></table>
    </div>
    <div class="ab" id="ab" style="display:none">
      <button class="bexp" onclick="enterFocusMode()" style="border-color:rgba(34,197,94,.3);color:#22c55e">&#9654; Voltar ao Foco</button>
      <button class="bexp" id="btn-exp">Exportar CSV</button>
    </div>
  </div>
  <div class="acertos-box acertos-mobile" style="display:none;gap:8px;margin-top:4px;padding:0 10px 16px">
    <div style="flex:1;background:#161B27;border:1px solid #262b38;border-radius:8px;padding:10px 8px;text-align:center">
      <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Acertos do dia</div>
      <div id="acertos-dia-m" style="font-size:20px;font-weight:700;color:#666">-</div>
    </div>
    <div style="flex:1;background:#161B27;border:1px solid #262b38;border-radius:8px;padding:10px 8px;text-align:center">
      <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Acertos do mês</div>
      <div id="acertos-mes-m" style="font-size:20px;font-weight:700;color:#666">-</div>
    </div>
  </div>
</div>
<script>
/* Espelha os valores de Acertos (preenchidos pelo app.js na copia da sidebar)
   para a copia do rodape usada no mobile — assim funciona independe da versao do app.js. */
(function(){
  function espelharAcertos(){
    [['acertos-dia','acertos-dia-m'],['acertos-mes','acertos-mes-m']].forEach(function(p){
      var src=document.getElementById(p[0]), dst=document.getElementById(p[1]);
      if(src&&dst){ dst.textContent=src.textContent; dst.style.color=src.style.color; }
    });
  }
  document.addEventListener('DOMContentLoaded', espelharAcertos);
  setInterval(espelharAcertos, 1200);
})();
</script>

<div class="pdf-ready-modal" id="pdf-ready-modal">
  <div class="pdf-ready-box">
    <div class="pdf-ready-icon">&#9989;</div>
    <h3>PDFs prontos!</h3>
    <p>Seus PDFs já estão disponíveis para realização das análises.</p>
    <button class="pdf-ready-ok" id="btn-pdf-ready-ok">OK</button>
  </div>
</div>

<div class="modal-bg" id="cap-modal">
  <div class="modal">
    <h3 id="cm-title">Capivara necessaria</h3>
    <p id="cm-body">Carregue o print ou PDF.</p>
    <div class="modal-upload"><input type="file" id="cap-modal-inp" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple><strong>Clique, arraste ou cole (Ctrl+V)</strong><p>JPG PNG PDF aceitos · Ctrl+V para colar print</p></div>
    <div class="cap-st" id="cap-st"></div>
    <div class="flist-modal" id="cap-modal-list"></div>
    <div class="modal-acts"><button class="bca" id="btn-cap-cancel">Cancelar</button><button class="bok" id="btn-cap-ok" disabled>Validar e Reanalisar</button></div>
  </div>
</div>

<script>var BASE='${BASE}';var SS_KEY='ghf_results_v1';</script>
<script src="${BASE}/app.js"></script></body></html>`);
});

router.get('/live', exigirAcesso('screen.live'), (req, res) => {
  const user = req.user;
  const logoB64 = getLogo();
  // URLs fixas das pistas (ajustar aqui quando precisar trocar)
  const SISRACING_URL = process.env.SISRACING_URL || 'https://www.sisracing.tv/?autoplay=1';
  const GHBR_URL = process.env.GHBR_URL || 'https://tv.greyhoundbrasil.com/';
  // Recorte de cada tela dentro do greyhoundbrasil (uma em cima da outra na pagina
  // original). Valores calibrados manualmente via /live/calibrar em 06/07/2026.
  const GHBR_1 = {
    top: process.env.GHBR_TOP_1 || '-262',
    left: process.env.GHBR_LEFT_1 || '-457',
    width: process.env.GHBR_WIDTH_1 || '1920',
    height: process.env.GHBR_HEIGHT_1 || '1954',
    scale: process.env.GHBR_SCALE_1 || '48'
  };
  const GHBR_2 = {
    top: process.env.GHBR_TOP_2 || '-571',
    left: process.env.GHBR_LEFT_2 || '-3',
    width: process.env.GHBR_WIDTH_2 || '1920',
    height: process.env.GHBR_HEIGHT_2 || '3840',
    scale: process.env.GHBR_SCALE_2 || '48'
  };
  const SIS_CROP = {
    top: process.env.SIS_TOP || '-34',
    left: process.env.SIS_LEFT || '-165',
    width: process.env.SIS_WIDTH || '2029',
    height: process.env.SIS_HEIGHT || '1078',
    scale: process.env.SIS_SCALE || '38'
  };
  function ghbrFrameStyle(c) {
    return 'position:absolute;top:' + c.top + 'px;left:' + c.left + 'px;'
      + 'width:' + c.width + 'px;height:' + c.height + 'px;'
      + 'transform:scale(' + (parseInt(c.scale, 10) / 100) + ');transform-origin:top left;border:none;';
  }
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live - Greyhound Validator</title>
<style>
${designTokensCSS()}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
.content{padding:16px 20px;max-width:1900px;margin:0 auto}
h1{font-size:18px;font-weight:700;margin-bottom:12px}
.live-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
@media(max-width:1200px){.live-grid{grid-template-columns:1fr 1fr}}
@media(max-width:700px){.live-grid{grid-template-columns:1fr}}
.live-panel{background:#161B27;border:1px solid #222;border-radius:10px;overflow:hidden}
.live-panel h3{font-size:11px;color:#666;padding:6px 10px;border-bottom:1px solid #222;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.live-crop{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.live-crop iframe{position:absolute;top:-65px;left:0;width:100%;height:600px;border:none}
.live-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#555;font-size:12px;text-align:center;padding:20px;gap:10px}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'live')}
<div class="content">
<h1>Live — Acompanhamento Simultaneo</h1>
<div class="live-grid">
  <div class="live-panel">
    <h3>SIS Racing</h3>
    <div class="live-crop">
      ${SISRACING_URL ? `<iframe src="${SISRACING_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen style="${ghbrFrameStyle(SIS_CROP)}"></iframe>` : '<div class="live-empty">Nao configurado</div>'}
    </div>
  </div>
  <div class="live-panel">
    <h3>Greyhound Brasil — Tela 1</h3>
    <div class="live-crop">
      ${GHBR_URL ? `<iframe src="${GHBR_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen style="${ghbrFrameStyle(GHBR_1)}"></iframe>` : '<div class="live-empty">Nao configurado</div>'}
    </div>
  </div>
  <div class="live-panel">
    <h3>Greyhound Brasil — Tela 2</h3>
    <div class="live-crop">
      ${GHBR_URL ? `<iframe src="${GHBR_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen style="${ghbrFrameStyle(GHBR_2)}"></iframe>` : '<div class="live-empty">Nao configurado</div>'}
    </div>
  </div>
</div>
</div>
</body></html>`);
});

router.get('/live/popup', exigirAcesso('screen.live'), (req, res) => {
  const SISRACING_URL = process.env.SISRACING_URL || 'https://www.sisracing.tv/?autoplay=1';
  const GHBR_URL = process.env.GHBR_URL || 'https://tv.greyhoundbrasil.com/';
  const GHBR_1 = {
    top: process.env.GHBR_TOP_1 || '-262',
    left: process.env.GHBR_LEFT_1 || '-457',
    width: process.env.GHBR_WIDTH_1 || '1920',
    height: process.env.GHBR_HEIGHT_1 || '1954',
    scale: process.env.GHBR_SCALE_1 || '48'
  };
  const GHBR_2 = {
    top: process.env.GHBR_TOP_2 || '-571',
    left: process.env.GHBR_LEFT_2 || '-3',
    width: process.env.GHBR_WIDTH_2 || '1920',
    height: process.env.GHBR_HEIGHT_2 || '3840',
    scale: process.env.GHBR_SCALE_2 || '48'
  };
  const SIS_CROP = {
    top: process.env.SIS_TOP || '-34',
    left: process.env.SIS_LEFT || '-165',
    width: process.env.SIS_WIDTH || '2029',
    height: process.env.SIS_HEIGHT || '1078',
    scale: process.env.SIS_SCALE || '38'
  };
  function ghbrFrameStyle(c) {
    return 'position:absolute;top:' + c.top + 'px;left:' + c.left + 'px;'
      + 'width:' + c.width + 'px;height:' + c.height + 'px;'
      + 'transform:scale(' + (parseInt(c.scale, 10) / 100) + ');transform-origin:top left;border:none;';
  }
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live - Greyhound Validator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;height:100vh;overflow:hidden;display:flex;align-items:center}
.live-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;width:100%}
@media(max-width:1200px){.live-grid{grid-template-columns:1fr 1fr}}
@media(max-width:700px){.live-grid{grid-template-columns:1fr}}
.live-crop{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.live-crop iframe{position:absolute;top:-65px;left:0;width:100%;height:600px;border:none}
.live-empty{display:flex;align-items:center;justify-content:center;height:100%;color:#555;font-size:13px;text-align:center;padding:20px;font-family:sans-serif}
</style></head><body>
<div class="live-grid">
  <div class="live-crop">
    ${SISRACING_URL ? `<iframe src="${SISRACING_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen style="${ghbrFrameStyle(SIS_CROP)}"></iframe>` : '<div class="live-empty">Nao configurado</div>'}
  </div>
  <div class="live-crop">
    ${GHBR_URL ? `<iframe src="${GHBR_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen style="${ghbrFrameStyle(GHBR_1)}"></iframe>` : '<div class="live-empty">Nao configurado</div>'}
  </div>
  <div class="live-crop">
    ${GHBR_URL ? `<iframe src="${GHBR_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen style="${ghbrFrameStyle(GHBR_2)}"></iframe>` : '<div class="live-empty">Nao configurado</div>'}
  </div>
</div>
</body></html>`);
});

// ─── Calibrador manual de recorte de iframe (top/left/largura/altura/zoom) ───
// Ferramenta so pra admin ajustar visualmente o crop de uma pagina de terceiros
// dentro do painel, sem precisar ficar chutando valor e fazendo deploy.
router.get('/live/calibrar', requireAdmin, (req, res) => {
  const targetUrl = req.query.url || process.env.GHBR_URL || 'https://tv.greyhoundbrasil.com/';
  // Largura real de um painel na producao (hoje com 3 colunas). Calculo:
  // .content max-width 1900px, gap 14px entre as 3 colunas -> (1900 - 2*14) / 3 ≈ 624px.
  // Se o layout de colunas mudar de novo, passe ?boxwidth=NNN pra recalibrar certo.
  const BOX_WIDTH = parseInt(req.query.boxwidth, 10) || 624;
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calibrador de Tela - Greyhound Validator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px}
.wrap{display:grid;grid-template-columns:340px 1fr;height:100vh}
.panel{background:#111;border-right:1px solid #333;padding:16px;overflow-y:auto}
.panel h2{font-size:14px;margin-bottom:14px;color:#22c55e}
.panel .box-note{font-size:11px;color:#666;margin-bottom:14px;line-height:1.5;background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:8px 10px}
.panel .box-note b{color:#22c55e}
.field{margin-bottom:14px}
.field label{display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px}
.field label span{color:#22c55e;font-weight:700;font-family:monospace}
.field input[type=range]{width:100%}
.field input[type=number]{width:80px;padding:4px 6px;background:#1a1a1a;border:1px solid #333;border-radius:4px;color:#f0f0f0;font-size:12px}
.field-row{display:flex;gap:8px;align-items:center}
.url-field{width:100%;padding:6px 8px;background:#1a1a1a;border:1px solid #333;border-radius:4px;color:#f0f0f0;font-size:12px;margin-bottom:14px}
.btn{width:100%;padding:9px;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:6px;cursor:pointer;font-size:12px;margin-top:6px}
.btn:hover{background:#16a34a}
.btn-sec{background:transparent;border:1px solid #333;color:#888}
.btn-sec:hover{border-color:#22c55e;color:#22c55e}
pre{background:#000;border:1px solid #333;border-radius:6px;padding:10px;font-size:11px;color:#60a5fa;white-space:pre-wrap;word-break:break-all;margin-top:10px}
.stage{background:#000;display:flex;align-items:center;justify-content:center;padding:20px}
.crop-box{position:relative;width:100%;max-width:${BOX_WIDTH}px;aspect-ratio:16/9;overflow:hidden;background:#000;border:1px solid #333;border-radius:8px}
.crop-box iframe{position:absolute;border:none}
</style></head><body>
<div class="wrap">
  <div class="panel">
    <h2>&#127919; Calibrador de Recorte</h2>
    <div class="box-note">Preview usando <b>${BOX_WIDTH}px</b> de largura — o tamanho real de 1 painel na tela Live hoje (layout de 3 colunas). Se o numero de paineis mudar, adicione <code>?boxwidth=NNN</code> na URL pra recalibrar certo.</div>
    <label style="display:block;font-size:11px;color:#888;margin-bottom:5px;text-transform:uppercase">URL alvo</label>
    <input type="text" class="url-field" id="c-url" value="${targetUrl}">
    <button class="btn btn-sec" onclick="reloadFrame()">&#8635; Recarregar pagina</button>

    <div class="field" style="margin-top:16px">
      <label>Top (px) <span id="v-top">0</span></label>
      <div class="field-row">
        <input type="range" id="r-top" min="-3000" max="500" value="0" oninput="syncFromRange('top')">
        <input type="number" id="n-top" value="0" onchange="syncFromNumber('top')">
      </div>
    </div>
    <div class="field">
      <label>Left (px) <span id="v-left">0</span></label>
      <div class="field-row">
        <input type="range" id="r-left" min="-2000" max="500" value="0" oninput="syncFromRange('left')">
        <input type="number" id="n-left" value="0" onchange="syncFromNumber('left')">
      </div>
    </div>
    <div class="field">
      <label>Largura do iframe (px) <span id="v-width">1920</span></label>
      <div class="field-row">
        <input type="range" id="r-width" min="320" max="3840" value="1920" oninput="syncFromRange('width')">
        <input type="number" id="n-width" value="1920" onchange="syncFromNumber('width')">
      </div>
    </div>
    <div class="field">
      <label>Altura do iframe (px) <span id="v-height">1080</span></label>
      <div class="field-row">
        <input type="range" id="r-height" min="320" max="3840" value="1080" oninput="syncFromRange('height')">
        <input type="number" id="n-height" value="1080" onchange="syncFromNumber('height')">
      </div>
    </div>
    <div class="field">
      <label>Zoom / escala <span id="v-scale">100</span>%</label>
      <div class="field-row">
        <input type="range" id="r-scale" min="10" max="300" value="100" oninput="syncFromRange('scale')">
        <input type="number" id="n-scale" value="100" onchange="syncFromNumber('scale')">
      </div>
    </div>

    <button class="btn" onclick="copyValues()">&#128203; Copiar valores</button>
    <pre id="out"></pre>
  </div>
  <div class="stage">
    <div class="crop-box" id="box">
      <iframe id="frame" src="${targetUrl}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen></iframe>
    </div>
  </div>
</div>
<script>
var vals={top:0,left:0,width:1920,height:1080,scale:100};

function applyStyle(){
  var f=document.getElementById('frame');
  f.style.top=vals.top+'px';
  f.style.left=vals.left+'px';
  f.style.width=vals.width+'px';
  f.style.height=vals.height+'px';
  f.style.transform='scale('+(vals.scale/100)+')';
  f.style.transformOrigin='top left';
  updateOutput();
}

function syncFromRange(key){
  var r=document.getElementById('r-'+key);
  var n=document.getElementById('n-'+key);
  var v=document.getElementById('v-'+key);
  vals[key]=parseInt(r.value,10);
  n.value=r.value;
  v.textContent=r.value;
  applyStyle();
}

function syncFromNumber(key){
  var r=document.getElementById('r-'+key);
  var n=document.getElementById('n-'+key);
  var v=document.getElementById('v-'+key);
  vals[key]=parseInt(n.value,10)||0;
  r.value=vals[key];
  v.textContent=vals[key];
  applyStyle();
}

function updateOutput(){
  var css='position:absolute;top:'+vals.top+'px;left:'+vals.left+'px;'
    +'width:'+vals.width+'px;height:'+vals.height+'px;'
    +'transform:scale('+(vals.scale/100)+');transform-origin:top left;border:none;';
  document.getElementById('out').textContent =
    'CSS do iframe:\\n'+css+
    '\\n\\nEnv vars (se for essa tela):\\nGHBR_TOP=' +vals.top+
    '\\nGHBR_LEFT='+vals.left+
    '\\nGHBR_IFRAME_WIDTH='+vals.width+
    '\\nGHBR_IFRAME_HEIGHT='+vals.height+
    '\\nGHBR_SCALE='+vals.scale;
}

function copyValues(){
  var txt=document.getElementById('out').textContent;
  navigator.clipboard.writeText(txt).then(function(){
    alert('Copiado! Cola aqui no chat ou no Railway.');
  }).catch(function(){
    alert('Nao consegui copiar automaticamente — seleciona o texto manualmente.');
  });
}

function reloadFrame(){
  var url=document.getElementById('c-url').value;
  document.getElementById('frame').src=url;
}

applyStyle();
</script>
</body></html>`);
});

// ─── Calibrador das 3 telas ao mesmo tempo, no MESMO layout exato da aba Live ───
// Evita o problema de calibrar num mockup de tamanho diferente do real.
router.get('/live/calibrar3', requireAdmin, (req, res) => {
  const P1_URL = req.query.p1 || process.env.SISRACING_URL || 'https://www.sisracing.tv/?autoplay=1';
  const P2_URL = req.query.p2 || process.env.GHBR_URL || 'https://tv.greyhoundbrasil.com/';
  const P3_URL = req.query.p3 || process.env.GHBR_URL || 'https://tv.greyhoundbrasil.com/';

  const P1_INIT = {
    top: process.env.SIS_TOP || '-299', left: process.env.SIS_LEFT || '-458',
    width: process.env.SIS_WIDTH || '1920', height: process.env.SIS_HEIGHT || '3840',
    scale: process.env.SIS_SCALE || '48'
  };
  const P2_INIT = {
    top: process.env.GHBR_TOP_1 || '-28', left: process.env.GHBR_LEFT_1 || '-131',
    width: process.env.GHBR_WIDTH_1 || '1920', height: process.env.GHBR_HEIGHT_1 || '763',
    scale: process.env.GHBR_SCALE_1 || '37'
  };
  const P3_INIT = {
    top: process.env.GHBR_TOP_2 || '-571', left: process.env.GHBR_LEFT_2 || '-3',
    width: process.env.GHBR_WIDTH_2 || '1920', height: process.env.GHBR_HEIGHT_2 || '3840',
    scale: process.env.GHBR_SCALE_2 || '48'
  };

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calibrador 3 Telas - Greyhound Validator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
.content{padding:16px 20px;max-width:1900px;margin:0 auto}
h1{font-size:16px;font-weight:700;margin-bottom:4px}
.sub{font-size:12px;color:#888;margin-bottom:14px}
.live-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
@media(max-width:1200px){.live-grid{grid-template-columns:1fr 1fr}}
@media(max-width:700px){.live-grid{grid-template-columns:1fr}}
.live-panel{background:#161B27;border:1px solid #222;border-radius:10px;overflow:hidden}
.live-panel h3{font-size:11px;color:#666;padding:6px 10px;border-bottom:1px solid #222;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.live-crop{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.live-crop iframe{position:absolute;border:none}
.ctrl{padding:10px;background:#161B27;border-top:1px solid #222;display:flex;flex-direction:column;gap:6px}
.ctrl-row{display:flex;align-items:center;gap:6px;font-size:10px}
.ctrl-row label{width:34px;color:#888;text-transform:uppercase;flex-shrink:0}
.ctrl-row input[type=range]{flex:1}
.ctrl-row input[type=number]{width:62px;padding:3px 5px;background:#0D1117;border:1px solid #333;border-radius:4px;color:#f0f0f0;font-size:11px}
.ctrl-row span{width:36px;text-align:right;color:#22c55e;font-family:monospace;font-size:10px}
.ctrl-url{width:100%;padding:5px 7px;background:#0D1117;border:1px solid #333;border-radius:4px;color:#f0f0f0;font-size:11px;margin-bottom:2px}
.btn-copy{padding:6px;background:#22c55e;color:#000;font-weight:700;border:none;border-radius:5px;cursor:pointer;font-size:11px;margin-top:2px}
.btn-copy:hover{background:#16a34a}
pre{background:#000;border:1px solid #333;border-radius:5px;padding:6px 8px;font-size:9px;color:#60a5fa;white-space:pre-wrap;word-break:break-all;margin-top:4px;max-height:90px;overflow-y:auto}
</style></head><body>
<div class="content">
<h1>&#127919; Calibrador — 3 Telas Simultaneas</h1>
<div class="sub">Layout identico a aba Live real (mesma grade de 3 colunas) — o que voce ve aqui e o tamanho exato de producao. Ajusta cada painel e copia os valores.</div>
<div class="live-grid">

  <div class="live-panel">
    <h3>SIS Racing</h3>
    <div class="live-crop"><iframe id="f-p1" src="${P1_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen></iframe></div>
    <div class="ctrl">
      <input type="text" class="ctrl-url" id="url-p1" value="${P1_URL}" onchange="document.getElementById('f-p1').src=this.value">
      <div class="ctrl-row"><label>Top</label><input type="range" id="r-p1-top" min="-3000" max="500" value="${P1_INIT.top}" oninput="sync('p1','top')"><input type="number" id="n-p1-top" value="${P1_INIT.top}" onchange="syncN('p1','top')"><span id="v-p1-top">${P1_INIT.top}</span></div>
      <div class="ctrl-row"><label>Left</label><input type="range" id="r-p1-left" min="-2000" max="500" value="${P1_INIT.left}" oninput="sync('p1','left')"><input type="number" id="n-p1-left" value="${P1_INIT.left}" onchange="syncN('p1','left')"><span id="v-p1-left">${P1_INIT.left}</span></div>
      <div class="ctrl-row"><label>Larg</label><input type="range" id="r-p1-width" min="320" max="3840" value="${P1_INIT.width}" oninput="sync('p1','width')"><input type="number" id="n-p1-width" value="${P1_INIT.width}" onchange="syncN('p1','width')"><span id="v-p1-width">${P1_INIT.width}</span></div>
      <div class="ctrl-row"><label>Alt</label><input type="range" id="r-p1-height" min="320" max="3840" value="${P1_INIT.height}" oninput="sync('p1','height')"><input type="number" id="n-p1-height" value="${P1_INIT.height}" onchange="syncN('p1','height')"><span id="v-p1-height">${P1_INIT.height}</span></div>
      <div class="ctrl-row"><label>Zoom</label><input type="range" id="r-p1-scale" min="10" max="300" value="${P1_INIT.scale}" oninput="sync('p1','scale')"><input type="number" id="n-p1-scale" value="${P1_INIT.scale}" onchange="syncN('p1','scale')"><span id="v-p1-scale">${P1_INIT.scale}</span></div>
      <button class="btn-copy" onclick="copyVals('p1')">&#128203; Copiar SIS Racing</button>
      <pre id="out-p1"></pre>
    </div>
  </div>

  <div class="live-panel">
    <h3>Greyhound Brasil — Tela 1</h3>
    <div class="live-crop"><iframe id="f-p2" src="${P2_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen></iframe></div>
    <div class="ctrl">
      <input type="text" class="ctrl-url" id="url-p2" value="${P2_URL}" onchange="document.getElementById('f-p2').src=this.value">
      <div class="ctrl-row"><label>Top</label><input type="range" id="r-p2-top" min="-3000" max="500" value="${P2_INIT.top}" oninput="sync('p2','top')"><input type="number" id="n-p2-top" value="${P2_INIT.top}" onchange="syncN('p2','top')"><span id="v-p2-top">${P2_INIT.top}</span></div>
      <div class="ctrl-row"><label>Left</label><input type="range" id="r-p2-left" min="-2000" max="500" value="${P2_INIT.left}" oninput="sync('p2','left')"><input type="number" id="n-p2-left" value="${P2_INIT.left}" onchange="syncN('p2','left')"><span id="v-p2-left">${P2_INIT.left}</span></div>
      <div class="ctrl-row"><label>Larg</label><input type="range" id="r-p2-width" min="320" max="3840" value="${P2_INIT.width}" oninput="sync('p2','width')"><input type="number" id="n-p2-width" value="${P2_INIT.width}" onchange="syncN('p2','width')"><span id="v-p2-width">${P2_INIT.width}</span></div>
      <div class="ctrl-row"><label>Alt</label><input type="range" id="r-p2-height" min="320" max="3840" value="${P2_INIT.height}" oninput="sync('p2','height')"><input type="number" id="n-p2-height" value="${P2_INIT.height}" onchange="syncN('p2','height')"><span id="v-p2-height">${P2_INIT.height}</span></div>
      <div class="ctrl-row"><label>Zoom</label><input type="range" id="r-p2-scale" min="10" max="300" value="${P2_INIT.scale}" oninput="sync('p2','scale')"><input type="number" id="n-p2-scale" value="${P2_INIT.scale}" onchange="syncN('p2','scale')"><span id="v-p2-scale">${P2_INIT.scale}</span></div>
      <button class="btn-copy" onclick="copyVals('p2')">&#128203; Copiar Tela 1</button>
      <pre id="out-p2"></pre>
    </div>
  </div>

  <div class="live-panel">
    <h3>Greyhound Brasil — Tela 2</h3>
    <div class="live-crop"><iframe id="f-p3" src="${P3_URL}" scrolling="no" allow="autoplay; fullscreen" allowfullscreen></iframe></div>
    <div class="ctrl">
      <input type="text" class="ctrl-url" id="url-p3" value="${P3_URL}" onchange="document.getElementById('f-p3').src=this.value">
      <div class="ctrl-row"><label>Top</label><input type="range" id="r-p3-top" min="-3000" max="500" value="${P3_INIT.top}" oninput="sync('p3','top')"><input type="number" id="n-p3-top" value="${P3_INIT.top}" onchange="syncN('p3','top')"><span id="v-p3-top">${P3_INIT.top}</span></div>
      <div class="ctrl-row"><label>Left</label><input type="range" id="r-p3-left" min="-2000" max="500" value="${P3_INIT.left}" oninput="sync('p3','left')"><input type="number" id="n-p3-left" value="${P3_INIT.left}" onchange="syncN('p3','left')"><span id="v-p3-left">${P3_INIT.left}</span></div>
      <div class="ctrl-row"><label>Larg</label><input type="range" id="r-p3-width" min="320" max="3840" value="${P3_INIT.width}" oninput="sync('p3','width')"><input type="number" id="n-p3-width" value="${P3_INIT.width}" onchange="syncN('p3','width')"><span id="v-p3-width">${P3_INIT.width}</span></div>
      <div class="ctrl-row"><label>Alt</label><input type="range" id="r-p3-height" min="320" max="3840" value="${P3_INIT.height}" oninput="sync('p3','height')"><input type="number" id="n-p3-height" value="${P3_INIT.height}" onchange="syncN('p3','height')"><span id="v-p3-height">${P3_INIT.height}</span></div>
      <div class="ctrl-row"><label>Zoom</label><input type="range" id="r-p3-scale" min="10" max="300" value="${P3_INIT.scale}" oninput="sync('p3','scale')"><input type="number" id="n-p3-scale" value="${P3_INIT.scale}" onchange="syncN('p3','scale')"><span id="v-p3-scale">${P3_INIT.scale}</span></div>
      <button class="btn-copy" onclick="copyVals('p3')">&#128203; Copiar Tela 2</button>
      <pre id="out-p3"></pre>
    </div>
  </div>

</div>
</div>
<script>
var vals={
  p1:{top:${P1_INIT.top},left:${P1_INIT.left},width:${P1_INIT.width},height:${P1_INIT.height},scale:${P1_INIT.scale}},
  p2:{top:${P2_INIT.top},left:${P2_INIT.left},width:${P2_INIT.width},height:${P2_INIT.height},scale:${P2_INIT.scale}},
  p3:{top:${P3_INIT.top},left:${P3_INIT.left},width:${P3_INIT.width},height:${P3_INIT.height},scale:${P3_INIT.scale}}
};

function applyStyle(p){
  var f=document.getElementById('f-'+p);
  var v=vals[p];
  f.style.top=v.top+'px';
  f.style.left=v.left+'px';
  f.style.width=v.width+'px';
  f.style.height=v.height+'px';
  f.style.transform='scale('+(v.scale/100)+')';
  f.style.transformOrigin='top left';
  updateOutput(p);
}

function sync(p,key){
  var r=document.getElementById('r-'+p+'-'+key);
  var n=document.getElementById('n-'+p+'-'+key);
  var s=document.getElementById('v-'+p+'-'+key);
  vals[p][key]=parseInt(r.value,10);
  n.value=r.value;
  s.textContent=r.value;
  applyStyle(p);
}

function syncN(p,key){
  var r=document.getElementById('r-'+p+'-'+key);
  var n=document.getElementById('n-'+p+'-'+key);
  var s=document.getElementById('v-'+p+'-'+key);
  vals[p][key]=parseInt(n.value,10)||0;
  r.value=vals[p][key];
  s.textContent=vals[p][key];
  applyStyle(p);
}

function updateOutput(p){
  var v=vals[p];
  var css='position:absolute;top:'+v.top+'px;left:'+v.left+'px;'
    +'width:'+v.width+'px;height:'+v.height+'px;'
    +'transform:scale('+(v.scale/100)+');transform-origin:top left;border:none;';
  document.getElementById('out-'+p).textContent = css;
}

function copyVals(p){
  var v=vals[p];
  var txt='CSS:\\n'+document.getElementById('out-'+p).textContent
    +'\\n\\nValores:\\nTOP='+v.top+' LEFT='+v.left+' WIDTH='+v.width+' HEIGHT='+v.height+' SCALE='+v.scale;
  navigator.clipboard.writeText(txt).then(function(){
    alert('Copiado! Cola aqui no chat.');
  }).catch(function(){
    alert('Nao consegui copiar — seleciona manualmente no quadro preto.');
  });
}

applyStyle('p1'); applyStyle('p2'); applyStyle('p3');
</script>
</body></html>`);
});

// Catalogo das artes dos galgos, usado pela tela Carga VIP. Os arquivos vivem
// em public/img/dogs, nomeados Trap<N>_<pelagem>.png: o TRAP ja vem certo no
// arquivo (manga da cor certa) e o que varia e' a pelagem.
// Prefere a pasta mini/ (gerada por tools/miniaturasDogs.js): os originais tem
// ~2,3 MB cada, o que passa na Analisar (uma corrida por vez) mas nao numa
// lista com dezenas de linhas.
// Lido do disco uma vez e guardado: a pasta so muda em deploy.
let _dogsCache = null;
function catalogoGalgos() {
  if (_dogsCache) return _dogsCache;
  const base = path.join(__dirname, '../../public/img/dogs');
  const mini = path.join(base, 'mini');
  let dir = base, url = BASE + '/static/img/dogs/';
  try {
    if (fs.existsSync(mini) && fs.readdirSync(mini).some(f => /\.png$/i.test(f))) {
      dir = mini; url = BASE + '/static/img/dogs/mini/';
    }
  } catch (e) { /* sem mini: fica no original */ }
  const porTrap = {};
  try {
    fs.readdirSync(dir).filter(f => /\.png$/i.test(f)).sort().forEach(f => {
      const m = f.match(/^Trap(\d)_/i);
      if (!m) return;
      (porTrap[m[1]] = porTrap[m[1]] || []).push(url + encodeURIComponent(f));
    });
  } catch (e) { /* sem pasta: a tela cai na bolinha com o numero do trap */ }
  _dogsCache = porTrap;
  return porTrap;
}

// Chegada e resultado das corridas da Carga VIP.
//
// POR QUE ISTO EXISTE AQUI, e nao no /api/carga-vip: o dado ja esta no banco.
// O robo de resultados grava races.finishing_order_json, e e' de la que a tela
// Historico tira o "Bateu". Esta rota so faz o mesmo caminho pras corridas da
// lista VIP, sem esperar mudanca no motor.
//
// O resultado NAO e' recalculado aqui: usamos bateuPar(), a mesma funcao do
// Historico e dos KPIs. Se a tela fizesse a propria conta, uma divergencia
// entre ela e o Historico seria impossivel de arbitrar depois.
//
// Recebe os pares porque quem sabe qual disputa vale e' a lista (o pick e o
// outro vem do motor, e nao sao necessariamente o fav e o und da corrida).
router.post('/carga-vip/resultados', exigirAcesso('analisar.carga_vip'), express.json(), (req, res) => {
  try {
    const { date, pares } = req.body || {};
    if (!Array.isArray(pares) || !pares.length) return res.json({});
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'data invalida' });

    const { bateuPar } = require('../utils/avbResultado');

    // Uma consulta so pro dia inteiro, em vez de uma por corrida. Mesmo filtro
    // de dia usado no resto do sistema: sessao canonica, hora de Brasilia.
    const linhas = db.prepare(
      "SELECT r.hora, r.corrida, r.finishing_order_json, r.race_card " +
      "FROM races r JOIN race_sessions s ON s.id = r.session_id " +
      "WHERE s.user_id = ? AND date(s.created_at,'-3 hours') = ?"
    ).all(CANONICO, date);

    const porChave = new Map();
    for (const l of linhas) porChave.set(l.hora + '|' + l.corrida, l);

    const json = (t) => { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } };

    const out = {};
    for (const p of pares) {
      const chave = String(p.hora || '') + '|' + String(p.corrida || '');
      const l = porChave.get(chave);
      if (!l) continue;
      const chegada = json(l.finishing_order_json);
      if (!Array.isArray(chegada) || !chegada.length) { out[chave] = { chegada: null, bateu: null }; continue; }

      // bateu: true | false | null. O null (galgo fora da chegada, dead heat)
      // e' repassado como null de proposito: na tela ele fica NEUTRO, igual ao
      // "-" do Historico. Virar false pintaria de vermelho o que ninguem errou.
      const b = bateuPar(l.finishing_order_json, p.a, p.b);

      // nome por trap, so pro tooltip das bolinhas. Melhor esforco: o formato
      // do race_card varia entre analises antigas e novas.
      const nomes = {};
      const card = json(l.race_card);
      const lista = Array.isArray(card) ? card : (card && card.galgos) || [];
      for (const g of lista) {
        if (g && g.trap != null) nomes[String(g.trap)] = String(g.nome || g.name || '').trim();
      }

      out[chave] = { chegada, bateu: b, nomes };
    }
    res.json(out);
  } catch (e) {
    console.error('[carga-vip/resultados]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Dados dos dois galgos de uma disputa, pro painel "Analisar disputa" da tela
// Carga VIP. Sob demanda de proposito: mandar o historico de todos os galgos
// junto com a lista deixaria a tela pesada a toa (dezenas de corridas).
//
// FONTE DO HISTORICO, e a ressalva que vem junto:
// usamos hist_fav/hist_und quando o trap pedido e' o favorito ou o underdog da
// analise, e hist_all para os demais. Nao e' a mesma fonte da tela Analisar,
// que prefere o aHist/bHist vindo do robo ao vivo (mais completo) e que nao
// fica gravado no banco. Ou seja: para a MESMA disputa, este painel pode
// mostrar algumas linhas a menos que o da Analisar. E' a mesma fonte que a
// tela /sessao ja usa, entao pelo menos as duas telas de consulta concordam.
router.get('/carga-vip/disputa', exigirAcesso('analisar.carga_vip'), (req, res) => {
  try {
    const hora = String(req.query.hora || '');
    const corrida = String(req.query.corrida || '');
    const a = parseInt(req.query.a, 10), b = parseInt(req.query.b, 10);
    if (!hora || !corrida || !a || !b) return res.status(400).json({ error: 'parametros faltando' });

    // Mesma chave que a lista usa (hora + corrida), na sessao canonica do dia.
    // Pega a mais recente caso a corrida apareca em mais de uma sessao.
    const r = db.prepare(
      "SELECT r.* FROM races r JOIN race_sessions s ON s.id = r.session_id " +
      "WHERE s.user_id = ? AND r.hora = ? AND r.corrida = ? " +
      "ORDER BY r.id DESC LIMIT 1"
    ).get(CANONICO, hora, corrida);
    if (!r) return res.status(404).json({ error: 'corrida nao encontrada' });

    const json = (t) => { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } };
    const todos = json(r.hist_all) || [];
    const scores = json(r.scores_json) || [];

    const doTrap = (trap) => {
      const igual = (x) => String(x) === String(trap);
      // 1) fav/und tem coluna propria, que e' o historico usado pela /sessao
      if (igual(r.trap_fav)) {
        const h = json(r.hist_fav);
        if (h && h.length) return { trap, nome: r.name_fav, perfil: r.perfil_fav, hist: h };
      }
      if (igual(r.trap_und)) {
        const h = json(r.hist_und);
        if (h && h.length) return { trap, nome: r.name_und, perfil: r.perfil_und, hist: h };
      }
      // 2) qualquer outro galgo: hist_all
      const g = todos.find(x => igual(x.trap));
      const sc = scores.find(x => igual(x.trap));
      return {
        trap,
        nome: (g && g.nome) || (sc && sc.nome) || (igual(r.trap_fav) ? r.name_fav : igual(r.trap_und) ? r.name_und : ''),
        perfil: (g && g.perfil) || (sc && sc.perfil) || '',
        hist: (g && g.historico) || null
      };
    };

    res.json({ corrida: r.corrida, hora: r.hora, a: doTrap(a), b: doTrap(b) });
  } catch (e) {
    console.error('[carga-vip/disputa]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CARGA VIP ───────────────────────────────────────────────────────────────
// Era um modal desenhado pelo app.js por cima da tela Analisar: cobria o
// cabecalho e o menu, nao tinha URL propria e o botao voltar do navegador nao
// servia pra sair. Virou tela propria, com a mesma moldura do Historico.
// Aqui vai SO a moldura: a lista e' montada no navegador por
// public/js/telaCargaVip.js, que le a MESMA rota de antes (GET /api/carga-vip).
// Arquivo estatico de proposito, pra o JS da lista nao passar por template
// literal (onde aspas e \n se resolvem errado com facilidade).
router.get('/carga-vip', exigirAcesso('analisar.carga_vip'), (req, res) => {
  const user = req.user;
  const logoB64 = getLogo();
  const DOGS = JSON.stringify(catalogoGalgos());
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carga VIP - Greyhound Factory</title>
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>
${designTokensCSS()}
${cssCardGalgo()}
/* Painel "Analisar disputa": mesmo card da tela /sessao, mesmo CSS. */
#gv-modal{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center;z-index:9000;padding:10px}
#gv-modal.open{display:flex}
/* Cor de dentro do painel: #161B27, a mesma dos cards do resto do app
   (.vip-box aqui, .form-card em Usuarios, .section em Acessos). Antes era
   #0f1319, quase preto, que destoava. Trocar aqui muda so este painel. */
#gv-box{background:#161B27;border:1px solid #2a3140;border-radius:12px;max-width:1100px;width:100%;max-height:96vh;display:flex;flex-direction:column;overflow:hidden}
#gv-hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;border-bottom:1px solid #2a3140;flex-shrink:0}
#gv-hdr h3{font-size:14px;font-weight:700;color:#f0f0f0;margin:0}
#gv-xbtn{background:none;border:none;color:#888;font-size:18px;cursor:pointer;line-height:1;padding:0 4px}
#gv-xbtn:hover{color:#f0f0f0}
#gv-body{padding:12px 16px;overflow:auto;-webkit-overflow-scrolling:touch}
/* Aperta um pouco as linhas SO deste painel, pra caber mais historico sem
   rolar. As classes .sv-* sao compartilhadas com a tela /sessao, por isso
   tudo aqui vai sob #gv-body: la continua com o espacamento de sempre. */
#gv-body .sv-tbl td{padding:4px 4px}
#gv-body .sv-tbl th{padding:4px}
#gv-body .sv-dog-hdr{margin-bottom:5px}
#gv-body .sv-sep{margin:7px 0}
@media(max-width:800px){#gv-modal{padding:6px}#gv-body{padding:10px;overflow-x:auto}#gv-body .sv-tbl{table-layout:auto;width:auto;min-width:560px}}
.content{padding:24px;max-width:1240px;margin:0 auto}
.topo{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;margin-bottom:3px}
.sub{font-size:12px;color:#888}
.volta{font-size:12px;color:#22c55e;text-decoration:none;border:1px solid rgba(34,197,94,.3);padding:6px 12px;border-radius:6px;white-space:nowrap;flex-shrink:0}
.volta:hover{background:rgba(34,197,94,.1)}
.vip-aviso{padding:12px 15px;background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.25);border-radius:8px;font-size:12px;color:#eab308;line-height:1.6;margin-bottom:12px}
.vip-legenda{font-size:11px;color:#888;line-height:1.7;margin-bottom:12px;padding:0 2px}
.vip-box{background:#161B27;border:1px solid #222;border-radius:10px;overflow:hidden}
.vip-lin{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid #1e2430;border-left:3px solid transparent;cursor:pointer;transition:background .15s}
/* Verde/vermelho SO quando a chegada resolveu a disputa. Corrida que ainda nao
   correu, e disputa indefinida (galgo fora da chegada, dead heat), ficam
   neutras: pintar de vermelho o que ninguem errou seria mentira. */
.vip-lin.bateu{border-left-color:#22c55e}
.vip-lin.errou{border-left-color:#ef4444}
.vip-conf{display:flex;align-items:center;gap:5px;flex-shrink:0;width:200px}
.vip-dog{width:62px;height:42px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.vip-dog img{max-width:100%;max-height:100%;object-fit:contain;display:block}
/* A arte olha pra direita. Espelhar a da direita poe os dois de frente um pro
   outro, como na arena da tela Analisar. */
.vip-dog.espelha img{transform:scaleX(-1)}
.vip-dog .semarte{width:26px;height:26px;border-radius:50%;background:#1e2430;border:1px solid #2a3342;color:#8a94a6;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
.vip-vence{font-size:8px;font-weight:800;letter-spacing:.6px;color:#3f4c5f;text-transform:uppercase;text-align:center;flex-shrink:0}
.vip-chegada{display:flex;align-items:center;gap:3px;flex-shrink:0;width:150px}
.vip-pos{width:20px;height:20px;border-radius:50%;background:#1a2130;border:1px solid #2a3342;color:#8a94a6;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}
.vip-pos.p1{background:rgba(234,179,8,.16);border-color:rgba(234,179,8,.45);color:#eab308}
.vip-pos.pick{border-color:#22c55e;color:#22c55e}
.vip-pos.outro{border-color:#60a5fa;color:#60a5fa}
.vip-chegada .aguarda{font-size:10px;color:#3f4c5f}
.vip-acao{flex-shrink:0}
.vip-acao .btn{display:inline-block;font-size:11px;font-weight:600;color:#22c55e;background:transparent;border:1px solid rgba(34,197,94,.3);border-radius:6px;padding:6px 11px;text-decoration:none;white-space:nowrap}
.vip-acao .btn:hover{background:rgba(34,197,94,.12)}
.vip-lin:last-child{border-bottom:none}
.vip-lin:hover{background:rgba(255,255,255,.03)}
.vip-lin.tem-skip{background:rgba(192,132,252,.06)}
.vip-lin.tem-skip:hover{background:rgba(192,132,252,.11)}
.vip-hora{width:58px;flex-shrink:0;text-align:center}
.vip-hora .br{font-size:15px;font-weight:800;color:#22c55e;line-height:1.1}
.vip-hora .uk{font-size:10px;color:#3f8f5c}
.vip-meio{flex:1;min-width:0}
.vip-meio .par{font-size:13px;color:#f0f0f0;font-weight:600}
.vip-meio .par .vence{color:#555;font-weight:500}
.vip-meio .det{font-size:11px;color:#888;margin-top:2px}
.vip-meio .selos{font-size:10px;color:#60a5fa;margin-top:2px}
.vip-skip{font-size:10px;color:#c084fc;margin-top:2px}
.vip-taxa{text-align:right;flex-shrink:0}
.vip-taxa .nivel{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
.vip-taxa .pct{font-size:16px;font-weight:800;line-height:1.2}
.vip-taxa .rot{font-size:8px;color:#555;white-space:nowrap}
.vip-rodape{padding:12px 2px;font-size:11px;color:#555}
@media(max-width:768px){
  html,body{overflow-x:hidden}
  .content{padding:14px 12px}
  .topo{flex-direction:column;gap:10px}
  .vip-lin{padding:11px 10px;gap:8px;flex-wrap:wrap}
  .vip-conf{width:auto}
  .vip-dog{width:46px;height:32px}
  .vip-chegada{width:auto;order:9}
  .vip-acao{order:10;margin-left:auto}
  .vip-hora{width:46px}
  .vip-taxa .pct{font-size:14px}
}
</style></head><body>
<div class="hero">${logoB64 ? `<img src="${logoB64}" alt="Greyhound Factory">` : '<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'cargavip')}
<div class="content">
  <div class="topo">
    <div>
      <h1>&#11088; Carga VIP</h1>
      <div class="sub" id="vip-sub">Carregando...</div>
    </div>
    <a class="volta" href="${BASE}">&#8592; Voltar para Analisar</a>
  </div>
  <div id="vip-conteudo"><div class="vip-box" style="padding:22px;color:#888;font-size:13px">Carregando...</div></div>
</div>
<div id="gv-modal"><div id="gv-box"><div id="gv-hdr"><h3 id="gv-title">Disputa</h3><button id="gv-xbtn" type="button" aria-label="Fechar">&#x2715;</button></div><div id="gv-body"></div></div></div>
<script src="${BASE}/static/js/cardGalgo.js"></script>
<script>var VIP_BASE='${BASE}';var VIP_DOGS=${DOGS};</script>
<script src="${BASE}/static/js/telaCargaVip.js" defer></script>
</body></html>`);
});

// CSS do card de historico de galgo (.sv-*), usado pelo painel "Analisar
// disputa". Vive numa funcao porque DUAS telas o injetam: /sessao/:id e
// /carga-vip. O JS que monta o card esta em public/js/cardGalgo.js.
function cssCardGalgo() {
  return `.sv-dog{width:100%}
.sv-dog-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:0}
.sv-dog-hdr .trap-badge{width:26px;height:26px;font-size:12px;font-weight:700;flex-shrink:0}
.sv-name{font-size:13px;font-weight:700;color:#fff;letter-spacing:.1px}
.sv-perfil{font-size:10px;color:rgba(255,255,255,.35);margin-left:6px;font-weight:400}
.sv-sep{height:1px;background:rgba(255,255,255,.06);margin:10px 0}
.sv-tbl{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;font-family:sans-serif}
.sv-tbl thead tr{border-bottom:1px solid rgba(255,255,255,.08)}
.sv-tbl th{font-size:12px;font-weight:600;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.4px;padding:5px 4px;text-align:center;white-space:nowrap;font-family:sans-serif}
.sv-tbl td{padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.04);color:rgba(255,255,255,.78);vertical-align:middle;text-align:center;font-family:sans-serif;font-size:12px}
.sv-tbl tr:last-child td{border-bottom:none}
.sv-tbl tr:hover td{background:rgba(255,255,255,.025)}
.sv-td-date{color:rgba(255,255,255,.6);font-size:12px;text-align:left;font-family:sans-serif}
.sv-td-track{color:rgba(255,255,255,.7);font-size:12px;text-align:center;font-family:sans-serif}
.sv-td-muted{color:rgba(255,255,255,.4);font-size:12px;text-align:center;font-family:sans-serif}
.sv-bends{font-family:sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,.85);text-align:center}
.sv-td-rem{color:rgba(255,255,255,.45);font-size:11px;text-align:left;font-family:sans-serif;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sv-grade{display:inline-block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 4px;font-size:12px;color:rgba(255,255,255,.55);font-family:sans-serif}
.sv-caltm{color:#60a5fa;font-weight:700;font-size:12px;text-align:center;font-family:sans-serif}`;
}

router.get('/historico', exigirAcesso('screen.historicos'), (req, res) => {
  const user = req.user;
  const sessions = db.prepare('SELECT * FROM race_sessions WHERE user_id=? ORDER BY created_at DESC').all(CANONICO);
  const stats = db.prepare("SELECT COUNT(*) as t, SUM(CASE WHEN bateu='sim' THEN 1 ELSE 0 END) as a FROM races WHERE user_id=? AND bateu IS NOT NULL AND bateu!=''").get(CANONICO);
  const logoB64 = getLogo();
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Histórico - Greyhound Validator</title>
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>
${designTokensCSS()}
.content{padding:24px;max-width:900px;margin:0 auto}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
h2{font-size:16px;font-weight:700;margin-bottom:12px}table{width:100%;border-collapse:collapse;background:#111;border:1px solid #333;border-radius:8px;overflow:hidden}th{padding:10px 12px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#666;background:#1a1a1a;border-bottom:1px solid #333}td{padding:10px 12px;border-bottom:1px solid #222;font-size:13px}tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
.btn-del{background:none;border:none;cursor:pointer;color:#666;font-size:18px;padding:4px 6px;border-radius:6px;transition:all .2s;line-height:1}.btn-del:hover{color:#ef4444;background:rgba(239,68,68,.1)}
.del-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:1000;align-items:center;justify-content:center}
.del-modal-bg.open{display:flex}
.del-modal{background:#111;border:1px solid #333;border-radius:16px;padding:36px 40px;text-align:center;max-width:360px;width:90%;animation:popIn .25s ease}
@keyframes popIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
.del-icon{font-size:56px;margin-bottom:16px;display:block}
.del-modal h3{font-size:18px;font-weight:700;margin-bottom:8px}
.del-modal p{font-size:13px;color:#888;margin-bottom:24px;line-height:1.5}
.del-btns{display:flex;gap:10px;justify-content:center}
.del-btns button{padding:10px 24px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;border:none}
.btn-cancel{background:#222;color:#888;border:1px solid #333!important}
.btn-cancel:hover{background:#2a2a2a}
.btn-confirm-del{background:#ef4444;color:#fff}
.btn-confirm-del:hover{background:#dc2626}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'historico')}
<div class="content">
<div class="kpis">
<div class="kpi g"><div class="kpi-label">Total sessoes</div><div class="kpi-val">${sessions.length}</div></div>
<div class="kpi o"><div class="kpi-label">Total apostas</div><div class="kpi-val">${stats.t||0}</div></div>
<div class="kpi b"><div class="kpi-label">Taxa de acerto</div><div class="kpi-val">${stats.t>0?Math.round(stats.a/stats.t*100):0}%</div></div>
</div>
<h2>Sessoes de analise</h2>
<table><thead><tr><th>Data</th><th>Nome</th><th>AvBs</th><th>Acao</th></tr></thead><tbody>
${sessions.map(s=>`<tr><td>${new Date(s.created_at).toLocaleDateString('pt-BR')}</td><td>${s.name||'Sem nome'}</td><td><span class="badge">${s.total_avbs||0}</span></td><td style="display:flex;gap:14px;align-items:center"><a href="${BASE}/sessao/${s.id}">Ver detalhes</a><button class="btn-del" title="Deletar sessao" onclick="abrirDel('${s.id}','${(s.name||'Sem nome').replace(/'/g,"\\'")}')">&#128465;</button></td></tr>`).join('')}
${!sessions.length?'<tr><td colspan="4" style="text-align:center;color:#666;padding:30px">Nenhuma sessao salva</td></tr>':''}
</tbody></table>
</div>

<div class="del-modal-bg" id="del-bg">
  <div class="del-modal">
    <span class="del-icon">&#128465;&#65039;</span>
    <h3>Deletar sessao?</h3>
    <p id="del-txt">Esta acao nao pode ser desfeita.</p>
    <div class="del-btns">
      <button class="btn-cancel" onclick="fecharDel()">Cancelar</button>
      <button class="btn-confirm-del" onclick="confirmarDel()">Deletar</button>
    </div>
  </div>
</div>
<form id="del-form" method="POST" style="display:none"></form>

<script>
var BASE_H='${BASE}';
var delId=null;
function abrirDel(id,nome){delId=id;document.getElementById('del-txt').textContent='Voce esta deletando a sessao "'+nome+'". Esta acao nao pode ser desfeita.';document.getElementById('del-bg').classList.add('open');}
function fecharDel(){document.getElementById('del-bg').classList.remove('open');delId=null;}
function confirmarDel(){if(!delId)return;var f=document.getElementById('del-form');f.action=BASE_H+'/sessao/'+delId+'/deletar';f.submit();}
document.getElementById('del-bg').addEventListener('click',function(e){if(e.target===this)fecharDel();});
</script>
</body></html>`);
});

router.post('/sessao/:id/deletar', (req, res) => {
  const user = req.user;
  const sess = db.prepare('SELECT * FROM race_sessions WHERE id=? AND user_id=?').get(req.params.id, CANONICO);
  if (sess) {
    db.prepare('DELETE FROM races WHERE session_id=?').run(sess.id);
    db.prepare('DELETE FROM race_sessions WHERE id=?').run(sess.id);
  }
  res.redirect(BASE + '/historico');
});

// ── AvB Motor x AvB BW ──────────────────────────────────────────────────────
// AvB Motor : o par da analise global (trap_fav x trap_und). Sempre existe.
// AvB BW    : o par que de fato valia na hora de apostar, com prioridade
//             1) a SUA escolha (race_user_data.avb_escolhido)
//             2) senao, a principal da reanalise (races.avb_fechamento)
//             3) senao, vazio — a corrida nao abriu no ao vivo, ou nenhum AvB
//                aberto tinha valor.
//
// O "bateu" e a "odd" seguem o BW quando ele existe; sem BW, seguem o Motor.
// E' a regra que reflete a aposta que realmente valeu.
// Observacoes: mostra os primeiros 150 caracteres e um "leia mais" que
// expande a linha. Nada e' cortado no banco — o texto inteiro fica no HTML,
// so escondido, entao o relatorio e o export continuam completos.
// O corte respeita a palavra: cortar no meio de uma deixa a leitura estranha.
function _celulaObs(r){
  var txt = String(r.obs || '').trim();
  if (!txt) return '<td style="text-align:left;font-size:11px;color:#888;line-height:1.5">-</td>';
  var LIM = 150;
  if (txt.length <= LIM) {
    return '<td style="text-align:left;font-size:11px;color:#888;line-height:1.5">' + txt + '</td>';
  }
  var corte = txt.lastIndexOf(' ', LIM);
  if (corte < LIM * 0.6) corte = LIM;      // palavra gigante: corta no limite mesmo
  var ini = txt.slice(0, corte);
  var resto = txt.slice(corte);
  return '<td style="text-align:left;font-size:11px;color:#888;line-height:1.5">'
    + '<span>' + ini + '</span>'
    + '<span class="obs-resto" style="display:none">' + resto + '</span>'
    + '<span class="obs-elip">…</span> '
    + '<a class="obs-mais" style="color:#60a5fa;cursor:pointer;font-size:10px;white-space:nowrap">leia mais</a>'
    + '</td>';
}

function _parBW(r){
  var esc = _jsonOuNull(r.avb_escolhido);
  if (esc) { esc._origem = 'sua escolha'; return esc; }
  var fec = _jsonOuNull(r.avb_fechamento);
  if (fec) { fec._origem = 'reanálise'; return fec; }
  return null;
}
// Celula do AvB BW, no MESMO formato visual da coluna do Motor: badge do trap,
// nome embaixo, "vs" no meio. Se nao ha BW, celula vazia com um traco.
function _celulaBW(r){
  var av = _parBW(r);
  if(!av){
    return '<td style="text-align:center;vertical-align:middle;color:#444;font-size:11px">—</td>';
  }
  // Mesmo tratamento visual da coluna AvB Motor: badge + primeiro nome apenas.
  // Os numeros (rean/mkt/odd/edge) ficam de fora de proposito — a coluna e' de
  // identificacao do par, e a odd ja tem coluna propria.
  var lado = function(trap, nome){
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:46px">'
      + '<div class="trap-badge t'+trap+'" style="width:20px;height:20px;font-size:11px">'+trap+'</div>'
      + '<div style="font-size:9px;font-weight:600;color:rgba(255,255,255,.85);text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+String(nome||'').split(' ')[0]+'</div>'
      + '</div>';
  };
  return '<td style="text-align:center;vertical-align:middle">'
    + '<div style="display:flex;align-items:flex-start;justify-content:center;gap:8px">'
    +   lado(av.aTrap, av.aNome)
    +   '<div style="font-size:10px;color:#555;padding-top:6px">vs</div>'
    +   lado(av.bTrap, av.bNome)
    + '</div>'
    // So os dois numeros que dizem se valeu a pena: a avaliacao da reanalise e
    // o que o mercado achava. Odd e edge ficam de fora — a odd ja tem coluna
    // propria e o edge e' a diferenca entre estes dois, da pra ler de olho.
    + (function(){
        var n = [];
        if (av.reanalisePct != null) n.push('rean ' + av.reanalisePct + '%');
        if (av.marketPct != null) n.push('mkt ' + av.marketPct + '%');
        return n.length ? '<div style="font-size:8.5px;color:#777;margin-top:3px">' + n.join(' &middot; ') + '</div>' : '';
      })()
    + '</td>';
}

// ── AvB do Historico: fechamento (objetivo) x escolha (pessoal) ─────────────
// races.avb_fechamento  -> foto da principal da reanalise no instante da
//                          largada. Escrita SO pelo robo, igual pra todos.
// race_user_data.avb_escolhido -> o par em que ESTE usuario entrou.
//
// Regra de exibicao: sem escolha, mostra so o fechamento; escolha igual ao
// fechamento, mostra um so (nao duplica); divergiram, mostra os DOIS lado a
// lado — e' o que permite comparar, ao longo do tempo, se escolher na mao
// esta ajudando ou atrapalhando.
function _jsonOuNull(txt){
  if(!txt) return null;
  try { var o = typeof txt === 'string' ? JSON.parse(txt) : txt; return (o && o.aTrap != null) ? o : null; }
  catch(e){ return null; }
}
function _mesmoPar(x, y){
  return x && y && String(x.aTrap)===String(y.aTrap) && String(x.bTrap)===String(y.bTrap);
}
// Bloco compacto de um par, pro Histórico. rotulo identifica a origem.
function _blocoAvb(av, rotulo, cor){
  if(!av) return '';
  var nums = [];
  if(av.reanalisePct != null) nums.push('rean ' + av.reanalisePct + '%');
  if(av.motorOrigPct != null) nums.push('motor ' + av.motorOrigPct + '%');
  if(av.marketPct != null) nums.push('mkt ' + av.marketPct + '%');
  if(av.odd != null) nums.push('odd ' + av.odd);
  var e = av.edge;
  var edgeStr = (e == null) ? '' : ' <span style="color:' + (e > 0 ? '#22c55e' : (e < 0 ? '#ef4444' : '#666')) + ';font-weight:700">' + (e > 0 ? '+' : '') + e + '</span>';
  var semRean = (av.origem === 'fallback' || av.reanalisePct == null)
    ? '<span title="a reanalise nao rodou nesta corrida" style="font-size:8px;color:#eab308;margin-left:4px">sem reanálise</span>' : '';
  return '<div style="border-left:2px solid ' + cor + ';padding-left:6px;margin-top:4px;text-align:left">'
    + '<div style="font-size:8px;color:' + cor + ';font-weight:800;text-transform:uppercase;letter-spacing:.4px">' + rotulo + semRean + '</div>'
    + '<div style="font-size:10px;color:#cbd5e1;font-weight:700">T' + av.aTrap + ' &times; T' + av.bTrap + '</div>'
    + '<div style="font-size:8.5px;color:#777">' + nums.join(' &middot; ') + edgeStr + '</div>'
    + '</div>';
}
// Devolve o HTML dos blocos conforme a regra de prioridade.
function _avbsDoHistorico(r){
  var fech = _jsonOuNull(r.avb_fechamento);
  var esc  = _jsonOuNull(r.avb_escolhido);
  if(!fech && !esc) return '';
  if(esc && !fech) return _blocoAvb(esc, 'sua escolha', '#1d4ed8');
  if(fech && !esc) return _blocoAvb(fech, 'fechamento', '#22c55e');
  if(_mesmoPar(esc, fech)) return _blocoAvb(esc, 'escolha = fechamento', '#22c55e');
  return _blocoAvb(esc, 'sua escolha', '#1d4ed8') + _blocoAvb(fech, 'fechamento do motor', '#22c55e');
}

router.get('/sessao/:id', exigirAcesso('screen.historicos'), (req, res) => {
  const user = req.user;
  const sess = db.prepare('SELECT * FROM race_sessions WHERE id=? AND user_id=?').get(req.params.id, CANONICO);
  if (!sess) return res.redirect(BASE + '/historico');
  const races = db.prepare('SELECT * FROM races WHERE session_id=? ORDER BY hora').all(sess.id);
  // odd/valor/aposta/atrasada vem da race_user_data do usuario logado
  aplicarPessoais(db, races, user.id);

  // "Bateu" passa a refletir o AvB que REALMENTE valia: o BW quando existe
  // (sua escolha, senao a principal da reanalise), e o do Motor quando nao
  // existe. Sem isto a tela mostraria o acerto de uma disputa e o par de
  // outra — a reanalise troca o par com frequencia.
  // A ODD nao entra nessa regra: ela e' registro de APOSTA, e so existe
  // depois do "Entrei!". Ver a nota mais abaixo.
  // O bateu e' DERIVADO da chegada (finishing_order_json) com bateuPar, a
  // mesma funcao usada nos KPIs, pra os dois numeros nunca discordarem.
  // null (trap fora da chegada) fica como "-", nem acerto nem erro.
  {
    const { bateuPar } = require('../utils/avbResultado');
    for (const r of races) {
      const bw = _parBW(r);
      if (!bw) continue;
      const b = bateuPar(r.finishing_order_json, bw.aTrap, bw.bTrap);
      r.bateu = (b === null) ? '' : (b ? 'sim' : 'nao');
      // A Odd NAO e' mais sobrescrita pela do fechamento. Antes esta linha
      // fazia "r.odd = bw.odd" quando a odd pessoal estava vazia, o que
      // quebrava a regra de que Odd so existe depois do "Entrei!" — e, pior,
      // inflava Entradas/Green/%Green, que filtram justamente por r.odd:
      // corrida nunca apostada passava a contar como aposta.
      // A odd do fechamento continua visivel na coluna AvB BW, que e' o lugar
      // dela: referencia do mercado, nao registro de aposta.
    }
  }
  const racesValidas = races.filter(r=>r.nivel!=='skip');
  const skipCount = races.length - racesValidas.length;
  const resolvidas = racesValidas.filter(r=>r.bateu).length;
  const ac = racesValidas.filter(r=>r.bateu==='sim').length;
  const taxa = resolvidas>0 ? Math.round(ac/resolvidas*100) : 0;
  const apostadas = racesValidas.filter(r=>r.odd);
  const ap = apostadas.length;
  const green = apostadas.filter(r=>r.bateu==='sim').length;
  const pctGreen = ap>0 ? Math.round(green/ap*100) : 0;
  // ── Tres taxas sobre a MESMA chegada ─────────────────────────────────────
  // Geral      = o AvB que REALMENTE valia: BW quando existe (sua escolha ou a
  //              principal da reanalise), motor quando nao existe. E' a mesma
  //              regra da coluna "Bateu", entao este numero e a tabela sempre
  //              concordam.
  // Pre-Analise= so o AvB do motor (analise global), pra medir o motor sozinho.
  // Analise BW = so o AvB do fechamento da reanalise.
  // Todas usam bateuPar sobre finishing_order_json: mesma funcao, mesmo
  // criterio. Resultado indefinido (trap fora da chegada) fica FORA do
  // denominador de cada uma — nao conta como acerto nem como erro.
  const _tx = (function(){
    const { bateuPar } = require('../utils/avbResultado');
    const z = () => ({ ok:0, tot:0, pct:null });
    const o = { geral:z(), motor:z(), bw:z() };
    for (const r of racesValidas) {
      const ordem = r.finishing_order_json;
      const bw = _parBW(r);
      const par = {
        motor: (r.trap_fav && r.trap_und) ? { aTrap:r.trap_fav, bTrap:r.trap_und } : null,
        bw:    bw,
        geral: bw || ((r.trap_fav && r.trap_und) ? { aTrap:r.trap_fav, bTrap:r.trap_und } : null)
      };
      for (const k of ['geral','motor','bw']) {
        if (!par[k]) continue;
        const v = bateuPar(ordem, par[k].aTrap, par[k].bTrap);
        if (v === null) continue;
        o[k].tot++; if (v) o[k].ok++;
      }
    }
    for (const k of ['geral','motor','bw']) o[k].pct = o[k].tot ? Math.round(o[k].ok/o[k].tot*100) : null;
    return o;
  })();

  // ── Grafico por turno: motor x reanalise, acerto x erro ──────────────────
  // Mesmo corte de turno do dashboard de HR (6h e 13h BR) de proposito: se as
  // duas telas usassem cortes diferentes, os numeros discordariam sem motivo
  // aparente. Conta TODAS as corridas analisadas, nao so as apostadas.
  const _turnos = (function(){
    const { bateuPar } = require('../utils/avbResultado');
    const vazio = () => ({ motor:{ok:0,err:0}, bw:{ok:0,err:0} });
    const g = { 'Manhã':vazio(), 'Tarde':vazio() };
    for (const r of racesValidas) {
      const h = parseInt(String(r.hora_br||'').split(':')[0], 10);
      if (isNaN(h)) continue;
      const t = h < 13 ? 'Manhã' : 'Tarde';
      const bw = _parBW(r);
      const pares = {
        motor: (r.trap_fav && r.trap_und) ? { aTrap:r.trap_fav, bTrap:r.trap_und } : null,
        bw: bw
      };
      for (const k of ['motor','bw']) {
        if (!pares[k]) continue;
        const v = bateuPar(r.finishing_order_json, pares[k].aTrap, pares[k].bTrap);
        if (v === null) continue;      // indefinido fica fora
        if (v) g[t][k].ok++; else g[t][k].err++;
      }
    }
    return g;
  })();

  const logoB64 = getLogo();
  const pistaOpts = [...new Set(races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0).map(r=>(r.corrida||'').split(' ')[0]).filter(Boolean))].sort().map(p=>`<option value="${p}">${nomePista(p)}</option>`).join('');
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${sess.name} - Greyhound</title>
<link rel="stylesheet" href="${BASE}/static/css/shared.css">
<style>

/* As tres taxas LADO A LADO, cada uma como uma mini-coluna: rotulo em cima,
   percentual no meio, contagem embaixo. Usa !important porque o container dos
   KPIs tem regras proprias pros filhos do card. */
.tx3{display:flex!important;gap:14px;justify-content:space-between;margin-top:4px}
.tx3 .tx3-l{display:flex!important;flex-direction:column;align-items:center;gap:1px;flex:1}
.tx3 .tx3-rot{font-size:10px;color:#888;white-space:nowrap}
.tx3 .tx3-num{font-size:19px;font-weight:800;line-height:1.1;white-space:nowrap}
.tx3 .tx3-cnt{font-size:9px;color:#555;white-space:nowrap}

/* Grafico por turno: manha e tarde LADO A LADO dentro do mesmo card, cada
   turno com duas barras (motor e reanalise). Empilhar os turnos jogava o card
   pra linha de baixo e deixava a faixa dos KPIs pela metade.
   Sem biblioteca de grafico: sao divs com largura percentual — pra 4 barras,
   trazer dependencia nova nao se justifica. */
.gtn{min-width:0}   /* a largura vem do grid do .kpis */
.gtn-cols{display:flex;gap:12px;margin-top:2px}
.gtn-col{flex:1;min-width:0}
.gtn-lin{display:flex;align-items:center;gap:6px;margin-top:4px}
.gtn-rot{font-size:9px;color:#888;width:52px;flex-shrink:0;text-align:right;white-space:nowrap}
.gtn-bar{flex:1;height:12px;border-radius:3px;overflow:hidden;display:flex;background:rgba(255,255,255,.04);min-width:50px}
.gtn-ok{background:#22C65E}
.gtn-err{background:#ef4444}
.gtn-pct{font-size:10px;font-weight:700;width:32px;flex-shrink:0;white-space:nowrap}
.gtn-turno{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px}

${designTokensCSS()}
.content{padding:16px 20px;max-width:1600px;margin:0 auto}
/* 7 cartoes numa linha so. Os cinco simples (Corridas, Acertos, Entradas,
   Green, % de Green) tem um numero curto e nao precisam de 1fr cada — com
   colunas iguais o setimo card (o grafico) nao cabia e caia pra linha de
   baixo, deixando a faixa pela metade.
   Aqui os simples ficam estreitos, a Taxa (3 valores) um pouco maior, e o
   grafico leva todo o resto. */
.kpis{
  display:grid;
  grid-template-columns:0.62fr 0.62fr 1.15fr 0.62fr 0.62fr 0.62fr 1.75fr;
  gap:8px;margin-bottom:16px;
}
/* Sem ponto de quebra por largura: um valor chutado (1400px) jogava tudo em
   3 colunas em monitor comum. Se ficar apertado, o proprio grid encolhe as
   colunas — os numeros sao curtos e aguentam. */
/* Cabecalho fixo: o container ganha altura maxima e rolagem propria, e o
   thead cola no topo dele. Sem o max-height quem rola e' a PAGINA inteira,
   e ai o sticky nao tem em relacao a que grudar. */
.tw{overflow:auto;max-height:calc(100vh - 260px);border:1px solid var(--bdr);border-radius:8px}
.tw thead th{position:sticky;top:0;z-index:5}
/* O sticky nao herda o fundo da linha: sem cor solida no th, o conteudo
   rolando aparece POR TRAS do cabecalho. */
.tw thead th{background:#1a1a1a}
/* A borda de baixo some no sticky (a borda rola junto), entao usamos
   box-shadow, que fica pintada na posicao fixa. */
.tw thead th{box-shadow:inset 0 -1px 0 #333}
table{width:100%;border-collapse:collapse;background:#111;min-width:900px}
@media(max-width:768px){
  .content{padding:12px 10px}
  .kpis{grid-template-columns:repeat(3,1fr)}
  table{min-width:660px}
  .tw table th:nth-child(7), .tw table td:nth-child(7){display:none} /* Observacoes some no mobile */
}
th{padding:10px 8px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#888;background:#1a1a1a;border-bottom:1px solid #333;vertical-align:top}
td{padding:10px 8px;border-bottom:1px solid var(--sur2);font-size:12px;vertical-align:middle;text-align:center}
tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,.02)}
</style></head><body>
<div class="hero">${logoB64?`<img src="${logoB64}" alt="">`:'<div style="height:130px;background:#000"></div>'}</div>
${navBar(user, 'historico')}
<div class="content">
<div class="kpis">
<div class="kpi"><div class="kpi-label">Corridas</div><div class="kpi-val" id="kpi-corridas" style="color:#3B82F7">${racesValidas.length}</div>${skipCount>0?`<div style="font-size:9px;color:#666;margin-top:2px">${skipCount} skip</div>`:''}</div>
<div class="kpi"><div class="kpi-label">Acertos</div><div class="kpi-val" id="kpi-acertos" style="color:#22C65E">${ac}</div></div>
<div class="kpi" style="min-width:250px">
  <div class="kpi-label">Taxa de acerto</div>
  <div class="tx3">
  ${[['Geral','geral','o AvB que valeu: BW quando há, motor quando não há'],
     ['Pré-análise','motor','só o AvB do motor (análise global)'],
     ['Análise BW','bw','só o AvB do fechamento da reanálise']]
    .map(function(l){
      var o=_tx[l[1]];
      var cor = o.pct==null ? '#666' : (o.pct>=50 ? '#22C65E' : '#ef4444');
      return '<div class="tx3-l" title="'+l[2]+'">'
        + '<span class="tx3-rot">'+l[0]+'</span>'
        + '<span class="tx3-num" style="color:'+cor+'">'+(o.pct==null?'—':o.pct+'%')+'</span>'
        + '<span class="tx3-cnt">'+(o.tot?o.ok+'/'+o.tot:'')+'</span>'
        + '</div>';
    }).join('')}
  </div>
</div>
<div class="kpi"><div class="kpi-label">Entradas</div><div class="kpi-val" id="kpi-apostas" style="color:#3B82F7">${ap}</div></div>
<div class="kpi"><div class="kpi-label">Green</div><div class="kpi-val" id="kpi-green" style="color:#22C65E">${green}</div></div>
<div class="kpi"><div class="kpi-label">% de Green</div><div class="kpi-val" id="kpi-pctgreen" style="color:${ap>0&&green/ap>=.5?'#22C65E':'#ef4444'}">${pctGreen}%</div></div>

<div class="kpi gtn">
  <div class="kpi-label">Acerto por turno</div>
  <div class="gtn-cols">
  ${['Manhã','Tarde'].map(function(t){
    var d=_turnos[t];
    var linha=function(rot,o){
      var tot=o.ok+o.err;
      if(!tot) return '<div class="gtn-lin"><span class="gtn-rot">'+rot+'</span>'
        + '<span class="gtn-bar"></span><span class="gtn-pct" style="color:#555">—</span></div>';
      var pct=Math.round(o.ok/tot*100);
      return '<div class="gtn-lin" title="'+rot+' '+t+': '+o.ok+' acerto(s), '+o.err+' erro(s)">'
        + '<span class="gtn-rot">'+rot+'</span>'
        + '<span class="gtn-bar"><span class="gtn-ok" style="width:'+pct+'%"></span>'
        +   '<span class="gtn-err" style="width:'+(100-pct)+'%"></span></span>'
        + '<span class="gtn-pct" style="color:'+(pct>=50?'#22C65E':'#ef4444')+'">'+pct+'%</span></div>';
    };
    return '<div class="gtn-col"><div class="gtn-turno">'+t+'</div>'
      + linha('Motor',d.motor) + linha('Reanálise',d.bw) + '</div>';
  }).join('')}
  </div>
</div>
</div>
<div class="tw"><table><thead><tr><th style="width:70px">Hora BR<br><select id="fh-turno" onchange="aplicarFiltroHist()" style="width:100%;margin-top:5px;padding:3px;font-size:10px;background:#0d0d0d;border:1px solid #333;border-radius:4px;color:#ccc;text-transform:none;letter-spacing:normal;font-weight:400"><option value="">Todos</option><option value="Manhã">Manhã</option><option value="Tarde">Tarde</option></select></th><th style="width:110px">Corrida<br><select id="fh-corrida" onchange="aplicarFiltroHist()" style="width:100%;margin-top:4px;padding:3px;font-size:10px;background:#0d0d0d;border:1px solid #333;border-radius:4px;color:#ccc;text-transform:none;letter-spacing:normal;font-weight:400"><option value="">Todas</option>${pistaOpts}</select></th><th style="width:50px">AvB Motor</th><th style="width:50px">AvB BW</th><th style="width:74px">Bateu<br><select id="fh-bateu" onchange="aplicarFiltroHist()" style="width:100%;margin-top:4px;padding:3px;font-size:10px;background:#0d0d0d;border:1px solid #333;border-radius:4px;color:#ccc;text-transform:none;letter-spacing:normal;font-weight:400"><option value="">Todos</option><option value="sim">Sim</option><option value="nao">Não</option><option value="pend">Pendente</option></select></th><th style="width:110px">Resultado</th><th style="width:50px">🚩</th><th style="width:360px">Observações</th><th style="width:45px">Odd</th><th style="width:80px">Aberto?</th><th style="width:24px"></th></tr></thead><tbody>
${races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0).map(r=>{
  var bc=r.nivel==='alta'?'ba':r.nivel==='media'?'bm':'bb';
  var horaBr=r.hora_br||r.hora||'-';
  var horaUk=r.hora||'';
  var _brh=(function(h){if(!h)return null;var p=h.split(':');var hr=parseInt(p[0]);if(isNaN(hr))return null;if(hr>=1&&hr<=9)hr+=12;hr=hr-4;if(hr<0)hr+=24;return hr;})(r.hora);
  var turnoBR=_brh==null?'':(_brh>=13?'Tarde':'Manhã');
  return`<tr${r.flag_atrasada?' class="row-atrasada"':''} data-race data-turno="${turnoBR}" data-pista="${(r.corrida||'').split(' ')[0]}" data-bateu="${r.bateu||''}" data-odd="${r.odd||''}">
<td style="text-align:center;white-space:nowrap"><div style="font-size:15px;font-weight:700;color:#22c55e;letter-spacing:.5px">${horaUk||'-'}</div><div style="font-size:10px;color:rgba(34,197,94,.45);margin-top:1px">${(function(h){if(!h)return'';var p=h.split(':');var hr=parseInt(p[0]);if(hr>=1&&hr<=9)hr+=12;hr=hr-4;if(hr<0)hr+=24;return hr+':'+p[1];})(horaUk)}</div></td>
<td style="text-align:center"><div style="font-weight:700;font-size:12px">${nomeCorridaCompleto(r.corrida)||'-'}</div><div style="font-size:10px;color:#666">${r.dist||''}</div>${r.top3?'<div class="top3-tag">&#127942; '+r.top3+'</div>':''}</td>
<td style="text-align:center;vertical-align:middle"><div style="display:flex;align-items:flex-start;justify-content:center;gap:8px">
<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:46px">
<div class="trap-badge t${r.trap_fav}" style="width:20px;height:20px;font-size:11px">${r.trap_fav}</div>
<div style="font-size:9px;font-weight:600;color:rgba(255,255,255,.85);text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(r.name_fav||'').split(' ')[0]}</div>
${r.perfil_fav?`<div style="font-size:9px;color:#666;text-align:center">${r.perfil_fav}</div>`:''}
</div>
<div style="font-size:10px;color:#555;padding-top:6px">vs</div>
<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:46px">
<div class="trap-badge t${r.trap_und}" style="width:20px;height:20px;font-size:11px">${r.trap_und}</div>
<div style="font-size:9px;font-weight:600;color:rgba(255,255,255,.85);text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(r.name_und||'').split(' ')[0]}</div>
${r.perfil_und?`<div style="font-size:9px;color:#666;text-align:center">${r.perfil_und}</div>`:''}
</div></div>
<a style="font-size:9px;color:rgba(96,165,250,.7);cursor:pointer;display:block;text-align:center;margin-top:4px" onclick="openSessValModal(${r.id})">&#128269; ver historico</a></td>
${_celulaBW(r)}
<td style="text-align:center"><select class="hist-inp" data-id="${r.id}" data-f="bateu" disabled style="border-radius:4px;padding:3px;font-size:11px;cursor:pointer;font-weight:700;color:${r.bateu==='sim'?'#22c55e':r.bateu==='nao'?'#ef4444':'#888'}">
<option value="" ${!r.bateu?'selected':''}>-</option>
<option value="sim" style="color:#22c55e" ${r.bateu==='sim'?'selected':''}>✓ Sim</option>
<option value="nao" style="color:#ef4444" ${r.bateu==='nao'?'selected':''}>✗ Não</option>
</select></td>
<td style="text-align:center">${(function(){var tc=["","t1","t2","t3","t4","t5","t6"];var html="";[r.resultado_1,r.resultado_2,r.resultado_3].forEach(function(v){if(!v)return;var n=parseInt(v);if(n>=1&&n<=6){html+='<span class="trap-badge '+tc[n]+'" style="width:20px;height:20px;font-size:11px;margin:0 1px">'+n+'</span>';}else{var name=String(v).split(" ")[0].slice(0,10);html+='<span style="font-size:9px;color:#888;display:block;text-align:center;line-height:1.3">'+name+'</span>';}});if(r.video_url){html+='<div style="margin-top:5px"><button onclick="openReplay('+r.id+')" style="font-size:9px;color:#60a5fa;cursor:pointer;background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.25);border-radius:4px;padding:2px 8px;display:inline-flex;align-items:center;gap:3px">&#9654; Replay</button></div>';}return html||"-";})()}</td>
<td style="text-align:center">${!r.resultado_1?'<label style="cursor:pointer" title="Marcar corrida atrasada — fica piscando ate ter resultado"><input type="checkbox" class="hist-inp" '+(r.flag_atrasada?'checked':'')+' data-id="'+r.id+'" data-f="flag_atrasada" style="cursor:pointer"></label>':(r.flag_atrasada?'🚩':'')}</td>
${_celulaObs(r)}
<td style="text-align:center"><input type="text" class="hist-inp" value="${r.odd||''}" placeholder="-" data-id="${r.id}" data-f="odd" disabled style="width:44px;text-align:center;border-radius:4px;padding:4px;font-size:11px" onkeydown="if(event.key==='Enter')this.blur();"></td>
<td style="text-align:center"><label style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:10px;color:${r.avb_nao_aberto?'#f97316':'#666'};cursor:default"><input type="checkbox" class="hist-inp" ${r.avb_nao_aberto?'checked':''} data-id="${r.id}" data-f="avb_nao_aberto" disabled> Não aberto</label></td>
<td style="text-align:center"><span class="edit-pencil" data-row="${r.id}" onclick="toggleRowEdit(this)" title="Editar Odd/Bateu/Aberto">&#9998;</span></td>
</tr>`;}).join('')}
${!races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0).length?'<tr><td colspan="10" style="text-align:center;color:#666;padding:20px">Nenhum AvB nesta sessao</td></tr>':''}
</tbody></table></div>

<style>
.row-atrasada{animation:rowAtrasadaBlink 1.2s ease-in-out infinite}
@keyframes rowAtrasadaBlink{0%,100%{background:transparent}50%{background:rgba(234,179,8,.18)}}
.hist-inp{background:transparent;border:1px solid transparent;color:#ccc}
.hist-inp:not([disabled]){background:#0D1117;border:1px solid #333;color:#fff;cursor:pointer}
.hist-inp[type=checkbox]{cursor:default}
.hist-inp[type=checkbox]:not([disabled]){cursor:pointer}
.edit-pencil{cursor:pointer;font-size:13px;opacity:.55;transition:opacity .15s}
.edit-pencil:hover{opacity:1}
.edit-pencil.editing{opacity:1;color:#22c55e}
#sv-modal{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center;z-index:9000}#sv-modal.open{display:flex}
#sv-box{background:#12172a;border:1px solid rgba(255,255,255,.1);border-radius:12px;width:88vw;max-width:920px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(0,0,0,.7)}
#sv-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.07);background:#161b2e}
#sv-hdr h3{font-size:12px;font-weight:600;color:rgba(255,255,255,.85);margin:0;flex:1;text-align:center;letter-spacing:.2px}
#sv-xbtn{background:transparent;border:none;color:rgba(255,255,255,.3);font-size:16px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0;transition:color .15s}
#sv-xbtn:hover{color:#fff}
#sv-body{padding:12px 16px;display:flex;flex-direction:column;gap:0;background:#12172a}
${cssCardGalgo()}
/* Mobile: modal ocupa quase a tela toda e a tabela rola na horizontal
   (colunas legiveis, arrasta pro lado pra ver Bends/Fin/Remarks/Grade/CalTm). */
@media(max-width:768px){
  #sv-modal{align-items:stretch;padding:10px}
  #sv-box{width:100%;max-width:100%;height:100%;max-height:100%;overflow:hidden}
  #sv-hdr{flex-shrink:0}
  #sv-body{flex:1 1 auto;min-height:0;height:auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 8px}
  .sv-dog{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .sv-tbl{table-layout:auto;width:auto;min-width:640px}
}
</style>
<style>
#rv-modal{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;z-index:9100;padding:20px}
#rv-modal.open{display:flex}
#rv-box{background:#0d0d0d;border:1px solid rgba(96,165,250,.25);border-radius:14px;width:988px;max-width:100%;height:824px;max-height:95vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 0 80px rgba(96,165,250,.08)}
#rv-hdr{display:flex;align-items:center;gap:10px;padding:10px 16px;background:#111;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
#rv-dot{width:8px;height:8px;border-radius:50%;background:#60a5fa;flex-shrink:0}
#rv-title{font-size:13px;font-weight:700;color:#60a5fa;flex:1;margin:0}
#rv-newtab{font-size:11px;color:#555;text-decoration:none;padding:4px 8px;border:1px solid #333;border-radius:4px;white-space:nowrap}
#rv-newtab:hover{color:#aaa;border-color:#555}
#rv-xbtn{background:transparent;border:none;color:#555;font-size:20px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0}
#rv-xbtn:hover{color:#f0f0f0}
#rv-crop{flex:1;overflow:hidden;position:relative}
#rv-frame{position:absolute;top:-51px;left:0;width:100%;height:calc(100% + 51px);border:none;background:#000}
</style>
<div id="rv-modal">
  <div id="rv-box">
    <div id="rv-hdr">
      <div id="rv-dot"></div>
      <h3 id="rv-title">Replay</h3>
      <a id="rv-newtab" href="#" target="_blank">&#8599; Nova aba</a>
      <button id="rv-xbtn" onclick="closeReplayModal()">&#x2715;</button>
    </div>
    <div id="rv-crop">
      <iframe id="rv-frame" src="about:blank" allowfullscreen allow="autoplay; fullscreen"></iframe>
    </div>
  </div>
</div>
<div id="sv-modal"><div id="sv-box"><div id="sv-hdr"><h3 id="sv-title">Historico</h3><button id="sv-xbtn" onclick="closeSvModal()">&#x2715;</button></div><div id="sv-body"></div></div></div>
<script src="${BASE}/static/js/cardGalgo.js"></script>
<script>

// "leia mais" das Observacoes: um listener so pra tabela inteira, em vez de
// onclick por linha (aspas dentro de onclick em template literal ja quebraram
// tela neste projeto).
document.addEventListener('click', function(ev){
  var a = ev.target;
  if(!a || !a.classList || !a.classList.contains('obs-mais')) return;
  var td = a.closest('td'); if(!td) return;
  var resto = td.querySelector('.obs-resto'), elip = td.querySelector('.obs-elip');
  var aberto = resto && resto.style.display !== 'none';
  if(resto) resto.style.display = aberto ? 'none' : 'inline';
  if(elip)  elip.style.display  = aberto ? 'inline' : 'none';
  a.textContent = aberto ? 'leia mais' : 'leia menos';
});

var ALL_RACES=${JSON.stringify(races.filter(r=>r.nivel!=='skip'&&r.trap_fav>0).map(r=>Object.assign({},r,{corridaNome:nomeCorridaCompleto(r.corrida)}))).replace(/</g,'\u003c').replace(/>/g,'\u003e')};
var BASE='${BASE}';
// Salva edicoes de Odd/Apostei/Aberto direto no banco, sem precisar voltar
// pra tela Analisar — e recalcula os KPIs afetados na hora (Apostas/Green/%Green)
function saveHistField(id, field, value){
  var body={};
  body[field]=value;
  fetch(BASE+'/api/race/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .catch(function(e){console.error('[historico] erro ao salvar',field,e);});
  var race = ALL_RACES.find(function(r){ return String(r.id)===String(id); });
  if (race) { race[field] = value; recomputeKPIs(); }
}
function recomputeKPIs(){
  var resolvidas = ALL_RACES.filter(function(r){ return r.bateu; }).length;
  var ac = ALL_RACES.filter(function(r){ return r.bateu==='sim'; }).length;
  var taxa = resolvidas>0 ? Math.round(ac/resolvidas*100) : 0;
  var acEl = document.getElementById('kpi-acertos');
  if (acEl) acEl.textContent = ac;
  var taxaEl = document.getElementById('kpi-taxa');
  if (taxaEl) { taxaEl.textContent = taxa + '%'; taxaEl.style.color = (resolvidas>0 && ac/resolvidas>=.5) ? '#22C65E' : '#ef4444'; }
  var apostadas = ALL_RACES.filter(function(r){ return r.odd; });
  var ap = apostadas.length;
  var green = apostadas.filter(function(r){ return r.bateu==='sim'; }).length;
  var pctGreen = ap>0 ? Math.round(green/ap*100) : 0;
  document.getElementById('kpi-apostas').textContent = ap;
  document.getElementById('kpi-green').textContent = green;
  var pgEl = document.getElementById('kpi-pctgreen');
  pgEl.textContent = pctGreen + '%';
  pgEl.style.color = (ap>0 && green/ap>=.5) ? '#22C65E' : '#ef4444';
}
// Lapis: liga/desliga o modo de edicao so daquela linha (Odd/Aberto ficam
// desabilitados por padrao, pra nao editar sem querer)
function setRowEdit(id, editing){
  var pencilEl = document.querySelector('.edit-pencil[data-row="'+id+'"]');
  if (pencilEl) {
    pencilEl.classList.toggle('editing', editing);
    pencilEl.innerHTML = editing ? '&#10003;' : '&#9998;';
  }
  document.querySelectorAll('.hist-inp[data-id="'+id+'"]').forEach(function(el){
    el.disabled = !editing;
  });
}
function toggleRowEdit(pencilEl){
  var id = pencilEl.getAttribute('data-row');
  var editing = !pencilEl.classList.contains('editing');
  setRowEdit(id, editing);
}
document.querySelectorAll('table [data-f]').forEach(function(el){
  var evt = el.type==='checkbox' ? 'change' : (el.type==='number'||el.type==='text' ? 'input' : 'change');
  el.addEventListener(evt, function(){
    var id=this.getAttribute('data-id'), f=this.getAttribute('data-f');
    var val = this.type==='checkbox' ? (this.checked?1:0) : this.value;
    saveHistField(id, f, val);
    if (f === 'flag_atrasada') {
      var tr = this.closest('tr');
      if (tr) tr.classList.toggle('row-atrasada', !!val);
    }
    if (f === 'bateu') {
      this.style.color = val==='sim' ? '#22c55e' : val==='nao' ? '#ef4444' : '#888';
    }
  });
  // Odd: perder o foco (clicar fora) tambem fecha a edicao, alem do Enter
  // (que ja da blur() via onkeydown inline no input)
  if (el.getAttribute('data-f')==='odd') {
    el.addEventListener('blur', function(){
      setRowEdit(this.getAttribute('data-id'), false);
    });
  }
});
function closeSvModal(){document.getElementById('sv-modal').classList.remove('open');}
document.addEventListener('click',function(e){if(e.target.id==='rv-modal')closeReplayModal();if(e.target.id==='sv-modal')closeSvModal();});
function openSessValModal(id){
  var r=ALL_RACES.find(function(x){return x.id==id;});
  if(!r)return;
  var hf=null,hu=null;
  try{if(r.hist_fav)hf=JSON.parse(r.hist_fav);}catch(e){}
  try{if(r.hist_und)hu=JSON.parse(r.hist_und);}catch(e){}
  if(!hf&&!hu){document.getElementById('sv-title').textContent='Historico indisponivel';document.getElementById('sv-body').innerHTML='<p style="color:#888;font-size:12px;padding:20px;text-align:center">Sessao salva antes do recurso ser ativado.</p>';document.getElementById('sv-modal').classList.add('open');return;}
  document.getElementById('sv-title').textContent='T'+r.trap_fav+' '+(r.name_fav||'')+' vs T'+r.trap_und+' '+(r.name_und||'');
  document.getElementById('sv-body').innerHTML=svCard(r.trap_fav,r.name_fav,r.perfil_fav,hf)+'<div class="sv-sep"></div>'+svCard(r.trap_und,r.name_und,r.perfil_und,hu);
  document.getElementById('sv-modal').classList.add('open');
}
function closeReplayModal(){
  document.getElementById('rv-modal').classList.remove('open');
  document.getElementById('rv-frame').src='about:blank';
}
function openReplay(id){
  var r=ALL_RACES.find(function(x){return x.id==id;});
  if(!r||!r.video_url)return;
  document.getElementById('rv-title').textContent='\u25B6 '+(r.corridaNome||r.corrida||'Replay');
  document.getElementById('rv-newtab').href=r.video_url;
  document.getElementById('rv-frame').src=r.video_url;
  document.getElementById('rv-modal').classList.add('open');
}
// ===== Filtros do cabecalho do historico (Hora BR / Corrida / Bateu) =====
function _histSet(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
function recalcKpisHist(){
  var vis=Array.prototype.filter.call(document.querySelectorAll('tr[data-race]'),function(tr){return tr.style.display!=='none';});
  var resolv=vis.filter(function(tr){return tr.getAttribute('data-bateu');});
  var ac=vis.filter(function(tr){return tr.getAttribute('data-bateu')==='sim';}).length;
  var apost=vis.filter(function(tr){return (tr.getAttribute('data-odd')||'')!=='';});
  var green=apost.filter(function(tr){return tr.getAttribute('data-bateu')==='sim';}).length;
  _histSet('kpi-corridas',vis.length);
  _histSet('kpi-acertos',ac);
  _histSet('kpi-taxa',(resolv.length?Math.round(ac/resolv.length*100):0)+'%');
  _histSet('kpi-apostas',apost.length);
  _histSet('kpi-green',green);
  _histSet('kpi-pctgreen',(apost.length?Math.round(green/apost.length*100):0)+'%');
}
function aplicarFiltroHist(){
  var et=document.getElementById('fh-turno'), ec=document.getElementById('fh-corrida'), eb=document.getElementById('fh-bateu');
  var ft=et?et.value:'', fc=ec?ec.value:'', fb=eb?eb.value:'';
  document.querySelectorAll('tr[data-race]').forEach(function(tr){
    var t=tr.getAttribute('data-turno')||'';
    var p=tr.getAttribute('data-pista')||'';
    var b=tr.getAttribute('data-bateu')||'';
    var ok=(!ft||t===ft)&&(!fc||p===fc)&&(!fb||(fb==='pend'?b==='':b===fb));
    tr.style.display=ok?'':'none';
  });
  recalcKpisHist();
}
</script>
</div></body></html>`);
});

module.exports = router;
module.exports.navBar = navBar;