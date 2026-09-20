'use strict';
// teste_pagina_nao_carregou.js — PAGINA QUE NAO CARREGOU NAO VIRA PDF
// (Bruno, 20/09/2026)
//
// O caso real: na coleta das 06:00 de 20/09/2026 a corrida [72/88] 6:11PM
// Clonmel perdeu o frame, reconectou, a tabela nunca apareceu, e o robo salvou
// assim mesmo um PDF de 49KB feito da casca do site (19.006 chars de HTML,
// cabecalho "GREYHOUND BET"). O parser falhou nele, a corrida ficou fora do
// dia, e o log terminou anunciando "88 salvos | 0 erros".
//
// O que este teste trava:
//   1. quem reprova e' o TAMANHO; o nome nunca reprova sozinho (uma pista
//      chamada "Greyhound alguma coisa" nao pode ser recusada pelo nome);
//   2. a pagina recusada conta como ERRO, nunca como salva - o ponto todo da
//      mudanca e' a falha deixar de se disfarcar de sucesso;
//   3. a guarda roda ANTES de montar o nome do arquivo e de escrever no disco;
//   4. nao ha nova tentativa ali (a complementar de hora em hora e' quem
//      refaz), senao a coleta inteira atrasa por causa de uma pista travada.
//
//   node teste_pagina_nao_carregou.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'robot.js'), 'utf8');

let ok = 0, ruim = 0;
function t(nome, cond) {
  if (cond) { ok++; console.log('  OK    | ' + nome); }
  else { ruim++; console.log('  FALHOU| ' + nome); }
}
function bloco(n) { console.log('\n' + n + '\n'); }

bloco('[1] A GUARDA EXISTE E ESTA NO LUGAR CERTO');

const mGuarda = SRC.match(/if \(info\.bodyLen < 60000[\s\S]*?continue;\n\s*\}/);
t('a guarda foi encontrada', !!mGuarda);

const iGuarda = SRC.indexOf('if (info.bodyLen < 60000');
const iNome = SRC.indexOf('const filename = `${timeFormatted}_${track}.pdf`;');
const iGrava = SRC.indexOf('fs.writeFileSync(filepath, pdfBuffer);');
t('ela vem ANTES de montar o nome do arquivo', iGuarda > 0 && iNome > iGuarda);
t('e ANTES de escrever no disco', iGuarda > 0 && iGrava > iGuarda);
t('a pagina recusada conta como erro', /errors\+\+;/.test(mGuarda ? mGuarda[0] : ''));
t('e nao como salva', !/saved\+\+/.test(mGuarda ? mGuarda[0] : ''));
t('volta pra lista antes de seguir, como fazem os outros desvios',
  /page\.goto\(LIST_URL/.test(mGuarda ? mGuarda[0] : ''));
t('nao ha nova tentativa na guarda (quem refaz e a coleta complementar)',
  !/i--/.test(mGuarda ? mGuarda[0] : ''));
t('o texto do log nao tem em-dash', !/—/.test((mGuarda || [''])[0]));

bloco('[2] O CRITERIO, RODADO DE VERDADE');

// So a condicao, avaliada com os numeros reais do log de 20/09.
const mCond = SRC.match(/if \((info\.bodyLen < 60000[\s\S]*?)\) \{/);
t('a condicao foi extraida', !!mCond);

function recusa(bodyLen, track) {
  const ctx = { info: { bodyLen: bodyLen, track: track }, out: null };
  vm.createContext(ctx);
  vm.runInContext('this.out = (' + mCond[1] + ');', ctx);
  return !!ctx.out;
}

// O caso que motivou tudo.
t('a casca do site de 19.006 chars com cabecalho "GREYHOUND BET" e recusada',
  recusa(19006, 'GREYHOUND BET'));

// As paginas boas do dia 20/09: a menor teve 110.640 chars, a maior 181.491.
t('a menor pagina boa do dia (110.640, Sheffield) passa', !recusa(110640, 'Sheffield'));
t('a maior pagina boa do dia (181.491, Towcester) passa', !recusa(181491, 'Towcester'));
t('a 6.26PM Kinsley que deu certo depois de reconectar (122.566) passa',
  !recusa(122566, 'Kinsley'));

// O nome nunca reprova sozinho.
t('pagina inteira de uma pista chamada "Greyhound Park" NAO e recusada pelo nome',
  !recusa(140000, 'Greyhound Park'));
t('mas pagina pela metade com esse cabecalho e recusada (o tamanho e quem manda)',
  recusa(80000, 'Greyhound Park'));

// Faixa intermediaria: pagina truncada com nome de pista de verdade.
t('pagina de 30.000 chars com nome de pista bom tambem e recusada',
  recusa(30000, 'Hove'));
t('cabecalho vazio nao quebra a conta', !recusa(130000, ''));
t('cabecalho nulo nao quebra a conta', !recusa(130000, null));

console.log('\n' + (ruim ? 'FALHOU: ' + ruim + ' de ' + (ok + ruim) : 'TUDO OK: ' + ok + ' verificacoes'));
process.exit(ruim ? 1 : 0);
