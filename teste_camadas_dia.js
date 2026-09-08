'use strict';
// teste_camadas_dia.js — a REGUA DE CAMADAS (OPORTUNIDADE / TOP / HIGH / GOOD).
//
// Roda contra o codigo real: importa o src/utils/camadasDoDia.js e exercita cada
// regra do modelo fechado com o Bruno em set/2026.
//
//   node teste_camadas_dia.js
//
// O MODELO EM UMA TELA
//   A ODD TEM UM PAPEL SO, E E' NA MANHA: responder "quais AvBs a BW tem chance
//   de abrir?". Depois que a BW abre, a odd sai da decisao.
//
//   MANHA  pool = pct acima do corte E as SPs dos dois galgos proximas, medidas
//          pela DIFERENCA absoluta entre as odds decimais da ultima corrida
//          valida (<= 1,0). Enquanto a BW nao abre, e' OPORTUNIDADE.
//   BW     TODO par aberto e' classificado pela REGUA, sem olhar preco:
//          tier TOP -> TOP | tier REGULAR -> HIGH | tier null -> GOOD.
//          Par fora do pool da manha entra igual (a "pescada").
//   LIMITE 1 de cada camada por corrida, no maximo 3 linhas. Disputa por SPLIT,
//          depois TEMPO (CalTm), depois pct.
//   SAIDA  a OPORTUNIDADE que a BW nao abriu some DEPOIS que a corrida larga.
//
// A segunda parte compara, nos MESMOS cenarios, a regua nova contra a REGUA
// ANTERIOR — que nao foi reescrita a mao: e' a funcao fatiada da versao do
// camadasDoDia.js que estava no ar (pool por RAZAO <= 1,5 e teto de mercado 1,5
// barrando o motor BW). Serve pra ver linha a linha o que a mudanca fez.

const path = require('path');
const cd = require(path.join(__dirname, 'src', 'utils', 'camadasDoDia'));
const { bateuPar } = require(path.join(__dirname, 'src', 'utils', 'avbResultado'));

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}

// ── fabricas ─────────────────────────────────────────────────────────────────
function conf(pick, outro, pct, tier, ratioSp, splitDif, caltmDif) {
  return {
    pick_trap: pick, pick_nome: 'Galgo T' + pick,
    outro_trap: outro, outro_nome: 'Galgo T' + outro,
    pct: pct, tier: tier, ratio_sp: ratioSp,
    split_dif: splitDif, caltm_dif: caltmDif
  };
}
function par(a, b, marketPct, oddAB, oddBA) {
  return { aTrap: a, bTrap: b, marketPct: marketPct, oddAvenceB: oddAB, oddBvenceA: oddBA };
}
const CHEGADA = JSON.stringify([
  { trap: 1, pos: 1 }, { trap: 2, pos: 2 }, { trap: 5, pos: 3 },
  { trap: 6, pos: 4 }, { trap: 3, pos: 5 }, { trap: 4, pos: 6 }
]);

function rodar(c) {
  return cd.confrontosDaCorrida({
    todos: c.todos, lastSp: c.lastSp || null, pares: c.pares,
    abertoEm: c.abertoEm || null,
    corrida: c.corrida || 'Sheff A2', hora: c.hora || '1:31',
    finishingOrderJson: c.finishingOrderJson || null,
    parelhoAte: c.parelhoAte != null ? c.parelhoAte : 60,
    difSpMax: c.difSpMax || 0, tetoInfo: c.tetoInfo || 0,
    bateuPar: bateuPar
  });
}
const pares_ = r => r.map(x => x.par + ':' + x.camada).join('  ') || '(vazio)';
const camadas = r => r.map(x => x.camada).join(', ') || '(vazio)';

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[1] A ODD SO DECIDE NA MANHA — pool por DIFERENCA de SP (<= 1,0)\n');

// Yarmouth R7 real: T1 7/2 = 4,50 | T2 4/1 = 5,00 | T3 7/2 = 4,50
//                   T4 11/10F = 2,10 | T5 7/4F = 2,75
const YARMOUTH = { 1: 4.50, 2: 5.00, 3: 4.50, 4: 2.10, 5: 2.75 };

let r = rodar({
  todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: []
});
ok(r.length === 1 && r[0].sp_dif === 0,
   'T1 x T3 (7/2 x 7/2): distancia 0 — entra no pool  (sp_dif ' + (r[0] && r[0].sp_dif) + ')');

r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.111, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 1 && r[0].sp_dif === 0.5, 'T1 x T2 (4,50 x 5,00): distancia 0,50 — entra');

