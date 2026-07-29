/* Greyhound Factory — Alerta global de corridas.
 * Roda em TODAS as telas do sistema (robô, histórico, banca, configurações...)
 * para que o alarme toque mesmo quando você não está na tela de análise.
 * Na tela de análise fica passivo: o app.js já cuida do alarme lá
 * (evita aviso duplicado). Autossuficiente, sem dependências. */
(function () {
  'use strict';
  // Na tela de analise o app.js ja dispara o alarme — nao duplicar aqui.
  // A checagem e feita no ciclo(), e nao aqui na entrada, porque o navBar
  // (que carrega este script) e renderizado ANTES do <script src="/app.js">
  // na pagina de Analise. Na entrada do IIFE a flag ainda nao existiria.
  // A tag usa defer, entao na pratica o app.js ja rodou, mas a checagem
  // dentro do ciclo torna isso independente de ordem de carga.
  function souPassivo() { return !!window.__ghAlarmeApp; }

  // BASE a partir do próprio <script src="...">
  var BASE = '/greyhound';
  try {
    var sc = document.currentScript || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
    if (sc && sc.src) BASE = new URL(sc.src).pathname.replace(/\/static\/.*$/, '');
  } catch (e) {}

  var CORES_ALARME = { azul: '#3b82f6', roxo: '#8b5cf6', laranja: '#f97316', rosa: '#ec4899' };
  var ALARME = { ativo: 0, turno: '', pistas: [], classes: [], som: 'beep', cor: 'azul' };
  var SOM_ALERTA = 'sino', ALERTA_MIN_ANTES = 3;

  /* ---- helpers de tempo/parsing (espelham o app.js) ---- */
  function convertHora(h) { if (!h) return ''; var p = h.split(':'); var hr = parseInt(p[0]); if (hr >= 1 && hr <= 9) hr += 12; hr = hr - 4; if (hr < 0) hr += 24; return hr + ':' + p[1]; }
  function minutesToRace(r) { var hbr = r.hora_br || convertHora(r.hora || ''); if (!hbr) return null; var now = new Date(); var nowMin = now.getHours() * 60 + now.getMinutes(); var pp = hbr.split(':'); var rm = parseInt(pp[0] || 0) * 60 + parseInt(pp[1] || 0); return rm - nowMin; }
  function isOldRaceCard(r) { var dc = r.data_card || r.dataCard; if (!dc) return false; var now = new Date(); var t = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'); return dc < t; }
  function getRaceClass(corrida) { var m = (corrida || '').trim().match(/([A-Z]\d+)$/i); return m ? m[1].toUpperCase() : null; }
  function turnoDaCorrida(r) { var hbr = r.hora_br || convertHora(r.hora || ''); var h = parseInt((hbr || '').split(':')[0], 10); if (isNaN(h)) return ''; return h < 13 ? 'manha' : 'tarde'; }
  function matchAlarme(r) {
    if (!ALARME.ativo) return false;
    if (ALARME.turno && turnoDaCorrida(r) !== ALARME.turno) return false;
    var pista = (r.corrida || '').trim().split(' ')[0];
    var classe = (getRaceClass(r.corrida || '') || '').toUpperCase();
    if (ALARME.pistas.length && ALARME.pistas.indexOf(pista) < 0) return false;
    if (ALARME.classes.length && ALARME.classes.map(function (c) { return c.toUpperCase(); }).indexOf(classe) < 0) return false;
    return true;
  }

  /* ---- sons (mesmos timbres do app.js) ---- */
  function tocarSino(ctx) { function tone(f, s, d) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + s); g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + s + d); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d + 0.05); } tone(1046.5, 0, 0.25); tone(1318.5, 0.15, 0.35); }
  function tocarBeep(ctx) { function tone(f, s, d) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + s); g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + s + d); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d + 0.03); } tone(1500, 0, 0.08); tone(1500, 0.14, 0.08); }
  function tocarAlarme(ctx) { function tone(f, s, d) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + s); g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + s + d); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d + 0.05); } tone(880, 0, 0.15); tone(660, 0.15, 0.15); tone(880, 0.30, 0.15); tone(660, 0.45, 0.15); }
  function tocarSuave(ctx) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 700; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.65); }
  var SONS = { sino: tocarSino, beep: tocarBeep, alarme: tocarAlarme, suave: tocarSuave };

  var _ctx = null;
  function getCtx() { try { if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)(); if (_ctx.state === 'suspended') _ctx.resume(); return _ctx; } catch (e) { return null; } }

  /* Sons como <audio> (data URI WAV) — tocam confiavelmente em segundo plano. */
  var SOM_AUDIO = {}, _somProntos = false;
  function _bufToWav(buffer) {
    var ch = buffer.getChannelData(0), sr = buffer.sampleRate, len = ch.length;
    var ab = new ArrayBuffer(44 + len * 2), view = new DataView(ab);
    function ws(o, s) { for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, len * 2, true);
    var off = 44; for (var i = 0; i < len; i++, off += 2) { var s = Math.max(-1, Math.min(1, ch[i])); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
    var bytes = new Uint8Array(ab), bin = ''; for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function _render(fn, dur) {
    return new Promise(function (resolve, reject) {
      try {
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return reject('no-oac');
        var sr = 44100, oac = new OAC(1, Math.ceil(sr * dur), sr); fn(oac);
        oac.startRendering().then(function (buf) { resolve(_bufToWav(buf)); }).catch(reject);
      } catch (e) { reject(e); }
    });
  }
  // WAV de 10ms em silencio, so pra dar um play() SINCRONO dentro do gesto.
  // No iOS o <audio> so fica destravado se o play() rodar no mesmo tick do
  // toque; depois disso, trocar o .src mantem a liberacao.
  var _SILENCIO_WAV = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  function prepararSons() {
    if (_somProntos) return; _somProntos = true;
    var specs = [['sino', tocarSino, 0.7], ['beep', tocarBeep, 0.35], ['alarme', tocarAlarme, 0.75], ['suave', tocarSuave, 0.75]];

    // PASSO 1 (sincrono, dentro do gesto): destrava o autoplay no iOS.
    specs.forEach(function (s) {
      try {
        var a = new Audio(_SILENCIO_WAV);
        a.preload = 'auto';
        SOM_AUDIO[s[0]] = a;
        var p = a.play();
        if (p && p.then) p.then(function () { try { a.pause(); a.currentTime = 0; } catch (e) {} }).catch(function () {});
      } catch (e) {}
    });

    // PASSO 2 (assincrono): so troca o .src do elemento ja destravado.
    specs.forEach(function (s) {
      _render(s[1], s[2]).then(function (uri) {
        var a = SOM_AUDIO[s[0]];
        if (a) { try { a.src = uri; a.load(); } catch (e) {} }
        else { try { var b = new Audio(uri); b.preload = 'auto'; SOM_AUDIO[s[0]] = b; } catch (e) {} }
      }).catch(function () {});
    });
  }
  function playSom(nome) {
    try {
      var a = SOM_AUDIO[nome];
      if (a) { try { a.currentTime = 0; var p = a.play(); if (p && p.catch) p.catch(function () { _playWA(nome); }); return; } catch (e) {} }
      _playWA(nome);
    } catch (e) {}
  }
  function _playWA(nome) { try { var ctx = getCtx(); if (!ctx) return; (SONS[nome] || tocarSino)(ctx); } catch (e) {} }

  /* ---- notificação de desktop + título piscando ---- */
  function notificar(r, custom) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (!document.hidden) return;
      var hbr = r.hora_br || convertHora(r.hora || '');
      var titulo = custom ? 'Alarme — corrida chegando' : 'Corrida chegando';
      var corpo = (r.corrida || '') + (hbr ? (' · ' + hbr) : '');
      var n = new Notification(titulo, { body: corpo, tag: (r.hora || '') + '|' + (r.corrida || ''), silent: true });
      n.onclick = function () { try { window.focus(); n.close(); } catch (e) {} };
      setTimeout(function () { try { n.close(); } catch (e) {} }, 20000);
    } catch (e) {}
  }
  var _tOrig = null, _tTimer = null;
  function flashTitulo() { try { if (!document.hidden || _tTimer) return; if (_tOrig === null) _tOrig = document.title; var on = true; _tTimer = setInterval(function () { document.title = on ? '🔔 Corrida chegando!' : (_tOrig || 'Greyhound Factory'); on = !on; }, 1000); } catch (e) {} }
  function pararFlash() { if (_tTimer) { clearInterval(_tTimer); _tTimer = null; } if (_tOrig !== null) { document.title = _tOrig; _tOrig = null; } }

  function avisar(r, custom) { playSom(custom ? ALARME.som : SOM_ALERTA); notificar(r, custom); flashTitulo(); }

  /* ---- dedupe entre telas/abas via localStorage (evita repetir o mesmo aviso) ---- */
  var _local = {};
  function jaAvisou(key) {
    var now = Date.now(), TTL = 10 * 60 * 1000;
    try {
      var raw = localStorage.getItem('ghAlerted'); var o = raw ? JSON.parse(raw) : {};
      for (var k in o) { if (o[k] < now) delete o[k]; }
      if (o[key] && o[key] > now) { localStorage.setItem('ghAlerted', JSON.stringify(o)); return true; }
      o[key] = now + TTL; localStorage.setItem('ghAlerted', JSON.stringify(o)); return false;
    } catch (e) { if (_local[key] && _local[key] > now) return true; _local[key] = now + TTL; return false; }
  }

  /* ---- carga de config e corridas via API ---- */
  async function carregarConfig() {
    try {
      var r = await fetch(BASE + '/api/config'); if (!r.ok) return false; var c = await r.json();
      if (c.alerta_min_antes != null) ALERTA_MIN_ANTES = parseInt(c.alerta_min_antes);
      if (c.som_alerta) SOM_ALERTA = c.som_alerta;
      ALARME.ativo = c.alarme_filtro_ativo ? 1 : 0;
      ALARME.turno = c.alarme_filtro_turno || '';
      ALARME.pistas = (c.alarme_filtro_pistas || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      ALARME.classes = (c.alarme_filtro_classes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      ALARME.som = c.alarme_filtro_som || 'beep';
      ALARME.cor = c.alarme_filtro_cor || 'azul';
      return true;
    } catch (e) { return false; }
  }
  async function pegarCorridas() {
    try {
      var now = new Date();
      var label = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();
      var nome = 'Races ' + label;
      var sr = await fetch(BASE + '/api/sessions'); if (!sr.ok) return [];
      var sessions = await sr.json();
      var today = Array.isArray(sessions) ? sessions.find(function (s) { return s.name === nome; }) : null;
      if (!today) return [];
      var dr = await fetch(BASE + '/api/session/' + today.id + '/races'); if (!dr.ok) return [];
      var dd = await dr.json();
      return (dd.races && Array.isArray(dd.races)) ? dd.races : [];
    } catch (e) { return []; }
  }
  async function ciclo() {
    if (souPassivo()) return;          // tela de Analise: quem avisa e o app.js
    if (!(await carregarConfig())) return; // não logado / erro
    var races = await pegarCorridas();
    races.forEach(function (r) {
      if ((r.nivel || '') === 'skip') return;
      if (isOldRaceCard(r)) return;
      var mins = minutesToRace(r);
      if (mins === null || mins < 0 || mins > ALERTA_MIN_ANTES) return;
      var key = (r.hora || '') + '|' + (r.corrida || '');
      if (jaAvisou(key)) return;
      avisar(r, matchAlarme(r));
    });
  }

  /* primeiro gesto: destrava áudio e pede permissão de notificação */
  var _inited = false;
  function initGesto() { if (_inited) return; _inited = true; getCtx(); prepararSons(); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }
  ['click', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, initGesto); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pararFlash(); });

  /* ---- service worker (Web Push) ----
   * Registra o sw.js em toda tela autenticada. E' idempotente: chamar de novo
   * com o mesmo caminho nao cria outro registro. Precisa estar registrado
   * ANTES de o botao "Ativar notificacoes" (Configuracoes) tentar assinar.
   * O caminho e' BASE + '/sw.js' de proposito — servido de /static/ o escopo
   * nao cobriria as telas do sistema. */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' })
      .then(function (reg) { console.log('[push] service worker registrado, escopo:', reg.scope); })
      .catch(function (e) { console.warn('[push] service worker nao registrou:', e && e.message); });
  }

  ciclo();
  setInterval(ciclo, 15000);
})();