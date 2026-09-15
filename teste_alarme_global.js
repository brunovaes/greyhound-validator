'use strict';
// teste_alarme_global.js — O ALARME SONORO TOCA EM QUALQUER TELA
// (Bruno, 15/09/2026)
//
// Por que existe: ate hoje o som de camada saia SO na tela Analisar. Nas outras
// telas o alertaGlobal.js acendia o selo do menu e ficava mudo — estava escrito
// no proprio arquivo que o som entraria junto com o painelDia.js rodando em
// todas as telas. Bruno pediu o som: "quando tiver uma corrida TOP, HIGH e GOOD
// e eu estiver em qualquer outra tela, poderia tocar o alarme sonoro tb?".
//
// O QUE ESTE TESTE PROTEGE, em ordem de importancia:
//   1) que NAO nasceu um segundo alarme. Quem apita continua sendo o
//      painelDia.js — o mesmo modulo da Analisar. Duas implementacoes da mesma
//      regra e' a doenca recorrente deste projeto, e a divergencia entre elas so
//      apareceria com uma corrida prestes a largar.
//   2) que a Analisar NAO passou a apitar duas vezes (la o painelDia ja estava
//      carregado pela propria pagina).
//   3) que duas abas abertas nao sobrepoem o mesmo alarme.
//
// O bloco [2] nao le texto: CARREGA o painelDia.js de verdade, em duas "abas"
// (dois contextos de vm com sessionStorage proprio e localStorage compartilhado)
// e conta quantos sons sairam.
//
//   node teste_alarme_global.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PD = fs.readFileSync(path.join(__dirname, 'public', 'js', 'painelDia.js'), 'utf8');
const AG = fs.readFileSync(path.join(__dirname, 'public', 'js', 'alertaGlobal.js'), 'utf8');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [0] os dois arquivos continuam compilando ───────────────────────────────
bloco('[0] SINTAXE');
let e1 = null, e2 = null;
try { new vm.Script(PD, { filename: 'painelDia.js' }); } catch (e) { e1 = e; }
try { new vm.Script(AG, { filename: 'alertaGlobal.js' }); } catch (e) { e2 = e; }
t('painelDia.js compila', !e1);
t('alertaGlobal.js compila', !e2);
if (e1) console.log('        -> ' + e1.message);
if (e2) console.log('        -> ' + e2.message);

// ── [1] UM ALARME SO ────────────────────────────────────────────────────────
bloco('[1] O SOM VEM DO painelDia.js, NAO DE UMA COPIA NOVA');

t('o alertaGlobal carrega o painelDia.js em vez de reimplementar o alarme',
  /s\.src = BASE \+ '\/static\/js\/painelDia\.js'/.test(AG));
t('e o inicia pelo proprio modulo', /window\.PainelDia\.iniciar\(\{\}\)/.test(AG));

// A guarda que impede o alarme dobrado na Analisar. O ciclo() sai no
// souPassivo() ANTES de pedir o painelDia; la a pagina ja carrega o arquivo.
const posCiclo = AG.indexOf('async function ciclo()');
const trechoCiclo = AG.slice(posCiclo, posCiclo + 400);
t('o pedido do painelDia esta DENTRO do ciclo, depois do souPassivo',
  posCiclo > 0
  && trechoCiclo.indexOf('souPassivo()') > 0
  && trechoCiclo.indexOf('garantirPainelDia()') > trechoCiclo.indexOf('souPassivo()'));
t('e e pedido uma vez so (duas tags = dois pollings e dois alarmes)',
  /if \(_pdPedido\) return;\s*\n\s*_pdPedido = true;/.test(AG));
t('se o modulo ja estiver no ar, nao carrega de novo', /if \(window\.PainelDia\) \{ iniciarPainelDia\(\); return; \}/.test(AG));

