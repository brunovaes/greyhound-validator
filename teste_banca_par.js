'use strict';
// teste_banca_par.js — A BANCA RESOLVE CONTRA A SUA APOSTA (Bruno, 16/09/2026)
//
// O que apareceu: "a banca nao esta atualizando". Metade das apostas do dia
// travadas em Pendente, todas elas com "-" no favorito e no underdog.
//
// A causa era pior que o sintoma. A consulta da Banca trazia a odd e as
// unidades do USUARIO e o par e o resultado da CORRIDA:
//
//   rud.odd, rud.bet_unidades   -> a sua aposta
//   r.name_fav, r.name_und      -> o par do motor da manha
//   r.bateu                     -> calculado pro par do motor
//
// Caso real, Vlley A6 11:59: a linha mostrava "Hawkfield Hugo x Arrigle
// Buster" (o par da manha, que a BW nem chegou a abrir) com a odd 1.61 (a
// aposta no T5 x T2) e green calculado pro par da manha. Pago pelo resultado
// de uma aposta que nao foi feita.
//
// E os Pendente eternos: quando o motor perde o pick durante o dia, uma rotina
// zera trap_fav/trap_und, entao races.bateu nunca resolve.
//
// A ESCOLHA DO BRUNO foi "recalcular so os Pendente presos": quem ja esta
// green ou red nao se mexe, mesmo tendo saido do par errado. Este teste trava
// exatamente essa precedencia — inclusive o que ela deixa em aberto.
//
//   node teste_banca_par.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'banca.js'), 'utf8');
const { bateuPar } = require('./src/utils/avbResultado');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

function arranca(nome) {
  const ini = SRC.indexOf('function ' + nome + '(');
  if (ini < 0) { console.error('ERRO: ' + nome + ' sumiu do banca.js'); process.exit(1); }
  let i = SRC.indexOf('{', ini), n = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') n++;
    else if (SRC[i] === '}') { n--; if (!n) return SRC.slice(ini, i + 1); }
  }
  console.error('ERRO: nao consegui fechar ' + nome); process.exit(1);
}

const ctx = { console: console, JSON: JSON, Object: Object, Number: Number, bateuPar: bateuPar };
vm.createContext(ctx);
vm.runInContext(arranca('_parEscolhido') + '\n' + arranca('resolverAposta')
  + '\nthis.f = resolverAposta;', ctx);
const resolver = ctx.f;

// chegada: T5 ganhou, T2 em 2o, T6 em 3o, T1 em 4o. T3 e T4 fora.
const CHEGADA = JSON.stringify([{ pos: 1, trap: 5 }, { pos: 2, trap: 2 }, { pos: 3, trap: 6 }, { pos: 4, trap: 1 }]);
const ESCOLHA = JSON.stringify({ aTrap: 5, bTrap: 2, aNome: 'Arrigle Buster (M)', bNome: 'Ballinabola Phil', odd: 1.61 });

function aposta(o) {
  return Object.assign({
    id: 1, hora: '3:59', corrida: 'Vlley A6',
    name_fav: 'Hawkfield Hugo (W)', name_und: 'Arrigle Buster (M)',
    odd: 1.61, bet_unidades: 2.5, bateu: '',
    avb_escolhido: null, finishing_order_json: null
  }, o || {});
}

// ── [1] o que JA decidiu nao se mexe ────────────────────────────────────────
bloco('[1] GREEN E RED NAO SE MEXEM — escolha do Bruno, 16/09');

