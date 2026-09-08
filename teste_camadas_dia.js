'use strict';
// teste_camadas_dia.js — a REGUA DE CAMADAS (OPORTUNIDADE / TOP / HIGH / GOOD).
//
// Roda contra o codigo real: importa o src/utils/camadasDoDia.js e exercita cada
// regra do modelo que o Bruno fechou em set/2026.
//
//   node teste_camadas_dia.js
//
// O MODELO EM UMA TELA
//   MANHA  pool = pct acima do corte E SPs coladas (razao <= faixa, medida na
//          ultima corrida valida de cada galgo). Enquanto a BW nao confirma, e'
//          OPORTUNIDADE.
//   BW     par que abre COLADO (razao de mercado <= teto) e' classificado pela
//          REGUA: tier TOP -> TOP | tier REGULAR -> HIGH | tier null -> GOOD.
//          Par fora do pool da manha entra igual (a "pescada").
//   LIMITE 1 de cada camada por corrida, no maximo 3 linhas. Disputa resolvida
//          por SPLIT, depois TEMPO (CalTm), depois pct.
//   SAIDA  a OPORTUNIDADE que nao virou nada some DEPOIS que a corrida larga.
//
// A segunda parte do arquivo compara, nos MESMOS cenarios, a regua nova contra a
// REGUA ANTERIOR — que nao foi reescrita a mao: e' a funcao fatiada verbatim da
// versao do camadasDoDia.js que estava no ar (com os cortes daquela epoca,
// teto 1.5 / faixa 1.8). Serve pra voce ver linha a linha o que a mudanca fez.

const path = require('path');
const cd = require(path.join(__dirname, 'src', 'utils', 'camadasDoDia'));
const { bateuPar } = require(path.join(__dirname, 'src', 'utils', 'avbResultado'));

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── fabricas ─────────────────────────────────────────────────────────────────
// confronto do motor (shape do motorManha.precalcDaCorrida -> pc.todos)
function conf(pick, outro, pct, tier, ratioSp, splitDif, caltmDif) {
  return {
    pick_trap: pick, pick_nome: 'Galgo T' + pick,
    outro_trap: outro, outro_nome: 'Galgo T' + outro,
    pct: pct, tier: tier, ratio_sp: ratioSp,
    split_dif: splitDif, caltm_dif: caltmDif
  };
}
// par aberto na BW (shape do avb_abertos.pares_json)
function par(a, b, marketPct, oddAB, oddBA) {
  return { aTrap: a, bTrap: b, marketPct: marketPct, oddAvenceB: oddAB, oddBvenceA: oddBA };
}
const CHEGADA = JSON.stringify([
  { trap: 1, pos: 1 }, { trap: 2, pos: 2 }, { trap: 5, pos: 3 },
  { trap: 6, pos: 4 }, { trap: 3, pos: 5 }, { trap: 4, pos: 6 }
]);

function rodar(c) {
  return cd.confrontosDaCorrida({
    todos: c.todos, pares: c.pares, abertoEm: c.abertoEm || null,
    corrida: c.corrida || 'Sheff A2', hora: c.hora || '1:31',
    finishingOrderJson: c.finishingOrderJson || null,
    parelhoAte: c.parelhoAte != null ? c.parelhoAte : 60,
    teto: c.teto || 0, faixa: c.faixa || 0,
    bateuPar: bateuPar
  });
}
const camadas = r => r.map(x => x.camada).join(', ') || '(vazio)';
const pares_ = r => r.map(x => x.par + ':' + x.camada).join('  ') || '(vazio)';

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[1] POOL DA MANHA — pct acima do corte E SP colada (razao <= faixa 1,5)\n');

let r = rodar({
  todos: [
    conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30),   // SP 7/2 x 7/2 -> entra
    conf(1, 5, 80, 'TOP', 1.636, 0.25, 0.35)    // SP 7/2 x 7/4F -> FORA (>1,5)
  ],
  pares: []
});
ok(r.length === 1 && r[0].par === 'T1xT3',
   'SP 1,000 entra no pool; SP 1,636 fica fora (o exemplo do Yarmouth)');
ok(r[0].camada === 'OPORTUNIDADE', 'sem BW, o par do pool e OPORTUNIDADE');
ok(r[0].no_board_top === true && r[0].da_manha === true, 'marcado como vindo da manha');

r = rodar({ todos: [conf(1, 3, 55, 'TOP', 1.000, 0.20, 0.30)], pares: [] });
ok(r.length === 0, 'pct abaixo do corte nao entra no pool nem com SP colada');

