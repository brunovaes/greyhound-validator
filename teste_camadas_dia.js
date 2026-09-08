'use strict';
// teste_camadas_dia.js — EQUIVALENCIA da extracao da regra de camadas.
//
// O commit que criou o src/utils/camadasDoDia.js tirou a regra de camadas
// (OPORTUNIDADE/TOP/HIGH/GOOD) de dentro do handler do GET /api/painel-dia.
// Extracao e' o tipo de mudanca que PARECE inofensiva e nao e': basta um `<=`
// virar `<` no caminho e o payload muda sem estourar nada, sem log, sem 500.
//
// Como este teste prova que nada mudou: a funcao `oraculo` abaixo NAO foi escrita
// a mao — e' a logica antiga FATIADA VERBATIM do api.js anterior a extracao. O
// teste roda o oraculo e o util novo sobre os MESMOS cenarios e compara o JSON
// campo a campo, na ordem. Zero diferenca = extracao limpa.
//
//   node teste_camadas_dia.js
//
// QUANDO A REGUA NOVA ENTRAR (max 3 por corrida, split -> tempo -> pct), este
// teste passa a falhar de proposito nos cenarios afetados. E' o sinal de que o
// comportamento mudou de verdade — e ai o oraculo sai de cena e este arquivo e'
// reescrito com as expectativas novas.

const path = require('path');
const cd = require(path.join(__dirname, 'src', 'utils', 'camadasDoDia'));
const { bateuPar } = require(path.join(__dirname, 'src', 'utils', 'avbResultado'));

let falhas = 0;

