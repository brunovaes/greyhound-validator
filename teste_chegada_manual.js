'use strict';
// teste_chegada_manual.js — CORRIGIR A CHEGADA A MAO (Bruno, 15/09/2026)
//
// De onde veio: "quando clico no lapis nao estou conseguindo editar a coluna
// BATEU no historico".
//
// E nao da mesmo, e nao era pra dar: o BATEU do Historico nao e um dado
// gravado, e' uma conta — bateuPar(chegada, galgo A, galgo B). Liberar o lapis
// nele gravaria na coluna races.bateu, que a TELA nao le: voce clicaria, o
// servidor responderia 200, e nada mudaria. Gravacao silenciosa que nao
// aparece — exatamente o defeito que a correcao de 03/09 fechou e que o
// teste_bateu_fonte_unica.js protege.
//
// O campo certo e' a CHEGADA, que ate agora so os robos podiam escrever.
// Corrigindo ela, o BATEU se acerta em TODOS os AvBs da corrida, a coluna
// Resultado passa a mostrar certo, e a Banca e os exports acompanham.
//
// O QUE ESTE TESTE PROTEGE:
//   1) a validacao. Chegada e' a fonte do bateu do dia inteiro: entrada torta
//      aqui contamina a taxa de tudo. Nada meia-boca pode passar.
//   2) que o podio e o races.bateu sao regravados JUNTO. Consertar a tela e
//      deixar a Banca com o valor velho seria criar a divergencia de novo.
//   3) que so admin corrige — o dado e' compartilhado.
//
// Ele RODA o handler real do PUT /api/race/:id num contexto de mentira, com um
// banco de mentira que registra o UPDATE. Nao le o fonte procurando padrao.
//
//   node teste_chegada_manual.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_API = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'api.js'), 'utf8');
const SRC_MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
const { ehCampoPessoal } = require('./src/db/compartilhado');
const { bateuPar } = require('./src/utils/avbResultado');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── arranca o corpo do handler ──────────────────────────────────────────────
const MARCA = "router.put('/race/:id', express.json(), (req, res) => {";
const iH = SRC_API.indexOf(MARCA);
if (iH < 0) { console.error('ERRO: o PUT /race/:id mudou de forma.'); process.exit(1); }
let d = 0, j = iH + MARCA.length - 1;
for (; j < SRC_API.length; j++) {
  if (SRC_API[j] === '{') d++;
  else if (SRC_API[j] === '}') { d--; if (!d) break; }
}
const CORPO = SRC_API.slice(iH + MARCA.length, j);