r = rodar({ todos: [conf(1, 3, 84, null, 1.000, 0.20, 0.30)], pares: [] });
ok(r.length === 1,
   'par de REGUA FROUXA (tier null) entra no pool — senao GOOD nunca poderia vir da manha');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[2] REGUA DECIDE A CAMADA quando a BW abre COLADO (razao <= teto 1,5)\n');

const casos = [
  ['TOP', 'TOP', 'tier TOP -> TOP'],
  ['REGULAR', 'HIGH', 'tier REGULAR -> HIGH'],
  [null, 'GOOD', 'tier null -> GOOD']
];
for (const [tier, esperada, msg] of casos) {
  r = rodar({
    todos: [conf(1, 6, 84, tier, 1.20, 0.20, 0.30)],
    pares: [par(1, 6, 52.0, 1.85, 1.92)], abertoEm: '2026-09-07 12:00:00'
  });
  ok(r.length === 1 && r[0].camada === esperada, msg + '  (saiu: ' + camadas(r) + ')');
}

r = rodar({
  todos: [conf(1, 6, 84, 'TOP', 1.20, 0.20, 0.30)],
  pares: [par(1, 6, 72.0, 1.25, 3.60)], abertoEm: '2026-09-07 12:00:00'
});
ok(r.length === 1 && r[0].camada === 'OPORTUNIDADE' && r[0].odd_bw != null,
   'BW abriu LARGA (razao 2,6): nao confirma, segue OPORTUNIDADE com a odd visivel');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[3] UM POR CAMADA — disputa por SPLIT, depois TEMPO, depois pct\n');

r = rodar({
  todos: [
    conf(1, 6, 95, 'TOP', 1.20, 0.12, 0.40),   // pct maior, split PIOR
    conf(2, 5, 70, 'TOP', 1.30, 0.28, 0.10)    // pct menor, split MELHOR
  ],
  pares: [par(1, 6, 52.0, 1.85, 1.92), par(2, 5, 51.0, 1.90, 1.95)],
  abertoEm: '2026-09-07 12:00:00'
});
ok(r.length === 1 && r[0].par === 'T2xT5',
   'dois candidatos a TOP: ganha o de melhor SPLIT, mesmo com pct bem menor (95 x 70)');

r = rodar({
  todos: [
    conf(1, 6, 95, 'TOP', 1.20, 0.20, 0.11),   // split igual, CalTm PIOR
    conf(2, 5, 70, 'TOP', 1.30, 0.20, 0.33)    // split igual, CalTm MELHOR
  ],
  pares: [par(1, 6, 52.0, 1.85, 1.92), par(2, 5, 51.0, 1.90, 1.95)],
  abertoEm: '2026-09-07 12:00:00'
});
ok(r.length === 1 && r[0].par === 'T2xT5', 'split empatado: desempata pelo TEMPO (CalTm)');

r = rodar({
  todos: [
    conf(1, 6, 70, 'TOP', 1.20, 0.20, 0.30),
    conf(2, 5, 95, 'TOP', 1.30, 0.20, 0.30)    // tudo igual, pct MAIOR
  ],
  pares: [par(1, 6, 52.0, 1.85, 1.92), par(2, 5, 51.0, 1.90, 1.95)],
  abertoEm: '2026-09-07 12:00:00'
});
ok(r.length === 1 && r[0].par === 'T2xT5', 'split e tempo empatados: desempata pelo pct');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[4] TETO DE 3 e a ordem das linhas\n');

r = rodar({
  todos: [
    conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40),
    conf(2, 5, 85, 'REGULAR', 1.20, 0.25, 0.20),
    conf(3, 4, 80, null, 1.30, 0.20, 0.10),
    conf(1, 5, 75, null, 1.40, 0.05, 0.05)     // 4o par colado: nao cabe
  ],
  pares: [
    par(1, 6, 52.0, 1.85, 1.92), par(2, 5, 51.0, 1.90, 1.95),
    par(3, 4, 50.5, 1.95, 1.97), par(1, 5, 50.0, 1.98, 1.98)
  ],
  abertoEm: '2026-09-07 12:00:00'
});
ok(r.length === 3, 'no maximo 3 linhas por corrida  (saiu: ' + r.length + ')');
ok(camadas(r) === 'TOP, HIGH, GOOD', 'ordem hierarquica TOP > HIGH > GOOD  (saiu: ' + camadas(r) + ')');
ok(r.every(x => x.camada !== 'OPORTUNIDADE'),
   'com as 3 camadas cheias, nao sobra vaga pra linha cinza');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[5] OPORTUNIDADE some DEPOIS da corrida\n');