// ── ORACULO: a regra ANTIGA, fatiada do api.js. Nao editar a mao. ────────────
function oraculo(o) {

  const row = { corrida: o.corrida, hora: o.hora, finishing_order_json: o.finishingOrderJson };
  const todos = o.todos, pares = o.pares, abertoEm = o.abertoEm;
  const parelhoAte = o.parelhoAte, bateuPar = o.bateuPar;
    const TETO = 1.5, FAIXA = 1.8;
    const _c = c => String(c || '').trim().toLowerCase();
    const _h = h => { const m = String(h || '').match(/(\d{1,2}):(\d{2})/); return m ? (m[1].padStart(2, '0') + ':' + m[2]) : String(h || '').trim(); };
    const _k = (co, ho) => _c(co) + '|' + _h(ho);
    const _idc = (co, ho, t1, t2) => _k(co, ho) + '|' + Math.min(t1, t2) + 'x' + Math.max(t1, t2);
    const _mesmoPar = (t1a, t1b, t2a, t2b) => (t1a === t2a && t1b === t2b) || (t1a === t2b && t1b === t2a);
    const _pista = c => String(c || '').trim().split(/\s+/)[0] || '?';
    const _horaBr = h => { const m = String(h || '').match(/(\d{1,2}):(\d{2})/); if (!m) return String(h || ''); let hr = parseInt(m[1]); if (hr >= 1 && hr <= 9) hr += 12; hr = hr - 4; if (hr < 0) hr += 24; return hr + ':' + m[2]; };
        // dados de mercado (colagem na odd individual) de um confronto
        const mercadoDe = (s) => {
          if (!pares.length) return null;
          const par = pares.find(x => _mesmoPar(Number(x.aTrap), Number(x.bTrap), Number(s.pick_trap), Number(s.outro_trap)));
          if (!par || par.marketPct == null) return null;
          const mp = (Number(par.aTrap) === Number(s.pick_trap) ? par.marketPct : 100 - par.marketPct) / 100;
          const hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
          const razao = lo > 0 ? +(hi / lo).toFixed(3) : null;
          const oddPick = (Number(par.aTrap) === Number(s.pick_trap)) ? par.oddAvenceB : par.oddBvenceA;
          return { colada: razao != null && razao <= TETO, razao, market_pct: +(mp * 100).toFixed(1), odd: (oddPick != null ? +Number(oddPick).toFixed(2) : null) };
        };
        const mkConf = (s, camada, noBoard, mk) => ({
          id: _idc(row.corrida, row.hora, s.pick_trap, s.outro_trap),
          par: 'T' + s.pick_trap + 'xT' + s.outro_trap,
          pick_trap: s.pick_trap, pick_nome: s.pick_nome || null,
          outro_trap: s.outro_trap, outro_nome: s.outro_nome || null,
          pct: s.pct, sp_ratio: s.ratio_sp,
          camada, no_board_top: !!noBoard,
          odd_bw: mk ? mk.odd : null, razao_mercado: mk ? mk.razao : null, market_pct: mk ? mk.market_pct : null,
          promovido_em: (camada !== 'OPORTUNIDADE' && abertoEm) ? abertoEm : null,
          bateu: bateuPar(row.finishing_order_json, Number(s.pick_trap), Number(s.outro_trap))
        });
        // manha (board TOP): qualidade (tier != null) + pct + SP colada <= faixa
        const manha = todos.filter(s => s.tier != null && s.pct > parelhoAte && s.ratio_sp <= FAIXA);
        const confrontos = []; const jaAdd = new Set();
        // 1) board TOPs — sempre entram; OPORTUNIDADE ate abrir colada na BW, ai vira TOP
        for (const s of manha) {
          const key = Math.min(s.pick_trap, s.outro_trap) + 'x' + Math.max(s.pick_trap, s.outro_trap);
          const mk = mercadoDe(s);
          confrontos.push(mkConf(s, (mk && mk.colada) ? 'TOP' : 'OPORTUNIDADE', true, mk));
          jaAdd.add(key);
        }
        // 2) HIGH/GOOD — pares que a BW abriu colados, com opiniao do motor, fora da manha
        for (const par of pares) {
          if (par.marketPct == null) continue;
          const ta = Number(par.aTrap), tb = Number(par.bTrap);
          const key = Math.min(ta, tb) + 'x' + Math.max(ta, tb);
          if (jaAdd.has(key)) continue;
          const mp = par.marketPct / 100, hi = Math.max(mp, 1 - mp), lo = Math.min(mp, 1 - mp);
          const razao = lo > 0 ? (hi / lo) : null;
          if (!(razao != null && razao <= TETO)) continue;      // exige colada na BW
          const conf = todos.find(s => _mesmoPar(Number(s.pick_trap), Number(s.outro_trap), ta, tb));
          if (!conf || conf.pct <= parelhoAte) continue;        // sem opiniao/conviccao
          confrontos.push(mkConf(conf, conf.tier != null ? 'HIGH' : 'GOOD', false, mercadoDe(conf)));
          jaAdd.add(key);
        }
  return confrontos;

  return confrontos;
}

// ── cenarios ─────────────────────────────────────────────────────────────────
// Cenarios de teste da regra de camadas. Ficam num arquivo so pra o teste de
// equivalencia (commit 1) e o teste da regua nova (commit 2) rodarem sobre
// EXATAMENTE a mesma entrada — se cada um tivesse a sua, a comparacao entre os
// dois nao provaria nada.

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

// chegada (shape do races.finishing_order_json)
const CHEGADA = JSON.stringify([
  { trap: 1, pos: 1 }, { trap: 2, pos: 2 }, { trap: 5, pos: 3 },
  { trap: 6, pos: 4 }, { trap: 3, pos: 5 }, { trap: 4, pos: 6 }
]);