let r = resolver(aposta({ bateu: 'sim', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('bateu="sim" continua "sim", mesmo com par escolhido diferente', r.bateu === 'sim');
t('e a linha e marcada como divergente — o numero fica, o aviso aparece', r.par_divergente === true);

r = resolver(aposta({ bateu: 'nao', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('bateu="nao" tambem nao se mexe', r.bateu === 'nao' && r.par_divergente === true);

// Sem par escolhido nao ha divergencia possivel: a linha E do par do motor.
r = resolver(aposta({ bateu: 'sim' }));
t('sem par escolhido, nao ha divergencia a apontar', r.par_divergente === false);

// ── [2] os Pendente presos destravam ────────────────────────────────────────
bloco('[2] PENDENTE PRESO RESOLVE PELO SEU PAR');

r = resolver(aposta({ bateu: '', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('T5 (1o) x T2 (2o): bateu vira "sim"', r.bateu === 'sim');
t('e a fonte fica registrada como o SEU par', r.fonte_resultado === 'seu_par');
t('sem motivo de pendencia, porque resolveu', r.motivo_pendente === null);

const INVERSO = JSON.stringify({ aTrap: 2, bTrap: 5, aNome: 'Ballinabola Phil', bNome: 'Arrigle Buster (M)' });
r = resolver(aposta({ bateu: '', avb_escolhido: INVERSO, finishing_order_json: CHEGADA }));
t('apostando no sentido contrario (T2 x T5), vira "nao" — a conta e do PAR, com direcao',
  r.bateu === 'nao');

r = resolver(aposta({ bateu: null, avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('bateu null (e nao string vazia) tambem destrava', r.bateu === 'sim');

// ── [3] quando NAO da pra resolver, a linha diz por que ─────────────────────
// Pendente mudo e' o que fez isso passar despercebido: ficava igual a uma
// corrida que so nao tinha corrido ainda.
bloco('[3] PENDENTE COM MOTIVO');

r = resolver(aposta({ bateu: '', avb_escolhido: ESCOLHA, finishing_order_json: null }));
t('sem chegada: continua pendente', r.bateu === '');
t('e diz que a corrida ainda nao tem chegada', /ainda nao tem chegada/.test(r.motivo_pendente || ''));

r = resolver(aposta({ bateu: '', avb_escolhido: null, finishing_order_json: CHEGADA }));
t('sem par registrado: pendente', r.bateu === '');
t('e diz que a aposta nao tem par', /sem par registrado/.test(r.motivo_pendente || ''));

const FORA = JSON.stringify({ aTrap: 3, bTrap: 4 });
r = resolver(aposta({ bateu: '', avb_escolhido: FORA, finishing_order_json: CHEGADA }));
t('par que nao aparece na chegada: pendente, NUNCA "nao"', r.bateu === '');
t('e diz que um dos galgos nao esta na chegada', /nao aparece na chegada/.test(r.motivo_pendente || ''));

r = resolver(aposta({ bateu: '', avb_escolhido: '{lixo', finishing_order_json: CHEGADA }));
t('JSON quebrado na escolha nao estoura — cai em pendente', r.bateu === '' && !!r.motivo_pendente);

// ── [4] os NOMES seguem a sua aposta ────────────────────────────────────────
// Mostrar a dupla do motor na linha da sua aposta foi o que escondeu o
// problema por tanto tempo: a odd era de um par e os nomes de outro.
bloco('[4] O FAVORITO E O UNDERDOG SAO OS SEUS');

r = resolver(aposta({ bateu: 'sim', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('mostra o par apostado, nao o da manha',
  r.name_fav === 'Arrigle Buster (M)' && r.name_und === 'Ballinabola Phil');
t('e marca a fonte do par', r.fonte_par === 'sua_escolha');

r = resolver(aposta({ bateu: 'sim' }));
t('sem escolha registrada, cai no par do motor (comportamento antigo)',
  r.name_fav === 'Hawkfield Hugo (W)' && r.fonte_par === 'motor');

const SEM_NOME = JSON.stringify({ aTrap: 5, bTrap: 2 });
r = resolver(aposta({ bateu: '', avb_escolhido: SEM_NOME, finishing_order_json: CHEGADA }));
t('escolha sem nomes gravados mostra os boxes, nao os nomes da outra dupla',
  r.name_fav === 'T5' && r.name_und === 'T2');

// ── [5] o caso real do print ────────────────────────────────────────────────
bloco('[5] Vlley A6 11:59 — a linha que denunciou o problema');

const real = resolver(aposta({
  bateu: 'sim', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA,
  name_fav: 'Hawkfield Hugo (W)', name_und: 'Arrigle Buster (M)', odd: 1.61
}));
t('os nomes deixam de ser o par da manha', real.name_fav !== 'Hawkfield Hugo (W)');
t('passam a ser o par da odd 1.61', real.name_fav === 'Arrigle Buster (M)' && real.name_und === 'Ballinabola Phil');
t('o green NAO e recalculado (a escolha do Bruno foi essa)', real.bateu === 'sim');
t('mas a linha passa a avisar que o resultado veio do par do motor', real.par_divergente === true);

// ── [6] uma fonte so pra "quem chegou na frente" ────────────────────────────
bloco('[6] A BANCA NAO REIMPLEMENTA O bateuPar');

t('ela importa a funcao do avbResultado', /require\('\.\.\/utils\/avbResultado'\)/.test(SRC));
t('e nao tem uma copia propria', !/function bateuPar/.test(SRC));
t('a query passou a ler o avb_escolhido, que ja estava no JOIN sem uso',
  /rud\.avb_escolhido AS avb_escolhido/.test(SRC));
t('e a chegada, pra poder resolver', /r\.finishing_order_json/.test(SRC));
t('toda aposta passa pelo resolverAposta', /\.all\(userId, CANONICO\)\.map\(resolverAposta\)/.test(SRC));

// ── [7] o buraco que fica aberto, declarado ─────────────────────────────────
// O robo continua gravando races.bateu pelo par do motor. Aposta NOVA em par
// da BW vai cair no ramo (1) com o resultado da dupla errada. Fechar isso
// exige inverter a precedencia, e ai numeros do passado se mexem — que foi
// justamente o que o Bruno nao quis agora. Fica escrito no fonte.
bloco('[7] O QUE CONTINUA ABERTO ESTA ESCRITO NO CODIGO');

t('o comentario declara que aposta nova em par da BW ainda cai no par do motor',
  /aposta NOVA em[\s\S]{0,120}?par da BW/.test(SRC));
t('e diz qual e o preco de fechar (numeros do passado se mexem)',
  /numeros do passado se mexem/.test(SRC));

// ── [8] BANCA FIXA E AS TRES BANCAS (Bruno, 16/09/2026) ────────────────────
// O encadeamento mes-a-mes saiu: a unidade valia coisas diferentes em meses
// diferentes, entao 2,5 unidades num mes de banca 623 nao era a mesma aposta
// que 2,5 unidades num mes de banca 1000, e as taxas nao eram comparaveis.
bloco('[8] A BANCA E FIXA, E A BASE E UMA SO');

t('o encadeamento mes-a-mes nao existe mais',
  !/saldoAnterior/.test(SRC) && !/const inicial = overrides\[ym\]/.test(SRC));
t('a bankroll_months deixou de ser lida no calculo',
  !/SELECT year_month, banca_inicial FROM bankroll_months/.test(SRC));
t('todo mes usa a mesma base', /inicial: fixa,/.test(SRC));
t('e o ganho em R\$ sai dela', /\(ganhoPct \/ 100\) \* fixa/.test(SRC));

// As tres bancas, rodando.
const ctxB = { console: console, Object: Object, Number: Number };
vm.createContext(ctxB);
vm.runInContext(arranca('getBancas')
  + '\nthis.g = function(cfg, cadeia, fixa){'
  + '  getUserConfig = function(){ return cfg; };'
  + '  getBancaPadrao = function(){ return fixa; };'
  + '  return getBancas(1, cadeia);'
  + '};'
  + '\nvar getUserConfig, getBancaPadrao;', ctxB);

const CADEIA = { '2026-09': { apostas: [
  { dia: '2026-09-10', ganhoReais: 25 },
  { dia: '2026-09-14', ganhoReais: -25 },
  { dia: '2026-09-16', ganhoReais: 40 },
  { dia: '2026-09-16', ganhoReais: null }   // pendente: nao entra
]}};

let b = ctxB.g({ banca_valor_inicial: 1000 }, CADEIA, 1000);
t('sem reset nenhum, a acumulada conta desde a primeira aposta (1000 + 40)',
  b.bancaAcumulada === 1040);
t('aposta pendente (ganhoReais null) nao entra na conta', b.bancaAcumulada === 1040);
t('a fixa nao se mexe', b.bancaFixa === 1000);
// Sem marco de reset nao ha de quando contar. Somar o historico em cima de
// zero mostraria um numero com cara de saldo real da casa.
t('a BW nunca ancorada devolve null, e a tela desenha um traco', b.bancaBw === null);

b = ctxB.g({ banca_valor_inicial: 1000, banca_fixa_reset_em: '2026-09-15' }, CADEIA, 1000);
t('com reset em 15/09, a acumulada conta so o que veio depois (1000 + 40)',
  b.bancaAcumulada === 1040);
b = ctxB.g({ banca_valor_inicial: 1000, banca_fixa_reset_em: '2026-09-12' }, CADEIA, 1000);
t('reset em 12/09 pega o red do dia 14 tambem (1000 - 25 + 40)',
  b.bancaAcumulada === 1015);
b = ctxB.g({ banca_valor_inicial: 1000, banca_fixa_reset_em: '2026-09-17' }, CADEIA, 1000);
t('reset no futuro deixa a acumulada igual a fixa', b.bancaAcumulada === 1000);

b = ctxB.g({ banca_valor_inicial: 1000, banca_bw_valor: 300, banca_bw_reset_em: '2026-09-14' }, CADEIA, 1000);
t('a BW soma a partir do PROPRIO reset, independente da fixa (300 - 25 + 40)',
  b.bancaBw === 315);
t('e guarda o valor informado, pra tela poder explicar de onde saiu', b.bancaBwBase === 300);

t('a rota de reset existe e aceita fixa ou bw', /router\.post\('\/reset-banca'/.test(SRC)
  && /qual === 'fixa'/.test(SRC) && /qual === 'bw'/.test(SRC));
t('e da pra DESFAZER um reset (marco volta a null)', /desfazer \? null : hoje/.test(SRC));
t('resetar nao apaga aposta nenhuma — so move o marco',
  !/DELETE FROM races|DELETE FROM race_user_data/.test(SRC));

// ── [9] os cartoes do dia ──────────────────────────────────────────────────
bloco('[9] OITO CARTOES, UMA LINHA, SEM PENDENTES');

t('o cartao Pendentes saiu', !/lbl">Pendentes</.test(SRC));
t('entraram Banca fixa, acumulada e BW',
  /lbl">Banca fixa</.test(SRC) && /lbl">Banca acumulada</.test(SRC) && /lbl">Banca BW</.test(SRC));
t('a BW e amarela', /\.card \.val\.bw\{color:#eab308\}/.test(SRC) && /class="val bw"/.test(SRC));
t('o dia usa a linha de oito', /cardsEl\.className = 'cards l8'/.test(SRC));
t('com fonte e respiro menores so nela', /\.cards\.l8 \.val\{font-size:16px/.test(SRC));
t('e Mes e Ano voltam pro grid normal (senao herdam o l8 ao trocar de aba)',
  (SRC.match(/cardsEl\.className = 'cards';/g) || []).length === 2);
t('abaixo de 1180px a linha quebra sozinha',
  /@media\(max-width:1180px\)\{\.cards\.l8/.test(SRC));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
