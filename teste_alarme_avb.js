// TESTE: alarme de AvB (motor BW) — Bruno, 10/09/2026
//
// Cobre a entrega que: (1) matou o sino de proximidade que tocava em toda
// corrida, 3 min antes, em todas as telas menos a Analisar; (2) trocou as duas
// secoes de alarme da tela de Configuracoes por uma so, por camada; (3) fez o
// alarme repicar de 1 em 1 minuto ate a largada, com teto.
//
// O bloco [3] RODA o painelDia.js num DOM de mentira e mexe no relogio: e' a
// unica forma de provar que o teto de repiques segura de verdade. Um teste que
// so lesse o fonte nao pegaria um contador incrementado no lugar errado.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const P = f => path.join(__dirname, f);
const SRC_PAINEL = fs.readFileSync(P('public/js/painelDia.js'), 'utf8');
const SRC_GLOBAL = fs.readFileSync(P('public/js/alertaGlobal.js'), 'utf8');
const SRC_CFG = fs.readFileSync(P('src/routes/config.js'), 'utf8');
const SRC_API = fs.readFileSync(P('src/routes/api.js'), 'utf8');
const SRC_DB = fs.readFileSync(P('src/db/database.js'), 'utf8');
const SRC_MAIN = fs.readFileSync(P('src/routes/main.js'), 'utf8');
const SRC_APP = fs.readFileSync(P('src/app.js'), 'utf8');