const semAbrir = {
  todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)],
  pares: []
};
r = rodar(semAbrir);
ok(r.length === 1 && r[0].camada === 'OPORTUNIDADE',
   'antes da largada a OPORTUNIDADE aparece (da pra acompanhar o funil)');

r = rodar(Object.assign({}, semAbrir, { finishingOrderJson: CHEGADA }));
ok(r.length === 0,
   'depois da largada ela some — corrida sem nenhuma das tres sai inteira');

r = rodar({
  todos: [
    conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40),   // confirma
    conf(2, 5, 85, 'TOP', 1.20, 0.10, 0.10)    // do pool, nao confirma
  ],
  pares: [par(1, 6, 52.0, 1.85, 1.92)],
  abertoEm: '2026-09-07 12:00:00', finishingOrderJson: CHEGADA
});
ok(r.length === 1 && r[0].camada === 'TOP',
   'depois da largada sobra so o confirmado; o achado da manha que nao abriu sai');

ok(cd.jaCorreu(CHEGADA) === true && cd.jaCorreu(null) === false && cd.jaCorreu('[]') === false,
   'jaCorreu le a chegada gravada e trata vazio/nulo como "ainda nao correu"');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[6] A PESCADA — par fora do pool da manha que a BW abre colado\n');

r = rodar({
  todos: [conf(4, 1, 80, 'TOP', 1.600, 0.22, 0.30)],   // SP 1,6: FORA do pool
  pares: [par(4, 1, 52.3, 1.75, 2.10)],                 // BW abre colado (1,096)
  abertoEm: '2026-09-07 11:55:06'
});
ok(r.length === 1 && r[0].camada === 'TOP',
   'DunPk A5 real: SP 1,6 nao entra no pool, mas a BW confirma e ele vira TOP');
ok(r[0].no_board_top === false && r[0].da_manha === false,
   'e fica marcado como NAO vindo da manha (foi o mercado que achou)');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[7] HELPERS (id estavel, fuso, pista)\n');
ok(cd.idConfronto('Sheff A2', '1:31', 1, 6) === 'sheff a2|01:31|1x6', 'idConfronto monta a chave do contrato');
ok(cd.idConfronto('Sheff A2', '1:31', 6, 1) === cd.idConfronto('Sheff A2', '1:31', 1, 6), 'idConfronto e INSENSIVEL a ordem (inverter o AvB nao quebra o ENTREI)');
ok(cd.horaBr('1:31') === '9:31', 'horaBr: 1:31 UK -> 9:31 BR');
ok(cd.horaBr('14:02') === '10:02', 'horaBr: 14:02 UK -> 10:02 BR');
ok(cd.pista('Sheff A2') === 'Sheff', 'pista pega a primeira palavra');
ok(cd.TETO === 1.5 && cd.FAIXA === 1.5, 'TETO e FAIXA agora sao 1,5 os dois');
ok(cd.camadaPorRegua('TOP') === 'TOP' && cd.camadaPorRegua('REGULAR') === 'HIGH' && cd.camadaPorRegua(null) === 'GOOD',
   'camadaPorRegua mapeia a regua do motor nas tres camadas');

// ═════════════════════════════════════════════════════════════════════════════
// REGUA ANTERIOR — fatiada verbatim da versao do camadasDoDia.js que estava no
// ar (teto 1.5 / faixa 1.8). Nao editar a mao: existe so pra o comparativo.
// ═════════════════════════════════════════════════════════════════════════════
function regraAnterior(opts) {
  const TETO = 1.5, FAIXA = 1.8;              // os cortes de quando esta regra rodava
  const mercadoDe = cd.mercadoDe, montaConfronto = cd.montaConfronto, mesmoPar = cd.mesmoPar;
  const o = opts || {};
  const todos = Array.isArray(o.todos) ? o.todos : [];
  const pares = Array.isArray(o.pares) ? o.pares : [];
  const teto = (o.teto > 0) ? o.teto : TETO;
  const faixa = (o.faixa > 0) ? o.faixa : FAIXA;
  const parelhoAte = (o.parelhoAte > 0) ? o.parelhoAte : 0;
  const ctx = {
    corrida: o.corrida, hora: o.hora,
    abertoEm: o.abertoEm || null,
    finishingOrderJson: o.finishingOrderJson,
    bateuPar: (typeof o.bateuPar === 'function') ? o.bateuPar : function () { return null; }
  };
  const confrontos = [];
  const jaAdd = new Set();
  const chaveDe = (a, b) => Math.min(a, b) + 'x' + Math.max(a, b);
  const manha = todos.filter(s => s.tier != null && s.pct > parelhoAte && s.ratio_sp <= faixa);
  for (const s of manha) {
    const mk = mercadoDe(pares, s, teto);
    confrontos.push(montaConfronto(ctx, s, (mk && mk.colada) ? 'TOP' : 'OPORTUNIDADE', true, mk));
    jaAdd.add(chaveDe(s.pick_trap, s.outro_trap));
  }
  for (const p of pares) {
    if (p.marketPct == null) continue;
    const ta = Number(p.aTrap), tb = Number(p.bTrap);
    const chave = chaveDe(ta, tb);
    if (jaAdd.has(chave)) continue;
    const mp = p.marketPct / 100, hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
    const razao = lo > 0 ? (hi / lo) : null;
    if (!(razao != null && razao <= teto)) continue;
    const c2 = todos.find(s => mesmoPar(Number(s.pick_trap), Number(s.outro_trap), ta, tb));
    if (!c2 || c2.pct <= parelhoAte) continue;
    confrontos.push(montaConfronto(ctx, c2, c2.tier != null ? 'HIGH' : 'GOOD', false, mercadoDe(pares, c2, teto)));
    jaAdd.add(chave);
  }
  return confrontos;
}

