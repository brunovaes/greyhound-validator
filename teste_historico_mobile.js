'use strict';
// teste_historico_mobile.js — O HISTORICO NO CELULAR (Bruno, 18/09/2026)
//
// "queria alterar no mobile a tela historico com somente as seguintes
//  informacoes... HORA, PISTA, AVB, ENTREI e BATEU... tentar colocar tudo com
//  fonte menor, pois quero na mesma tela."
//
// O DEFEITO QUE ISTO EXISTE PRA NAO DEIXAR VOLTAR: a unica regra de celular
// que a tela tinha era
//
//     .tw table th:nth-child(7), .tw table td:nth-child(7){display:none}
//        /* Observacoes some no mobile */
//
// e ela escondia o BATEU. Quando foi escrita a setima coluna era Observacoes;
// colunas entraram no meio depois, o numero 7 andou, e no celular a coluna
// errada sumia — sem erro, sem log, sem nada. Esconder coluna por POSICAO e'
// uma regra que se quebra sozinha quando outra pessoa mexe na tabela.
//
// Agora cada coluna tem NOME (hc-*), e o teste trava as duas pontas: que todo
// cabecalho tem a mesma etiqueta da sua celula, e que o celular esconde
// exatamente as oito que o Bruno tirou — nem uma a mais.
//
//   node teste_historico_mobile.js

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');

// Os comentarios deste projeto citam os proprios termos que o teste procura
// (inclusive o nth-child ali em cima). Sem tirar comentario, o teste passa a
// falar do que eu escrevi e nao do que a tela faz.
function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const LIMPO = semComentarios(SRC);

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// O bloco @media do celular, recortado por contagem de chaves — assim o teste
// nao confunde uma regra do celular com uma regra geral de mesmo nome.
function mediaCelular() {
  const marca = LIMPO.indexOf('.hh-pista-cel{display:none}');
  if (marca < 0) { console.error('ERRO: o bloco do celular sumiu do main.js'); process.exit(1); }
  const ini = LIMPO.indexOf('@media(max-width:768px){', marca);
  if (ini < 0) { console.error('ERRO: nao achei o @media do bloco do celular'); process.exit(1); }
  let i = LIMPO.indexOf('{', ini), n = 0;
  for (; i < LIMPO.length; i++) {
    if (LIMPO[i] === '{') n++;
    else if (LIMPO[i] === '}') { n--; if (!n) return LIMPO.slice(ini, i + 1); }
  }
  console.error('ERRO: nao consegui fechar o @media'); process.exit(1);
}
const CEL = mediaCelular();

// A linha do <thead> e o corpo do map que monta cada <tr>.
const CABEC = (LIMPO.match(/<div class="tw"><table><thead>[\s\S]*?<\/tr><\/thead>/) || [''])[0];
const iniLinha = LIMPO.indexOf('var col = function(cls, html)');
const LINHA = iniLinha < 0 ? '' : LIMPO.slice(iniLinha, LIMPO.indexOf('}).join(\'\')}', iniLinha));

const MANTIDAS  = ['hc-hora', 'hc-pista', 'hc-avb', 'hc-entrei', 'hc-bateu'];
const ESCONDIDAS = ['hc-pct', 'hc-tipo', 'hc-res', 'hc-flag', 'hc-obs', 'hc-odd', 'hc-bw', 'hc-lapis'];

// ═══════════════════════════════════════════════════════════════════════════
bloco('[1] NINGUEM MAIS ESCONDE COLUNA POR POSICAO');
// ═══════════════════════════════════════════════════════════════════════════

