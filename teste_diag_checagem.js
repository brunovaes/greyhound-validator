'use strict';
// teste_diag_checagem.js — COBERTURA DA CHECAGEM FINAL (Bruno, 16/09/2026)
//
// De onde veio: "a trap 1 esta vazia e nao foi avisado na tela analisar".
// O motor nao sabia — o race_card gravado ainda tinha os seis galgos. Quem
// deveria ter pego a retirada e o robo de Checagem Final, e nao deu pra saber
// POR QUE ele nao pegou: o log dele vive numa linha unica da robot_logs,
// reescrita a cada rodada, e ele roda de 5 em 5 minutos.
//
// O que sobrevive e' o final_check_status/final_check_at na propria corrida.
// A rota /diag/checagem-final le esses dois e responde a pergunta que importa
// depois do fato: QUAIS corridas passaram da janela sem serem conferidas.
//
// O QUE ESTE TESTE PROTEGE:
//   1) a definicao de `furo`. Se ela ficar frouxa, o diagnostico vira ruido;
//      se ficar apertada demais, esconde o buraco que existe pra mostrar.
//   2) que a janela e' calculada com a MESMA funcao do robo. Um diagnostico
//      que discorda do diagnosticado nao serve pra nada.
//   3) que as boxes vazias saem do race_card GRAVADO — a mesma fonte que a
//      tela Analisar usa pra decidir a nota.
//
// Roda a rota de verdade contra um banco de mentira.
//
//   node teste_diag_checagem.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');

// As duas funcoes de tempo sao ARRANCADAS do cardMonitorRobot em vez de
// importadas: requerer aquele modulo abre o banco (ele puxa db/database no
// topo), e teste nao pode depender de banco. Extrair tem um bonus — o teste
// passa a rodar a implementacao REAL do robo, entao se ela mudar e a rota nao
// acompanhar, o bloco [4] cai.
const SRC_MON = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'cardMonitorRobot.js'), 'utf8');
function _arranca(src, nome) {
  const ini = src.indexOf('function ' + nome + '(');
  if (ini < 0) throw new Error('funcao ' + nome + ' sumiu do cardMonitorRobot.js');
  let i = src.indexOf('{', ini), n = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') n++;
    else if (src[i] === '}') { n--; if (!n) return src.slice(ini, i + 1); }
  }
  throw new Error('nao consegui fechar ' + nome);
}
const _tempo = {};
vm.createContext(_tempo);
vm.runInContext(_arranca(SRC_MON, 'horaUkParaMinutosBrt') + '\n'
  + _arranca(SRC_MON, 'agoraMinutosBrt')
  + '\nthis.a = horaUkParaMinutosBrt; this.b = agoraMinutosBrt;', _tempo);
const horaUkParaMinutosBrt = _tempo.a, agoraMinutosBrt = _tempo.b;

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── arranca o corpo da rota ─────────────────────────────────────────────────
const MARCA = "router.get('/diag/checagem-final', requireAdmin, (req, res) => {";
const iR = SRC.indexOf(MARCA);
if (iR < 0) { console.error('ERRO: a rota /diag/checagem-final nao existe.'); process.exit(1); }
let d = 0, j = iR + MARCA.length - 1;
for (; j < SRC.length; j++) {
  if (SRC[j] === '{') d++;
  else if (SRC[j] === '}') { d--; if (!d) break; }
}
const CORPO = SRC.slice(iR + MARCA.length, j);

