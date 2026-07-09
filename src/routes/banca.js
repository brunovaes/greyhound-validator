'use strict';
// src/routes/banca.js
// Gestao de Banca — acompanha as apostas reais feitas em cima dos AvBs
// (Odd preenchida = aposta feita), calculando ganho/perda por unidade (1
// unidade = 1% da banca inicial DO MES — fixa o mes inteiro, nao recalcula a
// cada aposta). Visao diaria, mensal (fecha o mes) e anual.

const express = require('express');
const router = express.Router();
const { db, getUserConfig } = require('../db/database');
const { navBar } = require('./main');
const { designTokensCSS } = require('../utils/designTokens');
const { icon } = require('../utils/icons');

const BASE = process.env.BASE_PATH || '/greyhound';

function getBancaPadrao(userId) {
  const cfg = getUserConfig(userId);
  return (cfg && cfg.banca_valor_inicial) || 1000;
}

function getLogo() {
  const path = require('path'), fs = require('fs');
  const logoPath = path.join(__dirname, '../../public/img/logo.png');
  if (fs.existsSync(logoPath)) return 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
  return '';
}

// %ganho/perda de UMA aposta. 1 unidade = 1 ponto percentual da banca do mes.
// Green: unidades x (odd-1). Red: -unidades. Pendente (sem resultado ainda): null.
// Converte string numerica no padrao brasileiro (virgula decimal, ex: "1,6")
// pra Number — parseFloat sozinho para de ler na virgula e trunca o valor
function parseNumBR(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function calcGanhoPct(bet) {
  if (bet.bateu !== 'sim' && bet.bateu !== 'nao') return null;
  const u = parseNumBR(bet.bet_unidades);
  const odd = parseNumBR(bet.odd);
  if (bet.bateu === 'sim') return u * (odd - 1);
  return -u;
}

function getApostas(userId) {
  return db.prepare(
    `SELECT r.id, r.hora, r.hora_br, r.corrida, r.dist, r.name_fav, r.name_und, r.odd, r.bet_unidades, r.bateu,
            date(s.created_at, '-3 hours') as dia
     FROM races r JOIN race_sessions s ON s.id = r.session_id
     WHERE r.user_id=? AND r.odd IS NOT NULL AND r.odd != ''
     ORDER BY s.created_at ASC, r.hora ASC`
  ).all(userId);
}

// Monta a cadeia de banca mes-a-mes: cada mes que teve >=1 aposta ganha um
// banca_inicial (override manual OU herdado do saldo final do mes anterior OU
// o padrao 1000 se for o primeiro mes de todos) e um banca_final calculado.
function getCadeiaBanca(userId) {
  const apostas = getApostas(userId);
  const porMes = {};
  apostas.forEach(a => {
    const ym = a.dia.slice(0, 7);
    (porMes[ym] = porMes[ym] || []).push(a);
  });
  const meses = Object.keys(porMes).sort();
  const overrides = {};
  db.prepare('SELECT year_month, banca_inicial FROM bankroll_months WHERE user_id=?').all(userId)
    .forEach(r => { overrides[r.year_month] = r.banca_inicial; });

  const cadeia = {};
  let saldoAnterior = null;
  meses.forEach(ym => {
    const inicial = overrides[ym] != null ? overrides[ym] : (saldoAnterior != null ? saldoAnterior : getBancaPadrao(userId));
    const apostasDoMes = porMes[ym].map(a => {
      const ganhoPct = calcGanhoPct(a);
      return Object.assign({}, a, {
        ganhoPct,
        ganhoReais: ganhoPct != null ? (ganhoPct / 100) * inicial : null,
        status: a.bateu === 'sim' ? 'green' : a.bateu === 'nao' ? 'red' : 'pendente'
      });
    });
    const somaGanhoPct = apostasDoMes.reduce((s, a) => s + (a.ganhoPct || 0), 0);
    const final = inicial + (somaGanhoPct / 100) * inicial;
    cadeia[ym] = { inicial, final, apostas: apostasDoMes, temOverride: overrides[ym] != null };
    saldoAnterior = final;
  });
  return cadeia;
}

function getBancaAtualPadrao(userId) {
  const cadeia = getCadeiaBanca(userId);
  const meses = Object.keys(cadeia).sort();
  if (!meses.length) return getBancaPadrao(userId);
  const ymAtual = new Date().toISOString().slice(0, 7);
  if (cadeia[ymAtual]) return cadeia[ymAtual].inicial;
  return cadeia[meses[meses.length - 1]].final;
}

// ── API ──────────────────────────────────────────────────────────────────────
router.get('/data', (req, res) => {
  const userId = req.user.id;
  const view = req.query.view || 'day';
  const dateParam = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const cadeia = getCadeiaBanca(userId);

    if (view === 'day') {
      const ym = dateParam.slice(0, 7);
      const mes = cadeia[ym] || { inicial: getBancaAtualPadrao(userId), apostas: [] };
      const apostasDoDia = mes.apostas.filter(a => a.dia === dateParam);
      const resolvidas = apostasDoDia.filter(a => a.status !== 'pendente');
      const lucros = resolvidas.filter(a => a.ganhoReais > 0).reduce((s, a) => s + a.ganhoReais, 0);
      const prejuizos = resolvidas.filter(a => a.ganhoReais < 0).reduce((s, a) => s + Math.abs(a.ganhoReais), 0);
      const saldoDia = lucros - prejuizos;
      const pctDia = mes.inicial ? (saldoDia / mes.inicial) * 100 : 0;
      // Dinheiro transitado: soma de TUDO que foi apostado no dia (o volume
      // que entrou em jogo), independente de ter ganho ou perdido — nao e o
      // resultado liquido, e o "handle" do dia.
      const dinheiroTransitado = apostasDoDia.reduce((s, a) => s + (parseNumBR(a.bet_unidades) / 100) * mes.inicial, 0);
      const cfg = getUserConfig(userId);
      const pctStop = cfg && cfg.banca_pct_stop != null ? cfg.banca_pct_stop : 20;
      const stopHit = pctDia < 0 && Math.abs(pctDia) >= pctStop;
      res.json({
        ok: true, view: 'day', date: dateParam, bancaInicialMes: mes.inicial,
        apostas: apostasDoDia, lucros, prejuizos, saldoDia, pctDia, dinheiroTransitado,
        pendentes: apostasDoDia.length - resolvidas.length,
        stopHit, pctStop,
        avisoStop: cfg && cfg.banca_aviso_stop || 'Atenção: o prejuízo de hoje atingiu o limite configurado. Considere parar as apostas por hoje.'
      });
    } else if (view === 'month') {
      const ym = dateParam.slice(0, 7);
      const mes = cadeia[ym] || { inicial: getBancaAtualPadrao(userId), final: getBancaAtualPadrao(userId), apostas: [] };
      const porDia = {};
      mes.apostas.forEach(a => { (porDia[a.dia] = porDia[a.dia] || []).push(a); });
      const dias = Object.keys(porDia).sort().map(dia => {
        const arr = porDia[dia];
        const gr = arr.reduce((s, a) => s + (a.ganhoReais || 0), 0);
        return { dia, saldo: gr, apostas: arr.length, green: arr.filter(a => a.status === 'green').length, red: arr.filter(a => a.status === 'red').length };
      });
      let acumulado = mes.inicial;
      const serie = dias.map(d => { acumulado += d.saldo; return { dia: d.dia, saldoAcumulado: acumulado, saldoDia: d.saldo, apostas: d.apostas }; });
      const totalGanho = mes.final - mes.inicial;
      const resolvidasMes = mes.apostas.filter(a => a.status !== 'pendente');
      res.json({
        ok: true, view: 'month', yearMonth: ym, bancaInicial: mes.inicial, bancaFinal: mes.final,
        totalGanho, pctMes: mes.inicial ? (totalGanho / mes.inicial) * 100 : 0, serie,
        totalApostas: mes.apostas.length,
        vitorias: resolvidasMes.filter(a => a.status === 'green').length,
        derrotas: resolvidasMes.filter(a => a.status === 'red').length,
        temOverride: !!mes.temOverride
      });
    } else if (view === 'year') {
      const year = dateParam.slice(0, 4);
      const mesesDoAno = Object.keys(cadeia).filter(ym => ym.startsWith(year)).sort();
      const serieMeses = mesesDoAno.map(ym => {
        const m = cadeia[ym];
        return { yearMonth: ym, inicial: m.inicial, final: m.final, ganho: m.final - m.inicial, pct: m.inicial ? ((m.final - m.inicial) / m.inicial) * 100 : 0, apostas: m.apostas.length };
      });
      const bancaInicioAno = mesesDoAno.length ? cadeia[mesesDoAno[0]].inicial : getBancaAtualPadrao(userId);
      const bancaFimAno = mesesDoAno.length ? cadeia[mesesDoAno[mesesDoAno.length - 1]].final : getBancaAtualPadrao(userId);
      res.json({
        ok: true, view: 'year', year, bancaInicioAno, bancaFimAno,
        ganhoAno: bancaFimAno - bancaInicioAno,
        pctAno: bancaInicioAno ? ((bancaFimAno - bancaInicioAno) / bancaInicioAno) * 100 : 0,
        serieMeses
      });
    } else {
      res.status(400).json({ error: 'view invalida' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/month-init', express.json(), (req, res) => {
  const userId = req.user.id;
  const { yearMonth, bancaInicial } = req.body || {};
  if (!yearMonth || bancaInicial == null || isNaN(parseFloat(bancaInicial))) {
    return res.status(400).json({ error: 'yearMonth e bancaInicial (numero) sao obrigatorios' });
  }
  db.prepare(
    'INSERT INTO bankroll_months (user_id, year_month, banca_inicial) VALUES (?,?,?) ' +
    'ON CONFLICT(user_id, year_month) DO UPDATE SET banca_inicial=excluded.banca_inicial'
  ).run(userId, yearMonth, parseFloat(bancaInicial));
  res.json({ ok: true });
});

// ── Pagina HTML ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const logoB64 = getLogo();
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const mesAtual = hojeStr.slice(0, 7);
  const anoAtual = hojeStr.slice(0, 4);

  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gestão de Banca - Greyhound Validator</title>
<style>
${designTokensCSS()}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0D1117;color:#f0f0f0;font-size:14px}
.hero{width:100%;background:#000;border-bottom:2px solid #22c55e;overflow:hidden}
.hero img{width:100%;height:auto;max-height:160px;object-fit:contain;object-position:center;display:block;background:#000}
.content{padding:24px;max-width:1200px;margin:0 auto}
h1{font-size:22px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:10px}
.sub{color:#888;font-size:13px;margin-bottom:20px}
.viewtabs{display:flex;gap:6px;background:#161B27;border:1px solid #222;border-radius:10px;padding:6px;margin-bottom:16px;width:fit-content}
.viewtab{padding:8px 18px;border-radius:6px;background:none;border:none;color:#888;font-weight:600;font-size:12px;cursor:pointer;transition:all .15s}
.viewtab.active{background:rgba(34,197,94,.15);color:#22c55e}
.viewtab:hover:not(.active){color:#ccc}
.toprow{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.datepick{display:flex;align-items:center;gap:8px}
.datepick input,.datepick select{background:#161B27;border:1px solid #222;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px}
.navbtn{background:#161B27;border:1px solid #222;color:#ccc;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
.navbtn:hover{border-color:#22c55e;color:#22c55e}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.card{background:#161B27;border:1px solid #222;border-radius:10px;padding:16px}
.card .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;font-weight:700}
.card .val{font-size:22px;font-weight:700}
.card .val.pos{color:#22c55e}
.card .val.neg{color:#ef4444}
.section{background:#161B27;border:1px solid #222;border-radius:10px;padding:18px;margin-bottom:16px}
.section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#22c55e;margin-bottom:14px}
table.betstbl{width:100%;border-collapse:collapse;font-size:12px}
table.betstbl th{text-align:left;padding:8px 10px;color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #2a2a2a}
table.betstbl td{padding:8px 10px;border-bottom:1px solid #1c1c1c}
.status-green{color:#22c55e;font-weight:700}
.status-red{color:#ef4444;font-weight:700}
.status-pendente{color:#888}
.gain-pos{color:#22c55e;font-weight:600}
.gain-neg{color:#ef4444;font-weight:600}
.empty-msg{padding:30px;text-align:center;color:#555;font-size:13px}
.monthinit-form{display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #222}
.btn-mini{background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#22c55e;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer}
</style></head><body>
<div class="hero"><img src="${logoB64}" alt="Greyhound Validator"></div>
${navBar(req.user, 'banca')}
<div class="content">
  <h1>${icon('trophy', {size:22, color:'#22c55e'})} Gestão de Banca</h1>
  <p class="sub">Acompanhamento real das apostas feitas em cima dos AvBs — 1 unidade = 1% da banca inicial do mês.</p>

  <div class="viewtabs">
    <button class="viewtab active" data-view="day" onclick="mudarView('day')">Dia</button>
    <button class="viewtab" data-view="month" onclick="mudarView('month')">Mês</button>
    <button class="viewtab" data-view="year" onclick="mudarView('year')">Ano</button>
  </div>

  <div class="toprow">
    <div class="datepick" id="datepick-day">
      <button class="navbtn" onclick="mudarData(-1)">‹</button>
      <input type="date" id="date-input-day" value="${hojeStr}" onchange="carregarDados()">
      <button class="navbtn" onclick="mudarData(1)">›</button>
    </div>
    <div class="datepick" id="datepick-month" style="display:none">
      <button class="navbtn" onclick="mudarData(-1)">‹</button>
      <input type="month" id="date-input-month" value="${mesAtual}" onchange="carregarDados()">
      <button class="navbtn" onclick="mudarData(1)">›</button>
    </div>
    <div class="datepick" id="datepick-year" style="display:none">
      <button class="navbtn" onclick="mudarData(-1)">‹</button>
      <input type="number" id="date-input-year" value="${anoAtual}" style="width:90px" onchange="carregarDados()">
      <button class="navbtn" onclick="mudarData(1)">›</button>
    </div>
  </div>

  <div id="banca-cards" class="cards"></div>
  <div id="banca-chart-section" class="section" style="display:none">
    <div class="section-title" id="chart-title">Evolução</div>
    <div id="banca-chart"></div>
  </div>
  <div class="section">
    <div class="section-title" id="table-title">Apostas do dia</div>
    <div id="banca-table"></div>
  </div>
</div>

<script>
const BASE = '${BASE}';
let currentView = 'day';

function mudarView(v) {
  currentView = v;
  document.querySelectorAll('.viewtab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-view')===v); });
  document.getElementById('datepick-day').style.display = v==='day' ? 'flex' : 'none';
  document.getElementById('datepick-month').style.display = v==='month' ? 'flex' : 'none';
  document.getElementById('datepick-year').style.display = v==='year' ? 'flex' : 'none';
  carregarDados();
}

function getCurrentDateParam() {
  if (currentView === 'day') return document.getElementById('date-input-day').value;
  if (currentView === 'month') return document.getElementById('date-input-month').value + '-01';
  return document.getElementById('date-input-year').value + '-01-01';
}

function mudarData(delta) {
  if (currentView === 'day') {
    const el = document.getElementById('date-input-day');
    const d = new Date(el.value + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    el.value = d.toISOString().slice(0,10);
  } else if (currentView === 'month') {
    const el = document.getElementById('date-input-month');
    const parts = el.value.split('-').map(Number);
    let y = parts[0], m = parts[1] + delta;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    el.value = y + '-' + String(m).padStart(2,'0');
  } else {
    const el = document.getElementById('date-input-year');
    el.value = parseInt(el.value) + delta;
  }
  carregarDados();
}

function fmtR$(v) {
  const s = (v<0?'-':'') + 'R$ ' + Math.abs(v).toFixed(2).replace('.', ',');
  return s;
}
function fmtPct(v) { return (v>=0?'+':'') + v.toFixed(2).replace('.', ',') + '%'; }

function barChart(items) {
  // items: [{label, value, color}] — barras verticais simples, altura proporcional ao maior valor
  const max = Math.max.apply(null, items.map(function(i){return Math.abs(i.value);}).concat([1]));
  const h = 180;
  return '<div style="display:flex;align-items:flex-end;gap:24px;height:'+ (h+40) +'px;padding:10px 20px">' +
    items.map(function(i) {
      const barH = Math.max(4, Math.round((Math.abs(i.value)/max) * h));
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:8px">' +
        '<div style="font-size:13px;font-weight:700;color:'+i.color+'">'+fmtR$(i.value)+'</div>' +
        '<div style="width:70px;height:'+barH+'px;background:'+i.color+';border-radius:4px 4px 0 0"></div>' +
        '<div style="font-size:11px;color:#888;font-weight:600">'+i.label+'</div>' +
        '</div>';
    }).join('') + '</div>';
}

// Curva intradiaria: saldo acumulado do dia, bet a bet, em ordem cronologica.
// Cada TRECHO da linha e colorido pelo resultado daquela aposta especifica —
// verde subindo (green), vermelho descendo (red) — tipo uma curva de equity.
function intradayEquityChart(apostas) {
  const resolvidas = apostas.filter(function(a){ return a.status !== 'pendente'; })
    .slice().sort(function(a,b){ return (a.hora_br||a.hora||'').localeCompare(b.hora_br||b.hora||''); });
  if (!resolvidas.length) return '<div class="empty-msg">Sem apostas resolvidas nesse dia ainda.</div>';

  const w = 900, h = 220, pad = 36;
  let acumulado = 0;
  const pts = [{ x: 0, valor: 0, label: 'início', cor: '#666' }];
  resolvidas.forEach(function(a, i) {
    acumulado += (a.ganhoReais || 0);
    pts.push({ x: i+1, valor: acumulado, label: a.hora_br||a.hora||'', cor: a.ganhoReais >= 0 ? '#22c55e' : '#ef4444' });
  });

  const vals = pts.map(function(p){return p.valor;});
  const minV = Math.min.apply(null, vals.concat([0])), maxV = Math.max.apply(null, vals.concat([0]));
  const range = (maxV - minV) || 1;
  const stepX = pts.length > 1 ? (w - pad*2) / (pts.length - 1) : 0;
  const coords = pts.map(function(p, i) {
    return { x: pad + i*stepX, y: h - pad - ((p.valor - minV) / range) * (h - pad*2), label: p.label, valor: p.valor, cor: p.cor };
  });

  // Um <path> por trecho (cor do trecho = cor do PONTO DE CHEGADA, ou seja,
  // do resultado daquela aposta especifica)
  const segments = [];
  for (let i = 1; i < coords.length; i++) {
    segments.push('<path d="M'+coords[i-1].x.toFixed(1)+','+coords[i-1].y.toFixed(1)+' L'+coords[i].x.toFixed(1)+','+coords[i].y.toFixed(1)+'" fill="none" stroke="'+coords[i].cor+'" stroke-width="2.5"/>');
  }
  const zeroY = h - pad - ((0 - minV) / range) * (h - pad*2);
  const linhaZero = '<line x1="'+pad+'" y1="'+zeroY.toFixed(1)+'" x2="'+(w-pad)+'" y2="'+zeroY.toFixed(1)+'" stroke="#333" stroke-width="1" stroke-dasharray="4,4"/>';
  const dots = coords.map(function(p){ return '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="'+p.cor+'"><title>'+p.label+': '+fmtR$(p.valor)+'</title></circle>'; }).join('');
  const labels = coords.filter(function(_,i){ return i % Math.ceil(coords.length/8 || 1) === 0 || i === coords.length-1; })
    .map(function(p){ return '<text x="'+p.x.toFixed(1)+'" y="'+(h-6)+'" font-size="9" fill="#666" text-anchor="middle">'+p.label+'</text>'; }).join('');

  return '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:220px">' + linhaZero + segments.join('') + dots + labels + '</svg>';
}

function lineChart(pontos) {
  // pontos: [{label, valor}] — linha simples em SVG, eixo Y auto-escalado
  if (!pontos.length) return '<div class="empty-msg">Sem dados nesse período.</div>';
  const w = 900, h = 220, pad = 40;
  const vals = pontos.map(function(p){return p.valor;});
  const minV = Math.min.apply(null, vals), maxV = Math.max.apply(null, vals);
  const range = (maxV - minV) || 1;
  const stepX = pontos.length > 1 ? (w - pad*2) / (pontos.length - 1) : 0;
  const pts = pontos.map(function(p, i) {
    const x = pad + i*stepX;
    const y = h - pad - ((p.valor - minV) / range) * (h - pad*2);
    return {x:x, y:y, label:p.label, valor:p.valor};
  });
  const pathD = pts.map(function(p,i){ return (i===0?'M':'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  const areaD = pathD + ' L' + pts[pts.length-1].x.toFixed(1) + ',' + (h-pad) + ' L' + pts[0].x.toFixed(1) + ',' + (h-pad) + ' Z';
  const corLinha = pts[pts.length-1].valor >= pts[0].valor ? '#22c55e' : '#ef4444';
  const labels = pts.filter(function(_,i){ return i % Math.ceil(pts.length/10 || 1) === 0 || i === pts.length-1; })
    .map(function(p){ return '<text x="'+p.x.toFixed(1)+'" y="'+(h-8)+'" font-size="9" fill="#666" text-anchor="middle">'+p.label+'</text>'; }).join('');
  const dots = pts.map(function(p){ return '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="'+corLinha+'"><title>'+p.label+': '+fmtR$(p.valor)+'</title></circle>'; }).join('');
  return '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:220px">' +
    '<path d="'+areaD+'" fill="'+corLinha+'" fill-opacity="0.08" stroke="none"/>' +
    '<path d="'+pathD+'" fill="none" stroke="'+corLinha+'" stroke-width="2"/>' +
    dots + labels +
  '</svg>';
}

async function carregarDados() {
  const dateParam = getCurrentDateParam();
  try {
    const r = await fetch(BASE + '/banca/data?view=' + currentView + '&date=' + dateParam);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'erro');
    if (currentView === 'day') renderDay(d);
    else if (currentView === 'month') renderMonth(d);
    else renderYear(d);
  } catch(e) {
    document.getElementById('banca-table').innerHTML = '<div class="empty-msg">Erro ao carregar: ' + e.message + '</div>';
  }
}

function renderDay(d) {
  document.getElementById('table-title').textContent = 'Apostas do dia';
  document.getElementById('chart-title').textContent = 'Lucros x Prejuízos e evolução do dia';
  const cardsEl = document.getElementById('banca-cards');
  cardsEl.innerHTML =
    '<div class="card"><div class="lbl">Banca inicial (mês)</div><div class="val">'+fmtR$(d.bancaInicialMes)+'</div></div>' +
    '<div class="card"><div class="lbl">Dinheiro transitado</div><div class="val" style="color:#3B82F7">'+fmtR$(d.dinheiroTransitado)+'</div></div>' +
    '<div class="card"><div class="lbl">Lucros do dia</div><div class="val pos">'+fmtR$(d.lucros)+'</div></div>' +
    '<div class="card"><div class="lbl">Prejuízos do dia</div><div class="val neg">'+fmtR$(-d.prejuizos)+'</div></div>' +
    '<div class="card"><div class="lbl">Saldo do dia</div><div class="val '+(d.saldoDia>=0?'pos':'neg')+'">'+fmtR$(d.saldoDia)+'</div></div>' +
    '<div class="card"><div class="lbl">% do dia</div><div class="val '+(d.pctDia>=0?'pos':'neg')+'">'+fmtPct(d.pctDia)+'</div></div>' +
    (d.pendentes ? '<div class="card"><div class="lbl">Pendentes</div><div class="val">'+d.pendentes+'</div></div>' : '');

  const chartSection = document.getElementById('banca-chart-section');
  if (d.lucros || d.prejuizos) {
    chartSection.style.display = 'block';
    document.getElementById('banca-chart').innerHTML =
      '<div style="display:flex;gap:24px;align-items:stretch;flex-wrap:wrap">' +
      '<div style="flex-shrink:0">' + barChart([
        { label: 'Lucros', value: d.lucros, color: '#22c55e' },
        { label: 'Prejuízos', value: -d.prejuizos, color: '#ef4444' }
      ]) + '</div>' +
      '<div style="flex:1;min-width:320px;border-left:1px solid #222;padding-left:24px">' +
      '<div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:8px">Evolução do saldo — bet a bet</div>' +
      intradayEquityChart(d.apostas) +
      '</div></div>';
  } else { chartSection.style.display = 'none'; }

  const tblEl = document.getElementById('banca-table');
  if (!d.apostas.length) { tblEl.innerHTML = '<div class="empty-msg">Nenhuma aposta registrada nesse dia.</div>'; return; }
  tblEl.innerHTML = '<table class="betstbl"><thead><tr><th>Hora</th><th>Corrida</th><th>Favorito</th><th>Underdog</th><th>Odd</th><th>Unid.</th><th>Status</th><th>%Gain/Loss</th><th>R$</th></tr></thead><tbody>' +
    d.apostas.map(function(a) {
      const statusLabel = a.status==='green'?'Green':a.status==='red'?'Red':'Pendente';
      const statusCls = 'status-'+a.status;
      const gainCls = a.ganhoReais>0?'gain-pos':a.ganhoReais<0?'gain-neg':'';
      return '<tr><td>'+(a.hora_br||a.hora||'')+'</td><td>'+a.corrida+'</td><td>'+(a.name_fav||'-')+'</td><td>'+(a.name_und||'-')+'</td><td>'+(a.odd||'-')+'</td><td>'+a.bet_unidades+'</td>' +
        '<td class="'+statusCls+'">'+statusLabel+'</td>' +
        '<td class="'+gainCls+'">'+(a.ganhoPct!=null?fmtPct(a.ganhoPct):'-')+'</td>' +
        '<td class="'+gainCls+'">'+(a.ganhoReais!=null?fmtR$(a.ganhoReais):'-')+'</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderMonth(d) {
  document.getElementById('table-title').textContent = 'Dias do mês';
  document.getElementById('chart-title').textContent = 'Evolução da banca no mês';
  const cardsEl = document.getElementById('banca-cards');
  cardsEl.innerHTML =
    '<div class="card"><div class="lbl">Banca inicial</div><div class="val">'+fmtR$(d.bancaInicial)+'</div></div>' +
    '<div class="card"><div class="lbl">Banca final</div><div class="val">'+fmtR$(d.bancaFinal)+'</div></div>' +
    '<div class="card"><div class="lbl">Ganho do mês</div><div class="val '+(d.totalGanho>=0?'pos':'neg')+'">'+fmtR$(d.totalGanho)+'</div></div>' +
    '<div class="card"><div class="lbl">% do mês</div><div class="val '+(d.pctMes>=0?'pos':'neg')+'">'+fmtPct(d.pctMes)+'</div></div>' +
    '<div class="card"><div class="lbl">Green / Red</div><div class="val">'+d.vitorias+' / '+d.derrotas+'</div></div>' +
    '<div class="card"><div class="lbl">Total apostas</div><div class="val">'+d.totalApostas+'</div></div>';

  const chartSection = document.getElementById('banca-chart-section');
  if (d.serie.length) {
    chartSection.style.display = 'block';
    const pontos = [{label:'início', valor:d.bancaInicial}].concat(
      d.serie.map(function(s){ return { label: s.dia.slice(8,10), valor: s.saldoAcumulado }; })
    );
    document.getElementById('banca-chart').innerHTML = lineChart(pontos);
  } else { chartSection.style.display = 'none'; }

  const tblEl = document.getElementById('banca-table');
  let html = '';
  if (!d.serie.length) {
    html = '<div class="empty-msg">Nenhuma aposta registrada nesse mês.</div>';
  } else {
    html = '<table class="betstbl"><thead><tr><th>Dia</th><th>Apostas</th><th>Saldo do dia</th><th>Saldo acumulado</th></tr></thead><tbody>' +
      d.serie.map(function(s) {
        const cls = s.saldoDia>0?'gain-pos':s.saldoDia<0?'gain-neg':'';
        return '<tr><td>'+s.dia+'</td><td>'+s.apostas+'</td><td class="'+cls+'">'+fmtR$(s.saldoDia)+'</td><td>'+fmtR$(s.saldoAcumulado)+'</td></tr>';
      }).join('') + '</tbody></table>';
  }
  html += '<div class="monthinit-form">' +
    '<span style="font-size:11px;color:#888">Ajustar banca inicial desse mês:</span>' +
    '<input type="number" step="1" id="month-init-input" value="'+d.bancaInicial+'" style="width:100px;background:#0D1117;border:1px solid #222;color:#fff;padding:6px 10px;border-radius:6px">' +
    '<button class="btn-mini" onclick="salvarBancaInicial(\\''+d.yearMonth+'\\')">Salvar</button>' +
    (d.temOverride ? '<span style="font-size:11px;color:#22c55e">✓ configurado manualmente</span>' : '<span style="font-size:11px;color:#666">herdado do mês anterior</span>') +
    '</div>';
  tblEl.innerHTML = html;
}

function renderYear(d) {
  document.getElementById('table-title').textContent = 'Meses do ano';
  document.getElementById('chart-title').textContent = 'Evolução da banca no ano';
  const cardsEl = document.getElementById('banca-cards');
  cardsEl.innerHTML =
    '<div class="card"><div class="lbl">Banca início do ano</div><div class="val">'+fmtR$(d.bancaInicioAno)+'</div></div>' +
    '<div class="card"><div class="lbl">Banca fim do ano</div><div class="val">'+fmtR$(d.bancaFimAno)+'</div></div>' +
    '<div class="card"><div class="lbl">Ganho do ano</div><div class="val '+(d.ganhoAno>=0?'pos':'neg')+'">'+fmtR$(d.ganhoAno)+'</div></div>' +
    '<div class="card"><div class="lbl">% do ano</div><div class="val '+(d.pctAno>=0?'pos':'neg')+'">'+fmtPct(d.pctAno)+'</div></div>';

  const chartSection = document.getElementById('banca-chart-section');
  if (d.serieMeses.length) {
    chartSection.style.display = 'block';
    const pontos = d.serieMeses.map(function(m){ return { label: m.yearMonth.slice(5,7)+'/'+m.yearMonth.slice(2,4), valor: m.final }; });
    document.getElementById('banca-chart').innerHTML = lineChart(pontos);
  } else { chartSection.style.display = 'none'; }

  const tblEl = document.getElementById('banca-table');
  if (!d.serieMeses.length) { tblEl.innerHTML = '<div class="empty-msg">Nenhuma aposta registrada nesse ano.</div>'; return; }
  tblEl.innerHTML = '<table class="betstbl"><thead><tr><th>Mês</th><th>Apostas</th><th>Banca inicial</th><th>Banca final</th><th>Ganho</th><th>%</th></tr></thead><tbody>' +
    d.serieMeses.map(function(m) {
      const cls = m.ganho>0?'gain-pos':m.ganho<0?'gain-neg':'';
      return '<tr><td>'+m.yearMonth+'</td><td>'+m.apostas+'</td><td>'+fmtR$(m.inicial)+'</td><td>'+fmtR$(m.final)+'</td><td class="'+cls+'">'+fmtR$(m.ganho)+'</td><td class="'+cls+'">'+fmtPct(m.pct)+'</td></tr>';
    }).join('') + '</tbody></table>';
}

async function salvarBancaInicial(yearMonth) {
  const val = document.getElementById('month-init-input').value;
  try {
    const r = await fetch(BASE + '/banca/month-init', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ yearMonth: yearMonth, bancaInicial: val })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'erro');
    carregarDados();
  } catch(e) { alert('Erro ao salvar: ' + e.message); }
}

carregarDados();
</script>
</body></html>`);
});

module.exports = router;