t('nao sobrou nenhum toque proprio de camada no alertaGlobal',
  !/TOP[\s\S]{0,60}playSom|playSom\(\s*['"]alarme['"]\s*\)/.test(AG));

// ── [2] O SOM PRECISA TER COMO SAIR ─────────────────────────────────────────
bloco('[2] O painelDia PROCURA window.playSom — fora da Analisar ninguem definia');

t('o painelDia toca por tocarSomAlertaGlobal ou playSom',
  /glob\.tocarSomAlertaGlobal === 'function'/.test(PD) && /glob\.playSom === 'function'/.test(PD));
t('o alertaGlobal passa a exportar o playSom dele',
  /window\.playSom = playSom;/.test(AG));
t('COM GUARDA — na Analisar quem manda e o app.js, e sobrescrever trocaria o motor de audio de uma tela que funciona',
  /if \(typeof window\.playSom !== 'function'\) window\.playSom = playSom;/.test(AG));
t('e passa o proprio BASE pro painelDia (fora da Analisar nao ha `BASE` global garantido)',
  /window\.BASE_PAINEL = BASE;/.test(AG));
t('o painelDia le BASE_PAINEL antes de BASE', /glob\.BASE_PAINEL \|\| glob\.BASE/.test(PD));

// ── [3] O SELO NAO PODE FICAR CEGO ──────────────────────────────────────────
bloco('[3] SE O painelDia NAO SUBIR, O SELO SE VIRA SOZINHO');

t('falha ao carregar marca _pdFalhou em vez de estourar', /s\.onerror = function \(\) \{ _pdFalhou = true; \};/.test(AG));
t('e a busca propria do selo volta a valer nesse caso',
  /if \(window\.PainelDia && !_pdFalhou\) return;/.test(AG));
t('com o painel no ar, quem pinta e o assinar — uma busca em vez de duas',
  /window\.PainelDia\.assinar\(function \(d\) \{ pintarSelo\(d\); \}\)/.test(AG));

// ── [4] A TRAVA ENTRE ABAS, RODANDO ─────────────────────────────────────────
bloco('[4] DUAS ABAS ABERTAS NAO SOBREPOEM O MESMO ALARME');

function novoStore(mapa) {
  const m = mapa || {};
  return {
    _m: m,
    getItem: function (k) { return (k in m) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }
  };
}

// Payload do /api/painel-dia, na forma que o servidor devolve.
function payload(camada) {
  return {
    corridas: [{
      hora: '5:57', hora_br: '13:57', corrida: 'Monmr A7', pista: 'Monmr', dist: '480',
      race_id: 1, ja_correu: false, expirado: false, entrada: null,
      confrontos: [{
        id: 'monmr a7|5:57|1x2', par: 'T1xT2', camada: camada,
        aguardando_entrada: true, pick_trap: 1, outro_trap: 2
      }]
    }]
  };
}

// Uma "aba": contexto proprio, sessionStorage proprio, localStorage COMPARTILHADO.
function novaAba(ls) {
  const sons = [];
  const sandbox = {
    console: console,
    document: { hidden: false },
    sessionStorage: novoStore(),
    localStorage: ls,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    playSom: function (n) { sons.push(n); },
    _resposta: null
  };
  sandbox.fetch = function () {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(sandbox._resposta); } });
  };
  vm.createContext(sandbox);
  vm.runInContext('var window = globalThis;', sandbox);
  vm.runInContext(PD, sandbox, { filename: 'painelDia.js' });
  return {
    sons: sons,
    // Uma volta do polling com o payload dado.
    volta: function (d) {
      sandbox._resposta = d;
      sandbox.window.PainelDia._testeCarregarVistas
        ? sandbox.window.PainelDia._testeCarregarVistas() : null;
      return sandbox.window.PainelDia.buscar();
    },
    api: sandbox.window.PainelDia
  };
}

