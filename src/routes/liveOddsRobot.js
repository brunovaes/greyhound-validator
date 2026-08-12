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
const zlib = require('zlib');
const {
  parseLiveRaces, parseRaceMarkets, crossWithEngine, sugerirAvbs, scoreToPct
} = require('../utils/betwinnerFeed');
const reanalise = require('../utils/reanaliseEngine');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Dominios-espelho do betwinner. O bloqueio (406) e' por IP no dominio principal,
// mas os espelhos costumam ter WAF diferente — a gente tenta em ordem e "gruda" no
// primeiro que responder. Da pra sobrescrever a lista via env BETWINNER_HOSTS
// (dominios separados por virgula) sem mexer no codigo nem redeployar via git.
const HOSTS = (process.env.BETWINNER_HOSTS
  ? process.env.BETWINNER_HOSTS.split(',').map(s => s.trim()).filter(Boolean)
  : ['betwinner1.com', 'betwinner.com', 'betwinner2.com', 'betwinner3.com', 'betwinner6.com', 'betwinner9.com', 'betwinnersport.com']);
let _hostBom = null; // dominio que funcionou por ultimo (tentado primeiro no proximo ciclo)

// Proxy OPCIONAL — cobre descoberta E odds. Se BETWINNER_PROXY_URL (ou o campo
// Proxy do Painel Admin) estiver setado, as chamadas ao betwinner saem por um IP
// residencial limpo — contorna o anti-bot no IP do Railway (que passou a bloquear
// tanto a descoberta quanto o gameEvents das odds). Sem proxy setado, TUDO segue
// direto como hoje (custo zero). Como o robo so puxa odds de corridas do seu perfil,
// o volume pelo proxy fica baixo.
let _proxyAgent = null;
let _proxyUrlAtual = '';
// (Re)configura o proxy de descoberta. url vazia = desliga. Chamado no load com a
// env e de novo pelo iniciar() com a URL da config (a config vence a env).
function setProxy(url) {
  url = url || '';
  _proxyUrlAtual = url;
  _proxyAgent = null;
  if (!url) { console.log('[ODDS] proxy de descoberta desligado'); return; }
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    _proxyAgent = new HttpsProxyAgent(url);
    console.log('[ODDS] proxy de descoberta ATIVO');
  } catch (e) { console.error('[ODDS] proxy setado mas https-proxy-agent indisponivel:', e.message); }
}
setProxy(process.env.BETWINNER_PROXY_URL || '');

// Casamento de pista por NOME: o feed do betwinner traz o nome da pista (ex.
// "Nottingham"), e a gente reverte pelo nomesPistas do sistema. Zero ID
// hardcodado — funciona pra qualquer pista que exista no nomesPistas.
const { NOMES_PISTAS } = require('../utils/nomesPistas');
const NOME_PARA_PISTA = {};
for (const code in NOMES_PISTAS) NOME_PARA_PISTA[String(NOMES_PISTAS[code]).toLowerCase()] = code;
function pistaPorNome(nome) { return NOME_PARA_PISTA[String(nome || '').toLowerCase().trim()] || null; }

// Deep-link da corrida no betwinner (pro botao "Entre na BW"):
// https://betwinner1.com/br/live/greyhound-racing/{champId}-{slug}/{gameId}-{slug}
function _slug(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, '-'); }
function bwUrlCorrida(li, gameId, track) {
  if (!li || !gameId) return null;
  const s = _slug(track);
  return `https://betwinner1.com/br/live/greyhound-racing/${li}-${s}/${gameId}-${s}`;
}

// Provisorios ate virem de Configuracoes (Etapa D):
const LIMITE_EDGE_VALOR = 5; // default do edge minimo p/ o selo "valor"
const MAX_AVBS = 3;          // default de quantos AvBs mostrar na tela
// Valores EFETIVOS — a config (Painel Admin) sobrescreve os defaults via o
// callback getOddsCfg, lido a cada ciclo. Sem config, ficam nos defaults acima.
let _edgeMin = LIMITE_EDGE_VALOR;
let _maxAvbs = MAX_AVBS;
let _getOddsCfg = null; // () => { maxAvbs, edgeMin } (setado por iniciar)

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

