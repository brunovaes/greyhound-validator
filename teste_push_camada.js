'use strict';
// teste_push_camada.js — O PUSH AVISA POR CAMADA (Bruno, 16/09/2026)
//
// De onde veio: "Queria alterar para chegar no celular as entradas que vem da
// BW: TOP, HIGH e GOOD... Vir com o horario e cachorrinho como no 1o anexo (o
// avb nao precisa, pois se tiver mais de um eu escolherei na hora)".
//
// O QUE MUDOU: antes o push disparava por HORARIO — toda corrida do dia com
// trap_fav, X minutos antes da largada. O criterio era "a corrida vai largar",
// nao "da pra apostar nela". Agora quem decide e a CAMADA, e o aviso sai no
// momento em que ela aparece.
//
// O QUE ESTE TESTE PROTEGE:
//   1) que o titulo perdeu o AvB e ficou com hora + cachorrinho.
//   2) que OPORTUNIDADE nao avisa. E o par que a BW ainda NAO abriu: avisar
//      seria chamar o Bruno pra uma tela onde nao ha o que fazer.
//   3) que avisa UMA vez por corrida, avisa DE NOVO se ela subir de camada, e
//      fica calado se ela descer.
//   4) que corrida que ja largou nao avisa, pelos DOIS caminhos (chegada
//      gravada e relogio).
//   5) que a camada NAO e recalculada aqui — vem do baseDoDia do api.js, a
//      mesma conta da tela. Duas reguas divergem em silencio.
//
//   node teste_push_camada.js

const fs = require('fs');
const path = require('path');

const SRC_AG = fs.readFileSync(path.join(__dirname, 'src', 'push', 'agendador.js'), 'utf8');
const SRC_SD = fs.readFileSync(path.join(__dirname, 'src', 'push', 'sender.js'), 'utf8');
const SRC_API = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'api.js'), 'utf8');

// O hook do require entra ANTES de carregar o codigo de producao: o store.js
// abre o banco no proprio carregamento, e este teste nao sobe banco nenhum.
// Trocar o modulo depois de carregado seria tarde demais.
const Module = require('module');
const origLoad = Module._load;

let enviados = [];
let baseFake = [];
let cfgFake = { alarme_filtro_ativo: 1 };
let inscritos = [{ user_id: 1, endpoint: 'x' }];

const storeFake = {
  listarTodas: () => inscritos,
  listarPorUsuario: () => inscritos,
  remover: () => {}
};

Module._load = function (req) {
  if (req === '../routes/api') return { baseDoDia: () => baseFake };
  if (req === '../db/database') return { getUserConfig: () => cfgFake, db: null };
  if (req === './store') return storeFake;
  return origLoad.apply(this, arguments);
};

const sender = require('./src/push/sender');
const ag = require('./src/push/agendador');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [1] o titulo ────────────────────────────────────────────────────────────
bloco('[1] O TITULO: HORA + CACHORRINHO, SEM O AvB');

const p = sender.montarPayloadCorrida({
  horaBr: '9:01', pista: 'Mulgr', classe: 'A7', minutos: 0
}, { negrito: false });

t('o titulo leva a bandeirinha e a hora', p.titulo.indexOf('9:01') >= 0 && p.titulo.indexOf('🏁') === 0);
t('e termina no cachorrinho', /🐕$/.test(p.titulo));
t('o par NAO aparece mais', !/\d+v\d+/.test(p.titulo));
t('o corpo continua com pista e minutos', p.corpo === '📍 Mulgr A7 ⏰ 0 min');

// Mesmo mandando o par (chamador antigo), ele nao pode vazar pro titulo.
const pv = sender.montarPayloadCorrida({
  horaBr: '9:01', pista: 'Mulgr', classe: 'A7', minutos: 0, trapFav: 6, trapUnd: 3
}, { negrito: false });
t('chamador que ainda manda trapFav/trapUnd nao reintroduz o par', !/6v3/.test(pv.titulo));

const pb = sender.montarPayloadCorrida({ horaBr: '9:01', pista: 'Mulgr', classe: 'A7', minutos: 0 }, { negrito: true });
t('com negrito, a hora vira glifo — e o botao de teste continua tendo o que comparar',
  pb.titulo !== p.titulo);

