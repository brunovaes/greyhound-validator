'use strict';
// teste_estudo_galgo.js — a rota /robot/diag/estudo-galgo
//
// Por que existe, e por que ela e' MAIS perigosa que a estudo-avb: esta rota
// deriva campos. Um sinal invertido no `degrau` nao quebra nada visivel — so
// faz o estudo concluir que subir de categoria ajuda, e a gente reprogramar o
// motor ao contrario. O teste abaixo trava exatamente os pontos onde um erro
// silencioso mudaria a conclusao:
//
//   degrau POSITIVO = desceu de categoria (nivelCat: numero menor = mais forte)
//   "ultima" ignora trial
//   margem = caltm - vencedorTm
//   dias_desc vazio quando a data nao pode ser lida, NUNCA zero
//   a_ = pick do motor, b_ = outro, mesmo quando a BW devolve o par invertido
//
// Roda o HANDLER REAL extraido do robot.js, com os modulos de verdade
// (camadasDoDia, reanaliseEngine, avbResultado), contra um banco de mentira.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let ok = 0;
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg + '  (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); ok++; };
const ver = (c, msg) => { assert.ok(c, msg); ok++; };

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
const INI = "router.get('/diag/estudo-galgo', requireAdmin, (req, res) => {";
const i = SRC.indexOf(INI);
ver(i > 0, 'a rota /diag/estudo-galgo existe no robot.js');
let nivel = 0, fim = -1;
for (let k = i; k < SRC.length; k++) {
  const c = SRC[k];
  if (c === '{') nivel++;
  else if (c === '}') { nivel--; if (nivel === 0) { fim = SRC.indexOf('\n', k); break; } }
}
ver(fim > i, 'consegui delimitar o corpo da rota');
const CORPO = SRC.slice(i, fim).replace(INI, 'HANDLER = (req, res) => {').replace(/\}\);\s*$/, '};');

// ── banco de mentira ────────────────────────────────────────────────────────
// Corrida de hoje: Harlow A6, 415m, 14/09. Par 4 x 6.
//
// T4 (o pick): venceu a ultima, que foi em A7 -> hoje e A6, ou seja SUBIU de
//   categoria -> degrau NEGATIVO. Tem um TRIAL mais recente que a vitoria, que
//   tem que ser ignorado. Peso subiu 1,5 kg. 7 dias de descanso.
// T6 (o outro): ultima foi 4o lugar em A5, colado no vencedor (0,06s), com
//   remark de atrapalho. Hoje A6 -> DESCEU de categoria -> degrau POSITIVO.
const HIST_FULL = JSON.stringify([
  { trap: 4, nome: 'Browns Barbie', historico: [
    { data: '11Sep26', pista: 'Harlow', dist: 415, trap: 4, split: 4.80, bends: '1111', pos: 0,
      remarks: 'Solo', caltm: 26.50, classe: 'T3', peso: 30.0, gng: '-10', sp: '', vencedorTm: 26.50 },
    { data: '07Sep26', pista: 'Harlow', dist: 415, trap: 4, split: 4.98, bends: '2222', pos: 1,
      remarks: 'LdRnIn', caltm: 27.05, classe: 'A7', peso: 31.5, gng: '-10', sp: '2/1', vencedorTm: 27.05 },
    { data: '31Aug26', pista: 'Harlow', dist: 415, trap: 3, split: 5.00, bends: '1111', pos: 2,
      remarks: 'ALd Mid', caltm: 27.40, classe: 'A7', peso: 30.0, gng: '-10', sp: '3/1', vencedorTm: 27.20 },
    { data: '21Aug26', pista: 'Harlow', dist: 400, trap: 4, split: 4.93, bends: '1111', pos: 1,
      remarks: 'LdRnUp', caltm: 27.09, classe: 'A6', peso: 30.5, gng: '-20', sp: '5/2', vencedorTm: 27.09 }
  ]},
  { trap: 6, nome: 'Donnybrook', historico: [
    { data: '09Sep26', pista: 'Harlow', dist: 415, trap: 6, split: 5.14, bends: '5656', pos: 4,
      remarks: 'SAw Bmp1', caltm: 27.46, classe: 'A5', peso: 33.0, gng: '-10', sp: '6/1', vencedorTm: 27.40 },
    { data: '24Aug26', pista: 'Harlow', dist: 415, trap: 5, split: 5.03, bends: '3443', pos: 3,
      remarks: 'SAw', caltm: 27.32, classe: 'A5', peso: 33.0, gng: '-10', sp: '4/1', vencedorTm: 27.00 },
    { data: '17Aug26', pista: 'Harlow', dist: 415, trap: 6, split: 5.00, bends: '5455', pos: 6,
      remarks: 'Bmp1&2', caltm: 27.75, classe: 'A5', peso: 32.5, gng: '-10', sp: '5/1', vencedorTm: 27.10 }
  ]},
  // Sem historico: serve pra provar que o par cujo galgo nao tem card e' descartado.
  { trap: 2, nome: 'Sem Historico', historico: [] }
]);
const CHEGADA = JSON.stringify([{ trap: 6, pos: 1 }, { trap: 4, pos: 2 }, { trap: 2, pos: 3 }]);

