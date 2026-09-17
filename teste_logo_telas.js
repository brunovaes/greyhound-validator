'use strict';
// teste_logo_telas.js — A FAIXA DA LOGO NO TAMANHO DA ANALISAR (Bruno, 17/09/2026)
//
// "olha a diferenca entre as duas telas Analisar e Banca... o tamanho nao e o
// mesmo... a logo la em cima tb".
//
// O QUE ERA: a Analisar limita a faixa a min(160px,15vh) — em janela baixa ela
// encolhe junto, pra nao comer a area util. Banca, Configuracoes, Painel Admin
// e Live pediam 160px fixos. Na janela do Bruno isso da ~115px contra ~150px:
// a faixa fica mais alta e empurra tudo que vem abaixo, menu inclusive.
//
// EU ERREI DUAS VEZES ANTES DE CHEGAR AQUI, e as duas estao anotadas porque sao
// o tipo de erro que volta:
//   1. Disse que "nao existe zoom nenhum no codigo". Existe: designTokens.js
//      tem body{zoom:.9} acima de 801px. Eu tinha procurado em src/routes e
//      public/css e NAO em src/utils — conclui ausencia a partir de uma busca
//      incompleta. O zoom vale pra todas as telas igualmente, entao nao era ele
//      a diferenca, mas a frase estava errada do mesmo jeito.
//   2. Fui atras de font-size e max-width do conteudo e mexi em quatro telas a
//      toa. O bloco [3] trava que aquilo nao voltou.
//
//   node teste_logo_telas.js

const fs = require('fs');
const path = require('path');

const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const semCom = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const BANCA  = semCom(ler('src/routes/banca.js'));
const CONFIG = semCom(ler('src/routes/config.js'));
const ROBOT  = semCom(ler('src/routes/robot.js'));
const MAIN   = semCom(ler('src/routes/main.js'));
const TOKENS = ler('src/utils/designTokens.js');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// A regra da Analisar e a REFERENCIA. Se ela mudar, o alvo mudou.
const ANALISAR = MAIN.slice(MAIN.indexOf("router.get('/', exigirAcesso('screen.analisar')"),
                            MAIN.indexOf("router.get('/live'"));

bloco('[1] A REFERENCIA: COMO A ANALISAR LIMITA A FAIXA');

t('a Analisar limita a logo a min(160px,15vh)',
  /\.hero img\{max-height:min\(160px,15vh\)\}/.test(ANALISAR));
t('e cai pra 130px abaixo de 900px',
  /@media\(max-width:900px\)\{[\s\S]{0,300}?\.hero img\{max-height:130px\}/.test(ANALISAR));

bloco('[2] AS QUATRO TELAS PASSARAM A USAR O MESMO TETO');

const TELAS = [['Banca', BANCA], ['Configuracoes', CONFIG], ['Painel Admin', ROBOT], ['Live', MAIN]];
for (const [nome, src] of TELAS) {
  t(nome + ': a logo usa min(160px,15vh)',
    /\.hero img\{width:100%;height:auto;max-height:min\(160px,15vh\);/.test(src));
  t(nome + ': e tem o mesmo teto de 130px no estreito',
    /@media\(max-width:900px\)\{\.hero img\{max-height:130px\}\}/.test(src));
}
t('nenhuma das quatro ficou com os 160px fixos',
  !/\.hero img\{width:100%;height:auto;max-height:160px;/.test(BANCA)
  && !/\.hero img\{width:100%;height:auto;max-height:160px;/.test(CONFIG)
  && !/\.hero img\{width:100%;height:auto;max-height:160px;/.test(ROBOT)
  && !/\.hero img\{width:100%;height:auto;max-height:160px;/.test(MAIN));

bloco('[3] O QUE EU MEXI A TOA E DESFIZ NAO PODE VOLTAR');

t('as quatro continuam com font-size:14px no body — nao era isso',
  /body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(BANCA)
  && /body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(CONFIG)
  && /body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(ROBOT)
  && /body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(MAIN));
t('e com o max-width do conteudo que sempre tiveram',
  /\.content\{padding:24px;max-width:1200px;margin:0 auto\}/.test(BANCA)
  && /\.content\{padding:24px;max-width:920px;margin:0 auto\}/.test(ROBOT));

bloco('[4] O ZOOM GLOBAL EXISTE, E VALE PRA TODAS IGUALMENTE');

// Anotado porque eu afirmei o contrario. Ele nao e a diferenca entre as telas,
// mas quem vier depois precisa saber que ele esta la.
t('o designTokens aplica body{zoom:.9} acima de 801px',
  /@media \(min-width:801px\)\{[\s\S]{0,60}?body\{zoom:\.9\}/.test(TOKENS));
t('e as quatro telas carregam o designTokens, entao o zoom e o mesmo nas quatro',
  BANCA.includes('designTokensCSS()') && CONFIG.includes('designTokensCSS()')
  && ROBOT.includes('designTokensCSS()') && MAIN.includes('designTokensCSS()'));
t('a Analisar tambem carrega, entao ela nao esta num zoom diferente',
  ANALISAR.includes('designTokensCSS()'));

bloco('[5] A BARRA DE MENU JA ERA IGUAL NAS CINCO');

// Cheguei a achar, olhando o print, que o menu da Banca era maior. Nao era: ele
// so aparece mais abaixo porque a faixa acima dele e mais alta. O CSS do menu
// sai do proprio navBar(), que e um so pra todas as telas.
// O <style> do navBar fica ~7,7 mil caracteres depois da abertura da funcao
// (a funcao monta o menu inteiro antes). Medir por indice e' mais honesto que
// chutar um limite de regex que passa hoje e falha quando o menu crescer.
const iNav = MAIN.indexOf('function navBar');
const iFimNav = MAIN.indexOf('\nfunction ', iNav + 10);
const iNl = MAIN.indexOf('.nl{padding:12px 18px', iNav);
t('o CSS do menu mora DENTRO do navBar, nao em cada tela',
  iNav >= 0 && iNl > iNav && iNl < iFimNav);
t('com font-size 13px, uma vez so pra todas as telas',
  /\.nl\{padding:12px 18px;color:#888;text-decoration:none;font-size:13px/.test(MAIN));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