r = rodar({ todos: [conf(4, 5, 84, 'TOP', 1.310, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 1 && r[0].sp_dif === 0.65, 'T4 x T5 (2,10 x 2,75): distancia 0,65 — entra');

r = rodar({ todos: [conf(1, 5, 84, 'TOP', 1.636, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 0, 'T1 x T5 (4,50 x 2,75): distancia 1,75 — FICA FORA');

r = rodar({ todos: [conf(1, 4, 84, 'TOP', 2.143, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 0, 'T1 x T4 (4,50 x 2,10): distancia 2,40 — FICA FORA');

// A troca de RAZAO por DIFERENCA muda quem entra nos extremos. E' o efeito
// principal da mudanca e precisa estar coberto nos dois sentidos.
const AZAROES = { 1: 7.00, 2: 9.00 };
r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.286, 0.20, 0.30)], lastSp: AZAROES, pares: [] });
ok(r.length === 0,
   'dois azaroes (7,00 x 9,00): razao 1,29 entrava na regua velha, distancia 2,00 fica FORA agora');

const FAVORITOS = { 1: 1.50, 2: 2.40 };
r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.600, 0.20, 0.30)], lastSp: FAVORITOS, pares: [] });
ok(r.length === 1,
   'dois favoritos (1,50 x 2,40): razao 1,60 ficava FORA, distancia 0,90 ENTRA agora');

r = rodar({ todos: [conf(1, 2, 84, 'TOP', 1.1, 0.20, 0.30)], lastSp: { 1: 4.5 }, pares: [] });
ok(r.length === 0, 'galgo sem SP valida: nao da pra medir, fica fora do pool');

r = rodar({ todos: [conf(1, 3, 55, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 0, 'pct abaixo do corte nao entra no pool nem com SP identica');

r = rodar({ todos: [conf(1, 3, 84, null, 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] });
ok(r.length === 1, 'par de regua frouxa entra no pool — senao GOOD nunca viria da manha');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[2] MOTOR BW — a REGUA decide, o preco NAO barra\n');

for (const [tier, esperada] of [['TOP', 'TOP'], ['REGULAR', 'HIGH'], [null, 'GOOD']]) {
  r = rodar({
    todos: [conf(1, 6, 84, tier, 1.20, 0.20, 0.30)], lastSp: { 1: 4.5, 6: 4.6 },
    pares: [par(1, 6, 52.0, 1.85, 1.92)], abertoEm: '2026-09-08 12:00:00'
  });
  ok(r.length === 1 && r[0].camada === esperada,
     'tier ' + String(tier) + ' -> ' + esperada + '  (saiu: ' + camadas(r) + ')');
}

// O caso que muda tudo: par ESCANCARADO no mercado (razao 2,6).
r = rodar({
  todos: [conf(1, 6, 84, 'TOP', 1.20, 0.20, 0.30)], lastSp: { 1: 4.5, 6: 4.6 },
  pares: [par(1, 6, 72.0, 1.25, 3.60)], abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 1 && r[0].camada === 'TOP',
   'mercado 72x28 (razao 2,6): a regua manda, vira TOP mesmo assim');
ok(r[0].colada_mercado === false && r[0].razao_mercado > 1.5,
   'a razao de mercado segue VISIVEL no payload, so nao decide mais nada');

r = rodar({
  todos: [conf(4, 3, 92, null, 4.333, 0.12, 0.41)], lastSp: { 4: 2.0, 3: 9.0 },
  pares: [par(4, 3, 47.7, 1.92, 1.75)], abertoEm: '2026-09-08 10:07:12'
});
ok(r.length === 1 && r[0].camada === 'GOOD' && r[0].da_manha === false,
   'pescada real do Newc A6: fora do pool (distancia 7,00) e a BW abriu -> GOOD');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[3] UM POR CAMADA — disputa por SPLIT, depois TEMPO, depois pct\n');

const SP6 = { 1: 4.5, 2: 4.6, 3: 4.7, 4: 4.8, 5: 4.9, 6: 5.0 };
r = rodar({
  todos: [conf(1, 6, 95, 'TOP', 1.20, 0.12, 0.40), conf(2, 5, 70, 'TOP', 1.30, 0.28, 0.10)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 1 && r[0].par === 'T2xT5',
   'dois candidatos a TOP: ganha o de melhor SPLIT, mesmo com pct bem menor (95 x 70)');

r = rodar({
  todos: [conf(1, 6, 95, 'TOP', 1.20, 0.20, 0.11), conf(2, 5, 70, 'TOP', 1.30, 0.20, 0.33)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 1 && r[0].par === 'T2xT5', 'split empatado: desempata pelo TEMPO (CalTm)');

r = rodar({
  todos: [conf(1, 6, 70, 'TOP', 1.20, 0.20, 0.30), conf(2, 5, 95, 'TOP', 1.30, 0.20, 0.30)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 1 && r[0].par === 'T2xT5', 'split e tempo empatados: desempata pelo pct');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[4] TETO DE 3 e a ordem das linhas\n');

r = rodar({
  todos: [
    conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'REGULAR', 1.20, 0.25, 0.20),
    conf(3, 4, 80, null, 1.30, 0.20, 0.10), conf(1, 5, 75, null, 1.40, 0.05, 0.05)
  ],
  lastSp: SP6,
  pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95),
          par(3, 4, 50.5, 1.95, 1.97), par(1, 5, 50, 1.98, 1.98)],
  abertoEm: '2026-09-08 12:00:00'
});
ok(r.length === 3, 'no maximo 3 linhas por corrida  (saiu: ' + r.length + ')');
ok(camadas(r) === 'TOP, HIGH, GOOD', 'ordem hierarquica TOP > HIGH > GOOD');
ok(r.every(x => x.camada !== 'OPORTUNIDADE'), 'com as 3 cheias, nao sobra vaga pra linha cinza');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[5] OPORTUNIDADE some DEPOIS da corrida\n');

const SEM_ABRIR = { todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [] };
r = rodar(SEM_ABRIR);
ok(r.length === 1 && r[0].camada === 'OPORTUNIDADE', 'antes da largada a OPORTUNIDADE aparece');

r = rodar(Object.assign({}, SEM_ABRIR, { finishingOrderJson: CHEGADA }));
ok(r.length === 0, 'depois da largada some — corrida sem nenhuma das tres sai inteira');

r = rodar({
  todos: [conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'TOP', 1.20, 0.10, 0.10)],
  lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92)],
  abertoEm: '2026-09-08 12:00:00', finishingOrderJson: CHEGADA
});
ok(r.length === 1 && r[0].camada === 'TOP',
   'depois da largada sobra so o que a BW abriu; o achado que nao abriu sai');

ok(cd.jaCorreu(CHEGADA) === true && cd.jaCorreu(null) === false && cd.jaCorreu('[]') === false,
   'jaCorreu trata vazio/nulo como "ainda nao correu"');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n[6] HELPERS\n');
ok(cd.idConfronto('Sheff A2', '1:31', 1, 6) === 'sheff a2|01:31|1x6', 'idConfronto monta a chave do contrato');
ok(cd.idConfronto('Sheff A2', '1:31', 6, 1) === cd.idConfronto('Sheff A2', '1:31', 1, 6), 'idConfronto e INSENSIVEL a ordem');
ok(cd.horaBr('1:31') === '9:31' && cd.horaBr('14:02') === '10:02', 'horaBr converte UK -> BR');
ok(cd.pista('Sheff A2') === 'Sheff', 'pista pega a primeira palavra');
ok(cd.DIF_SP_MAX === 1.0, 'DIF_SP_MAX default 1,0');
ok(cd.distanciaSp({ 1: 4.5, 2: 5.0 }, 1, 2) === 0.5, 'distanciaSp mede a diferenca absoluta');
ok(cd.distanciaSp({ 1: 4.5 }, 1, 2) === null, 'distanciaSp devolve null quando falta um lado');
ok(cd.camadaPorRegua('TOP') === 'TOP' && cd.camadaPorRegua('REGULAR') === 'HIGH' && cd.camadaPorRegua(null) === 'GOOD',
   'camadaPorRegua mapeia a regua nas tres camadas');

// ═════════════════════════════════════════════════════════════════════════════
// REGUA ANTERIOR — pool por RAZAO <= 1,5 e teto de mercado 1,5 barrando o BW.
// Fatiada da versao que estava no ar. Existe so pra o comparativo.
// ═════════════════════════════════════════════════════════════════════════════
function regraAnterior(o) {
  const TETO = 1.5, FAIXA = 1.8 - 0.3; // 1,5, os cortes de quando esta regra rodava
  const mercadoDe = cd.mercadoDe, montaConfronto = cd.montaConfronto, mesmoPar = cd.mesmoPar;
  const todos = o.todos || [], pares = o.pares || [];
  const parelhoAte = o.parelhoAte > 0 ? o.parelhoAte : 0;
  const ctx = {
    corrida: o.corrida, hora: o.hora, abertoEm: o.abertoEm || null,
    finishingOrderJson: o.finishingOrderJson,
    bateuPar: typeof o.bateuPar === 'function' ? o.bateuPar : function () { return null; }
  };
  const out = [], jaAdd = new Set();
  const ch = (a, b) => Math.min(a, b) + 'x' + Math.max(a, b);
  const manha = todos.filter(s => s.pct > parelhoAte && s.ratio_sp <= FAIXA);
  for (const s of manha) {
    const mk = mercadoDe(pares, s, TETO);
    out.push(montaConfronto(ctx, s, (mk && mk.colada) ? 'TOP' : 'OPORTUNIDADE', true, mk, null));
    jaAdd.add(ch(s.pick_trap, s.outro_trap));
  }
  for (const p of pares) {
    if (p.marketPct == null) continue;
    const ta = Number(p.aTrap), tb = Number(p.bTrap);
    if (jaAdd.has(ch(ta, tb))) continue;
    const mp = p.marketPct / 100, hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
    const razao = lo > 0 ? hi / lo : null;
    if (!(razao != null && razao <= TETO)) continue;
    const s = todos.find(x => mesmoPar(Number(x.pick_trap), Number(x.outro_trap), ta, tb));
    if (!s || s.pct <= parelhoAte) continue;
    out.push(montaConfronto(ctx, s, s.tier != null ? 'HIGH' : 'GOOD', false, mercadoDe(pares, s, TETO), null));
    jaAdd.add(ch(ta, tb));
  }
  return out;
}

console.log('\n' + '='.repeat(78));
console.log('ANTES x DEPOIS — mesmos cenarios nas duas reguas');
console.log('='.repeat(78) + '\n');

const COMPARA = [
  { nome: 'Yarmouth R7: T1xT5 (4,50 x 2,75) — razao 1,64 / distancia 1,75',
    todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30), conf(1, 5, 80, 'TOP', 1.636, 0.25, 0.35)],
    lastSp: YARMOUTH, pares: [] },
  { nome: 'Dois azaroes 7,00 x 9,00 — razao 1,29 / distancia 2,00',
    todos: [conf(1, 2, 84, 'TOP', 1.286, 0.20, 0.30)], lastSp: AZAROES, pares: [] },
  { nome: 'Dois favoritos 1,50 x 2,40 — razao 1,60 / distancia 0,90',
    todos: [conf(1, 2, 84, 'TOP', 1.600, 0.20, 0.30)], lastSp: FAVORITOS, pares: [] },
  { nome: 'Mercado ESCANCARADO 72x28, tier TOP',
    todos: [conf(1, 6, 84, 'TOP', 1.20, 0.20, 0.30)], lastSp: { 1: 4.5, 6: 4.6 },
    pares: [par(1, 6, 72.0, 1.25, 3.60)], abertoEm: '2026-09-08 12:00:00' },
  { nome: 'Corrida cheia: TOP + REGULAR + null, todos abertos',
    todos: [conf(1, 6, 90, 'TOP', 1.10, 0.30, 0.40), conf(2, 5, 85, 'REGULAR', 1.20, 0.25, 0.20), conf(3, 4, 80, null, 1.30, 0.20, 0.10)],
    lastSp: SP6, pares: [par(1, 6, 52, 1.85, 1.92), par(2, 5, 51, 1.90, 1.95), par(3, 4, 50.5, 1.95, 1.97)],
    abertoEm: '2026-09-08 12:00:00' },
  { nome: 'Tres GOOD abertos na mesma corrida (Yrmth A6)',
    todos: [conf(4, 2, 88, null, 2.50, 0.30, 0.20), conf(6, 1, 78, null, 1.24, 0.18, 0.15), conf(3, 2, 86, null, 1.39, 0.22, 0.25)],
    lastSp: SP6, pares: [par(4, 2, 50, 1.83, 1.83), par(6, 1, 48.5, 1.91, 1.91), par(3, 2, 48.1, 1.90, 1.90)],
    abertoEm: '2026-09-08 12:00:00' },
  { nome: 'Achado da manha que nao abriu, DEPOIS da corrida',
    todos: [conf(1, 3, 84, 'TOP', 1.000, 0.20, 0.30)], lastSp: YARMOUTH, pares: [], finishingOrderJson: CHEGADA }
];

let tA = 0, tD = 0;
for (const c of COMPARA) {
  const base = {
    todos: c.todos, pares: c.pares, abertoEm: c.abertoEm || null,
    corrida: 'Sheff A2', hora: '1:31',
    finishingOrderJson: c.finishingOrderJson || null,
    parelhoAte: 60, bateuPar: bateuPar
  };
  const antes = regraAnterior(Object.assign({}, base));
  const depois = cd.confrontosDaCorrida(Object.assign({}, base, { lastSp: c.lastSp }));
  tA += antes.length; tD += depois.length;
  const mudou = JSON.stringify(antes.map(x => x.par + x.camada)) !== JSON.stringify(depois.map(x => x.par + x.camada));
  console.log((mudou ? '  MUDOU  ' : '  igual  ') + c.nome);
  console.log('           antes  (' + antes.length + '): ' + pares_(antes));
  console.log('           depois (' + depois.length + '): ' + pares_(depois));
  console.log('');
}
console.log('  TOTAL DE LINHAS NOS CENARIOS:  antes ' + tA + '  ->  depois ' + tD);

console.log('\n' + (falhas === 0
  ? 'TUDO OK — a regua nova esta valendo em todos os casos.'
  : falhas + ' FALHA(S) — nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