// Roda o handler com um banco de mentira. Devolve o que o servidor respondeu e
// o UPDATE que ele tentou fazer.
function chamar(body, opts) {
  opts = opts || {};
  const fav = opts.trap_fav != null ? opts.trap_fav : 3;
  const und = opts.trap_und != null ? opts.trap_und : 1;
  const upd = { sql: null, values: null };
  const db = {
    prepare: function (sql) {
      return {
        get: function () {
          if (/trap_fav/.test(sql)) return { trap_fav: fav, trap_und: und };
          return { id: 7 };
        },
        run: function () { upd.sql = sql; upd.values = Array.prototype.slice.call(arguments); }
      };
    }
  };
  let resposta = null;
  const res = {
    status: function (c) { return { json: function (o) { resposta = { code: c, body: o }; } }; },
    json: function (o) { resposta = { code: 200, body: o }; }
  };
  const req = {
    user: { id: 1, role: opts.role || 'admin' },
    params: { id: '7' },
    body: body
  };
  const ctx = {
    console: console, db: db, req: req, res: res, JSON: JSON, Object: Object,
    String: String, Number: Number, Array: Array, Set: Set,
    require: function (p) { return require(p.replace('../utils/', './src/utils/')); },
    getUserConfig: function () { return { banca_unidade_padrao: 2.5 }; },
    ehCampoPessoal: ehCampoPessoal,
    salvarPessoal: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext('(function(req,res){' + CORPO + '})(req,res)', ctx);
  // Reconstroi o que foi gravado, por nome de coluna.
  const gravado = {};
  if (upd.sql) {
    const cols = upd.sql.replace(/^.*SET /, '').replace(/ WHERE.*$/, '').split(',')
      .map(function (s) { return s.trim().replace('=?', ''); });
    cols.forEach(function (c, i) { gravado[c] = upd.values[i]; });
  }
  return { resposta: resposta, gravado: gravado, sql: upd.sql };
}

// ── [1] os formatos que ele pode digitar ────────────────────────────────────
bloco('[1] O QUE DA PRA DIGITAR');

const ESPERADO = JSON.stringify([{ pos: 1, trap: 3 }, { pos: 2, trap: 1 }, { pos: 3, trap: 5 }, { pos: 4, trap: 2 }]);

[['3-1-5-2', 'com hifen'], ['3 1 5 2', 'com espaco'], ['3,1,5,2', 'com virgula'],
 ['3152', 'sem separador nenhum'], ['  3-1-5-2  ', 'com espaco sobrando']].forEach(function (c) {
  const r = chamar({ finishing_order_json: c[0] });
  t('"' + c[0] + '" (' + c[1] + ') vira a chegada certa',
    r.gravado.finishing_order_json === ESPERADO);
});

// ── [2] o que NAO pode passar ───────────────────────────────────────────────
// Chegada e a fonte do bateu de todos os AvBs da corrida. Entrada torta aqui
// nao quebra a tela: ela contamina a taxa do dia e ninguem percebe.
bloco('[2] O QUE E RECUSADO — e recusado com erro, nao em silencio');

[['3-3-1', 'trap repetido'], ['7-1-2', 'trap acima de 6'], ['0-1-2', 'trap zero'],
 ['3', 'um galgo so nao e uma chegada'], ['1-2-3-4-5-6-2', 'mais de seis'],
 ['abc', 'texto'], ['-', 'so separador']].forEach(function (c) {
  const r = chamar({ finishing_order_json: c[0] });
  t('"' + c[0] + '" (' + c[1] + ') e recusado com 400',
    r.resposta && r.resposta.code === 400 && !r.sql);
});
const rErro = chamar({ finishing_order_json: '3-3-1' });
t('e a mensagem de erro ensina o formato',
  rErro.resposta.body.error.indexOf('3-1-5-2') >= 0);

// ── [3] limpar ──────────────────────────────────────────────────────────────
bloco('[3] VAZIO LIMPA — e como se desfaz um erro de digitacao');

const rVazio = chamar({ finishing_order_json: '' });
t('a chegada volta a ser nula', rVazio.gravado.finishing_order_json === null);
t('o podio e limpo junto',
  rVazio.gravado.resultado_1 === null && rVazio.gravado.resultado_2 === null && rVazio.gravado.resultado_3 === null);
t('e o bateu da coluna volta a indefinido (nao fica o valor velho)',
  rVazio.gravado.bateu === null);

// ── [4] O QUE DEPENDE DA CHEGADA E REGRAVADO JUNTO ──────────────────────────
// Este bloco e o motivo de a entrega existir desse jeito. Um override do BATEU
// consertaria uma celula; corrigir a chegada acerta a linha inteira.
bloco('[4] PODIO E races.bateu ACOMPANHAM — senao a Banca fica com o valor velho');

const rOk = chamar({ finishing_order_json: '3-1-5-2' });
t('o podio sai da propria chegada',
  rOk.gravado.resultado_1 === '3' && rOk.gravado.resultado_2 === '1' && rOk.gravado.resultado_3 === '5');
t('com trap_fav=3 e trap_und=1 (1o x 2o), a coluna bateu vira "sim"',
  rOk.gravado.bateu === 'sim');

const rInv = chamar({ finishing_order_json: '3-1-5-2' }, { trap_fav: 1, trap_und: 3 });
t('invertendo o par, vira "nao" — a conta e do par, nao do vencedor',
  rInv.gravado.bateu === 'nao');

const rFora = chamar({ finishing_order_json: '3-1', }, { trap_fav: 4, trap_und: 6 });
t('par que nao aparece na chegada fica INDEFINIDO, nunca "nao"',
  rFora.gravado.bateu === '');

// A coluna tem que concordar com a conta que a TELA faz. E a invariante que o
// teste_bateu_fonte_unica defende, conferida aqui pela ponta nova.
t('a coluna concorda com o bateuPar, que e o que o Historico desenha',
  (bateuPar(ESPERADO, 3, 1) === true && rOk.gravado.bateu === 'sim')
  && (bateuPar(ESPERADO, 1, 3) === false && rInv.gravado.bateu === 'nao'));

// ── [5] quem pode ──────────────────────────────────────────────────────────
bloco('[5] SO ADMIN — a chegada e dado do sistema, vale pra todo mundo');

const rUser = chamar({ finishing_order_json: '3-1-5-2' }, { role: 'user' });
t('usuario comum recebe 403', rUser.resposta && rUser.resposta.code === 403);
t('e nada e gravado', !rUser.sql);

// ── [6] nao atropela o resto do PUT ─────────────────────────────────────────
bloco('[6] O RESTO DO PUT CONTINUA FUNCIONANDO');

const rOutro = chamar({ video_url: 'http://x/y' });
t('um PUT sem chegada nao mexe na chegada',
  !('finishing_order_json' in rOutro.gravado) && rOutro.gravado.video_url === 'http://x/y');
t('e nao inventa um bateu', !('bateu' in rOutro.gravado));

// ── [7] a ponta da tela ─────────────────────────────────────────────────────
bloco('[7] O CAMPO NO HISTORICO');

t('a celula Resultado desenha o campo da chegada', /class="hist-inp cheg-inp"/.test(SRC_MAIN));
t('com o data-id da corrida — e o que o lapis casa pra habilitar',
  /class="hist-inp cheg-inp"[\s\S]{0,300}?data-id="' \+ r\.id \+ '/.test(SRC_MAIN));
t('nasce desabilitado, como os outros campos do lapis',
  /class="hist-inp cheg-inp"[\s\S]{0,120}?disabled/.test(SRC_MAIN));
t('e escondido fora do modo de edicao', /\.cheg-inp\[disabled\]\{display:none\}/.test(SRC_MAIN));
t('o valor ja vem preenchido com a chegada atual, em 3-1-5-2',
  /_ordemTxt[\s\S]{0,260}?\.join\('-'\)/.test(SRC_MAIN));
t('fica FORA do laco generico de data-f (o campo tem nome proprio no PUT)',
  /data-chegada="1"/.test(SRC_MAIN) && !/data-f="chegada"/.test(SRC_MAIN));
t('manda finishing_order_json no PUT', /finishing_order_json: valor/.test(SRC_MAIN));
t('recarrega depois de gravar, em vez de refazer a conta do bateu no navegador',
  /if \(resp\.ok\) \{ location\.reload\(\); return; \}/.test(SRC_MAIN));
t('e o bateuPar NAO foi copiado pro front', !/function bateuPar/.test(SRC_MAIN));
t('recusa acende a borda e devolve o valor anterior, sem dialogo',
  /classList\.add\('erro'\)/.test(SRC_MAIN) && /campo\.value = campo\.getAttribute\('data-antes'\)/.test(SRC_MAIN));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
