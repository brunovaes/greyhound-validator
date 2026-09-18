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

// Sem comentario: o comentario do lapis da Banca CITA o shared.css justamente
// pra dizer que a tela nao o carrega, e era esse texto que derrubava a linha.
const semCom2 = s2 => s2.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/^\s*\/\/.*$/gm, '');
t('o bloco leva o proprio <style>: nao depende do shared.css, que estas telas nao carregam',
  /<style>/.test(FN) && !semCom2(BANCA).includes('shared.css')
  && !semCom2(CONFIG).includes('shared.css'));

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


// ── [7] IGUAL A DA ANALISAR, PROPRIEDADE POR PROPRIEDADE ────────────────────
// Bruno, depois da primeira versao: "ficou quase perfeito, so nao ficou igual".
// Eu tinha feito um cartao flutuante (borda inteira, cantos arredondados,
// margem, sticky) enquanto a da Analisar e' uma coluna rente com borda so a
// direita. Eram cinco diferencas, e "parecido" nao era o pedido.
//
// Este bloco NAO compara com valores que eu digitei aqui: ele LE as regras da
// Analisar do proprio main.js e compara com as da faixa compartilhada. Se um
// dia alguem mexer no visual da Analisar, e este teste que avisa que as duas
// deixaram de ser iguais.
bloco('[7] AS DUAS FAIXAS TEM AS MESMAS PROPRIEDADES');

// As regras da Analisar usam as variaveis do shared.css; a faixa compartilhada
// nao pode usa-las (aquelas telas nao carregam o arquivo), entao escreve o
// valor. Aqui as duas sao trazidas pro mesmo alfabeto antes de comparar.
const VARS = { '--sur': '#161b27', '--sur2': '#1e2433', '--bdr': '#2a3142',
               '--bdr2': '#323a4a', '--grn': '#22c55e', '--mut': '#666',
               '--mut2': '#888', '--txt': '#f0f0f0' };
function resolve(v) {
  return String(v).replace(/var\((--[a-z0-9]+)\)/gi, function (_, n) { return VARS[n] || _; })
    .replace(/\s+/g, '').toLowerCase();
}
// O MESMO SELETOR APARECE VARIAS VEZES: a Analisar tem tres regras .sidebar —
// a base e duas dentro de @media pro celular. Pegar a primeira me devolveu a do
// celular (.sidebar{border-right:none}) e reprovou o arquivo certo. Entao aqui
// se juntam TODAS as ocorrencias e fica a mais completa, que e' sempre a base.
function regra(src, seletor) {
  const re = new RegExp(seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'g');
  let m, melhor = null, n = -1;
  while ((m = re.exec(src)) !== null) {
    const out = {};
    m[1].split(';').forEach(function (d) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim().replace(/\s+/g, '')] = resolve(d.slice(i + 1));
    });
    const q = Object.keys(out).length;
    if (q > n) { n = q; melhor = out; }
  }
  return melhor;
}
function comparar(nome, a, b, props) {
  if (!a || !b) { t(nome + ': as duas regras existem', false); return; }
  props.forEach(function (p) {
    t(nome + ' — ' + p + ': ' + (a[p] === undefined ? '(ausente)' : a[p]), a[p] === b[p]);
  });
}

const A_SIDE = regra(ANALISAR, '.sidebar');
const G_SIDE = regra(FN, '.gf-side');
comparar('faixa', A_SIDE, G_SIDE, ['background', 'border-right', 'padding', 'gap', 'flex-direction', 'overflow-y']);
t('faixa: a da Analisar nao tem canto arredondado, a compartilhada tambem nao',
  !('border-radius' in A_SIDE) && !('border-radius' in G_SIDE));
t('faixa: nem margem', !('margin' in A_SIDE) && !('margin' in G_SIDE));
t('faixa: a largura da coluna e a mesma (250px no grid da Analisar)',
  /grid-template-columns:250px/.test(ANALISAR) && G_SIDE['width'] === '250px');

comparar('caixa do menu', regra(ANALISAR, '.tabnav'), regra(FN, '.gf-tabnav'),
  ['background', 'border', 'border-radius', 'padding', 'gap', 'display', 'flex-direction']);

comparar('item do menu', regra(ANALISAR, '.tabbtn'), regra(FN, '.gf-tab'),
  ['display', 'padding', 'color', 'font-size', 'font-weight', 'border-radius', 'gap', 'background']);

comparar('item no hover', regra(ANALISAR, '.tabbtn:hover'), regra(FN, '.gf-tab:hover'),
  ['background', 'color']);

comparar('linha da sessao', regra(ANALISAR, '.sess-link'), regra(FN, '.gf-sess'),
  ['display', 'font-size', 'color', 'padding', 'border-bottom', 'text-decoration']);

comparar('contagem de AvBs', regra(ANALISAR, '.sess-link span'), regra(FN, '.gf-sess span'),
  ['float', 'color']);

comparar('titulo de secao', regra(ANALISAR, '.sidebar h2'), regra(FN, '.gf-side h2'),
  ['font-size', 'font-weight', 'letter-spacing', 'text-transform', 'color']);

comparar('divisoria', regra(ANALISAR, '.dv'), regra(FN, '.gf-dv'), ['height', 'background']);

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
