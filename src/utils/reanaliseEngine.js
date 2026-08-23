'use strict';
// src/utils/reanaliseEngine.js
// Reanalise PAR A PAR (head-to-head) de um AvB, na regra do Bruno:
//   cascata: categoria (custo em segundos) -> tempo (2 ultimas, enfase na ultima)
//            -> split/bends (arranque + como correu) -> podios
//   modificadores: trap vazia ao lado, cio recente, trial.
// Puro (sem rede/DB): recebe os dois galgos com historico e devolve a avaliacao
// (% de A vencer B) + flags + obs. Cada linha de historico deve ter:
//   { data, classe, caltm, split, bends, pos, remarks, dist, trap }  (mais recente 1o)

const DEFAULTS = {
  segPorNivelCat: 0.40,   // cada nivel de categoria vale ~0,40s (dobra p/ >1 nivel via a propria conta)
  pesoUltima: 0.6,        // enfase 60% ultima corrida
  pesoPenultima: 0.4,     // 40% penultima
  nRecentes: 5,           // olhar ate 5 corridas p/ split/bends/podio
  escalaPct: 85,          // conversao vantagem-liquida(seg) -> % (0,10s ~ +8,5%)
  kSplit: 0.15,           // peso do split (arranque)
  kBends: 0.05,           // peso dos bends (como correu)
  kPodio: 0.10,           // peso dos podios
  trialSuperiorSeg: 0.20, // trial "muito superior" = >= 0,20s melhor que a media do galgo
  bonusTrapVazia: 0.10,   // seg-equiv de bonus quando ha trap vazia ao lado
  penalCio: 0.15,         // seg-equiv de penalidade p/ femea em cio recente
  cioDias: 90,            // janela de cio (mesma regra ja feita)
  outlierSeg: 1.0,        // linha com tempo > (media 2 melhores) + isto -> descartada (problema)
  descartaAtrapalhoSeg: 0.40 // SO NO CALTM: corrida >= (media 2 melhores)+isto E com remark
                             // de atrapalho (Bmp/Crd/Ck/Blk/Baulk/Stmb) sai do tempo — nao e' o
                             // galgo lento, foi a corrida. 0 = desliga a regra.
};

// nivel numerico da categoria: A1=1 ... A9=9 (menor = mais forte). Nao-A -> null.
// Open Race (OR/OR1/OR2/OR3) = topo, nivel 1 (= A1), consistente com o motor 1.
function nivelCat(classe) {
  const c = String(classe || '').trim().toUpperCase();
  if (/^OR\d?$/.test(c)) return 1;
  const m = c.match(/^A(\d+)$/);
  return m ? parseInt(m[1]) : null;
}
// trial? grade comeca com T (UK marca trial assim) ou remark Solo/Trial.
function ehTrial(l) {
  return /^T/i.test(String(l.classe || '')) || /solo|trial/i.test(String(l.remarks || ''));
}
// acidente GRAVE (nao segura a corrida ruim contra o galgo). Crd/Bmp leves NAO entram
// (o Bruno frisou: Crd1 do #4 nao e grave — foi so split ruim).
const GRAVE = /(Fll|KO|BdStt|BBlk|SnBlk|Blk1|Stmb|Baulk)/i;
// ATRAPALHO (regra ago/2026): remark que EXPLICA um tempo ruim. Mais amplo que GRAVE —
// pega tambem os "leves" (Bmp/Crd/Ck/Blk) que so contam quando a corrida foi bem mais
// lenta que o padrao do galgo (a combinacao lento+desculpa e' que exclui, nao o remark so).
const ATRAPALHO = /(Bmp|Crd|Ck|Blk|Baulk|Stmb|Fll|KO|BBlk|SnBlk|BdStt)/i;

