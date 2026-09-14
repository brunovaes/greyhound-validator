'use strict';
// teste_estudo_avb.js — a rota /robot/diag/estudo-avb
//
// Por que existe: esta rota nao muda nada na tela, mas o CSV que ela cospe e' o
// insumo que vai decidir se a camada continua saindo da regua ou passa a sair do
// pct. Um erro silencioso aqui — o market_pct invertido, por exemplo — nao
// quebra nada visivel: so faz a gente concluir o contrario do certo e mudar o
// motor com base nisso. Por isso ela nasce com teste.
//
// O teste roda o HANDLER REAL, extraido do robot.js, contra um banco de mentira,
// e usa os modulos DE VERDADE (camadasDoDia, avbResultado) — as regras de chave,
// camada e "bateu" sao as de producao, nao copias.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let ok = 0;
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg + '  (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); ok++; };
const ver = (c, msg) => { assert.ok(c, msg); ok++; };

// ── extrai o handler do robot.js ────────────────────────────────────────────
const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
const INI = "router.get('/diag/estudo-avb', requireAdmin, (req, res) => {";
const i = SRC.indexOf(INI);
ver(i > 0, 'a rota /diag/estudo-avb existe no robot.js');
// Fecha no primeiro `});` que zera as chaves abertas a partir do inicio.
let nivel = 0, fim = -1;
for (let k = i; k < SRC.length; k++) {
  const c = SRC[k];
  if (c === '{') nivel++;
  else if (c === '}') { nivel--; if (nivel === 0) { fim = SRC.indexOf('\n', k); break; } }
}
ver(fim > i, 'consegui delimitar o corpo da rota');
const CORPO = SRC.slice(i, fim).replace(INI, 'HANDLER = (req, res) => {').replace(/\}\);\s*$/, '};');

// ── banco de mentira ────────────────────────────────────────────────────────
// Um dia, uma corrida, tres confrontos:
//   4x6  tier TOP     pct 71  — a BW abriu com o par INVERTIDO (a=6, b=4)
//   2x6  tier null    pct 82  — a BW abriu na mesma orientacao do motor
//   1x3  tier REGULAR pct 90  — a BW NAO abriu
// Chegada: 6 em 1o, 4 em 2o, 2 em 3o. O trap 1 nao aparece (retirado).
const CHEGADA = JSON.stringify([{ trap: 6, pos: 1 }, { trap: 4, pos: 2 }, { trap: 2, pos: 3 }, { trap: 5, pos: 4 }]);
const PRECALC = [
  { data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54', race_id: 9, pick_trap: 4, outro_trap: 6,
    pct: 71, tier: 'TOP', bw_provavel: 1, indicado: 0, rank_pick: 1, rank_outro: 2, sp_ratio: 1.2,
    caltm_dif: 0.11, split_dif: 0.07, podio_dif: 20, desaba_count: 0,
    dist: '415', nivel: 'skip', trap_fav: 0, race_tier: null, finishing_order_json: CHEGADA },
  { data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54', race_id: 9, pick_trap: 2, outro_trap: 6,
    pct: 82, tier: null, bw_provavel: 1, indicado: 0, rank_pick: 3, rank_outro: 2, sp_ratio: 1.4,
    caltm_dif: 0.02, split_dif: 0.01, podio_dif: 5, desaba_count: 1,
    dist: '415', nivel: 'skip', trap_fav: 0, race_tier: null, finishing_order_json: CHEGADA },
  { data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54', race_id: 9, pick_trap: 1, outro_trap: 3,
    pct: 90, tier: 'REGULAR', bw_provavel: 0, indicado: 0, rank_pick: 5, rank_outro: 6, sp_ratio: 2.9,
    caltm_dif: 0.30, split_dif: 0.20, podio_dif: 40, desaba_count: 0,
    dist: '415', nivel: 'skip', trap_fav: 0, race_tier: null, finishing_order_json: CHEGADA }
];
const ABERTOS = [{
  data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54',
  pares_json: JSON.stringify([
    // INVERTIDO de proposito: o motor escolheu 4x6, a BW devolveu 6 como "A".
    { aTrap: 6, bTrap: 4, marketPct: 60, oddAvenceB: 1.55, oddBvenceA: 2.30 },
    { aTrap: 2, bTrap: 6, marketPct: 45, oddAvenceB: 2.05, oddBvenceA: 1.70 }
  ])
}];
const VENCEDOR = [{
  data: '2026-09-14', corrida: 'Harlow A6', hora: '1:54',
  odds_json: JSON.stringify([{ trap: 4, odd: 3.10 }, { trap: 6, odd: 2.20 }, { trap: 2, odd: 5.50 }])
}];

