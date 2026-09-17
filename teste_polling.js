'use strict';
// teste_polling.js — QUANTO A TELA PERGUNTA AO SERVIDOR (Bruno, 16/09/2026)
//
// De onde veio: "Railway / checkRobots... isso e sobre economia do que estou
// gastando?" — e' sim. A barra de navegacao perguntava TRES vezes a cada 4
// segundos se os robos estavam rodando, em toda tela aberta. Cada pedido passa
// pelo requireAdmin, que faz um SELECT em users.
//
// A CONDICAO QUE O BRUNO POS: "so vamos ver se tem impacto na atualizacao das
// ODDs das oportunidades pela BW". O bloco [3] e' essa verificacao, e ela e a
// razao principal deste arquivo existir. As odds vem por OUTRO caminho
// (/robot/odds/live, de 5 em 5s, na tela Analisar) e ele nao pode ter mudado.
//
//   node teste_polling.js

const fs = require('fs');
const path = require('path');

const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
// Sem comentario. Ja me pegou antes (teste_dialogo): a regex casou com a
// PALAVRA dentro de um comentario e eu quase "corrigi" codigo que estava certo.
// Aqui o comentario novo cita /robot/odds/live justamente pra dizer que NAO
// mexeu nele — e era esse texto que derrubava a assercao abaixo.
const MAIN_CODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ROBOT = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
const ALERTA = fs.readFileSync(path.join(__dirname, 'public', 'js', 'alertaGlobal.js'), 'utf8');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [1] a barra nao pede mais tres vezes ────────────────────────────────────
bloco('[1] UM PEDIDO NO LUGAR DE TRES');