async function rodar() {
  // ── uma aba so: a promocao apita ──
  const ls1 = novoStore();
  const a = novaAba(ls1);
  await a.volta(payload('OPORTUNIDADE'));   // 1a volta da aba: so registra
  t('a primeira volta da aba nao apita (abrir a tela nao dispara o dia inteiro)', a.sons.length === 0);
  await a.volta(payload('TOP'));            // promocao
  t('a promocao pra TOP apita', a.sons.length === 1);
  t('e sai no som configurado pro TOP', a.sons[0] === 'alarme');
  await a.volta(payload('TOP'));            // ja estava TOP
  t('continuar em TOP nao reapita', a.sons.length === 1);

  // ── duas abas, o MESMO localStorage: a promocao apita UMA vez ──
  const ls2 = novoStore();
  const t1 = novaAba(ls2), t2 = novaAba(ls2);
  await t1.volta(payload('OPORTUNIDADE'));
  await t2.volta(payload('OPORTUNIDADE'));
  t('duas abas, primeira volta das duas: silencio', t1.sons.length === 0 && t2.sons.length === 0);
  await t1.volta(payload('TOP'));
  await t2.volta(payload('TOP'));
  t('a mesma promocao em duas abas sai UMA vez so (era o som dobrado)',
    (t1.sons.length + t2.sons.length) === 1);

  // ── sem localStorage a trava NAO pode calar o alarme ──
  const lsQuebrado = {
    getItem: function () { throw new Error('storage bloqueado'); },
    setItem: function () { throw new Error('storage bloqueado'); }
  };
  const c = novaAba(lsQuebrado);
  await c.volta(payload('OPORTUNIDADE'));
  await c.volta(payload('TOP'));
  t('storage bloqueado (janela anonima) ainda apita — mudo e pior que repetido',
    c.sons.length === 1);

  // ── o que NAO pode apitar continua nao apitando ──
  const d = novaAba(novoStore());
  await d.volta(payload('TOP'));
  await d.volta(payload('OPORTUNIDADE'));
  t('cair pra OPORTUNIDADE nao apita (e a lista de espera)', d.sons.length === 0);

  const e = novaAba(novoStore());
  const comAposta = payload('OPORTUNIDADE');
  await e.volta(comAposta);
  const promovido = payload('TOP');
  promovido.corridas[0].entrada = { aTrap: 1, bTrap: 2 };
  await e.volta(promovido);
  t('corrida ja apostada nao apita, nem promovendo', e.sons.length === 0);

  // ── [5] a janela da trava ──
  bloco('[5] A JANELA DA TRAVA');
  t('sao 20 segundos — o repique legitimo, de 60 em 60s, passa folgado',
    /var TRAVA_MS = 20000;/.test(PD));
  t('a trava e por CONFRONTO, nao global (dois AvBs diferentes podem apitar)',
    /function podeTocar\(id\) \{/.test(PD) && /if \(!id\) return true;/.test(PD));
  t('a promocao passa o id', /tocar\(camadaDe\(novas\[0\]\)\.som, novas\[0\]\.id\);/.test(PD));
  t('o repique tambem', /tocar\(camadaDe\(candidatos\[0\]\)\.som, candidatos\[0\]\.id\);/.test(PD));
  t('e a chave se limpa sozinha a cada leitura (nao cresce o dia inteiro)',
    /for \(var k in o\) \{ if \(!\(o\[k\] > agora\)\) delete o\[k\]; \}/.test(PD));

  // dois confrontos diferentes na mesma volta nao se travam
  const f = novaAba(novoStore());
  const dois = payload('OPORTUNIDADE');
  dois.corridas[0].confrontos.push({
    id: 'monmr a7|5:57|3x4', par: 'T3xT4', camada: 'OPORTUNIDADE',
    aguardando_entrada: true, pick_trap: 3, outro_trap: 4
  });
  await f.volta(dois);
  const doisTop = payload('TOP');
  doisTop.corridas[0].confrontos.push({
    id: 'monmr a7|5:57|3x4', par: 'T3xT4', camada: 'GOOD',
    aguardando_entrada: true, pick_trap: 3, outro_trap: 4
  });
  await f.volta(doisTop);
  t('duas promocoes na MESMA volta tocam uma vez, na camada mais forte',
    f.sons.length === 1 && f.sons[0] === 'alarme');

  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
}

rodar().catch(function (e) {
  console.error('\nERRO: ' + (e && e.stack || e) + '\n');
  process.exit(1);
});