const PRECALC = [
  { data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54', race_id: 9, pick_trap: 4, outro_trap: 6,
    pct: 71, tier: 'TOP', bw_provavel: 1, indicado: 0, sp_ratio: 1.2,
    dist: 415, data_card: '2026-09-14', nivel: 'skip', trap_fav: 0,
    hist_full: HIST_FULL, finishing_order_json: CHEGADA },
  { data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54', race_id: 9, pick_trap: 4, outro_trap: 2,
    pct: 80, tier: null, bw_provavel: 1, indicado: 0, sp_ratio: 1.5,
    dist: 415, data_card: '2026-09-14', nivel: 'skip', trap_fav: 0,
    hist_full: HIST_FULL, finishing_order_json: CHEGADA }
];
const ABERTOS = [{
  data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54',
  // INVERTIDO: o motor escolheu 4x6, a BW devolveu 6 como "A".
  pares_json: JSON.stringify([
    { aTrap: 6, bTrap: 4, marketPct: 60, oddAvenceB: 1.55, oddBvenceA: 2.30 },
    { aTrap: 4, bTrap: 2, marketPct: 70, oddAvenceB: 1.35, oddBvenceA: 3.00 }
  ])
}];

const db = {
  prepare(sql) {
    return { all() {
      if (sql.indexOf('FROM avb_precalc') >= 0) return PRECALC.map(r => Object.assign({}, r));
      if (sql.indexOf('FROM avb_abertos') >= 0) return ABERTOS.map(r => Object.assign({}, r));
      throw new Error('consulta inesperada: ' + sql);
    } };
  }
};
const requireReal = (m) => {
  if (m === '../db/database') return { db };
  if (m === '../utils/camadasDoDia') return require('./src/utils/camadasDoDia');
  if (m === '../utils/reanaliseEngine') return require('./src/utils/reanaliseEngine');
  if (m === '../utils/avbResultado') return require('./src/utils/avbResultado');
  throw new Error('require inesperado: ' + m);
};
function chama(query) {
  const r = { _json: null, _send: null, _hdr: {}, _status: 200 };
  r.json = (o) => { r._json = o; return r; };
  r.send = (s) => { r._send = s; return r; };
  r.setHeader = (k, v) => { r._hdr[k] = v; };
  r.status = (c) => { r._status = c; return r; };
  const fn = new Function('require', 'OUT', CORPO + '; OUT.f = HANDLER;');
  const box = {}; fn(requireReal, box); box.f({ query: query || {} }, r);
  return r;
}

// ── 1) o descarte por falta de historico ────────────────────────────────────
let r = chama({});
eq(r._status, 200, 'inventario responde 200');
eq(r._json.resumo.confrontos_no_precalc, 2, 'dois confrontos no precalc');
eq(r._json.resumo.que_a_bw_abriu, 2, 'a BW abriu os dois');
eq(r._json.resumo.descartados_sem_hist_dos_dois, 1, 'o par com o T2 sem historico e descartado');
eq(r._json.resumo.linhas_no_csv, 1, 'sobra uma linha');
ver(r._json.cobertura_pct && r._json.cobertura_pct.a_ult_pos === 100, 'cobertura reportada por coluna');

// ── 2) o CSV ────────────────────────────────────────────────────────────────
r = chama({ fmt: 'csv' });
eq(r._hdr['Content-Type'], 'text/csv; charset=utf-8', 'Content-Type de CSV');
eq(r._send.charCodeAt(0), 0xFEFF, 'CSV comeca com BOM');
const L = r._send.replace(/^﻿/, '').trim().split('\n');
eq(L.length, 2, 'cabecalho + uma linha');
const cols = L[0].split(','), vals = L[1].split(',');
eq(cols.length, vals.length, 'a linha tem o mesmo numero de campos do cabecalho');
const v = (nome) => { const k = cols.indexOf(nome); ver(k >= 0, 'coluna ' + nome + ' existe'); return vals[k]; };

// ── 3) O SINAL DO DEGRAU. O erro que inverteria o estudo inteiro ────────────
// Hoje e A6 (nivel 6). O T4 vem de A7 (nivel 7): 6 - 7 = -1, SUBIU de categoria.
// O T6 vem de A5 (nivel 5): 6 - 5 = +1, DESCEU de categoria.
eq(v('nivel_hoje'), '6', 'nivel de hoje lido do nome da corrida');
eq(v('a_ult_nivel'), '7', 'nivel da ultima do pick');
eq(v('a_degrau'), '-1', 'pick veio de A7 pra A6: degrau NEGATIVO = subiu de categoria');
eq(v('b_ult_nivel'), '5', 'nivel da ultima do outro');
eq(v('b_degrau'), '1', 'outro veio de A5 pra A6: degrau POSITIVO = desceu de categoria');