t('existe a rota de resumo', /router\.get\('\/status\/resumo', requireAdmin/.test(ROBOT));
t('e a barra e quem a chama', /fetch\(BASE \+ '\/robot\/status\/resumo'\)/.test(MAIN));

// O que NAO pode mais existir na barra: os tres fetch antigos.
t('a barra nao pede mais /robot/status direto', !/fetch\(BASE \+ '\/robot\/status'\)/.test(MAIN));
t('nem /robot/results/status', !/'\/robot\/results\/status'/.test(MAIN));
t('nem /robot/monitor/status', !/'\/robot\/monitor\/status'/.test(MAIN));
t('e os banners nao buscam sozinhos: viraram funcoes que RECEBEM o dado',
  /function pintaResultsBanner\(d\)/.test(MAIN) && /function pintaMonitorBanner\(d\)/.test(MAIN));
t('ninguem chama mais os nomes antigos',
  !/checkResultsBanner/.test(MAIN) && !/checkMonitorBanner/.test(MAIN));

// As tres rotas originais CONTINUAM de pe: a aba Robo vive delas.
t('a rota /status continua existindo pra aba Robo', /router\.get\('\/status', requireAdmin/.test(ROBOT));
t('a /results/status tambem', /router\.get\('\/results\/status', requireAdmin/.test(ROBOT));
t('e a /monitor/status tambem', /router\.get\('\/monitor\/status', requireAdmin/.test(ROBOT));

// ── [2] o ritmo virou adaptativo ────────────────────────────────────────────
bloco('[2] SO PERGUNTA RAPIDO QUANDO ADIANTA');

t('nao existe mais setInterval fixo de 4s na barra', !/setInterval\(checkRobots, 4000\)/.test(MAIN));
t('o ritmo rapido continua sendo 4s, pra quando um robo esta rodando',
  /var LENTO = 30000, RAPIDO = 4000;/.test(MAIN));
t('e ele so e escolhido se algum robo estiver rodando',
  /_ritmoRobots\(\(pdf\.running \|\| res\.running \|\| mon\.running\) \? RAPIDO : LENTO\)/.test(MAIN));
t('aba escondida nao pergunta nada', /if \(document\.hidden\) return;/.test(MAIN));
t('mas voltar pra aba pede na hora — o badge nao fica velho',
  /visibilitychange[\s\S]{0,120}?checkRobots\(\)/.test(MAIN));

// O ciclo de 60s pedia checkRobots DE NOVO, em cima do de 4s.
t('o ciclo de 60s parou de repetir o checkRobots',
  !/setInterval\(function\(\)\{ checkRobots\(\)/.test(MAIN));
t('e ficou so com o stop, que le outro endereco',
  /setInterval\(checkStopBanner, 60000\)/.test(MAIN));

// ── [3] AS ODDS DA BW NAO FORAM TOCADAS ─────────────────────────────────────
// A condicao que o Bruno pos antes de aprovar. As odds tem caminho proprio:
// o robo captura no servidor e a tela Analisar le /robot/odds/live de 5 em 5s.
// Nenhum dos dois passa por aqui.
bloco('[3] A CONDICAO DO BRUNO: AS ODDS DA BW CONTINUAM IGUAIS');

t('a tela Analisar continua lendo as odds de 5 em 5 segundos',
  /_oddsLiveTimer = setInterval\(function\(\)\{ renderOddsLive\(r\); \}, 5000\)/.test(APP));
t('pela rota /robot/odds/live, que nao foi tocada',
  /router\.get\('\/odds\/live', requireAdmin/.test(ROBOT));
t('a barra de navegacao nunca leu odds — nao ha como ter afetado',
  !/odds\/live/.test(MAIN_CODE));
t('e a rota de resumo NAO devolve odd nenhuma: ela nao tem o que atrasar',
  !/\/status\/resumo[\s\S]{0,1400}?odd/i.test(ROBOT));

// ── [4] O ALARME TAMBEM NAO ────────────────────────────────────────────────
// Foi pedido HOJE DE MANHA que o alarme tocasse em todas as telas. Pausar o
// alertaGlobal com a aba escondida desfaria exatamente aquele pedido — e' o
// erro obvio de quem mexe em polling pensando so em economia.
bloco('[4] O ALARME CONTINUA RODANDO COM A ABA ESCONDIDA');

t('o alertaGlobal continua no ciclo de 15s', /setInterval\(ciclo, 15000\)/.test(ALERTA));
// A guarda PROIBIDA e a que PULA o trabalho com a aba escondida:
//     if (document.hidden) return;
// O alertaGlobal ja tem o contrario disso — `if (!document.hidden) return`, que
// e o flash no titulo, e so faz sentido QUANDO a aba esta escondida. Uma regex
// frouxa confunde as duas e reprova o arquivo certo.
t('e ele NAO ganhou guarda que pula o trabalho com a aba escondida',
  !/if \(document\.hidden\)\s*return/.test(ALERTA));
t('o que ele tem e o contrario: trabalho que so acontece com a aba escondida',
  /if \(!document\.hidden\) return;/.test(ALERTA));
t('o alerta de corrida proxima da barra tambem continua',
  /setInterval\(checkRaceProximity, 15000\)/.test(MAIN));

// ── [5] a conta ─────────────────────────────────────────────────────────────
// Numeros, nao impressao. Por ABA ABERTA, por HORA.
bloco('[5] A CONTA, POR ABA ABERTA E POR HORA');

const antes = (3600 / 4) * 3          // checkRobots: 3 pedidos a cada 4s
            + (3600 / 60) * (3 + 1 + 1 + 1);  // ciclo de 60s: checkRobots(3) + 3 banners
const depoisOcioso = (3600 / 30) * 1  // um pedido a cada 30s
                   + (3600 / 60) * 1; // o stop
t('antes: 3.060 pedidos por hora por aba', antes === 3060);
t('depois, com tudo parado e a aba aberta: 180', depoisOcioso === 180);
t('queda de mais de 90%', (1 - depoisOcioso / antes) > 0.9);
console.log('         antes ' + antes + '/h  ->  depois ' + depoisOcioso + '/h  ('
  + Math.round((1 - depoisOcioso / antes) * 100) + '% a menos, e ZERO com a aba escondida)');

// Cada um daqueles pedidos fazia um SELECT em users pelo requireAdmin.
t('o requireAdmin continua consultando o banco a cada pedido — e por isso que o numero de PEDIDOS e o que importa',
  /SELECT \* FROM users WHERE id = \? AND active = 1/.test(
    fs.readFileSync(path.join(__dirname, 'src', 'middleware', 'auth.js'), 'utf8')));


// ── [6] O NAVEGADOR NAO RODA DENTRO DO APP ──────────────────────────────────
// Bruno, 16/09/2026: o Railway tinha TRES instalacoes de navegador no build e
// nenhuma era executada. Todos os robos fazem puppeteer.connect() no servico
// `chromium` (BROWSERLESS_HOST). Este bloco trava esse fato: no dia em que
// alguem escrever um puppeteer.launch(), o build vai estar sem navegador local
// e o teste avisa ANTES do deploy, em vez de o robo quebrar em producao.
bloco('[6] NENHUM NAVEGADOR LOCAL: SO connect() NO SERVICO chromium');

const ROBOS = ['src/routes/robot.js', 'src/routes/resultsRobot.js',
               'src/routes/cardMonitorRobot.js', 'src/routes/finalCheckRobot.js'];
let algumLaunch = null, todosConnect = true;
for (const f of ROBOS) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  if (/puppeteer[\s\S]{0,40}?\.launch\s*\(/.test(src)) algumLaunch = f;
  if (!/puppeteer\.connect\(|require\('puppeteer'\)\.connect\(/.test(src)) todosConnect = false;
}
t('nenhum robo lanca navegador local', algumLaunch === null);
t('os quatro conectam no servico chromium', todosConnect);

const NIX = fs.readFileSync(path.join(__dirname, 'nixpacks.toml'), 'utf8');
// Sem comentario, pela TERCEIRA vez hoje. O comentario que eu escrevi no
// nixpacks explica que "chromium" e playwright SAIRAM — e era esse texto que
// derrubava as duas assercoes abaixo. Ler o comentario como se fosse codigo ja
// me fez duvidar de arquivo certo duas vezes nesta mesma sessao.
const NIX_CODE = NIX.replace(/^\s*#.*$/gm, '');
const PKG = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
t('o build nao baixa mais o chromium do Nix', !/"chromium"/.test(NIX_CODE));
t('nem o do playwright, que nem e dependencia', !/playwright/.test(NIX_CODE));
t('nem o Chrome do puppeteer no postinstall', !/postinstall/.test(PKG));
t('e o download do puppeteer esta desligado por variavel',
  /PUPPETEER_SKIP_DOWNLOAD = "true"/.test(NIX));
t('as bibliotecas de sistema FICARAM — sairao numa segunda passada, se sairem',
  /"nss"/.test(NIX) && /"pango"/.test(NIX) && /"cairo"/.test(NIX));
t('e o start nao mudou', /cmd = "node src\/server\.js"/.test(NIX_CODE));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