const db = {
  prepare(sql) {
    return {
      all() {
        if (sql.indexOf('FROM avb_precalc') >= 0) return PRECALC.map(r => Object.assign({}, r));
        if (sql.indexOf('FROM avb_abertos') >= 0) return ABERTOS.map(r => Object.assign({}, r));
        if (sql.indexOf('FROM odds_vencedor') >= 0) return VENCEDOR.map(r => Object.assign({}, r));
        throw new Error('consulta inesperada: ' + sql);
      }
    };
  }
};

// ── roda o handler ──────────────────────────────────────────────────────────
const requireReal = (m) => {
  if (m === '../db/database') return { db };
  if (m === '../utils/camadasDoDia') return require('./src/utils/camadasDoDia');
  if (m === '../utils/avbResultado') return require('./src/utils/avbResultado');
  throw new Error('require inesperado: ' + m);
};
function chama(query) {
  const r = { _json: null, _send: null, _hdr: {}, _status: 200 };
  r.json = (o) => { r._json = o; return r; };
  r.send = (s) => { r._send = s; return r; };
  r.setHeader = (k, v) => { r._hdr[k] = v; };
  r.status = (c) => { r._status = c; return r; };
  const fn = new Function('require', 'HANDLER_OUT', CORPO + '; HANDLER_OUT.f = HANDLER;');
  const box = {};
  fn(requireReal, box);
  box.f({ query: query || {} }, r);
  return r;
}

// ── 1) inventario ───────────────────────────────────────────────────────────
let r = chama({});
eq(r._status, 200, 'inventario responde 200');
ver(r._json && r._json.resumo, 'inventario devolve resumo');
eq(r._json.resumo.dias, 1, 'um dia no inventario');
eq(r._json.resumo.confrontos_no_precalc, 3, 'tres confrontos no precalc');
eq(r._json.resumo.confrontos_que_a_bw_abriu, 2, 'a BW abriu dois dos tres');
eq(r._json.resumo.linhas_no_csv, 2, 'so_abertos=1 por padrao: duas linhas');
eq(r._json.dias[0].corridas, 1, 'uma corrida distinta no dia');
eq(r._json.dias[0].abriu_bw, 2, 'abriu_bw por dia bate');

// ── 2) so_abertos=0 traz o par que a BW nao abriu ───────────────────────────
r = chama({ so_abertos: '0' });
eq(r._json.resumo.linhas_no_csv, 3, 'so_abertos=0: as tres linhas');

// ── 3) o CSV ────────────────────────────────────────────────────────────────
r = chama({ fmt: 'csv' });
ver(typeof r._send === 'string', 'fmt=csv devolve texto');
eq(r._hdr['Content-Type'], 'text/csv; charset=utf-8', 'Content-Type de CSV');
ver(/attachment; filename=/.test(r._hdr['Content-Disposition'] || ''), 'vai como download');
eq(r._send.charCodeAt(0), 0xFEFF, 'CSV comeca com BOM (senao o Excel estraga o acento)');
const linhas = r._send.replace(/^﻿/, '').trim().split('\n');
eq(linhas.length, 3, 'cabecalho + duas linhas');
const cols = linhas[0].split(',');
const col = (nome) => { const k = cols.indexOf(nome); ver(k >= 0, 'coluna ' + nome + ' existe'); return k; };
const campo = (linha, nome) => linha.split(',')[col(nome)];