let ok = 0, fail = 0;
function t(nome, cond) {
  if (cond) { ok++; console.log('  OK    | ' + nome); }
  else { fail++; console.log('  FALHA | ' + nome); }
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [1] O SINO DE PROXIMIDADE MORREU ───────────────────────────────────────
bloco('[1] O ALARME QUE TOCAVA EM TODA CORRIDA NAO EXISTE MAIS');

t('o alertaGlobal nao chama mais avisar() no ciclo',
  !/avisar\(r, matchAlarme\(r\)\)/.test(SRC_GLOBAL));
t('e nao varre mais as corridas pelo relogio', !/races\.forEach/.test(SRC_GLOBAL));
t('o app.js corta o alarme de filtro na raiz',
  /function matchAlarmeFiltro\(r\)\{[\s\S]{0,900}?\n  return false;/.test(SRC_APP));
t('o corpo antigo do matchAlarmeFiltro foi mantido (o push ainda espelha a regra)',
  /ALARME_FILTRO\.pistas\.length/.test(SRC_APP));

// ── [2] A TELA DE CONFIGURACOES ────────────────────────────────────────────
bloco('[2] UMA SECAO DE ALARME, POR CAMADA');

t('a secao "Alarme para filtro selecionado" saiu', SRC_CFG.indexOf('Alarme para filtro selecionado') < 0);
t('a secao "Alarme TOP" saiu (era configuracao morta: nada no runtime a lia)',
  SRC_CFG.indexOf('<div class="sec-title">Alarme TOP</div>') < 0);
t('entrou "Alarme de AvB (motor BW)"', SRC_CFG.indexOf('Alarme de AvB (motor BW)') >= 0);
['top', 'high', 'good'].forEach(function (k) {
  t('a camada ' + k.toUpperCase() + ' tem som, cor e liga/desliga',
    SRC_CFG.indexOf("'avb_'+C.k+'_som'") >= 0 && SRC_CFG.indexOf("avb_" + k + "_") >= 0);
});
t('tem o campo de repetir de 1 em 1 minuto', /name="avb_alarme_repetir"/.test(SRC_CFG));
t('tem o teto de repeticoes, limitado a 5', /name="avb_alarme_vezes" min="1" max="5"/.test(SRC_CFG));
t('o UPDATE grava as 12 colunas novas',
  /avb_alarme_ativo=\?,avb_alarme_repetir=\?,avb_alarme_vezes=\?/.test(SRC_CFG)
  && /avb_top_ativo=\?,avb_top_som=\?,avb_top_cor=\?/.test(SRC_CFG)
  && /avb_high_ativo=\?,avb_high_som=\?,avb_high_cor=\?/.test(SRC_CFG)
  && /avb_good_ativo=\?,avb_good_som=\?,avb_good_cor=\?/.test(SRC_CFG));
t('o checkbox desmarcado nao ressuscita o valor antigo (_liga trata o par hidden+checkbox)',
  /const _liga = function \(v, padrao\)/.test(SRC_CFG));

t('as 12 colunas existem na migracao', ['avb_alarme_ativo', 'avb_alarme_repetir', 'avb_alarme_vezes',
  'avb_top_ativo', 'avb_top_som', 'avb_top_cor', 'avb_high_ativo', 'avb_high_som', 'avb_high_cor',
  'avb_good_ativo', 'avb_good_som', 'avb_good_cor'].every(function (c) {
    return SRC_DB.indexOf('ADD COLUMN ' + c + ' ') >= 0;
  }));
t('as colunas antigas NAO foram derrubadas (em SQLite isso e destrutivo)',
  SRC_DB.indexOf('alarme_filtro_ativo') >= 0 && SRC_DB.indexOf('alarme_top_ativo') >= 0
  && !/DROP COLUMN/i.test(SRC_DB));
t('o /api/config entrega os campos novos (campo nao listado nunca chega na tela)',
  /avb_top_som: config\.avb_top_som \|\| 'alarme'/.test(SRC_API)
  && /avb_alarme_vezes: config\.avb_alarme_vezes/.test(SRC_API));
t('o selo de AvB existe na barra de navegacao', /id="avb-badge"/.test(SRC_MAIN));
t('e o alertaGlobal e quem o acende, em todas as telas', /function selosDeAvb/.test(SRC_GLOBAL));

// ── [3] O REPIQUE, RODANDO ─────────────────────────────────────────────────
bloco('[3] REPIQUE DE 1 EM 1 MINUTO, COM TETO (executado)');

// Carrega o painelDia.js num contexto de mentira. Ele so precisa de um `glob`
// com fetch/BASE e de document.hidden; o resto e' puro.
function carregaPainel(cfg, confrontosDaVez, agoraHoraBr) {
  const tocados = [];
  const ctx = {
    console: console,
    document: { hidden: false },
    localStorage: {
      _d: {},
      getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; }
    },
    fetch: function () { return Promise.resolve({ ok: false }); },
    setInterval: function () { return 0; },
    clearInterval: function () {},
    setTimeout: function () { return 0; },
    Date: Date
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.BASE = '/greyhound';
  ctx.playSom = function (s) { tocados.push(s); };
  vm.createContext(ctx);
  vm.runInContext(SRC_PAINEL, ctx);
  const PD = ctx.PainelDia;
  PD.aplicarConfig(cfg);
  // Injeta o payload direto no estado, via o mesmo caminho que a tela usa.
  ctx.__payload = { corridas: confrontosDaVez };
  vm.runInContext('PainelDia.__setDados && PainelDia.__setDados(__payload);', ctx);
  return { PD: PD, tocados: tocados, ctx: ctx };
}

// O modulo nao expoe um setter de dados; em vez de inventar um, montamos o
// payload pelo assinar/buscar seria assincrono. Mais honesto: testar a funcao
// de janela e o teto pela API publica que existe — config() e repique() — com o
// estado alimentado por um fetch de mentira.
function comPayload(cfg, corridas) {
  const tocados = [];
  const ctx = {
    console: console,
    document: { hidden: false },
    localStorage: {
      _d: {}, getItem: function (k) { return this._d[k] || null; },
      setItem: function (k, v) { this._d[k] = String(v); }, removeItem: function (k) { delete this._d[k]; }
    },
    setInterval: function () { return 0; }, clearInterval: function () {},
    setTimeout: function (fn) { return 0; }, Date: Date
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.BASE = '/greyhound';
  ctx.playSom = function (s) { tocados.push(s); };
  ctx.fetch = function (url) {
    if (String(url).indexOf('/api/config') >= 0) {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(cfg); } });
    }
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ corridas: corridas }); } });
  };
  vm.createContext(ctx);
  vm.runInContext(SRC_PAINEL, ctx);
  return { PD: ctx.PainelDia, tocados: tocados };
}

// hora_br daqui a N minutos, no relogio de quem roda o teste
function daquiA(min) {
  const d = new Date(Date.now() + min * 60000);
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}
function corrida(camada, min, extra) {
  return Object.assign({
    race_id: 1, hora: '3:13', hora_br: daquiA(min), corrida: 'Towc A6',
    ja_correu: false, expirado: false, entrada: null,
    confrontos: [{ id: 'c1', camada: camada, aguardando_entrada: true }]
  }, extra || {});
}

const CFG_PADRAO = {
  avb_alarme_ativo: 1, avb_alarme_repetir: 1, avb_alarme_vezes: 3,
  avb_top_ativo: 1, avb_top_som: 'alarme', avb_top_cor: '#3b82f6',
  avb_high_ativo: 1, avb_high_som: 'alarme', avb_high_cor: '#f97316',
  avb_good_ativo: 1, avb_good_som: 'alarme', avb_good_cor: '#8b5cf6'
};

