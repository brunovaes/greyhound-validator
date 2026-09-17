'use strict';
// teste_escala_telas.js — AS QUATRO TELAS NA ESCALA DA ANALISAR (Bruno, 17/09/2026)
//
// "consegue corrigir o zoom dos menus Banca, Configuracoes, Painel Admin e
// Live... quero que fique da mesma vizualizacao de zoom da analisar".
//
// NAO EXISTIA ZOOM NENHUM NO CODIGO. Procurei `zoom:`, `transform:scale` e o
// meta viewport das quatro telas: o viewport e' identico em todas e nao ha
// propriedade de zoom em lugar nenhum. A diferenca eram DUAS coisas somadas:
//
//   1. a Analisar nunca declarou font-size no body, entao ela herda os 16px do
//      navegador. As outras quatro pediam 14px.
//   2. a Analisar ocupa a janela inteira. As outras prendiam o conteudo num
//      max-width (920px no Admin, 1200 na Banca e Config, 1900 na Live).
//
// Fonte menor numa faixa mais estreita e' exatamente o que se le como "zoom
// diferente". Este teste trava as duas, nas quatro telas.
//
//   node teste_escala_telas.js

const fs = require('fs');
const path = require('path');

const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
// Sem comentario: o comentario que eu escrevi nas quatro telas CITA os 14px e o
// max-width pra dizer que sairam. Ler o comentario como codigo ja me derrubou
// tres vezes nesta semana.
const semCom = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const BANCA  = semCom(ler('src/routes/banca.js'));
const CONFIG = semCom(ler('src/routes/config.js'));
const ROBOT  = semCom(ler('src/routes/robot.js'));
const MAIN   = semCom(ler('src/routes/main.js'));

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [1] a referencia ────────────────────────────────────────────────────────
// Se a Analisar um dia declarar font-size no body, o alvo mudou e as outras
// quatro deixam de estar iguais a ela sem ninguem perceber. Entao a referencia
// tambem e' verificada.
bloco('[1] A REFERENCIA: A ANALISAR HERDA O TAMANHO DO NAVEGADOR');

const ANALISAR = MAIN.slice(MAIN.indexOf("router.get('/', exigirAcesso('screen.analisar')"),
                            MAIN.indexOf("router.get('/live'"));
// A regra de TELA da Analisar, exatamente como ela e: sem font-size.
t('a Analisar nao declara font-size no body de tela',
  /body\{display:flex;flex-direction:column;overflow:hidden;background:#000\}/.test(ANALISAR));
// A UNICA regra de body com font-size na Analisar e a de IMPRESSAO, que e'
// deliberada (10px pra caber no papel) e nao tem nada a ver com o zoom da tela.
// Minha primeira versao desta assercao nao separava as duas e reprovava o
// arquivo certo — mesmo erro que ja me pegou tres vezes nesta semana.
const bodiesComFonte = ANALISAR.match(/body\{[^}]*font-size[^}]*\}/g) || [];
t('e a unica com font-size ali e a de impressao', bodiesComFonte.length === 1
  && /font-size:10px!important/.test(bodiesComFonte[0]));
t('e o layout dela ocupa a janela (html,body em 100%)',
  /html,body\{height:100%\}/.test(MAIN));

// ── [2] as quatro telas ─────────────────────────────────────────────────────
bloco('[2] AS QUATRO DEIXARAM DE PEDIR 14px');

const TELAS = [['Banca', BANCA], ['Configuracoes', CONFIG], ['Painel Admin', ROBOT], ['Live', MAIN]];
for (const [nome, src] of TELAS) {
  t(nome + ': o body nao fixa mais font-size',
    /body\{background:#0D1117;color:#f0f0f0\}/.test(src));
}
t('e nenhuma das quatro deixou um body com 14px pra tras',
  !/body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(BANCA)
  && !/body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(CONFIG)
  && !/body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(ROBOT)
  && !/body\{background:#0D1117;color:#f0f0f0;font-size:14px\}/.test(MAIN));

bloco('[3] E O CONTEUDO PASSOU A OCUPAR A JANELA');

t('Banca: sem max-width', /\.content\{padding:24px;max-width:none;margin:0\}/.test(BANCA));
t('Configuracoes: sem max-width', /\.content\{padding:24px;max-width:none;margin:0\}/.test(CONFIG));
t('Painel Admin: sem max-width (era o mais estreito, 920px)',
  /\.content\{padding:24px;max-width:none;margin:0\}/.test(ROBOT));
t('Live: sem max-width', /\.content\{padding:16px 20px;max-width:none;margin:0\}/.test(MAIN));

t('o Admin nao tem mais os 920px', !/max-width:920px/.test(ROBOT));
t('a Banca nao tem mais os 1200px', !/\.content\{padding:24px;max-width:1200px/.test(BANCA));
t('a Config nao tem mais os 1200px', !/\.content\{padding:24px;max-width:1200px/.test(CONFIG));

t('o padding continua: largura livre nao e encostar na borda',
  /max-width:none/.test(BANCA) && /padding:24px;max-width:none/.test(BANCA));

// ── [4] o que NAO podia ser tocado ──────────────────────────────────────────
bloco('[4] O QUE FICOU DE FORA, DE PROPOSITO');

// A /live/calibrar3 mede recorte de video em pixels. Mudar a escala dela muda
// a medida, e os valores calibrados na mao em 06/07 virariam mentira.
t('a /live/calibrar3 continua com os 14px e o max-width dela',
  /body\{background:#0D1117;color:#f0f0f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px\}/.test(MAIN)
  && /\.content\{padding:16px 20px;max-width:1900px;margin:0 auto\}/.test(MAIN));
// O /diagnostico-pdf do robot.js nao esta na lista das quatro.
t('o /diagnostico-pdf tambem nao foi mexido', /max-width:800px/.test(ROBOT));

// E o mais importante: a tela que serve de REFERENCIA nao pode ter mudado.
t('a Analisar nao ganhou font-size nenhum nesta entrega',
  !/body\{display:flex;flex-direction:column;overflow:hidden;background:#000;font-size/.test(MAIN));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