// Uma corrida do banco de mentira. `min` = minutos daqui a quanto ela larga.
function corrida(o) {
  const mAgora = agoraMinutosBrt();
  const alvo = mAgora + o.min;
  // horaUkParaMinutosBrt faz UK->BRT; aqui vamos ao contrario pra montar a hora
  // UK que resulta no minuto BRT que o cenario quer.
  let hUk = Math.floor(((alvo % 1440) + 1440) % 1440 / 60) + 4;
  if (hUk >= 24) hUk -= 24;
  // A volta do "1-9 = PM" do horaUkParaMinutosBrt. So vale de 13 a 21, que sao
  // as horas que ele mapeia; 22, 23, 0 e 10-12 ele le direto.
  //
  // ESTE BUG ERA MEU, e no proprio teste: eu subtraia 12 de QUALQUER hora >= 13,
  // entao 22h UK virava "10" e voltava como 6h BRT. So aparecia em certos
  // horarios do dia — o teste passou de sorte quando eu o escrevi a tarde.
  // Dai o round-trip obrigatorio logo abaixo: um helper que converte tem que
  // provar que converteu.
  if (hUk >= 13 && hUk <= 21) hUk -= 12;
  const hora = hUk + ':' + String(((alvo % 1440) + 1440) % 1440 % 60).padStart(2, '0');
  const volta = horaUkParaMinutosBrt(hora);
  if (volta !== ((alvo % 1440) + 1440) % 1440) {
    console.error('ERRO no proprio teste: "' + hora + '" volta como ' + volta
      + ' e o cenario pediu ' + (((alvo % 1440) + 1440) % 1440));
    process.exit(1);
  }
  return Object.assign({
    id: o.id, hora: hora, hora_br: null, corrida: o.corrida || ('Pista A' + o.id),
    nivel: 'media', tier: 'TOP',
    race_card: JSON.stringify((o.traps || [1, 2, 3, 4, 5, 6]).map(t => ({ trap: t, nome: 'G' + t }))),
    final_check_status: o.status || null, final_check_at: o.at || null,
    finishing_order_json: null
  }, o.extra || {});
}

function rodar(linhas, audit) {
  let saida = null;
  const db = {
    prepare: function (sql) {
      return {
        get: function () { return { final_check_min_antes: 15 }; },
        all: function () {
          if (/race_audit_log/.test(sql)) return audit || [];
          return linhas;
        }
      };
    }
  };
  const ctx = {
    console: console, JSON: JSON, Object: Object, String: String, Number: Number,
    Array: Array, Math: Math, isNaN: isNaN, parseInt: parseInt,
    getTodayDate: function () { return '2026-09-16'; },
    require: function (p) {
      if (/db\/database/.test(p)) return { db: db };
      if (/cardMonitorRobot/.test(p)) return { horaUkParaMinutosBrt, agoraMinutosBrt };
      return require(p);
    },
    req: { query: {}, user: { role: 'admin' } },
    res: { json: function (o) { saida = o; }, status: function () { return { json: function (o) { saida = { erro: o }; } }; } }
  };
  vm.createContext(ctx);
  vm.runInContext('(function(req,res){' + CORPO + '})(req,res)', ctx);
  return saida;
}

// ── [1] o caso do Bruno ─────────────────────────────────────────────────────
// Valley A6: card com os SEIS galgos gravados, a trap 1 saiu na vida real, e a
// corrida ja passou da janela sem ter sido conferida.
bloco('[1] O CASO QUE ORIGINOU A ROTA');

let r = rodar([corrida({ id: 1, corrida: 'Vlley A6', min: -30 })]);
t('a rota responde', !!r && !r.erro);
t('a corrida entra como FURO: janela passou e final_check_status continua nulo',
  r.resumo.NUNCA_CONFERIDAS === 1 && r.lista[0].furo === true);
t('e aparece na lista nunca_conferidas, com hora e corrida',
  r.nunca_conferidas.length === 1 && r.nunca_conferidas[0].corrida === 'Vlley A6');
t('o card gravado tem 6 galgos e NENHUMA box vazia — por isso a tela nao avisou',
  r.lista[0].galgos_no_card === 6 && r.lista[0].boxes_vazias.length === 0);
t('a janela e mostrada em BRT, pra dar pra cruzar com o log do robo',
  /^\d{2}:\d{2} - \d{2}:\d{2}$/.test(r.lista[0].janela_brt));

// ── [2] a definicao de FURO ─────────────────────────────────────────────────
// Frouxa demais vira ruido; apertada demais esconde o buraco.
bloco('[2] O QUE E E O QUE NAO E FURO');