console.log('\n' + '='.repeat(78));
console.log('ANTES x DEPOIS — mesmos cenarios nas duas reguas');
console.log('='.repeat(78) + '\n');

const COMPARA = [
  { nome: 'Yarmouth R7: 2 pares da manha, um com SP 1,636', todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30), conf(1, 5, 80, 'TOP', 1.636, 0.25, 0.35)], pares: [] },
  { nome: 'Corrida cheia: TOP + REGULAR + null, todos colados', todos: [conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'REGULAR', 1.20, 0.25, 0.20), conf(3, 4, 80, null, 1.30, 0.20, 0.10)], pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95), par(3, 4, 50.5, 1.95, 1.97)], abertoEm: '2026-09-07 12:00:00' },
  { nome: 'Dois candidatos a TOP (o de pior split tinha pct maior)', todos: [conf(1, 6, 95, 'TOP', 1.20, 0.12, 0.40), conf(2, 5, 70, 'TOP', 1.30, 0.28, 0.10)], pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95)], abertoEm: '2026-09-07 12:00:00' },
  { nome: 'Tres GOOD colados na mesma corrida (Yrmth A6 de ontem)', todos: [conf(4, 2, 88, null, 2.50, 0.30, 0.20), conf(6, 1, 78, null, 1.24, 0.18, 0.15), conf(3, 2, 86, null, 1.39, 0.22, 0.25)], pares: [par(4, 2, 50, 1.83, 1.83), par(6, 1, 48.5, 1.91, 1.91), par(3, 2, 48.1, 1.90, 1.90)], abertoEm: '2026-09-07 20:19:18' },
  { nome: 'Pescada: SP 1,6 fora do pool, BW confirma (DunPk A5)', todos: [conf(4, 1, 80, 'TOP', 1.600, 0.22, 0.30)], pares: [par(4, 1, 52.3, 1.75, 2.10)], abertoEm: '2026-09-07 11:55:06' },
  { nome: 'Achado da manha que nao abriu, DEPOIS da corrida', todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], pares: [], finishingOrderJson: CHEGADA },
  { nome: 'Regua frouxa da manha que nao abriu (antes nem entrava)', todos: [conf(1, 3, 84, null, 1.000, 0.20, 0.30)], pares: [] }
];

let totAntes = 0, totDepois = 0;
for (const c of COMPARA) {
  const base = {
    todos: c.todos, pares: c.pares, abertoEm: c.abertoEm || null,
    corrida: 'Sheff A2', hora: '1:31',
    finishingOrderJson: c.finishingOrderJson || null,
    parelhoAte: 60, bateuPar: bateuPar
  };
  const antes = regraAnterior(Object.assign({}, base));
  const depois = cd.confrontosDaCorrida(Object.assign({}, base));
  totAntes += antes.length; totDepois += depois.length;
  const mudou = JSON.stringify(antes.map(x => x.par + x.camada)) !== JSON.stringify(depois.map(x => x.par + x.camada));
  console.log((mudou ? '  MUDOU  ' : '  igual  ') + c.nome);
  console.log('           antes  (' + antes.length + '): ' + pares_(antes));
  console.log('           depois (' + depois.length + '): ' + pares_(depois));
  console.log('');
}
console.log('  TOTAL DE LINHAS NOS CENARIOS:  antes ' + totAntes + '  ->  depois ' + totDepois);

console.log('\n' + (falhas === 0
  ? 'TUDO OK — a regua nova esta valendo em todos os casos.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