t('sem hora, nao estoura: cai no tracinho', /--:--/.test(
  sender.montarPayloadCorrida({ pista: 'X', classe: 'A1' }, {}).titulo));

// ── [2] qual camada a corrida alcancou ──────────────────────────────────────
bloco('[2] A CAMADA DA CORRIDA E A MAIS FORTE DOS PARES ABERTOS');

const c = (camadas) => ({ confrontos: camadas.map(x => ({ camada: x })) });

t('so OPORTUNIDADE nao vale nada — a BW nao abriu',
  ag.camadaDaCorrida(c(['OPORTUNIDADE', 'OPORTUNIDADE'])) === null);
t('corrida sem confronto nenhum idem', ag.camadaDaCorrida({ confrontos: [] }) === null);
t('corrida sem o campo confrontos nao estoura', ag.camadaDaCorrida({}) === null);
t('um GOOD vale GOOD', ag.camadaDaCorrida(c(['GOOD'])) === 'GOOD');
t('GOOD + TOP vale TOP — a melhor manda', ag.camadaDaCorrida(c(['GOOD', 'TOP'])) === 'TOP');
t('a ordem nao importa', ag.camadaDaCorrida(c(['TOP', 'GOOD'])) === 'TOP');
t('HIGH ganha de GOOD', ag.camadaDaCorrida(c(['GOOD', 'HIGH'])) === 'HIGH');
t('TOP ganha de HIGH', ag.camadaDaCorrida(c(['HIGH', 'TOP'])) === 'TOP');
t('OPORTUNIDADE no meio nao atrapalha', ag.camadaDaCorrida(c(['OPORTUNIDADE', 'HIGH'])) === 'HIGH');
t('camada desconhecida e ignorada, nao vira aviso', ag.camadaDaCorrida(c(['SURPRESA'])) === null);

t('a forca e TOP > HIGH > GOOD', ag.FORCA.TOP > ag.FORCA.HIGH && ag.FORCA.HIGH > ag.FORCA.GOOD);
t('e OPORTUNIDADE nem esta na tabela', ag.FORCA.OPORTUNIDADE === undefined);

// ── [3] o ciclo de verdade ──────────────────────────────────────────────────
// Roda o ciclo() REAL, com o api.js, o banco e o sender trocados por dublês.
// Assim o que esta sendo medido e a decisao do agendador, nao um resumo dela.
bloco('[3] O CICLO: QUEM AVISA, QUANTAS VEZES');

// Congela o relogio: teste que depende da hora em que roda passa de manha e
// falha a tarde. Foi exatamente o defeito que me pegou no teste do diag.
const AGORA = Date.UTC(2026, 8, 16, 12, 0, 0);   // 09:00 BRT
const realNow = Date.now;
Date.now = () => AGORA;

// hora UK -> a corrida de hora_br '09:30' larga em 30 min.
function corrida(o) {
  return Object.assign({
    race_id: 1, hora: '13:30', hora_br: '09:30', corrida: 'Mulgr A7',
    pista: 'Mulgr', dist: 480, ja_correu: false,
    confrontos: [{ camada: 'TOP' }]
  }, o || {});
}

// O sender ja esta carregado: aqui so se troca o que ele FAZ, nao o que ele e.
sender.disponivel = () => true;
sender.enviarParaUsuario = async (userId, payload) => {
  enviados.push({ userId, payload }); return { enviados: 1, total: 1 };
};

async function ciclo() { enviados = []; await ag.ciclo(); return enviados; }