// Headers "de navegador" — o betwinner responde 406 pra requisicao "seca". O
// Referer/Origin batendo com o DOMINIO tentado faz a chamada parecer o proprio site.
function headersPara(host) {
  return {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Referer': `https://${host}/br/live/greyhound-racing`,
    'Origin': `https://${host}`,
    'X-Requested-With': 'XMLHttpRequest'
  };
}
// ── Medidor de trafego do proxy (pra comparar com o USED TRAFFIC da Decodo) ──
// Soma os bytes COMPRIMIDOS que trafegam (o que a Decodo cobra) por dia (fuso BR),
// mais um overhead fixo por requisicao (headers + framing TLS, que a Decodo tambem
// conta mas o Node nao ve). E' ESTIMATIVA — a Decodo tende a marcar um pouco mais
// (handshake TLS, reconexoes). Serve pra ordem de grandeza e projecao mensal.
const TRAFEGO_OVERHEAD_REQ = 550; // bytes/req aprox (req headers + resp headers + TLS)
const _trafego = { porDia: {} };  // 'YYYY-MM-DD'(BR) -> { bytes, reqs }
function _diaBR() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function registrarTrafego(bytesComprimidos) {
  const dia = _diaBR();
  const d = _trafego.porDia[dia] || { bytes: 0, reqs: 0 };
  d.bytes += (bytesComprimidos || 0) + TRAFEGO_OVERHEAD_REQ;
  d.reqs += 1;
  _trafego.porDia[dia] = d;
  const dias = Object.keys(_trafego.porDia).sort();
  while (dias.length > 14) delete _trafego.porDia[dias.shift()]; // mantem 14 dias
}
function getTrafego() {
  const dia = _diaBR();
  const hoje = _trafego.porDia[dia] || { bytes: 0, reqs: 0 };
  const porDia = Object.keys(_trafego.porDia).sort().reverse().map(k => ({
    dia: k, mb: +(_trafego.porDia[k].bytes / 1e6).toFixed(2),
    gb: +(_trafego.porDia[k].bytes / 1e9).toFixed(3), reqs: _trafego.porDia[k].reqs
  }));
  // media diaria dos dias COM trafego -> projecao de 30 dias
  const comUso = porDia.filter(d => d.mb > 0);
  const mediaMb = comUso.length ? comUso.reduce((a, b) => a + b.mb, 0) / comUso.length : 0;
  return {
    hoje: { dia, mb: +(hoje.bytes / 1e6).toFixed(2), gb: +(hoje.bytes / 1e9).toFixed(3), reqs: hoje.reqs },
    porDia,
    projecaoMensalGb: +((mediaMb * 30) / 1000).toFixed(2) // media/dia x 30
  };
}

