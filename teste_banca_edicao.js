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
// Sem a largura exata: ela mudou de 34 pra 62 quando a lixeira entrou ao lado
// do lapis, e a assercao reprovou o arquivo por isso. Medida exata e' retrato,
// nao propriedade — o que importa e' que existe UMA coluna vazia no fim.
t('a coluna dos icones entrou no fim do cabecalho da tabela do dia',
  /<th>R\$<\/th><th style="width:\d+px"><\/th>/.test(BANCA));

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


// ── [7] A LIXEIRA ───────────────────────────────────────────────────────────
// Bruno, 18/09: "ao lado do lapis uma lixeirinha tb pois serve pra quando eu
// clicar em entrei e nao entrar ou dar cash na BW. Coloca uma perguntinha se
// deseja excluir mesmo no padrao do App".
//
// O QUE ELA APAGA e o ponto que este bloco protege: a APOSTA, nao a corrida.
// Zera odd, unidades e o ENTREI. A corrida, a analise e a chegada continuam
// inteiras. Se um dia alguem trocar isso por um DELETE de verdade, a suite grita.
bloco('[7] A LIXEIRA APAGA A APOSTA, NAO A CORRIDA');

t('a linha tem a lixeira ao lado do lapis',
  /class="bnc-del" data-row=[\s\S]{0,80}?excluirAposta\(this\)/.test(BANCA));
t('e o icone vem do conjunto compartilhado, nao desenhado solto aqui',
  /ICONE_LIXO/.test(BANCA) && /trash: '<path/.test(ler('src/utils/icons.js')));

const FN_DEL = BANCA.slice(BANCA.indexOf('function excluirAposta(el)'),
                           BANCA.indexOf('function setRowEditBanca'));
t('ela zera a odd, as unidades e o ENTREI',
  /odd: null, bet_unidades: null, bet_entrou: 0/.test(FN_DEL));
t('e NAO manda apagar mais nada: sem DELETE, sem mexer na corrida',
  !/DELETE/i.test(FN_DEL) && !/finishing_order_json/.test(FN_DEL)
  && !/bateu/.test(FN_DEL));
t('o par escolhido FICA — o Historico continua sabendo em que par voce entrou',
  !/avb_escolhido/.test(FN_DEL));
t('usa o mesmo PUT de sempre, sem rota nova', /'\/api\/race\/' \+ id/.test(FN_DEL));
t('e recarrega a tela depois, como a edicao faz', /await carregarDados\(\)/.test(FN_DEL));

bloco('[8] A PERGUNTA, NO PADRAO DO APP');

t('pergunta antes, pela caixa do app', /ghConfirmar\(\{/.test(FN_DEL));
t('e nao pelo confirm do navegador', !/[^h]\bconfirm\(/.test(FN_DEL));
t('o botao e marcado como destrutivo (fica vermelho)', /perigo: true/.test(FN_DEL));
t('e diz Excluir, nao Confirmar', /ok: 'Excluir'/.test(FN_DEL));
t('a caixa DIZ qual aposta vai sair — hora, corrida e os dois galgos',
  /linha\.hora_br/.test(FN_DEL) && /linha\.corrida/.test(FN_DEL)
  && /linha\.name_fav/.test(FN_DEL) && /linha\.name_und/.test(FN_DEL));
t('e explica que da pra registrar de novo', /registrar de novo/.test(FN_DEL));
t('as apostas do dia ficam guardadas pra caixa poder dizer isso',
  /APOSTAS_DO_DIA = d\.apostas/.test(BANCA));
t('clicar em Cancelar nao faz nada', /if \(!sim\) return;/.test(FN_DEL));

// ── [9] AS DUAS PEGADINHAS DO TEMPLATE LITERAL ──────────────────────────────
// As duas me pegaram NESTA entrega, e as duas ja tinham me pegado antes:
//   1. crase dentro de comentario FECHA o template e derruba a tela inteira.
//   2. \n de uma barra so vira quebra de linha de verdade e parte a string.
// O node --check nao pega nenhuma das duas (pro Node o <script> e' so texto);
// quem pega e' o tools/valida.js. Esta assercao roda ele dentro da suite, pra
// nao depender de eu lembrar.
bloco('[9] O TEMPLATE LITERAL DA BANCA CONTINUA INTEIRO');

const { execFileSync } = require('child_process');
let okValida = true, saida = '';
try {
  saida = execFileSync(process.execPath,
    [path.join(__dirname, 'tools', 'valida.js'), path.join(__dirname, 'src', 'routes', 'banca.js')],
    { encoding: 'utf8' });
} catch (e) { okValida = false; saida = (e.stdout || '') + (e.stderr || ''); }
t('o tools/valida.js aprova o <script> da Banca', okValida && /Tudo certo/.test(saida));
if (!okValida) console.log(saida.split('\n').slice(0, 5).join('\n'));

t('nenhuma crase dentro dos comentarios da funcao de excluir', !/`/.test(FN_DEL));
t('e as quebras de linha da caixa estao escapadas com duas barras',
  /\\\\n/.test(FN_DEL));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