r = rodar([corrida({ id: 2, min: 40 })]);
t('corrida cuja janela AINDA NAO chegou nao e furo',
  r.lista[0].furo === false && r.resumo.janela_ainda_por_vir === 1);

r = rodar([corrida({ id: 3, min: -30, status: 'ok', at: '2026-09-16 11:47:00' })]);
t('corrida ja conferida nao e furo', r.lista[0].furo === false && r.resumo.card_intacto === 1);

r = rodar([corrida({ id: 4, min: -30, extra: { nivel: 'skip' } })]);
t('corrida skip nao e furo — ela nunca entra no SELECT do robo, e regra e nao falha',
  r.lista[0].furo === false && r.lista[0].elegivel === false && r.resumo.skip_fora_da_regra === 1);

r = rodar([corrida({ id: 5, min: -30, status: 'refeita', at: '2026-09-16 11:47:00' })]);
t('corrida refeita conta como conferida, nao como furo',
  r.lista[0].furo === false && r.resumo.refeitas === 1);

// DENTRO da janela agora: ainda da tempo, entao nao e furo.
r = rodar([corrida({ id: 6, min: 10 })]);
t('corrida DENTRO da janela agora nao e furo (ainda da tempo)', r.lista[0].furo === false);

// ── [3] as boxes vazias ─────────────────────────────────────────────────────
// Sai do race_card GRAVADO — a mesma fonte da nota na tela Analisar. Se a rota
// lesse de outro lugar, ela poderia dizer "tem box vazia" numa corrida em que a
// tela nao tinha como avisar, e o diagnostico apontaria pro lugar errado.
bloco('[3] BOX VAZIA SAI DO race_card GRAVADO');

r = rodar([corrida({ id: 7, min: -30, traps: [2, 3, 4, 5, 6] })]);
t('card de 5 galgos sem a trap 1 acusa box 1 vazia',
  r.lista[0].boxes_vazias.length === 1 && r.lista[0].boxes_vazias[0] === 1);
t('e entra no resumo com_box_vazia_no_card', r.resumo.com_box_vazia_no_card === 1);
t('com a corrida listada em com_box_vazia', r.com_box_vazia[0].boxes_vazias[0] === 1);

r = rodar([corrida({ id: 8, min: -30, traps: [1, 3, 5] })]);
t('varias vazias saem todas, em ordem',
  JSON.stringify(r.lista[0].boxes_vazias) === JSON.stringify([2, 4, 6]));

// ESTA ASSERCAO MUDOU EM 16/09/2026, e a mudanca e o ponto.
// Ela dizia: 'card ausente nao estoura e nao inventa: 0 galgos, 6 boxes
// "vazias"'. Ou seja, ela descrevia — e protegia — exatamente o defeito: a rota
// tratava ausencia de card como seis boxes vazias, e o resumo do dia 16/09 deu
// 55 corridas "com box vazia" quando as reais eram 25. Trinta delas eram
// corridas sem card nenhum. Numa rota de diagnostico isso e pior que nao ter
// rota: ela aponta pro lugar errado com cara de numero.
r = rodar([corrida({ id: 9, min: -30, extra: { race_card: null } })]);
t('card ausente nao estoura', r.lista[0].galgos_no_card === 0);
t('e NAO inventa seis boxes vazias: sem card, boxes_vazias e NULO ("nao sei")',
  r.lista[0].boxes_vazias === null && r.lista[0].sem_card === true);
t('nao entra em com_box_vazia_no_card', r.resumo.com_box_vazia_no_card === 0);
t('e sim no contador proprio, sem_card_gravado', r.resumo.sem_card_gravado === 1);
t('a lista com_box_vazia fica vazia', r.com_box_vazia.length === 0);

// A outra ponta: card gravado COM os seis galgos e "conferi e nao falta
// ninguem" — lista vazia, nao nulo. Sem esta distincao os dois casos voltam a
// virar a mesma coisa na leitura.
r = rodar([corrida({ id: 12, min: -30 })]);
t('card completo: boxes_vazias e [] e sem_card e false',
  Array.isArray(r.lista[0].boxes_vazias) && r.lista[0].boxes_vazias.length === 0
  && r.lista[0].sem_card === false);