function httpGetJson(url, host, agent) {
  return new Promise((resolve, reject) => {
    const headers = Object.assign(headersPara(host || 'betwinner1.com'), { 'Accept-Encoding': 'gzip, deflate, br' });
    const opts = { headers };
    if (agent) opts.agent = agent; // proxy residencial (so na descoberta, se ligado)
    const req = https.get(url, opts, res => {
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      // Junta os chunks CRUS (comprimidos = o que trafega na rede/proxy) pra:
      // (1) medir o trafego real e comparar com o USED TRAFFIC da Decodo, e
      // (2) descomprimir de uma vez. Conta o trafego SEMPRE (inclusive respostas
      // de erro tipo 406), porque a Decodo tambem cobra esses bytes.
      const rawChunks = [];
      res.on('data', c => rawChunks.push(c));
      res.on('error', e => reject(new Error('stream: ' + e.message)));
      res.on('end', () => {
        const comp = Buffer.concat(rawChunks);
        registrarTrafego(comp.length); // bytes comprimidos na rede (+ overhead fixo por req)
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('HTTP ' + res.statusCode));
        let buf = comp;
        try {
          if (enc === 'gzip') buf = zlib.gunzipSync(comp);
          else if (enc === 'deflate') buf = zlib.inflateSync(comp);
          else if (enc === 'br') buf = zlib.brotliDecompressSync(comp);
        } catch (e) { return reject(new Error('descomprimir: ' + e.message)); }
        const body = buf.toString('utf8');
        try { resolve(JSON.parse(body)); }
        catch (e) {
          // Corpo nao-JSON: mostra content-type/encoding + amostra pra diagnosticar
          // (pagina de desafio anti-bot? outra compressao?). So no log, nao quebra nada.
          const ct = String(res.headers['content-type'] || '?');
          const amostra = body.slice(0, 160).replace(/\s+/g, ' ');
          reject(new Error('JSON invalido [ct=' + ct + ' enc=' + (enc || '-') + ' len=' + body.length + ']: ' + amostra));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
  });
}

// Busca um path do feed tentando os dominios-espelho em ordem. Gruda no primeiro
// que responder (2xx) e o usa primeiro no proximo ciclo; so re-varre a lista se ele
// voltar a falhar. Assim, quando um espelho funciona, nao fica testando os outros a toa.
async function fetchFeed(path, useProxy) {
  const agent = (useProxy && _proxyAgent) ? _proxyAgent : null; // proxy so na descoberta
  const ordem = _hostBom ? [_hostBom].concat(HOSTS.filter(h => h !== _hostBom)) : HOSTS.slice();
  let ultimoErro;
  for (const host of ordem) {
    try {
      const json = await httpGetJson(`https://${host}/service-api${path}`, host, agent);
      if (host !== _hostBom) { _hostBom = host; addLog('ok', 'dominio ativo: ' + host); }
      return json;
    } catch (e) {
      ultimoErro = e;
      if (_hostBom === host) _hostBom = null; // o "bom" caiu — libera a re-varredura
    }
  }
  throw ultimoErro || new Error('todos os dominios falharam');
}

// Registro de TODAS as pistas que o betwinner ja expos ao vivo desde que o robo
// ligou (diagnostico de cobertura). Se uma pista some da tela mas NUNCA aparece
// aqui o dia todo, o betwinner nao a lista no feed de galgo (estrutural). Se
// aparece pelo menos uma vez, foi janela ruim/timing (o proxy resolve).
const _champsVistos = {}; // nome -> { li, count, primeiraTs, ultimaTs, matched }
function getChampsVistos() { return _champsVistos; }

// Passo 1: quais pistas de galgo estao ao vivo agora. SEM champs, o feed
// devolve o esporte 68 com a lista `L` de champs (pista) ao vivo — so os IDs.
async function descobrirChampsAoVivo() {
  const data = await fetchFeed('/LiveFeed/GetSportsShortZip?sports=68&lng=pt&gr=495&country=31&partner=152&virtualSports=true&groupChamps=true', true);
  const sport = ((data && data.Value) || []).find(s => s.I === 68);
  const L = (sport && sport.L) || [];
  for (const c of L) { // registra TODA pista exposta (diagnostico de cobertura)
    const nome = c.L || c.LE || String(c.LI || '?');
    const v = _champsVistos[nome] || { li: c.LI, count: 0, primeiraTs: Date.now(), matched: !!pistaPorNome(nome) };
    v.count++; v.ultimaTs = Date.now(); v.li = c.LI;
    _champsVistos[nome] = v;
  }
  return L.map(c => c.LI).filter(Boolean);
}

// Passo 2: com os champs ao vivo, busca as corridas de cada pista. Casa a pista
// por NOME (via nomesPistas). champsIds explicito ainda funciona (pra teste).
async function listarCorridasAoVivo(champsIds) {
  let champs = (champsIds && champsIds.length) ? champsIds : null;
  if (!champs) { try { champs = await descobrirChampsAoVivo(); } catch (e) { champs = []; } }
  if (!champs || !champs.length) return [];
  // IMPORTANTE: o betwinner passou a REJEITAR (406) a chamada com VARIOS champs de
  // uma vez (a lista separada por virgula `champs=A,B,C`). Confirmado no diag
  // /odds/diag/variantes: multi-champ -> 406; UMA liga por vez -> 200 JSON normal.
  // Entao a gente busca champ A CHAMP e junta. Cada corrida ainda casa a pista por
  // nome via nomesPistas, igual antes. (O proxy rotativo faz cada chamada sair de um
  // IP brasileiro diferente, o que ajuda a nao parecer varredura.)
  const races = [];
  let algumOk = false, ultimoErro = null;
  for (const champ of champs) {
    try {
      const disc = await fetchFeed(`/LiveFeed/GetSportsShortZip?sports=68&champs=${champ}&lng=pt&gr=495&country=31&partner=152&virtualSports=true&groupChamps=true`, true);
      algumOk = true;
      for (const r of parseLiveRaces(disc)) {
        const pista = pistaPorNome(r.track);
        if (!pista && r.track) status.pistasNovas[r.track] = (r.li || '?'); // nome que nao casou no nomesPistas
        races.push(Object.assign({}, r, { pista }));
      }
    } catch (e) { ultimoErro = e; } // um champ falhou -> segue os outros
  }
  // Se NENHUM champ respondeu, propaga o erro pra o retry do obterCorridas agir
  // (ele tenta 3x e mantem a ultima lista boa). Se ao menos um respondeu, devolve
  // o que veio — melhor uma lista parcial do que nenhuma.
  if (!algumOk && ultimoErro) throw ultimoErro;
  return races;
}

async function buscarMercados(gameId) {
  // Usa o proxy tambem (2o arg true): o betwinner passou a bloquear o endpoint de
  // odds no IP do Railway, nao so a descoberta. Sem proxy setado, segue direto.
  return parseRaceMarkets(await fetchFeed(`/main-live-feed/v3/gameEvents?cfView=3&countEvents=250&fcountry=31&gameId=${gameId}&gr=495&grMode=4&lng=pt&marketType=1&ref=152`, true));
}

// ── DIAGNOSTICO: qual formato da chamada de jogos NAO e' desafiado ────────────
// A descoberta SEM champs= volta JSON, mas a COM champs= (que traz os jogos G[])
// volta a pagina HTML anti-bot, de qualquer IP. Aqui a gente bate a mesma familia
// de URL em varias VARIACOES (via proxy) e captura ct/len/isJson/jogos de cada uma,
// SEM quebrar em corpo nao-JSON, pra descobrir qual variacao o betwinner libera.
function httpGetRaw(url, host, agent) {
  return new Promise((resolve) => {
    const headers = Object.assign(headersPara(host || 'betwinner1.com'), { 'Accept-Encoding': 'gzip, deflate, br' });
    const opts = { headers };
    if (agent) opts.agent = agent;
    const req = https.get(url, opts, res => {
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      try {
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      } catch (e) {}
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('error', e => resolve({ status: res.statusCode, erro: 'stream: ' + e.message }));
      stream.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const ct = String(res.headers['content-type'] || '?');
        let isJson = false, jogos = null, sampleGameId = null;
        try {
          const j = JSON.parse(body);
          isJson = true;
          try { const r = parseLiveRaces(j); jogos = r.length; sampleGameId = (r[0] && r[0].gameId) || null; } catch (e) {}
        } catch (e) {}
        resolve({ status: res.statusCode, ct, enc: enc || '-', len: body.length, isJson, jogos, sampleGameId });
      });
    });
    req.on('error', e => resolve({ erro: String(e.message).slice(0, 80) }));
    req.setTimeout(9000, () => req.destroy(new Error('timeout')));
  });
}

async function diagVariantes() {
  let champs;
  try { champs = await descobrirChampsAoVivo(); } catch (e) { return { erro: 'descoberta (sem champs) falhou: ' + e.message }; }
  if (!champs || !champs.length) return { erro: 'sem champs de galgo ao vivo agora — tenta durante uma janela com corrida aberta' };
  const all = champs.join(',');
  const first = champs[0];
  const host = _hostBom || HOSTS[0];
  const agent = _proxyAgent || null;
  const base = q => `https://${host}/service-api/LiveFeed/GetSportsShortZip?${q}`;
  const variantes = [
    { nome: 'A) todos + groupChamps (ATUAL)', q: `sports=68&champs=${all}&lng=pt&gr=495&country=31&partner=152&virtualSports=true&groupChamps=true` },
    { nome: 'B) todos SEM groupChamps',        q: `sports=68&champs=${all}&lng=pt&gr=495&country=31&partner=152&virtualSports=true` },
    { nome: 'C) 1 liga + groupChamps',         q: `sports=68&champs=${first}&lng=pt&gr=495&country=31&partner=152&virtualSports=true&groupChamps=true` },
    { nome: 'D) 1 liga SEM groupChamps',       q: `sports=68&champs=${first}&lng=pt&gr=495&country=31&partner=152&virtualSports=true` },
    { nome: 'E) 1 liga minimo (so lng)',       q: `sports=68&champs=${first}&lng=pt` },
  ];
  const out = { host, proxyAtivo: !!_proxyAgent, champsTotal: champs.length, champsAmostra: champs.slice(0, 5), resultados: [] };
  for (const v of variantes) {
    const r = await httpGetRaw(base(v.q), host, agent);
    out.resultados.push(Object.assign({ variante: v.nome }, r));
    await new Promise(res => setTimeout(res, 700));
  }
  return out;
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

// Snapshot ao vivo: mercado (betwinner) + REANALISE par-a-par (motor novo) + tendencia.
// dados (da analise casada) = { scores, histFull:[{trap,nome,brtClasse,ssnDate,historico}],
//   dataCard, corrida, hora } ou null. Quando ha histFull, roda a reanalise par-a-par
// (categoria->tempo->split/bends->podios + trap vazia/cio/trial). Sem histFull (analise
// antiga), cai no cruzamento simples com o score global.
async function snapshotCorrida(gameId, dados, prevAvbs) {
  const race = await buscarMercados(gameId);
  const presentes = new Set((race.dogs || []).map(d => d.trap));
  const trapsVazias = [1, 2, 3, 4, 5, 6].filter(t => !presentes.has(t));
  const histFull = dados && dados.histFull;

  let avbs;
  if (histFull && histFull.length && race.avbs && race.avbs.length) {
    // scores globais da analise ORIGINAL (motor 1): usados pra (1) mostrar o "motor
    // original" ao lado da reanalise e (2) RESTRINGIR a reanalise aos ELEGIVEIS.
    // Decisao do Bruno (opcao b): a reanalise so pareia galgos que o motor 1
    // aceitou/pontuou, pra nao promover galgo que foi descartado pela regra de
    // pista+distancia (a reanalise ignora pista; o motor 1 nao). Assim os dois
    // motores nunca se contradizem em QUEM entra — o ganho de categoria segue
    // valendo ENTRE os elegiveis.
    const scoreByTrap = {}, perfilByTrap = {};
    for (const s of (dados && dados.scores) || []) { scoreByTrap[s.trap] = s.score; perfilByTrap[s.trap] = s.perfil || null; }
    const temScores = Object.keys(scoreByTrap).length > 0;
    const dogsByTrap = {};
    for (const g of histFull) {
      if (temScores && !(g.trap in scoreByTrap)) continue; // so elegiveis; sem scores no cadastro, nao filtra
      dogsByTrap[g.trap] = g;
    }
    const ctx = { trapsVazias, dataCorrida: (dados && dados.dataCard) || null, config: {} };
    const ranked = reanalise.rankearAvbs(race.avbs, dogsByTrap, ctx, _maxAvbs);
    avbs = ranked.map(a => {
      // casa com o par do betwinner p/ pegar odd + % mercado, orientados pro FAVORITO da reanalise
      const par = race.avbs.find(p =>
        (p.aTrap === a.aTrap && p.bTrap === a.bTrap) || (p.aTrap === a.bTrap && p.bTrap === a.aTrap));
      let odd = null, marketPct = null;
      if (par) {
        if (par.aTrap === a.aTrap) { odd = par.oddAvenceB; marketPct = par.marketPct; }
        else { odd = par.oddBvenceA; marketPct = (par.marketPct != null ? Math.round((100 - par.marketPct) * 10) / 10 : null); }
      }
      const edge = (a.avaliacao != null && marketPct != null) ? Math.round((a.avaliacao - marketPct) * 10) / 10 : null;
      // motor ORIGINAL (motor 1) para o MESMO par, orientado pro favorito da reanalise (a.aTrap)
      const sa = scoreByTrap[a.aTrap], sb = scoreByTrap[a.bTrap];
      const motorOrigPct = (sa != null && sb != null) ? Math.max(5, Math.min(95, scoreToPct(sa - sb))) : null;
      // FONTE UNICA p/ a arena: manda o historico EXATO que a reanalise usou
      // (dogsByTrap = histFull), pra a tela nao cair no histAll (que so tem os cães
      // COM score e usa linhasValidas). Assim a tela mostra a mesma base da decisao.
      const dogA = dogsByTrap[a.aTrap] || {}, dogB = dogsByTrap[a.bTrap] || {};
      const aPerfil = perfilByTrap[a.aTrap] || null, bPerfil = perfilByTrap[a.bTrap] || null;
      return {
        aTrap: a.aTrap, aNome: a.aNome, bTrap: a.bTrap, bNome: a.bNome,
        aPerfil, bPerfil,
        // aHist/bHist.historico ja vem no shape do mapHistLinhas (14 campos, <=5 linhas)
        aHist: { trap: a.aTrap, nome: a.aNome, perfil: aPerfil, brtClasse: dogA.brtClasse || null, ssnDate: dogA.ssnDate || null, historico: dogA.historico || [] },
        bHist: { trap: a.bTrap, nome: a.bNome, perfil: bPerfil, brtClasse: dogB.brtClasse || null, ssnDate: dogB.ssnDate || null, historico: dogB.historico || [] },
        avaliacao: a.avaliacao, enginePct: a.avaliacao, // enginePct mantido p/ retrocompat
        reanalisePct: a.avaliacao,                      // motor 2 (reanalise par-a-par)
        motorOrigPct,                                   // motor 1 (analise global original)
        oddAvenceB: odd, marketPct, edge, pos: a.pos,
        valor: (edge != null && edge >= _edgeMin),
        flags: a.flags, obs: a.obs
      };
    });
  } else {
    // fallback: sem os 6 historicos (analise antiga) -> cruzamento simples com score global
    avbs = crossWithEngine(race.avbs || [], (dados && dados.scores) || []);
    avbs.sort((a, b) => (b.edge == null ? -999 : b.edge) - (a.edge == null ? -999 : a.edge));
    avbs = avbs.slice(0, _maxAvbs).map((a, i) => Object.assign({}, a, {
      pos: i + 1, valor: (a.edge != null && a.edge >= _edgeMin),
      reanalisePct: null,             // sem reanalise nesta analise antiga
      motorOrigPct: (a.enginePct != null ? a.enginePct : null) // motor 1 = o proprio score
    }));
  }
  avbs = marcarTendencia(avbs, prevAvbs);
  return Object.assign({}, race, { avbs });
}

// ── Loop principal ───────────────────────────────────────────────────────────
// getScores(liveRace) -> array de scores {trap,nome,score} da analise casada, ou
//   null se ainda nao ha analise pra essa corrida (aí mostra so mercado).
// O casamento analise<->corrida do betwinner (por pista+horario) fica no chamador
// (robot.js), que tem acesso ao banco.
let timer = null;
let _onClose = null; // callback(fechamento) — grava a principal no banco no post (setado por iniciar)

// Cache da DESCOBERTA de pistas/corridas. O GetSportsShortZip (a lista de quais
// corridas estao ao vivo) e' o endpoint que toma 406 quando batido de 5 em 5s.
// Ele muda pouco (corridas entram/saem a cada ~1min), entao descobrimos so a cada
// ~30s e mantemos a ultima lista boa quando a descoberta falha — enquanto as ODDS
// de cada corrida (gameEvents, outro endpoint) continuam de 5 em 5s.
const DISCOVERY_TTL_MS = 30000;       // quando DA CERTO, cacheia a lista por 30s
const DISCOVERY_COOLDOWN_MS = 10000;  // quando FALHA, tenta de novo em ~10s (nao 30s)
const DISCOVERY_TENTATIVAS = 3;       // betwinner bloqueia INTERMITENTE — retry na hora
let _listaCache = { races: [], ts: 0, ok: false };
let _descobrindo = false;

// ── Saude da descoberta (monitoramento do bloqueio) ──────────────────────────
// Registra cada refresh de descoberta (deu certo / falhou apos os retries) numa
// janela de 60min, pra medir se o betwinner esta bloqueando de forma constante e
// avisar quando vale a pena ligar o proxy. So medicao — nao muda comportamento.
let _healthDesc = []; // [{ ts, ok }]
function registrarDescoberta(ok) {
  const agora = Date.now();
  _healthDesc.push({ ts: agora, ok: !!ok });
  const corte = agora - 60 * 60 * 1000;
  while (_healthDesc.length && _healthDesc[0].ts < corte) _healthDesc.shift();
}
function saudeDescoberta() {
  const agora = Date.now();
  const calc = mins => {
    const arr = _healthDesc.filter(h => h.ts >= agora - mins * 60000);
    const t = arr.length, ok = arr.filter(h => h.ok).length;
    return { tentativas: t, ok, falha: t - ok, taxaSucesso: t ? Math.round((ok / t) * 100) : null };
  };
  const q = calc(15), h = calc(60);
  let diagnostico = 'sem dados suficientes', alertaProxy = false;
  if (q.tentativas >= 4) {
    if (q.taxaSucesso >= 70) diagnostico = 'OK';
    else if (q.taxaSucesso >= 30) diagnostico = 'degradado (intermitente) — retry segurando';
    else { diagnostico = 'BLOQUEIO CONSTANTE — hora de ligar o BETWINNER_PROXY_URL'; alertaProxy = true; }
  }
  return { ultimos15min: q, ultimos60min: h, diagnostico, alertaProxy, proxyAtivo: !!_proxyAgent };
}

async function obterCorridas() {
  const agora = Date.now();
  // Gate por timestamp: se DEU CERTO, segura 30s; se FALHOU, tenta de novo em 10s.
  const janela = _listaCache.ok ? DISCOVERY_TTL_MS : DISCOVERY_COOLDOWN_MS;
  if (_listaCache.ts && (agora - _listaCache.ts) < janela) return _listaCache.races;
  if (_descobrindo) return _listaCache.races; // ja tem uma descoberta em andamento (nao sobrepoe)
  _descobrindo = true;
  try {
    // O betwinner responde de forma INTERMITENTE: ora o JSON certo, ora uma pagina
    // HTML anti-bot, ora timeout. Como ~metade das batidas passa, algumas tentativas
    // seguidas (com um pequeno intervalo) sobem a taxa de sucesso pra ~90% e a gente
    // deixa de perder corridas que largam durante uma janela ruim.
    let ultimoErro;
    for (let i = 0; i < DISCOVERY_TENTATIVAS; i++) {
      try {
        const races = await listarCorridasAoVivo();
        _listaCache = { races, ts: Date.now(), ok: true };
        registrarDescoberta(true);
        return races;
      } catch (e) { ultimoErro = e; if (i < DISCOVERY_TENTATIVAS - 1) await new Promise(r => setTimeout(r, 1500)); }
    }
    _listaCache.ts = Date.now(); _listaCache.ok = false; // mantem a ultima lista boa; retry em ~10s
    registrarDescoberta(false);
    addLog('warn', 'descoberta falhou ' + DISCOVERY_TENTATIVAS + 'x (' + String((ultimoErro && ultimoErro.message) || '').slice(0, 40) + ') — mantendo lista (' + _listaCache.races.length + '), novo retry em ~' + (DISCOVERY_COOLDOWN_MS / 1000) + 's');
    return _listaCache.races;
  } finally { _descobrindo = false; }
}

async function umCiclo(getScores) {
  // Refresca os valores efetivos da config (Painel Admin) a cada ciclo.
  if (typeof _getOddsCfg === 'function') {
    try { const c = _getOddsCfg() || {}; if (c.maxAvbs > 0) _maxAvbs = c.maxAvbs; if (c.edgeMin != null) _edgeMin = c.edgeMin; } catch (e) {}
  }
  const races = await obterCorridas();

  status.corridasAoVivo = races.length;
  const abertas = races.filter(r => /Inicia/i.test(r.statusLine)); // ainda vao largar

  for (const r of abertas) {
    const chave = r.gameId;
    // getScores(r) devolve { scores, histFull, dataCard, corrida, hora } da analise
    // casada, ou null. histFull alimenta a reanalise; scores alimenta os sugeridos.
    const analise = (typeof getScores === 'function') ? (getScores(r) || null) : null;
    // So gasta requisicao de odds em corrida que CASOU com uma analise sua. Corrida
    // sem analise (pista fora do perfil, ou australiana nao mapeada tipo Richmond/
    // The Meadows) nao gera cruzamento util e ainda entope o ciclo com timeout
    // quando o betwinner trava. Pular reduz carga no betwinner e evita perder as suas.
    if (!analise) continue;
    const prev = status.porCorrida[chave] || {};
    let snap;
    try { snap = await snapshotCorrida(r.gameId, analise, prev.avbs); }
    catch (e) { addLog('warn', `${r.track} ${r.raceNum}: ${e.message}`); continue; }
    status.porCorrida[chave] = {
      gameId: r.gameId, li: r.li, track: r.track, pista: r.pista, raceNum: r.raceNum,
      statusLine: r.statusLine, startTs: r.startTs,
      bwUrl: bwUrlCorrida(r.li, r.gameId, r.track),
      avbs: snap.avbs,
      sugeridos: (analise && analise.scores) ? sugerirAvbs(analise.scores) : [],
      temAnalise: !!(analise && (analise.histFull || analise.scores)),
      analiseCorrida: analise ? (analise.corrida || null) : null, // casa com o front
      hora: (analise && analise.hora) || prev.hora || null,       // p/ casar a linha no banco no fechamento
      fechado: prev.fechado || false,                             // ja gravou o fechamento? (persiste entre ciclos)
      updatedAt: Date.now()
    };
  }

  // FECHAMENTO: no instante em que a corrida larga (agora >= startTs), grava a
  // principal (pos 1) da reanalise no historico — AUTOMATICO, sem depender de tela
  // nem de login. O _onClose (robot.js) casa a linha e grava so uma vez (guarda no
  // proprio SQL), entao disparar de novo e' inofensivo.
  const agoraS = Math.floor(Date.now() / 1000);
  for (const id of Object.keys(status.porCorrida)) {
    const e = status.porCorrida[id];
    if (e.fechado || !e.startTs || agoraS < e.startTs) continue;
    e.fechado = true; // marca sempre (mesmo sem ter o que gravar) p/ nao reprocessar
    if (!e.temAnalise || !e.avbs || !e.avbs.length) continue; // sem principal p/ gravar
    if (typeof _onClose === 'function') {
      try {
        _onClose({ corrida: e.analiseCorrida, hora: e.hora, gameId: e.gameId, track: e.track, principal: e.avbs[0], fechadoEm: agoraS });
      } catch (err) { addLog('warn', 'onClose ' + (e.analiseCorrida || e.gameId) + ': ' + err.message); }
    }
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
  _onClose = (typeof opts.onClose === 'function') ? opts.onClose : null; // grava o fechamento no banco
  _getOddsCfg = (typeof opts.getOddsCfg === 'function') ? opts.getOddsCfg : null; // config viva (maxAvbs/edgeMin)
  if (opts.proxyUrl !== undefined) setProxy(opts.proxyUrl || process.env.BETWINNER_PROXY_URL || ''); // config vence env
  if (opts.maxAvbs > 0) _maxAvbs = opts.maxAvbs;
  if (opts.edgeMin != null) _edgeMin = opts.edgeMin;
  status.intervaloMs = intervaloMs;
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

function parar() {
  status.stopRequested = true;
  if (timer) { clearInterval(timer); timer = null; }
  status.running = false;
  addLog('info', 'parado');
}
function getStatus() {
  return Object.assign({}, status, {
    porCorrida: undefined,
    descoberta: saudeDescoberta(),
    trafego: getTrafego(),
    config: { intervaloSeg: Math.round((status.intervaloMs || 5000) / 1000), maxAvbs: _maxAvbs, edgeMin: _edgeMin, proxyDefinido: !!_proxyUrlAtual }
  });
}
function getSnapshots() { return Object.values(status.porCorrida); }

module.exports = {
  pistaPorNome, descobrirChampsAoVivo, listarCorridasAoVivo, buscarMercados,
  snapshotCorrida, marcarTendencia, sugerirAvbs, iniciar, parar, getStatus, getSnapshots,
  getChampsVistos, diagVariantes, getTrafego,
  _status: status
};