const CENARIOS = [
  {
    nome: 'manha sem BW -> OPORTUNIDADE (odd vazia, no board)',
    corrida: 'Sheff A2', hora: '1:31', abertoEm: null,
    finishingOrderJson: null, parelhoAte: 60,
    todos: [conf(1, 6, 73, 'TOP', 1.067, 0.20, 0.15)],
    pares: []
  },
  {
    nome: 'manha + BW colada -> TOP',
    corrida: 'Sheff A2', hora: '1:31', abertoEm: '2026-09-03 12:27:06',
    finishingOrderJson: CHEGADA, parelhoAte: 60,
    todos: [conf(1, 6, 73, 'TOP', 1.067, 0.20, 0.15)],
    pares: [par(1, 6, 53.8, 1.70, 2.05)]
  },
  {
    nome: 'manha + BW LARGA -> segue OPORTUNIDADE com odd preenchida (a nuance)',
    corrida: 'Sheff A2', hora: '1:31', abertoEm: '2026-09-03 12:27:06',
    finishingOrderJson: CHEGADA, parelhoAte: 60,
    todos: [conf(1, 6, 73, 'TOP', 1.067, 0.20, 0.15)],
    pares: [par(1, 6, 72.0, 1.25, 3.60)]
  },
  {
    nome: 'BW colada + qualidade fora da manha -> HIGH',
    corrida: 'Romfd A11', hora: '2:14', abertoEm: '2026-09-03 13:10:00',
    finishingOrderJson: CHEGADA, parelhoAte: 60,
    todos: [conf(2, 3, 71, 'TOP', 2.40, 0.18, 0.11)],   // ratio_sp > faixa: fora da manha
    pares: [par(2, 3, 52.0, 1.85, 1.92)]
  },
  {
    nome: 'BW colada + regua frouxa -> GOOD',
    corrida: 'Romfd A11', hora: '2:14', abertoEm: '2026-09-03 13:10:00',
    finishingOrderJson: CHEGADA, parelhoAte: 60,
    todos: [conf(5, 4, 68, null, 1.30, 0.09, 0.05)],
    pares: [par(5, 4, 51.0, 1.90, 1.95)]
  },
  {
    nome: 'BW colada mas pct abaixo do corte -> ignorado',
    corrida: 'Romfd A11', hora: '2:14', abertoEm: '2026-09-03 13:10:00',
    finishingOrderJson: CHEGADA, parelhoAte: 60,
    todos: [conf(5, 4, 55, null, 1.30, 0.09, 0.05)],
    pares: [par(5, 4, 51.0, 1.90, 1.95)]
  },
  {
    nome: 'BW abre o par INVERTIDO (BxA) -> casa e inverte a odd certa',
    corrida: 'Towc A5', hora: '4:59', abertoEm: '2026-09-03 15:02:00',
    finishingOrderJson: CHEGADA, parelhoAte: 60,
    todos: [conf(5, 3, 88, 'TOP', 1.10, 0.22, 0.19)],
    pares: [par(3, 5, 45.0, 2.10, 1.80)]
  },
  {
    nome: 'CORRIDA CHEIA: 2 da manha + 1 HIGH + 1 GOOD (onde a regua nova morde)',
    corrida: 'Youghal A3', hora: '4:54', abertoEm: '2026-09-03 16:20:00',
    finishingOrderJson: CHEGADA, parelhoAte: 60,
    todos: [
      conf(1, 4, 95, 'TOP', 1.20, 0.12, 0.30),   // manha, split PIOR
      conf(2, 5, 84, 'TOP', 1.35, 0.20, 0.10),   // manha, split MELHOR
      conf(6, 3, 78, 'TOP', 2.90, 0.18, 0.22),   // fora da manha (SP larga) -> HIGH
      conf(1, 5, 71, null, 1.40, 0.25, 0.08)     // regua frouxa -> GOOD, split o melhor de todos
    ],
    pares: [
      par(1, 4, 54.0, 1.75, 2.00),
      par(2, 5, 52.5, 1.88, 1.94),
      par(6, 3, 47.0, 2.05, 1.85),
      par(1, 5, 50.5, 1.95, 1.97)
    ]
  },
  {
    nome: 'nada da manha e a BW nao abriu nada -> lista vazia',
    corrida: 'Notts A5', hora: '5:11', abertoEm: null,
    finishingOrderJson: null, parelhoAte: 60,
    todos: [conf(5, 2, 95, null, 2.50, 0.05, 0.02)],
    pares: []
  },
  {
    nome: 'parelhoAte em 70 (producao pode estar assim) muda quem entra',
    corrida: 'Harlow A7', hora: '6:11', abertoEm: '2026-09-03 17:05:00',
    finishingOrderJson: CHEGADA, parelhoAte: 70,
    todos: [
      conf(6, 1, 74, 'TOP', 1.15, 0.16, 0.12),
      conf(6, 3, 68, 'TOP', 1.18, 0.21, 0.14)    // cai fora com o corte em 70
    ],
    pares: [par(6, 1, 53.0, 1.80, 1.98), par(6, 3, 52.0, 1.86, 1.93)]
  }
];


