'use strict';
// teste_banca_edicao.js — LAPIS DE EDICAO NA BANCA (Bruno, 18/09/2026)
//
// "no menu banca, teria como colocar um lapis de edicao igual da tela historico
// para eu editar as informacoes de Odd e UNID?"
//
// O STATUS FICOU DE FORA, e por escolha dele depois de eu levantar o motivo:
// o status e' DERIVADO. Desde 17/09 ele sai da chegada pelo par que o Bruno
// apostou. Um campo de status gravando em races.bateu seria ignorado
// justamente nas linhas que ja tem chegada — ele editaria, a tela nao mudaria,
// e nao haveria erro nenhum pra explicar. Bruno: "status nao precisa, so ODD
// e UND". O bloco [3] trava isso, pra ninguem "completar" a edicao depois.
//
//   node teste_banca_edicao.js

const fs = require('fs');
const path = require('path');

const ler = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const BANCA = ler('src/routes/banca.js');
// Sem comentario para a assercao do alert(): o comentario HTML da Banca CITA
// "confirm()/alert()" justamente pra dizer que eles sairam, e era esse texto
// que reprovava o arquivo certo. Quinta vez nesta semana que leio comentario
// como se fosse codigo.
const BANCA_CODE = BANCA.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const MAIN  = ler('src/routes/main.js');
const API   = ler('src/routes/api.js');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── [1] o lapis existe e se comporta como o do Historico ────────────────────
bloco('[1] O MESMO MECANISMO DO HISTORICO');

t('a linha tem o lapis', /class="bnc-pencil" data-row=/.test(BANCA));
t('que liga e desliga so aquela linha', /function setRowEditBanca\(id, editando\)/.test(BANCA));
t('trocando o desenho pelo tique, igual la', /editando \? '&#10003;' : '&#9998;'/.test(BANCA)
  && /editing \? '&#10003;' : '&#9998;'/.test(MAIN));
t('os campos nascem DESABILITADOS — sem isso da pra apagar uma odd sem querer',
  /data-f="' \+ campo \+ '" disabled/.test(BANCA));
t('e so a linha do lapis habilita', /\.bnc-inp\[data-id="' \+ id \+ '"\]/.test(BANCA));

// ── [2] grava no mesmo lugar, sem rota nova ─────────────────────────────────
bloco('[2] MESMO ENDERECO, SEM REGRA NOVA');

t('grava no PUT /api/race/:id, o mesmo do Historico',
  /fetch\(BASE \+ '\/api\/race\/' \+ id, \{\s*method: 'PUT'/.test(BANCA)
  && /\/api\/race\/'\+id,\{method:'PUT'/.test(MAIN));
t('a odd ja era campo permitido la', /const allowed = \[[^\]]*'odd'/.test(API));
t('e as unidades tambem', /const allowed = \[[^\]]*'bet_unidades'/.test(API));
t('nao nasceu rota nova na Banca pra isso', !/router\.(put|patch)\(/.test(BANCA));

t('depois de gravar, a tela RECARREGA em vez de recalcular no navegador',
  /await carregarDados\(\);/.test(BANCA));
t('e o erro aparece na caixa do app, nao num alert do navegador',
  /ghErro\('Não consegui salvar/.test(BANCA) && !/\balert\(/.test(BANCA_CODE));

// ── [3] O STATUS CONTINUA DERIVADO ──────────────────────────────────────────
bloco('[3] O STATUS NAO VIROU CAMPO');

t('nao existe campo de status na tabela', !/data-f="bateu"/.test(BANCA) && !/data-f="status"/.test(BANCA));
t('o status continua saindo do bateu resolvido no servidor',
  /status: a\.bateu === 'sim' \? 'green' : a\.bateu === 'nao' \? 'red' : 'pendente'/.test(BANCA));
t('e o resolverAposta continua dando a palavra final ao SEU par',
  /if \(esc && a\.finishing_order_json\)/.test(BANCA));

// ── [4] so os dois campos, e so na aba Dia ──────────────────────────────────
bloco('[4] SO ODD E UNIDADES, SO ONDE HA APOSTA');

const campos = (BANCA.match(/inp\('([a-z_]+)'/g) || []).map(s => s.slice(5, -1));
t('exatamente dois campos editaveis', campos.length === 2);
t('e sao odd e bet_unidades',
  campos.indexOf('odd') >= 0 && campos.indexOf('bet_unidades') >= 0);
t('a coluna do lapis entrou no cabecalho da tabela do dia',
  /<th>R\$<\/th><th style="width:34px"><\/th>/.test(BANCA));

// ── [5] o Enter nao pode estar no atributo ──────────────────────────────────
// Esta tela e' montada dentro de um template literal. A barra de um \' some na
// avaliacao, entao um onkeydown="if(event.key===\'Enter\')" chega ao navegador
// como if(event.key==='Enter') e fecha a string JS que o envolve. O
// tools/valida.js pegou; esta assercao faz a suite pegar tambem.
bloco('[5] O ENTER FORA DO ATRIBUTO INLINE');

t('nenhum onkeydown inline no campo da Banca', !/onkeydown="if\(event\.key/.test(BANCA));
t('o Enter e tratado por ouvinte delegado',
  /addEventListener\('keydown'[\s\S]{0,200}?bnc-inp[\s\S]{0,60}?blur\(\)/.test(BANCA));
t('e o de change tambem e delegado — a tabela e redesenhada a cada carregamento',
  /document\.addEventListener\('change'/.test(BANCA));

// ── [6] o valor que vai pro servidor ────────────────────────────────────────
bloco('[6] O QUE E ENVIADO');

t('virgula vira ponto: 2,5 digitado salva como 2.5', /replace\(',', '\.'\)/.test(BANCA));
t('campo vazio APAGA o valor, de proposito', /valor === '' \? null : valor/.test(BANCA));
t('o texto e escapado antes de ir pro atributo value', /function _at\(v\)/.test(BANCA)
  && /value="' \+ _at\(valor\) \+ '"/.test(BANCA));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