// ── Descarte de linha-PROBLEMA (regra do Bruno, ago/2026) ────────────────────
// Regua = media dos 2 MELHORES tempos (mais rapidos, NAO-trial) nas corridas de
// MESMA pista+dist da corrida de hoje. Qualquer corrida com tempo > regua + limiar
// (1s) e' descartada INTEIRA (some do tempo, split, bends e podio) — independente do
// remark ser grave ou nao: e' quando o galgo teve algum tipo de problema. Sem track/
// dist (null) nao filtra por local (usa todas as cronometradas como base). Precisa de
// >=2 candidatas pra ter regua; senao nao mexe. O descarte de acidente GRAVE continua
// valendo depois (aditivo), no proprio resumoGalgo.
function _distNum(d) { return parseInt(String(d || '').replace(/[^0-9]/g, '')) || 0; }
function _mesmoLocal(l, track, dist) {
  if (track != null && String(l.pista || '').toUpperCase() !== String(track).toUpperCase()) return false;
  if (dist != null && _distNum(dist) && _distNum(l.dist) !== _distNum(dist)) return false;
  return true;
}
function limparHistorico(hist, track, dist, limiarS) {
  const thr = (limiarS > 0) ? limiarS : 1.0;
  let base = (hist || []).filter(l => l && _mesmoLocal(l, track, dist));
  const tempos = base.filter(l => l.caltm > 0 && !ehTrial(l)).map(l => l.caltm).sort((a, b) => a - b);
  if (tempos.length >= 2) {
    const teto = (tempos[0] + tempos[1]) / 2 + thr;
    base = base.filter(l => !(l.caltm > 0 && l.caltm > teto)); // linha-problema fora
  }
  return base;
}

// media das posicoes por curva a partir da string de bends ("3222" -> 2.25).
function bendMedio(l) {
  const ds = String(l.bends || '').match(/\d/g);
  if (!ds || !ds.length) return null;
  return ds.reduce((a, b) => a + Number(b), 0) / ds.length;
}