// ── 4) trial ignorado ───────────────────────────────────────────────────────
// A corrida mais recente do T4 e um Solo em grade T3. Se ela entrasse como
// "ultima", venceu_ult seria 0 (pos=0) e o degrau sairia errado.
eq(v('a_ult_data'), '07Sep26', 'a ultima do pick pula o trial de 11Sep');
eq(v('a_venceu_ult'), '1', 'o pick venceu a ultima corrida de verdade');
eq(v('a_ult_grade'), 'A7', 'grade da ultima nao-trial');
eq(v('a_n_hist'), '3', 'tres corridas nao-trial no historico do pick');

// ── 5) margem para o vencedor ───────────────────────────────────────────────
eq(v('a_ult_margem'), '0', 'o pick venceu: margem zero');
eq(v('b_ult_margem'), '0.06', 'o outro chegou em 4o a 0,06s do vencedor');
eq(v('b_ult_pos'), '4', 'posicao do outro na ultima');

// ── 6) atrapalho e saida lenta ──────────────────────────────────────────────
eq(v('a_atrapalho_ult'), '0', 'LdRnIn nao e atrapalho');
eq(v('b_atrapalho_ult'), '1', 'Bmp1 e atrapalho');
eq(v('b_saw_n'), '2', 'o outro tem SAw em duas das ultimas');
eq(v('a_saw_n'), '0', 'o pick nao tem SAw');

// ── 7) rotina: descanso, peso, distancia, trap ──────────────────────────────
eq(v('a_dias_desc'), '7', '14/09 menos 07/09 = 7 dias');
eq(v('b_dias_desc'), '5', '14/09 menos 09/09 = 5 dias');
eq(v('a_peso_var'), '1.5', 'peso subiu 1,5 kg entre as duas ultimas');
eq(v('b_peso_var'), '0', 'peso do outro nao mudou');
eq(v('a_mudou_dist'), '0', 'ultima do pick foi na mesma distancia');
eq(v('a_trap_dif'), '0', 'pick corre no mesmo trap');
eq(v('b_trap_dif'), '0', 'outro corre no mesmo trap');

// ── 8) regularidade ─────────────────────────────────────────────────────────
eq(v('a_caltm_melhor'), '27.05', 'melhor tempo do pick entre as nao-trial');
ver(parseFloat(v('a_caltm_dp')) > 0, 'desvio padrao do pick calculado');
ver(parseFloat(v('b_caltm_dp')) > parseFloat(v('a_caltm_dp')), 'o outro e mais irregular que o pick');
eq(v('a_split_med2'), '4.99', 'media dos dois splits mais recentes nao-trial do pick');

// ── 9) orientacao do par e resultado ────────────────────────────────────────
// A BW gravou 6x4 com marketPct 60 = "6 vence 4". O pick e o 4: tem que virar 40.
eq(v('pick'), '4', 'a linha sai na orientacao do pick do motor');
eq(v('market_pct'), '40', 'market_pct invertido pro lado do pick');
eq(v('odd_pick'), '2.3', 'odd_pick = oddBvenceA quando o par veio invertido');
eq(v('bateu'), '0', 'o pick (T4, 2o) chegou atras do outro (T6, 1o)');

// ── 10) data ilegivel vira VAZIO, nunca zero ────────────────────────────────
const semData = JSON.parse(HIST_FULL);
semData[0].historico[1].data = 'xxxxx';
PRECALC[0].hist_full = JSON.stringify(semData);
r = chama({ fmt: 'csv' });
const v2 = r._send.replace(/^﻿/, '').trim().split('\n')[1].split(',');
eq(v2[cols.indexOf('a_dias_desc')], '', 'data ilegivel -> dias_desc VAZIO, nao 0');
eq(v2[cols.indexOf('a_venceu_ult')], '1', 'o resto da linha continua valendo');
PRECALC[0].hist_full = HIST_FULL;

// ── 11) a rota nao grava nada ───────────────────────────────────────────────
ver(!/INSERT INTO|UPDATE |DELETE FROM/i.test(CORPO), 'o corpo da rota nao tem INSERT, UPDATE nem DELETE');

// ── 12) as 16 hipoteses tem coluna ──────────────────────────────────────────
// Se uma hipotese do pre-registro perder a coluna numa refatoracao, ela deixa de
// ser testavel em silencio. Isto quebra o teste em vez de quebrar o estudo.
const PRECISA = {
  'A1 venceu a ultima': 'a_venceu_ult', 'A2 desceu de grade': 'a_degrau',
  'B1/B2 margem': 'a_ult_margem', 'C1 atrapalho': 'a_atrapalho_ult', 'C2 saida lenta': 'a_saw_n',
  'D1/D2 arranque': 'a_split_med2', 'E1 peso': 'a_peso_var', 'E2 descanso': 'a_dias_desc',
  'E3 distancia': 'a_mudou_dist', 'F1 trap': 'a_trap_dif', 'F2 trap x pista': 'track',
  'G1 regularidade': 'a_caltm_dp', 'H pista': 'track'
};
for (const [hip, col] of Object.entries(PRECISA)) ver(cols.indexOf(col) >= 0, hip + ' -> coluna ' + col);
for (const c of ['a_ult_pos', 'b_ult_pos', 'a_ult_grade', 'b_ult_grade']) ver(cols.indexOf(c) >= 0, 'coluna ' + c);

console.log('\nTUDO OK — ' + ok + ' verificacoes');
