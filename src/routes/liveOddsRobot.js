'use strict';
// src/routes/liveOddsRobot.js
// Robo de ODDS AO VIVO — puxa os AvBs (Frente a frente) do betwinner de 5 em 5s,
// calcula o % de mercado, cruza com o % do motor (scores_json da analise) e marca
// a tendencia das odds. Espelha o padrao dos outros robos (status + logs +
// start/stop), mas roda em loop continuo (setInterval), nao em cron pontual.
//
// Feeds (familia 1xbet LiveFeed, sem login):
//   descoberta: /LiveFeed/GetSportsShortZip?sports=68&champs=<pistas>
//   corrida:    /main-live-feed/v3/gameEvents?gameId=<id>
// A decodificacao fica em ../utils/betwinnerFeed (testado offline e ao vivo).

const https = require('https');
const {
  parseLiveRaces, parseRaceMarkets, crossWithEngine, sugerirAvbs
} = require('../utils/betwinnerFeed');

const BASE = 'https://betwinner1.com/service-api';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Casamento de pista por NOME: o feed do betwinner traz o nome da pista (ex.
// "Nottingham"), e a gente reverte pelo nomesPistas do sistema. Zero ID
// hardcodado — funciona pra qualquer pista que exista no nomesPistas.
const { NOMES_PISTAS } = require('../utils/nomesPistas');
const NOME_PARA_PISTA = {};
for (const code in NOMES_PISTAS) NOME_PARA_PISTA[String(NOMES_PISTAS[code]).toLowerCase()] = code;
function pistaPorNome(nome) { return NOME_PARA_PISTA[String(nome || '').toLowerCase().trim()] || null; }

const status = {
  running: false,
  stopRequested: false,
  logs: [],
  lastRun: null,
  ciclos: 0,
  corridasAoVivo: 0,
  porCorrida: {},   // 'hora|corrida' -> { track, pista, raceNum, statusLine, avbs, sugeridos, updatedAt }
  pistasNovas: {}   // LI -> nome (pistas que apareceram e nao estao no mapa)
};

function addLog(type, msg) {
  const ts = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  status.logs.push({ type, msg, ts });
  if (status.logs.length > 300) status.logs.shift();
  console.log(`[ODDS] [${type}] ${msg}`);
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = ''; res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON invalido')); } });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('timeout')));
  });
}

// Passo 1: quais pistas de galgo estao ao vivo agora. SEM champs, o feed
// devolve o esporte 68 com a lista `L` de champs (pista) ao vivo — so os IDs.
async function descobrirChampsAoVivo() {
  const url = `${BASE}/LiveFeed/GetSportsShortZip?sports=68&lng=pt&gr=495&country=31&partner=152&virtualSports=true&groupChamps=true`;
  const data = await httpGetJson(url);
  const sport = ((data && data.Value) || []).find(s => s.I === 68);
  return ((sport && sport.L) || []).map(c => c.LI).filter(Boolean);
}

// Passo 2: com os champs ao vivo, busca as corridas de cada pista. Casa a pista
// por NOME (via nomesPistas). champsIds explicito ainda funciona (pra teste).
async function listarCorridasAoVivo(champsIds) {
  let champs = (champsIds && champsIds.length) ? champsIds : null;
  if (!champs) { try { champs = await descobrirChampsAoVivo(); } catch (e) { champs = []; } }
  if (!champs || !champs.length) return [];
  const url = `${BASE}/LiveFeed/GetSportsShortZip?sports=68&champs=${champs.join(',')}&lng=pt&gr=495&country=31&partner=152&virtualSports=true&groupChamps=true`;
  const disc = await httpGetJson(url);
  return parseLiveRaces(disc).map(r => {
    const pista = pistaPorNome(r.track);
    if (!pista && r.track) status.pistasNovas[r.track] = (r.li || '?'); // nome que nao casou no nomesPistas
    return Object.assign({}, r, { pista });
  });
}

async function buscarMercados(gameId) {
  const url = `${BASE}/main-live-feed/v3/gameEvents?cfView=3&countEvents=250&fcountry=31&gameId=${gameId}&gr=495&grMode=4&lng=pt&marketType=1&ref=152`;
  return parseRaceMarkets(await httpGetJson(url));
}

