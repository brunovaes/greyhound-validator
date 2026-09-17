'use strict';
// teste_sidebar_info.js — A FAIXA LATERAL NAS OUTRAS TELAS (Bruno, 17/09/2026)
//
// "sera que da pra colocar essa parte da tela analisar em todas as demais, com
// excecao da Live?" — a parte informativa (Historicos, Sessoes recentes e os
// dois cartoes de Acertos), em Banca, Configuracoes e Painel Admin, e escondida
// no celular.
//
// O QUE ESTE TESTE PROTEGE:
//   1) que a faixa e' UMA funcao so, e nao tres copias de marcacao.
//   2) que o que ficou de fora continua de fora: o Carregar PDF (cujo fluxo
//      vive no app.js) e o "Restaurado: N AvBs" (que so faz sentido na
//      Analisar). Sem isso, a proxima pessoa "completa" a faixa e leva junto um
//      botao de upload que nao tem quem receba o arquivo.
//   3) que a ANALISAR nao foi tocada. Ela e a tela onde o Bruno passa o dia.
//   4) que a Live ficou de fora, que foi o pedido.
//   5) que a faixa some no celular.
//   6) que os <div> continuam balanceados nas telas em que eu envolvi o
//      conteudo — foi insercao por indice, e div desbalanceada nao quebra o
//      node --check: quebra so na tela.
//
//   node teste_sidebar_info.js

const fs = require('fs');
const path = require('path');

const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const semCom = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

const MAIN   = ler('src/routes/main.js');
const BANCA  = ler('src/routes/banca.js');
const CONFIG = ler('src/routes/config.js');
const ROBOT  = ler('src/routes/robot.js');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [1] uma fonte so ────────────────────────────────────────────────────────
bloco('[1] UMA FUNCAO SO, COMO O navBar');