t('nao sobrou nenhum nth-child mexendo em coluna da tabela',
  !/nth-child\(\s*\d+\s*\)[^{]*\{[^}]*display\s*:\s*none/.test(LIMPO));
t('existe o helper col(), que carimba o nome da coluna na celula',
  /var col = function\(cls, html\)\{ return String\(html\)\.replace\('<td', '<td class="' \+ cls \+ '"'\); \};/.test(LIMPO));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[2] TODA COLUNA TEM NOME NO CABECALHO E NA CELULA');
// ═══════════════════════════════════════════════════════════════════════════

const TODAS = MANTIDAS.concat(ESCONDIDAS);
t('o cabecalho da tabela foi encontrado', CABEC.length > 500);
t('o corpo da linha foi encontrado', LINHA.length > 500);
TODAS.forEach(function (c) {
  t('cabecalho tem a coluna ' + c, CABEC.indexOf('class="' + c + '"') >= 0);
});
TODAS.forEach(function (c) {
  // Ou a celula ja nasce com a classe, ou ela passa pelo col(). As duas contam.
  t('a celula de ' + c + ' sai marcada', LINHA.indexOf("col('" + c + "'") >= 0
    || LINHA.indexOf('class="' + c + '"') >= 0);
});
// 13 cabecalhos, 13 nomes: se alguem acrescentar uma coluna sem nome, cai aqui.
const nomesNoCabec = (CABEC.match(/<th class="hc-[a-z]+"/g) || []).length;
const thNoCabec = (CABEC.match(/<th[ >]/g) || []).length;
t('todo <th> do cabecalho tem nome (' + nomesNoCabec + ' de ' + thNoCabec + ')',
  nomesNoCabec === thNoCabec && thNoCabec === 13);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[3] O CELULAR ESCONDE EXATAMENTE AS OITO QUE O BRUNO TIROU');
// ═══════════════════════════════════════════════════════════════════════════

const regraCols = (CEL.match(/\.hc-[^{]*\{display:none\}/g) || []).join('');
ESCONDIDAS.forEach(function (c) {
  t(c + ' some no celular', regraCols.indexOf('.' + c) >= 0);
});
MANTIDAS.forEach(function (c) {
  t(c + ' FICA no celular', regraCols.indexOf('.' + c) < 0);
});

// ═══════════════════════════════════════════════════════════════════════════
bloco('[4] EM CIMA: SO O AvBs GERAL E O GRAFICO');
// ═══════════════════════════════════════════════════════════════════════════

t('cada cartao recebe nome proprio (kcid-<id>)', /class="kc kcid-' \+ K\.id \+ '"/.test(LIMPO));
// kcid- e nao kc-: kc-top ja e a linha de cima do cartao, e reaproveitar o
// nome esconderia o topo de TODOS os cartoes em vez do cartao do TOP.
t('o nome novo nao colide com o .kc-top que ja existia', /\.kc-top\{display:flex/.test(LIMPO));
t('TOP, HIGH e GOOD somem no celular', /\.kcid-top,\.kcid-high,\.kcid-good\{display:none\}/.test(CEL));
t('o AvBs Geral fica', CEL.indexOf('.kcid-geral') < 0);
t('o grafico fica', CEL.indexOf('.kc-graf{display:none') < 0);
t('no celular o titulo do grafico e so "Evolução"', /\.kc-titg-pre\{display:none\}/.test(CEL));
t('e no computador continua "Gráfico de Evolução"',
  /<span class="kc-titg-pre">Gráfico de <\/span>Evolução/.test(LIMPO));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[5] O QUE CADA COLUNA MOSTRA NO CELULAR');
// ═══════════════════════════════════════════════════════════════════════════

// HORA: a de la em cima. A conversao pro Brasil e a linha de baixo, e e' ela
// que sai — nao a de cima.
t('a hora UK e a linha de cima da celula', /font-size:15px;font-weight:700;color:#22c55e;letter-spacing:\.5px">'\+\(horaUk\|\|'-'\)/.test(LIMPO));
t('a hora do Brasil e a linha marcada como hh-br', /<div class="hh-br"/.test(LIMPO));
t('e e ela que some no celular', /\.hh-br\{display:none\}/.test(CEL));

// PISTA: codigo + categoria, sem distancia e sem podio.
t('a pista tem as duas escritas (por extenso e o codigo)',
  /class="hh-pista-pc"/.test(LIMPO) && /class="hh-pista-cel"/.test(LIMPO));
t('o codigo curto sai do r.corrida, que e o que fica no banco',
  /class="hh-pista-cel"[^']*'\+\(r\.corrida\|\|'-'\)/.test(LIMPO));
t('no celular aparece o codigo e some o nome por extenso',
  /\.hh-pista-pc,\.hh-dist,\.top3-tag\{display:none\}/.test(CEL) && /\.hh-pista-cel\{display:block\}/.test(CEL));
t('no computador o codigo curto fica escondido', /\.hh-pista-cel\{display:none\}/.test(LIMPO));

// AvB: so as duas bolinhas.
t('no celular o AvB fica so nas bolinhas',
  /\.hh-avb-nome,\.hh-avb-org,\.hh-avb-link\{display:none\}/.test(CEL));
t('as bolinhas continuam sendo montadas (nada foi apagado)',
  /class="trap-badge t'\+trap\+'"/.test(LIMPO));

// ENTREI: um check azul.
t('existe o check do celular, em azul', /\.entrei-cel\{display:none;color:#60a5fa/.test(LIMPO));
t('ele so aparece quando a linha esta marcada',
  /\.entrei-chk:checked ~ \.entrei-cel\{display:inline\}/.test(CEL));
t('e a tarja verde ENTREI sai no celular', /\.entrei-tag\{display:none\}/.test(CEL));

// BATEU: S e N.
t('o Bateu escreve a versao longa e a letra de uma vez so',
  /<span class="bat-pc">' \+ par\[1\] \+ '<\/span>/.test(LIMPO)
  && /<span class="bat-cel">' \+ par\[2\] \+ '<\/span>/.test(LIMPO));
t('S pro sim, em verde', /\['#22c55e', '✓ Sim', 'S'\]/.test(LIMPO));
t('N pro nao, em vermelho', /\['#ef4444', '✗ Não', 'N'\]/.test(LIMPO));
t('no celular so a letra aparece',
  /\.bat-pc\{display:none\}/.test(CEL) && /\.bat-cel\{display:inline\}/.test(CEL));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[6] TUDO NA MESMA TELA');
// ═══════════════════════════════════════════════════════════════════════════

// Com cinco colunas nao ha o que rolar pro lado: o min-width era o que
// obrigava a arrastar a tabela e fazia perder o Bateu de vista.
t('a tabela deixa de ter largura minima no celular', /table\{min-width:0\}/.test(CEL));
t('a tabela deixa de ter altura maxima (quem rola e a pagina)', /\.tw\{max-height:none/.test(CEL));
t('fonte do cabecalho menor', /th\{padding:5px 2px;font-size:9px/.test(CEL));
t('fonte das celulas menor', /td\{padding:6px 2px;font-size:10px/.test(CEL));
t('cartoes com fonte menor', /\.kc-nome\{font-size:12px\}/.test(CEL));
t('o cabecalho curto: HORA e PISTA',
  /<span class="hc-lbl-cel">Hora<\/span>/.test(LIMPO)
  && /<span class="hc-lbl-cel">Pista<\/span>/.test(LIMPO)
  && /\.hc-lbl-pc\{display:none\}/.test(CEL));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[7] O COMPUTADOR NAO MUDOU');
// ═══════════════════════════════════════════════════════════════════════════

// Todo o desenho novo vive dentro do @media. Se alguma dessas regras vazar pra
// fora, a tela grande perde coluna sem ninguem ter pedido.
['\\.hc-pct', '\\.hc-tipo', '\\.hc-res', '\\.hc-obs', '\\.hc-odd', '\\.hc-bw', '\\.hc-lapis',
 '\\.kcid-top', '\\.hh-br', '\\.hh-avb-nome', '\\.bat-pc'].forEach(function (sel) {
  const foraDoMedia = LIMPO.replace(CEL, '');
  t('a regra de ' + sel.replace('\\', '') + ' so existe dentro do @media',
    !new RegExp(sel + '[^{]*\\{[^}]*display:none').test(foraDoMedia));
});
t('as treze colunas continuam sendo montadas no servidor',
  TODAS.every(function (c) { return LINHA.indexOf(c) >= 0; }));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