t('e ele nao conta como sem card', r.resumo.sem_card_gravado === 0);

// Os dois juntos, que e o cenario real do dia.
r = rodar([
  corrida({ id: 13, min: -30, traps: [2, 3, 4, 5, 6] }),
  corrida({ id: 14, min: -30, extra: { race_card: null } })
]);
t('misturados, cada um cai no seu contador',
  r.resumo.com_box_vazia_no_card === 1 && r.resumo.sem_card_gravado === 1);

// ── [4] a janela usa a MESMA conta do robo ──────────────────────────────────
bloco('[4] A JANELA E A DO ROBO, NAO UMA COPIA');

t('a rota importa as funcoes do cardMonitorRobot em vez de reimplementar',
  /require\('\.\/cardMonitorRobot'\)[\s\S]{0,120}?horaUkParaMinutosBrt/.test(SRC)
  || /horaUkParaMinutosBrt, agoraMinutosBrt \} = require\('\.\/cardMonitorRobot'\)/.test(SRC));
t('e nao existe um horaUkParaMinutosBrt proprio dentro da rota',
  !/\/diag\/checagem-final[\s\S]{0,4000}?function horaUkParaMinutosBrt/.test(SRC));

// A regra do robo: faltam <= minAntes && faltam >= minAntes-10. Com minAntes 15,
// a janela e de 15 a 5 minutos antes. Conferindo pelas bordas:
r = rodar([corrida({ id: 10, min: 16 })]);
t('16 min antes: janela ainda nao abriu', r.lista[0].janela_passou === false && r.lista[0].furo === false);
r = rodar([corrida({ id: 11, min: 4 })]);
t('4 min antes: janela ja fechou -> vira furo se nao foi conferida', r.lista[0].furo === true);

// ── [5] o resumo fecha ──────────────────────────────────────────────────────
bloco('[5] O RESUMO BATE COM A LISTA');

r = rodar([
  corrida({ id: 12, min: -30 }),                                     // furo
  corrida({ id: 13, min: -30, status: 'ok', at: 'x' }),              // ok
  corrida({ id: 14, min: 40 }),                                      // por vir
  corrida({ id: 15, min: -30, extra: { nivel: 'skip' } })            // fora da regra
], [{ race_id: 13, n: 2 }]);
t('corridas: 4', r.resumo.corridas === 4);
t('elegiveis: 3 (o skip sai)', r.resumo.elegiveis === 3);
t('conferidas: 1', r.resumo.conferidas === 1);
t('nunca conferidas: 1', r.resumo.NUNCA_CONFERIDAS === 1);
t('janela ainda por vir: 1', r.resumo.janela_ainda_por_vir === 1);
t('e a soma fecha: conferidas + furos + por vir = elegiveis',
  r.resumo.conferidas + r.resumo.NUNCA_CONFERIDAS + r.resumo.janela_ainda_por_vir === r.resumo.elegiveis);
t('o race_audit_log e cruzado: a corrida reescrita mostra a contagem',
  r.lista.find(x => x.race_id === 13).reescrita_pelo_robo === 2);
t('e quem o robo nao tocou fica em zero',
  r.lista.find(x => x.race_id === 12).reescrita_pelo_robo === 0);

// ── [6] so-leitura ──────────────────────────────────────────────────────────
bloco('[6] A ROTA NAO GRAVA NADA');

const trecho = SRC.slice(iR, j);
t('nenhum UPDATE, INSERT ou DELETE no corpo da rota',
  !/\b(UPDATE|INSERT|DELETE)\b/i.test(trecho));
t('e ela e admin', /\/diag\/checagem-final', requireAdmin/.test(SRC));
t('a legenda avisa que "conferida" e um retrato do momento da checagem',
  /UMA VEZ SO/.test(SRC.slice(iR, j)));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
