'use strict';
// src/utils/betwinnerFeed.js
// Decodifica os feeds JSON do betwinner (familia 1xbet LiveFeed) para o robo de
// odds ao vivo. NAO faz rede aqui de proposito — recebe o JSON ja baixado e
// devolve estrutura limpa. Assim da pra testar 100% offline com amostras reais.
//
// Dois feeds:
//   1) Descoberta  (GetSportsShortZip?sports=68&champs=...) -> corridas de galgo
//      ao vivo agora (gameId, pista, race#, horario).
//   2) Corrida     (main-live-feed/v3/gameEvents?gameId=...) -> mercados de UMA
//      corrida; o "Frente a frente" (AvB) vem no grupo 837, tipos 1702 (V1 = 1o
//      cao do par vence) e 1703 (V2 = 2o cao vence). Cada par tem um player.id
//      estavel que liga o V1 ao V2.

// odd decimal -> probabilidade implicita bruta (1/odd, com a margem embutida).
function impliedProb(odd) {
  const o = parseFloat(odd);
  return (o && o > 1) ? 1 / o : null;
}

// P(A vence B) a partir das duas odds do par (oddA = A vence, oddB = B vence),
// normalizando pra remover a margem da casa (a soma das duas passa a dar 1).
function marketPairProb(oddA, oddB) {
  const pa = impliedProb(oddA), pb = impliedProb(oddB);
  if (pa == null || pb == null) return null;
  return pa / (pa + pb);
}

// scoreToPct do motor ATUAL (copia fiel do api.js) — P(X vence Y) a partir da
// diferenca de score dos dois caes. Simetrico: pct(d) + pct(-d) = 100.
function scoreToPct(diffScore) {
  return Math.min(95, Math.round(50 + (diffScore / 50) * 45));
}

// "№4 All About Glory" -> { trap: 4, nome: "All About Glory" }
function parsePlayerName(name) {
  const s = String(name || '').trim();
  const m = s.match(/^№\s*(\d+)\s*(.*)$/);
  if (m) return { trap: parseInt(m[1]), nome: m[2].trim() };
  return { trap: null, nome: s };
}

// ── Feed de descoberta: quais corridas de galgo estao ao vivo ────────────────
// Estrutura: { Value: [ { I:68, N:"Corridas de Galgos", L:[ champ ] } ] }
//   champ: { L:"Yarmouth", LI:1697507, G:[ jogo ] }
//   jogo:  { I:gameId, DI:"Race 4", S:startTs, O1:"Yarmouth", LI, EC, SC:{SLS} }
function parseLiveRaces(discovery) {
  const out = [];
  const val = (discovery && discovery.Value) || [];
  for (const sport of val) {
    if (sport.I !== 68) continue; // 68 = Greyhound Racing
    for (const champ of (sport.L || [])) {
      const trackNome = champ.L || champ.LE || '';
      const champLi = champ.LI || null;
      for (const g of (champ.G || [])) {
        out.push({
          gameId: g.I,
          track: g.O1 || trackNome,
          li: g.LI || champLi,           // id fixo da pista (chave de casamento)
          raceNum: g.DI || '',           // "Race 4"
          startTs: g.S || null,          // unix (segundos) da largada
          eventsCount: g.EC || 0,        // qtd de mercados abertos
          statusLine: (g.SC && g.SC.SLS) || ''
        });
      }
    }
  }
  return out;
}

// ── Feed da corrida: caes + AvBs (grupo 837) ─────────────────────────────────
const GROUP_WIN = 26, TYPE_WIN = 2637;
const GROUP_H2H = 837, TYPE_V1 = 1702, TYPE_V2 = 1703;

// os "events" de cada grupo vem como array de arrays -> achata em uma lista
function flatEvents(group) {
  return [].concat(...((group && group.events) || []));
}

function parseRaceMarkets(game) {
  if (!game) return null;
  const groups = game.eventGroups || [];

  // Mercado de vitoria (grupo 26) -> odd de vencer por trap
  const win = {};
  const gWin = groups.find(g => g.groupId === GROUP_WIN);
  if (gWin) for (const o of flatEvents(gWin)) {
    if (o.type !== TYPE_WIN) continue;
    const p = parsePlayerName(o.player && o.player.name);
    if (p.trap) win[p.trap] = { nome: p.nome, odd: o.cf };
  }

  // Frente a frente (grupo 837) -> pares casados por player.id (V1 e V2 dividem)
  const gH2H = groups.find(g => g.groupId === GROUP_H2H);
  const pares = {};
  if (gH2H) for (const o of flatEvents(gH2H)) {
    const id = o.player && o.player.id;
    if (id == null) continue;
    if (!pares[id]) {
      const partes = String(o.player.name || '').split('/');
      const A = parsePlayerName(partes[0]);
      const B = parsePlayerName(partes[1] || '');
      pares[id] = { id, aTrap: A.trap, aNome: A.nome, bTrap: B.trap, bNome: B.nome, oddV1: null, oddV2: null };
    }
    if (o.type === TYPE_V1) pares[id].oddV1 = o.cf; // A vence B
    if (o.type === TYPE_V2) pares[id].oddV2 = o.cf; // B vence A
  }

  const avbs = Object.values(pares).map(p => {
    const mAB = marketPairProb(p.oddV1, p.oddV2); // P(A vence B) sem margem
    return {
      aTrap: p.aTrap, aNome: p.aNome, bTrap: p.bTrap, bNome: p.bNome,
      oddAvenceB: p.oddV1, oddBvenceA: p.oddV2,
      marketPct: mAB == null ? null : Math.round(mAB * 1000) / 10 // % de A vencer B
    };
  }).filter(a => a.aTrap && a.bTrap && a.marketPct != null);

  return {
    gameId: game.id,
    startTs: game.startTs,
    raceNum: game.dopInfo || '',
    statusLine: (game.scores && game.scores.statusLineStr) || '',
    nonStarted: !!game.nonStarted,
    dogs: Object.keys(win).map(t => ({ trap: +t, nome: win[t].nome, winOdd: win[t].odd }))
      .sort((a, b) => a.trap - b.trap),
    avbs
  };
}

// ── Cruza os AvBs do book com o motor ATUAL ──────────────────────────────────
// scores: array do scores_json salvo na analise -> [{ trap, nome, score, ... }]
// Para cada AvB, calcula o % do motor (P(A vence B)) e o "edge" = motor - mercado.
// Se algum dos dois caes nao estiver nos scores (ex.: eliminado / nao elegivel),
// o motor fica sem opiniao nesse par (enginePct = null).
function crossWithEngine(avbs, scores) {
  const byTrap = {};
  for (const s of (scores || [])) byTrap[s.trap] = s.score;
  return avbs.map(a => {
    const sa = byTrap[a.aTrap], sb = byTrap[a.bTrap];
    let enginePct = null;
    if (sa != null && sb != null) {
      enginePct = Math.max(5, Math.min(95, scoreToPct(sa - sb)));
    }
    const edge = (enginePct != null && a.marketPct != null)
      ? Math.round((enginePct - a.marketPct) * 10) / 10
      : null;
    return Object.assign({}, a, { enginePct, edge });
  });
}

module.exports = {
  impliedProb, marketPairProb, scoreToPct, parsePlayerName,
  parseLiveRaces, parseRaceMarkets, crossWithEngine
};