const l46 = linhas.find(x => x.split(',')[col('pick')] === '4');
const l26 = linhas.find(x => x.split(',')[col('outro')] === '6' && x.split(',')[col('pick')] === '2');
ver(l46 && l26, 'as duas linhas saem identificaveis por pick/outro');

// ── 4) A ORIENTACAO. E' o erro que passaria despercebido ────────────────────
// A BW gravou 6x4 com marketPct 60 = "6 vence 4". O pick do motor e o 4, entao
// o market_pct da linha TEM que ser 40, e a odd do pick tem que ser a oddBvenceA.
eq(campo(l46, 'market_pct'), '40', 'market_pct invertido pro lado do pick');
eq(campo(l46, 'odd_pick'), '2.3', 'odd_pick = oddBvenceA quando o par veio invertido');
eq(campo(l46, 'odd_outro'), '1.55', 'odd_outro = oddAvenceB quando o par veio invertido');
eq(campo(l46, 'edge'), '31', 'edge = pct 71 - market 40');
// O 2x6 veio na mesma orientacao: nada a inverter.
eq(campo(l26, 'market_pct'), '45', 'market_pct direto quando a orientacao ja bate');
eq(campo(l26, 'odd_pick'), '2.05', 'odd_pick = oddAvenceB quando a orientacao ja bate');
eq(campo(l26, 'edge'), '37', 'edge = pct 82 - market 45');

// ── 5) camada vem do tier, igual a tela ─────────────────────────────────────
eq(campo(l46, 'camada'), 'TOP', 'tier TOP -> camada TOP');
eq(campo(l46, 'tier'), 'TOP', 'o tier cru tambem sai, pra auditar');
eq(campo(l26, 'camada'), 'GOOD', 'tier vazio -> camada GOOD');
r = chama({ so_abertos: '0', fmt: 'csv' });
const l13 = r._send.replace(/^﻿/, '').trim().split('\n').find(x => x.split(',')[col('pick')] === '1');
eq(l13.split(',')[col('camada')], 'HIGH', 'tier REGULAR -> camada HIGH');
eq(l13.split(',')[col('abriu_bw')], '0', 'o par que a BW nao abriu sai com abriu_bw=0');
eq(l13.split(',')[col('market_pct')], '', 'sem par na BW, nao ha market_pct — e fica VAZIO, nao zero');

// ── 6) o resultado ──────────────────────────────────────────────────────────
// Chegada: 6 em 1o, 4 em 2o, 2 em 3o.
eq(campo(l46, 'bateu'), '0', 'pick 4 chegou atras do 6 -> nao bateu');
eq(campo(l46, 'fin_pick'), '2', 'posicao do pick');
eq(campo(l46, 'fin_outro'), '1', 'posicao do outro');
eq(campo(l26, 'bateu'), '0', 'pick 2 (3o) atras do 6 (1o) -> nao bateu');
// O trap 1 nao esta na chegada: INDEFINIDO, nunca 0.
eq(l13.split(',')[col('bateu')], '', 'trap fora da chegada -> bateu VAZIO, nao 0');

// ── 7) o vazio nao entra na conta de resultado ──────────────────────────────
r = chama({ so_abertos: '0' });
eq(r._json.resumo.com_resultado, 2, 'so os dois resolvidos contam como com_resultado');
eq(r._json.dias[0].sem_resultado, 1, 'o indefinido e contado a parte');

// ── 8) recorte de datas ─────────────────────────────────────────────────────
r = chama({ de: '2026-09-15' });
ver(r._status === 200, 'recorte de data nao quebra');

// ── 9) odd individual do mercado Vencedor ───────────────────────────────────
eq(campo(l46, 'odd_venc_pick'), '3.1', 'odd individual do pick');
eq(campo(l46, 'odd_venc_outro'), '2.2', 'odd individual do outro');

// ── 10) a rota nao grava nada ───────────────────────────────────────────────
ver(!/INSERT INTO|UPDATE |DELETE FROM/i.test(CORPO), 'o corpo da rota nao tem INSERT, UPDATE nem DELETE');

console.log('\nTUDO OK — ' + ok + ' verificacoes');