// datas ISO "YYYY-MM-DD" -> dias entre (cio). Aceita tb "04Aug26" via parseCurta.
function isoUTC(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
function diasEntre(a, b) { const x = isoUTC(a), y = isoUTC(b); return (x == null || y == null) ? null : Math.round((y - x) / 86400000); }

// Resumo de forma do galgo (tempo efetivo ajustado por categoria, split, bends, podio).
function resumoGalgo(hist, o) {
  const val = (hist || []).filter(l => l && l.caltm > 0);
  const ultimaTrial = val.length > 0 && ehTrial(val[0]);
  const naoTrial = val.filter(l => !ehTrial(l));

  // TEMPO: 2 mais recentes nao-trial e sem acidente grave, ajustadas por categoria.
  // ajuste = caltm + segPorNivelCat * nivelCategoria  (a constante de referencia
  // some na diferenca A-B; o que importa e que categoria mais forte "vale" mais).
  // ALEM do GRAVE, tira a corrida "lenta COM desculpa": bem mais lenta que o padrao do
  // galgo (media das 2 melhores + descartaAtrapalhoSeg) E com remark de atrapalho. Nao e'
  // o galgo lento, foi a corrida — so vale pro CALTM, os outros sinais nao mexem.
  const tOrd = naoTrial.map(l => l.caltm).filter(v => v > 0).sort((a, b) => a - b);
  const base2 = tOrd.length >= 2 ? (tOrd[0] + tOrd[1]) / 2 : (tOrd.length ? tOrd[0] : null);
  const limAtr = (o.descartaAtrapalhoSeg > 0) ? o.descartaAtrapalhoSeg : 0;
  const lentaComDesculpa = l => limAtr > 0 && base2 != null && l.caltm > 0
    && l.caltm >= base2 + limAtr && ATRAPALHO.test(l.remarks || '');
  const paraTempo = naoTrial.filter(l => !GRAVE.test(l.remarks || '') && !lentaComDesculpa(l)).slice(0, 2);
  const aj = l => l.caltm + o.segPorNivelCat * (nivelCat(l.classe) || 4);
  let caltmEf = null;
  if (paraTempo.length >= 2) caltmEf = o.pesoUltima * aj(paraTempo[0]) + o.pesoPenultima * aj(paraTempo[1]);
  else if (paraTempo.length === 1) caltmEf = aj(paraTempo[0]);

  // SPLIT / BENDS / PODIO das recentes nao-trial.
  const rec = naoTrial.slice(0, o.nRecentes);
  const splits = rec.map(l => l.split).filter(s => s > 0).slice(0, 2);
  const splitEf = splits.length ? splits.reduce((a, b) => a + b, 0) / splits.length : null;
  const bends = rec.slice(0, 2).map(bendMedio).filter(v => v != null);
  const bendEf = bends.length ? bends.reduce((a, b) => a + b, 0) / bends.length : null;
  const poss = rec.map(l => l.pos).filter(p => p > 0);
  const podioRate = poss.length ? poss.filter(p => p <= 3).length / poss.length : 0;

  // TRIAL "muito superior" numa corrida ANTERIOR a ultima -> promove.
  const mediaNT = naoTrial.length ? naoTrial.map(l => l.caltm).reduce((a, b) => a + b, 0) / naoTrial.length : null;
  const trialSuperior = val.slice(1).some(l => ehTrial(l) && l.caltm > 0 && mediaNT != null && (mediaNT - l.caltm) >= o.trialSuperiorSeg);

  return { caltmEf, splitEf, bendEf, podioRate, ultimaTrial, trialSuperior };
}

function montarObs(A, B, R, Rb, vantTempoAbs, flags) {
  const partes = [];
  partes.push(`T${A.trap} favorito`);
  if (vantTempoAbs > 0.02) partes.push(`mais rapido (~${vantTempoAbs.toFixed(2)}s aj. categoria)`);
  if (R.splitEf != null && Rb.splitEf != null && R.splitEf < Rb.splitEf - 0.03) partes.push('arranca melhor');
  if (R.bendEf != null && Rb.bendEf != null && R.bendEf < Rb.bendEf - 0.5) partes.push('corre mais na frente');
  if (flags.trapVaziaBox && flags.trapVaziaBox.length) partes.push(`box vazio ao lado (${flags.trapVaziaBox.join(',')})`);
  if (flags.cioRecente) partes.push(`atencao: cio recente T${flags.cioRecente}`);
  if (flags.trialPromovido) partes.push('trial recente muito forte');
  return partes.join(' · ') + '.';
}

// Avalia UM par (d1 x d2). Cada dog: { trap, nome, brtClasse, ssnDate, historico:[...] }.
// ctx: { classeCorrida, trapsVazias:[..], dataCorrida:'YYYY-MM-DD', config:{...} }.
// Retorna A orientado como FAVORITO (avaliacao = % de A vencer B).
function avaliarPar(d1, d2, ctx) {
  const o = Object.assign({}, DEFAULTS, (ctx && ctx.config) || {});
  // Regra do Bruno: antes de avaliar, filtra p/ mesma pista+dist e descarta as
  // linhas-problema (>1s pior que a media dos 2 melhores tempos do local).
  const trk = (ctx && ctx.trackCorrida != null) ? ctx.trackCorrida : null;
  const dst = (ctx && ctx.distCorrida != null) ? ctx.distCorrida : null;
  const h1 = limparHistorico(d1.historico, trk, dst, o.outlierSeg);
  const h2 = limparHistorico(d2.historico, trk, dst, o.outlierSeg);
  const r1 = resumoGalgo(h1, o), r2 = resumoGalgo(h2, o);

  if (r1.ultimaTrial || r2.ultimaTrial)
    return { descartar: true, motivo: 'ultima corrida foi trial', aTrap: d1.trap, bTrap: d2.trap };
  if (r1.caltmEf == null || r2.caltmEf == null)
    return { descartar: true, motivo: 'historico insuficiente', aTrap: d1.trap, bTrap: d2.trap };

  // vantagens (positivo = d1 melhor)
  const vantTempo = r2.caltmEf - r1.caltmEf;                                   // segundos
  const vantSplit = (r1.splitEf != null && r2.splitEf != null) ? (r2.splitEf - r1.splitEf) : 0;
  const vantBends = (r1.bendEf != null && r2.bendEf != null) ? (r2.bendEf - r1.bendEf) : 0;
  const vantPodio = r1.podioRate - r2.podioRate;

  let net = vantTempo + o.kSplit * vantSplit + o.kBends * vantBends + o.kPodio * vantPodio;
  if (r1.trialSuperior) net += 0.10;
  if (r2.trialSuperior) net -= 0.10;

  const flags = { trapVazia: [], trapVaziaBox: [], cioRecente: null, trialPromovido: !!(r1.trialSuperior || r2.trialSuperior) };
  const vazias = (ctx && ctx.trapsVazias) || [];
  // flags.trapVazia = trap do GALGO com box vazio ao lado (retrocompat). flags.trapVaziaBox
  // = o BOX vazio em si (o que a obs e a tela mostram — o numero do box que esta vazio).
  const adjVazia = (dog, sinal) => {
    const boxes = vazias.filter(v => Math.abs(v - dog.trap) === 1);
    if (boxes.length) { net += sinal * o.bonusTrapVazia; flags.trapVazia.push(dog.trap); boxes.forEach(b => { if (!flags.trapVaziaBox.includes(b)) flags.trapVaziaBox.push(b); }); }
  };
  adjVazia(d1, +1); adjVazia(d2, -1);
  const adjCio = (dog, sinal) => {
    if (dog.ssnDate && ctx && ctx.dataCorrida) {
      const dias = diasEntre(dog.ssnDate, ctx.dataCorrida);
      if (dias != null && dias >= 0 && dias <= o.cioDias) { net -= sinal * o.penalCio; flags.cioRecente = dog.trap; }
    }
  };
  adjCio(d1, +1); adjCio(d2, -1);

  let pct1 = Math.max(5, Math.min(95, Math.round(50 + net * o.escalaPct)));
  let A = d1, B = d2, pct = pct1, R = r1, Rb = r2;
  if (pct1 < 50) { A = d2; B = d1; pct = 100 - pct1; R = r2; Rb = r1; }

  return {
    descartar: false,
    aTrap: A.trap, aNome: A.nome, bTrap: B.trap, bNome: B.nome,
    avaliacao: pct, favoritoTrap: A.trap, flags,
    obs: montarObs(A, B, R, Rb, Math.abs(vantTempo), flags),
    _debug: { vantTempo: +vantTempo.toFixed(3), vantSplit: +vantSplit.toFixed(3), vantBends: +vantBends.toFixed(3), vantPodio: +vantPodio.toFixed(3), net: +net.toFixed(3) }
  };
}

// Avalia TODOS os pares do betwinner de uma corrida e devolve os melhores (top N),
// ja com pos. pares: [{aTrap,bTrap,oddV1,oddV2}]. dogsByTrap: { trap: dogObj }.
function rankearAvbs(pares, dogsByTrap, ctx, topN) {
  topN = topN || 3;
  const out = [];
  for (const p of (pares || [])) {
    const d1 = dogsByTrap[p.aTrap], d2 = dogsByTrap[p.bTrap];
    if (!d1 || !d2) continue;
    const av = avaliarPar(d1, d2, ctx);
    if (av.descartar) continue;
    out.push(Object.assign({}, av, { _par: p }));
  }
  out.sort((a, b) => b.avaliacao - a.avaliacao);
  return out.slice(0, topN).map((a, i) => Object.assign({}, a, { pos: i + 1 }));
}

module.exports = { avaliarPar, rankearAvbs, resumoGalgo, nivelCat, ehTrial, bendMedio, limparHistorico, DEFAULTS };