async function cena(cfg, corridas, quantosRepiques) {
  const h = comPayload(cfg, corridas);
  h.PD.aplicarConfig(cfg);
  await h.PD.buscar();               // popula st.dados (1a volta: so registra)
  h.tocados.length = 0;              // ignora o toque da confirmacao nesta cena
  for (let i = 0; i < quantosRepiques; i++) h.PD.repique();
  return h;
}

(async function () {
  var c1 = await cena(CFG_PADRAO, [corrida('TOP', 3)], 5);
  t('repica no maximo o numero configurado (3), mesmo chamado 5 vezes', c1.tocados.length === 3);
  t('e toca o som configurado da camada', c1.tocados.every(function (s) { return s === 'alarme'; }));

  var c2 = await cena(Object.assign({}, CFG_PADRAO, { avb_alarme_vezes: 1 }), [corrida('TOP', 3)], 4);
  t('teto de 1 repete uma vez so', c2.tocados.length === 1);

  var c3 = await cena(Object.assign({}, CFG_PADRAO, { avb_alarme_repetir: 0 }), [corrida('TOP', 3)], 4);
  t('com "repetir" desligado nao repica nenhuma vez', c3.tocados.length === 0);

  var c4 = await cena(Object.assign({}, CFG_PADRAO, { avb_alarme_ativo: 0 }), [corrida('TOP', 3)], 4);
  t('com o alarme geral desligado nao toca nada', c4.tocados.length === 0);

  var c5 = await cena(CFG_PADRAO, [corrida('TOP', 12)], 3);
  t('fora da janela de 5 min nao repica (faltando 12 min)', c5.tocados.length === 0);

  var c6 = await cena(CFG_PADRAO, [corrida('TOP', -2)], 3);
  t('depois da largada tambem nao', c6.tocados.length === 0);

  var c7 = await cena(CFG_PADRAO, [corrida('TOP', 3, { entrada: { odd: 1.9 } })], 3);
  t('corrida ja apostada nao chama de volta', c7.tocados.length === 0);

  var c8 = await cena(CFG_PADRAO, [corrida('TOP', 3, { expirado: true })], 3);
  t('corrida expirada pelo servidor nao repica', c8.tocados.length === 0);

  var c9 = await cena(CFG_PADRAO, [corrida('OPORTUNIDADE', 3)], 3);
  t('OPORTUNIDADE nunca apita — e a fila de espera, nao uma confirmacao', c9.tocados.length === 0);

  var c10 = await cena(Object.assign({}, CFG_PADRAO, { avb_good_ativo: 0 }), [corrida('GOOD', 3)], 3);
  t('camada desligada na configuracao fica muda', c10.tocados.length === 0);

  var c11 = await cena(Object.assign({}, CFG_PADRAO, { avb_high_som: 'sino' }), [corrida('HIGH', 3)], 1);
  t('som por camada e respeitado (HIGH em sino)', c11.tocados.length === 1 && c11.tocados[0] === 'sino');

  // Dois AvBs na mesma janela: toca a camada mais forte, mas o teto e debitado
  // dos dois — senao o mais fraco apitaria sozinho depois, fora de hora.
  var duas = [corrida('GOOD', 3), Object.assign(corrida('TOP', 4), {
    race_id: 2, corrida: 'CPark A2', confrontos: [{ id: 'c2', camada: 'TOP', aguardando_entrada: true }]
  })];
  var c12 = await cena(CFG_PADRAO, duas, 6);
  t('com dois AvBs na janela, toca 3 vezes no total — nao 3 por AvB', c12.tocados.length === 3);
  t('e o som e o da camada mais forte (TOP)', c12.tocados.every(function (s) { return s === 'alarme'; }));

  var cfgCor = Object.assign({}, CFG_PADRAO, { avb_top_cor: '#00ff00' });
  var h = comPayload(cfgCor, []);
  h.PD.aplicarConfig(cfgCor);
  t('a cor configurada substitui a de fabrica no CAMADAS', h.PD.CAMADAS.TOP.cor === '#00ff00');
  t('e o OPORTUNIDADE continua sem som, aconteca o que acontecer',
    h.PD.CAMADAS.OPORTUNIDADE.som === null && h.PD.CAMADAS.OPORTUNIDADE.apita === false);

  // ── [4] O SELO E A TELA TEM QUE CONCORDAR ────────────────────────────────
  // Bruno, 11/09: o selo dizia "2 AvBs esperando · GOOD" e a Analisar nao
  // mostrava nada. A lista da Analisar saia de
  // results.filter(nivel!=='skip' && trapFav>0) — a regua da MANHA —, enquanto o
  // painel-dia (fonte do selo) nao tem esse filtro desde o "livre acesso" de
  // 09/09. Corrida que a BW abriu sem o motor ter previsto era cortada antes de
  // qualquer coisa, e o filtro de tier a cortava de novo logo depois.
  bloco('[4] A CORRIDA COM AvB ESPERANDO CHEGA NA LISTA DA ANALISAR');

  // O filtro da lista, extraido do fonte e EXECUTADO: se alguem reescrever a
  // linha no app.js, este teste passa a medir a linha nova.
  // Ancorado no _avbDaCorrida de proposito: existem outros
  // `var avbs = results.filter(...)` no app.js (autoSaveSession,
  // atualizarProximas) que continuam com a regra antiga porque nao montam a
  // TELA. Sem a ancora, o teste media a linha errada — foi o que aconteceu na
  // primeira tentativa.
  const RE_LISTA = /var avbs = results\.filter\((function\(r\)\{return \(r\.nivel!=='skip'&&r\.trapFav>0\)\|\|!!_avbDaCorrida\(r\);\})\);/;
  const mFiltro = SRC_APP.match(RE_LISTA);
  t('o filtro da lista foi encontrado no app.js', !!mFiltro);
  const nMontagens = (SRC_APP.match(new RegExp(RE_LISTA.source, 'g')) || []).length;
  t('as DUAS montagens da lista usam a mesma regra (refresh e enter)', nMontagens === 2);

  function filtroCom(temAvb) {
    const ctx = { _avbDaCorrida: function (r) { return temAvb(r) ? { camada: 'GOOD' } : null; } };
    vm.createContext(ctx);
    return vm.runInContext('(' + mFiltro[1] + ')', ctx);
  }
  const semAvbNenhum = filtroCom(function () { return false; });
  const comAvbNaSkip = filtroCom(function (r) { return r.nome === 'skip-com-avb'; });

  const RSKIP = { nome: 'skip-com-avb', nivel: 'skip', trapFav: 0 };
  const RNORMAL = { nome: 'normal', nivel: 'alta', trapFav: 3 };
  const RSKIP_SEM = { nome: 'skip-sem-avb', nivel: 'skip', trapFav: 0 };

  t('corrida pulada pelo motor, COM AvB da BW, entra na lista', comAvbNaSkip(RSKIP) === true);
  t('corrida normal continua entrando', semAvbNenhum(RNORMAL) === true);
  t('corrida pulada SEM AvB continua fora — a lista nao escancara',
    semAvbNenhum(RSKIP_SEM) === false && comAvbNaSkip(RSKIP_SEM) === false);
  t('corrida sem pick do motor (trapFav 0) tambem entra quando tem AvB',
    comAvbNaSkip({ nome: 'skip-com-avb', nivel: 'alta', trapFav: 0 }) === true);

  // O segundo portao: o filtro de regua da manha descartava tier null.
  const fnTier = (function () {
    const m = SRC_APP.match(/function passaNoFiltroTier\(r, sessaoClassificada\) \{[\s\S]*?\n\}/);
    return m ? m[0] : null;
  })();
  t('passaNoFiltroTier foi encontrado', !!fnTier);
  function tierCom(temAvb) {
    const ctx = { _avbDaCorrida: function (r) { return temAvb(r) ? { camada: 'GOOD' } : null; },
                  _tierDe: function (r) { return r.tier || null; } };
    vm.createContext(ctx);
    vm.runInContext(fnTier + '\nthis.f = passaNoFiltroTier;', ctx);
    return ctx.f;
  }
  const tierSem = tierCom(function () { return false; });
  const tierCom1 = tierCom(function (r) { return r.nome === 'bw'; });

  t('sessao classificada + tier null + AvB da BW -> PASSA (era o segundo corte)',
    tierCom1({ nome: 'bw', tier: null }, true) === true);
  t('sessao classificada + tier null + sem AvB -> continua barrada',
    tierSem({ nome: 'x', tier: null }, true) === false);
  t('sessao classificada + tier TOP -> passa como antes',
    tierSem({ nome: 'x', tier: 'TOP' }, true) === true);
  t('sessao nao classificada -> passa tudo, como antes',
    tierSem({ nome: 'x', tier: null }, false) === true);

  t('o shouldShowRace ja tinha a excecao — o corte era mais acima',
    /if \(_avbDaCorrida\(r\)\) return true;/.test(SRC_APP));

  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})();