// ── comparacao ───────────────────────────────────────────────────────────────
// Estrita: mesma quantidade, mesma ORDEM, mesmas chaves, mesmos valores. Ordem
// importa — a Analisar usa a ordem pra decidir qual tile fica na esquerda.
function comparar(nome, a, b) {
  const sa = JSON.stringify(a, null, 1);
  const sb = JSON.stringify(b, null, 1);
  if (sa === sb) { console.log('  OK    | ' + nome + '  (' + a.length + ' confronto(s))'); return; }
  falhas++;
  console.log('  FALHA | ' + nome);
  const la = sa.split('\n'), lb = sb.split('\n');
  const n = Math.max(la.length, lb.length);
  let m = 0;
  for (let i = 0; i < n && m < 8; i++) {
    if (la[i] !== lb[i]) {
      console.log('          antigo: ' + (la[i] === undefined ? '(nada)' : la[i].trim()));
      console.log('          novo  : ' + (lb[i] === undefined ? '(nada)' : lb[i].trim()));
      m++;
    }
  }
}

const copia = x => JSON.parse(JSON.stringify(x));

console.log('\nEQUIVALENCIA — regra antiga (oraculo) x src/utils/camadasDoDia.js\n');
for (const c of CENARIOS) {
  const base = {
    abertoEm: c.abertoEm, corrida: c.corrida, hora: c.hora,
    finishingOrderJson: c.finishingOrderJson, parelhoAte: c.parelhoAte, bateuPar: bateuPar
  };
  // Copias independentes dos dois lados: se um mutasse a entrada, o outro
  // herdaria o estrago e a comparacao deixaria de provar qualquer coisa.
  const antigo = oraculo(Object.assign({}, base, { todos: copia(c.todos), pares: copia(c.pares) }));
  const novo   = cd.confrontosDaCorrida(Object.assign({}, base, { todos: copia(c.todos), pares: copia(c.pares) }));
  comparar(c.nome, antigo, novo);
}

// ── helpers tambem sairam do api.js ──────────────────────────────────────────
console.log('\nHELPERS extraidos (id estavel, fuso, pista)\n');
function ok(cond, msg) { console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg); if (!cond) falhas++; }
ok(cd.idConfronto('Sheff A2', '1:31', 1, 6) === 'sheff a2|01:31|1x6', 'idConfronto monta a chave do contrato');
ok(cd.idConfronto('Sheff A2', '1:31', 6, 1) === cd.idConfronto('Sheff A2', '1:31', 1, 6), 'idConfronto e INSENSIVEL a ordem (o botao de inverter nao pode quebrar o ENTREI)');
ok(cd.horaBr('1:31') === '9:31', 'horaBr: 1:31 UK -> 9:31 BR (soma 12, tira 4)');
ok(cd.horaBr('14:02') === '10:02', 'horaBr: 14:02 UK -> 10:02 BR (ja e 24h, so tira 4)');
ok(cd.horaBr('2:14') === '10:14', 'horaBr: 2:14 UK -> 10:14 BR');
ok(cd.pista('Sheff A2') === 'Sheff', 'pista pega a primeira palavra');
ok(cd.mesmoPar(1, 6, 6, 1) === true, 'mesmoPar casa o par invertido');
ok(cd.mesmoPar(1, 6, 1, 5) === false, 'mesmoPar nao casa par diferente');
ok(cd.TETO === 1.5 && cd.FAIXA === 1.8, 'TETO 1.5 e FAIXA 1.8 preservados');

console.log('\n' + (falhas === 0
  ? 'TUDO OK — a extracao nao mudou o payload em nenhum cenario.'
  : falhas + ' FALHA(S) — a extracao ALTEROU o comportamento. Nao subir.'));
process.exit(falhas === 0 ? 0 : 1);