(async function () {
  baseFake = [corrida()];
  let e = await ciclo();
  t('corrida em TOP avisa', e.length === 1);
  t('com a hora no titulo e a pista no corpo',
    e[0].payload.corpo === '📍 Mulgr A7 ⏰ 30 min');

  // O MESMO agendador, rodando de novo: nao pode repetir.
  e = await ciclo();
  t('o ciclo seguinte NAO repete a mesma corrida', e.length === 0);

  // Sobe de camada: e outra decisao, avisa de novo.
  baseFake = [corrida({ confrontos: [{ camada: 'TOP' }] })];
  e = await ciclo();
  t('continuar em TOP tambem nao repete', e.length === 0);

  baseFake = [corrida({ race_id: 2, confrontos: [{ camada: 'GOOD' }] })];
  e = await ciclo();
  t('outra corrida, em GOOD, avisa', e.length === 1);
  baseFake = [corrida({ race_id: 2, confrontos: [{ camada: 'TOP' }] })];
  e = await ciclo();
  t('a MESMA corrida subindo de GOOD pra TOP avisa de novo', e.length === 1);
  baseFake = [corrida({ race_id: 2, confrontos: [{ camada: 'GOOD' }] })];
  e = await ciclo();
  t('e descendo de TOP pra GOOD fica calada — voce ja sabe dela', e.length === 0);

  // OPORTUNIDADE nunca avisa.
  baseFake = [corrida({ race_id: 3, confrontos: [{ camada: 'OPORTUNIDADE' }] })];
  e = await ciclo();
  t('OPORTUNIDADE nao avisa: a BW ainda nao abriu esse par', e.length === 0);

  // Corrida que ja largou, pelos dois caminhos.
  baseFake = [corrida({ race_id: 4, ja_correu: true })];
  e = await ciclo();
  t('corrida com chegada gravada nao avisa', e.length === 0);

  baseFake = [corrida({ race_id: 5, hora: '11:30', hora_br: '07:30' })];
  e = await ciclo();
  t('corrida que largou ha uma hora nao avisa (o relogio pega antes da chegada)',
    e.length === 0);

  // O filtro do usuario continua valendo POR CIMA da camada.
  cfgFake = { alarme_filtro_ativo: 1, alarme_filtro_pistas: 'Kinsley' };
  baseFake = [corrida({ race_id: 6 })];
  e = await ciclo();
  t('pista fora do filtro do usuario nao avisa, mesmo sendo TOP', e.length === 0);

  cfgFake = { alarme_filtro_ativo: 0 };
  baseFake = [corrida({ race_id: 7 })];
  e = await ciclo();
  t('usuario com o alarme desligado nao recebe nada', e.length === 0);

  cfgFake = { alarme_filtro_ativo: 1 };

  // Se a base falhar, o ciclo nao pode derrubar o processo nem inventar aviso.
  Module._load = function (req) {
    if (req === '../routes/api') return { baseDoDia: () => { throw new Error('banco fora'); } };
    if (req === '../db/database') return { getUserConfig: () => cfgFake, db: null };
    if (req === './store') return storeFake;
    return origLoad.apply(this, arguments);
  };
  baseFake = [corrida({ race_id: 8 })];
  e = await ciclo();
  t('baseDoDia quebrada nao derruba o ciclo e nao inventa aviso', e.length === 0);

  Module._load = origLoad;
  Date.now = realNow;

  // ── [4] uma regua so ──────────────────────────────────────────────────────
  bloco('[4] A CAMADA NAO E RECALCULADA AQUI');

  t('o agendador pede a base pro api.js', /require\('\.\.\/routes\/api'\)/.test(SRC_AG));
  t('e o api.js exporta o baseDoDia', /module\.exports\.baseDoDia = baseDoDia/.test(SRC_API));
  t('o agendador NAO monta SELECT de corrida nenhum',
    !/FROM races/i.test(SRC_AG));
  t('nem reimplementa a regua de camadas',
    !/confrontosDaCorrida/.test(SRC_AG));
  t('e o /painel-dia passou a ler da MESMA funcao',
    /const corridasBase = baseDoDia\(date\)/.test(SRC_API));
  t('so existe UM lugar montando a base', (SRC_API.match(/function baseDoDia\(/g) || []).length === 1);

  // O criterio velho tem que ter saido de verdade, nao ficado dormindo.
  t('o disparo por antecedencia saiu do agendador', !/alerta_min_antes/.test(SRC_AG));
  t('e o SELECT proprio tambem', !/corridasDeHoje/.test(SRC_AG));

  // ── [5] o par saiu do sender de verdade ───────────────────────────────────
  bloco('[5] O PAR SAIU DO PAYLOAD, NAO SO DA TELA');

  t('o sender nao monta mais o texto do par', !/'v' \+/.test(SRC_SD));
  t('o negrito continua existindo pro botao de teste', /function emNegrito/.test(SRC_SD));
  t('e continua exportado', /emNegrito \};/.test(SRC_SD));

  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  Date.now = realNow;
  console.error('\nERRO: ' + (e && e.stack || e) + '\n');
  process.exit(1);
});