t('o main.js define a sidebarInfo', /function sidebarInfo\(user\)/.test(MAIN));
t('e exporta', /module\.exports\.sidebarInfo = sidebarInfo/.test(MAIN));
t('so existe UMA definicao dela', (MAIN.match(/function sidebarInfo\(/g) || []).length === 1);

const TELAS = [['Banca', BANCA], ['Configuracoes', CONFIG], ['Painel Admin', ROBOT]];
for (const [nome, src] of TELAS) {
  t(nome + ': importa a funcao', /const \{ navBar, sidebarInfo \} = require\('\.\/main'\)/.test(src));
  t(nome + ': e chama uma vez', (src.match(/\$\{sidebarInfo\(/g) || []).length === 1);
}
t('nenhuma das tres tem marcacao propria de sessoes ou acertos',
  !/gf-sess"/.test(semCom(BANCA).replace(/sidebarInfo/g, ''))
  && !/gf-acertos-dia/.test(BANCA) && !/gf-acertos-dia/.test(CONFIG) && !/gf-acertos-dia/.test(ROBOT));

// ── [2] o que ficou de fora ─────────────────────────────────────────────────
bloco('[2] O CARREGAR PDF E O RESTAURADO NAO VIERAM JUNTO');

const FN = MAIN.slice(MAIN.indexOf('function sidebarInfo(user)'),
                      MAIN.indexOf('function navBar(user, active, extra)'));
t('a faixa nao tem input de arquivo', !/type="file"/.test(FN));
t('nem o texto Carregar PDF', !/Carregar PDF/.test(semCom(FN)));
t('nem o Restaurado', !/Restaurado/.test(semCom(FN)));
t('mas tem o link Historicos', /\/historico" class="gf-tab"/.test(FN));
t('a lista de sessoes', /class="gf-sess"/.test(FN));
t('e os dois cartoes de acertos',
  /id="gf-acertos-dia"/.test(FN) && /id="gf-acertos-mes"/.test(FN));

t('os acertos vem do endpoint que ja existia, nao de conta nova',
  /fetch\('\$\{BASE\}\/api\/acertos-resumo'\)/.test(FN));
t('e sao buscados UMA vez, sem intervalo — poll aqui desfaria a economia de ontem',
  !/setInterval/.test(FN));
t('a regra de cor e a mesma do app.js (verde a partir de 50%)',
  /pct >= 50 \? '#22c55e' : '#ef4444'/.test(FN)
  && /pct >= 50 \? '#22c55e' : '#ef4444'/.test(ler('src/app.js')));

t('o bloco leva o proprio <style>: nao depende do shared.css, que estas telas nao carregam',
  /<style>/.test(FN) && !BANCA.includes('shared.css') && !CONFIG.includes('shared.css'));

// ── [3] a Analisar nao foi tocada ───────────────────────────────────────────
bloco('[3] A ANALISAR CONTINUA COM A FAIXA DELA');

const ANALISAR = MAIN.slice(MAIN.indexOf("router.get('/', exigirAcesso('screen.analisar')"),
                            MAIN.indexOf("router.get('/live'"));
t('a Analisar NAO chama a sidebarInfo', !/sidebarInfo\(/.test(ANALISAR));
t('ela mantem o proprio Carregar PDF', /id="race-input"/.test(ANALISAR));
t('o proprio Restaurado, pelos ids que o app.js manipula',
  /id="sessoes-recentes-slot"/.test(ANALISAR));
t('e os proprios ids de acertos, que o app.js preenche',
  /id="acertos-dia"/.test(ANALISAR) && /id="acertos-mes"/.test(ANALISAR));
t('os ids novos nao colidem com os dela',
  !/id="gf-acertos-dia"/.test(ANALISAR));

// ── [4] a Live ficou de fora ────────────────────────────────────────────────
bloco('[4] A LIVE FICOU DE FORA, QUE FOI O PEDIDO');

const LIVE = MAIN.slice(MAIN.indexOf("router.get('/live'"),
                        MAIN.indexOf("router.get('/live/popup'"));
t('a Live nao chama a faixa', !/sidebarInfo\(/.test(LIVE));

// ── [5] celular ─────────────────────────────────────────────────────────────
bloco('[5] NO CELULAR A FAIXA SOME');

t('abaixo de 900px a faixa e escondida', /@media\(max-width:900px\)\{\.gf-side\{display:none\}/.test(FN));
t('e a linha de duas colunas volta a ser bloco', /\.gf-row\{display:block\}/.test(FN));
t('no Painel Admin idem, dentro da lateral dele',
  /@media\(max-width:900px\)\{\.robot-sidebar \.gf-side\{display:none\}\}/.test(ROBOT));

// ── [6] as divs fecham ──────────────────────────────────────────────────────
// Envolvi o .content da Banca e da Configuracoes contando <div> por indice.
// Div desbalanceada passa no node --check e quebra so na tela — entao o teste
// conta aqui.
bloco('[6] AS DIVS CONTINUAM BALANCEADAS');

function saldoDivs(src, dePara) {
  const ini = src.indexOf(dePara);
  if (ini < 0) return null;
  const corpo = src.slice(ini);
  const abre = (corpo.match(/<div\b/g) || []).length;
  const fecha = (corpo.match(/<\/div>/g) || []).length;
  return abre - fecha;
}
t('Banca: <div> e </div> em numero igual depois do </head><body>',
  saldoDivs(BANCA, '</head><body>') === 0);
t('Configuracoes: idem', saldoDivs(CONFIG, '</head><body>') === 0);
t('a Banca abre o gf-row antes do content',
  /<div class="gf-row">\s*\$\{sidebarInfo\(req\.user\)\}\s*<div class="content">/.test(BANCA));
t('a Configuracoes tambem',
  /<div class="gf-row">\s*\$\{sidebarInfo\(user\)\}\s*<div class="content">/.test(CONFIG));
t('o Painel Admin NAO abre gf-row: a faixa entra na lateral que ele ja tem',
  !/gf-row">/.test(ROBOT) && /\$\{sidebarInfo\(req\.user\)\}\s*<\/div>/.test(ROBOT));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