function marcarTendencia(avbs, prevAvbs) {
  const key = a => a.aTrap + 'x' + a.bTrap;
  const prev = {};
  for (const p of (prevAvbs || [])) prev[key(p)] = p.oddAvenceB;
  return avbs.map(a => {
    const o = prev[key(a)];
    let trend = 'novo';
    if (o != null) trend = a.oddAvenceB > o ? 'subiu' : (a.oddAvenceB < o ? 'desceu' : 'igual');
    return Object.assign({}, a, { trend });
  });
}

// Snapshot ao vivo de uma corrida: mercado + cruzamento com o motor + tendencia.
async function snapshotCorrida(gameId, scores, prevAvbs) {
  const race = await buscarMercados(gameId);
  let avbs = crossWithEngine(race.avbs, scores || []);
  avbs = marcarTendencia(avbs, prevAvbs);
  avbs.sort((a, b) => (b.edge == null ? -999 : b.edge) - (a.edge == null ? -999 : a.edge));
  return Object.assign({}, race, { avbs });
}

// ── Loop principal ───────────────────────────────────────────────────────────
// getScores(liveRace) -> array de scores {trap,nome,score} da analise casada, ou
//   null se ainda nao ha analise pra essa corrida (aí mostra so mercado).
// O casamento analise<->corrida do betwinner (por pista+horario) fica no chamador
// (robot.js), que tem acesso ao banco.
let timer = null;
async function umCiclo(getScores) {
  let races;
  try { races = await listarCorridasAoVivo(); }
  catch (e) { addLog('warn', 'falha ao listar: ' + e.message); return; }

  status.corridasAoVivo = races.length;
  const abertas = races.filter(r => /Inicia/i.test(r.statusLine)); // ainda vao largar

  for (const r of abertas) {
    const chave = r.gameId;
    // getScores(r) devolve { scores, corrida, hora } da analise casada, ou null.
    const analise = (typeof getScores === 'function') ? (getScores(r) || null) : null;
    const scores = analise ? (analise.scores || null) : null;
    let snap;
    try { snap = await snapshotCorrida(r.gameId, scores, (status.porCorrida[chave] || {}).avbs); }
    catch (e) { addLog('warn', `${r.track} ${r.raceNum}: ${e.message}`); continue; }
    status.porCorrida[chave] = {
      gameId: r.gameId, track: r.track, pista: r.pista, raceNum: r.raceNum,
      statusLine: r.statusLine, startTs: r.startTs,
      avbs: snap.avbs,
      sugeridos: scores ? sugerirAvbs(scores) : [],
      temAnalise: !!scores,
      analiseCorrida: analise ? (analise.corrida || null) : null, // casa com o front
      updatedAt: Date.now()
    };
  }
  // limpa corridas que sairam de cena (nao estao mais abertas)
  const abertasIds = new Set(abertas.map(r => r.gameId));
  for (const id of Object.keys(status.porCorrida)) {
    if (!abertasIds.has(Number(id)) && !abertasIds.has(id)) delete status.porCorrida[id];
  }
  status.ciclos++;
  status.lastRun = new Date().toISOString();
}

// opts: { intervaloMs, podeRodar } — podeRodar() e' checado a cada ciclo; se
// devolver false (fora da janela de corridas), o ciclo e' PULADO sem bater na
// rede, evitando martelar o betwinner de madrugada.
function iniciar(getScores, opts) {
  opts = opts || {};
  const intervaloMs = opts.intervaloMs || 5000;
  if (status.running) { addLog('warn', 'ja esta rodando'); return; }
  status.running = true; status.stopRequested = false;
  addLog('ok', 'robo de odds ao vivo iniciado (loop ' + Math.round(intervaloMs / 1000) + 's)');
  const tick = () => {
    if (status.stopRequested) { status.running = false; if (timer) clearInterval(timer); timer = null; addLog('info', 'parado'); return; }
    if (typeof opts.podeRodar === 'function' && !opts.podeRodar()) return; // fora da janela: pula
    umCiclo(getScores).catch(e => addLog('err', 'ciclo: ' + e.message));
  };
  tick();
  timer = setInterval(tick, intervaloMs);
}

function parar() { status.stopRequested = true; }
function getStatus() { return Object.assign({}, status, { porCorrida: undefined }); }
function getSnapshots() { return Object.values(status.porCorrida); }

module.exports = {
  pistaPorNome, descobrirChampsAoVivo, listarCorridasAoVivo, buscarMercados,
  snapshotCorrida, marcarTendencia, sugerirAvbs, iniciar, parar, getStatus, getSnapshots,
  _status: status
};
