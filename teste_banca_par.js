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

// O par do MOTOR entra na fixture porque a regra nova compara com ele: T1 bate
// T5, que e' o SENTIDO CONTRARIO da ESCOLHA (T5 bate T2 nao, mas o ponto e que
// a dupla e outra). E' o cenario real: o motor montou uma coisa, o Bruno
// apostou noutra.
function aposta(o) {
  return Object.assign({
    id: 1, hora: '3:59', corrida: 'Vlley A6',
    name_fav: 'Hawkfield Hugo (W)', name_und: 'Arrigle Buster (M)',
    trap_fav: 1, trap_und: 5,
    odd: 1.61, bet_unidades: 2.5, bateu: '',
    avb_escolhido: null, finishing_order_json: null
  }, o || {});
}

// ── [1] O SEU PAR MANDA ─────────────────────────────────────────────────────
//
// ESTE BLOCO MUDOU DE LADO EM 17/09/2026, e a mudanca e o ponto do arquivo.
//
// Ele se chamava "GREEN E RED NAO SE MEXEM" e protegia a regra antiga: coluna
// decidida manda, fim. Essa regra produziu a linha do Wtrfd A6 das 9:12 —
// Green, R$ 16,75 creditados, numa aposta que perdeu. O teste estava passando
// e o dinheiro estava errado, porque o teste guardava a decisao e nao a
// verdade. Bruno em 17/09: "pode corrigir geral".
bloco('[1] O SEU PAR MANDA, MESMO COM A COLUNA JA DECIDIDA');

// A coluna diz 'sim' (o pick do MOTOR, T1, chegou na frente do T5? a coluna
// afirma que sim). A aposta foi T5 bate T2, e na chegada o T5 chegou em 1o e o
// T2 em 2o: pelo par DELE tambem e 'sim' — entao preciso de um caso em que as
// duas respostas DIFEREM, senao o teste nao prova nada.
let r = resolver(aposta({ bateu: 'sim', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('a coluna dizia sim e o seu par tambem: continua sim', r.bateu === 'sim');
t('mas agora a resposta vem do SEU par, nao da coluna', r.fonte_resultado === 'seu_par');

// O CASO DO DINHEIRO: a coluna diz 'sim', o seu par diz 'nao'.
// Aposta T2 bate T5. Na chegada o T5 chegou na frente. Sua aposta PERDEU.
const INVERSA = JSON.stringify({ aTrap: 2, bTrap: 5, aNome: 'Ballinabola Phil', bNome: 'Arrigle Buster (M)' });
r = resolver(aposta({ bateu: 'sim', avb_escolhido: INVERSA, finishing_order_json: CHEGADA }));
t('COLUNA DIZ SIM, SEU PAR DIZ NAO -> a linha vira RED', r.bateu === 'nao');
t('e a fonte e o seu par', r.fonte_resultado === 'seu_par');
t('esta e' + ' a linha que antes pagava um green que voce nao ganhou',
  r.bateu !== 'sim');
t('e ela e marcada como sentido diferente do motor', r.par_divergente === true);

// E o contrario tambem: coluna 'nao', seu par 'sim' -> a linha vira GREEN.
r = resolver(aposta({ bateu: 'nao', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('COLUNA DIZ NAO, SEU PAR DIZ SIM -> a linha vira GREEN', r.bateu === 'sim');
t('a correcao anda nos dois sentidos, nao so contra voce', r.fonte_resultado === 'seu_par');

// Sem par escolhido nao ha divergencia possivel: a linha E do par do motor.
r = resolver(aposta({ bateu: 'sim' }));
t('sem par escolhido, nao ha divergencia a apontar', r.par_divergente === false);

// APOSTANDO NO MESMO SENTIDO DO MOTOR (T1 bate T5) nada diverge, e o selo NAO
// pode acender. A versao antiga do `par_divergente` acendia aqui tambem, porque
// so olhava "tem par escolhido e a coluna decidiu" — acendia em toda linha
// resolvida e por isso nao queria dizer nada.
const IGUAL = JSON.stringify({ aTrap: 1, bTrap: 5, aNome: 'Hawkfield Hugo (W)', bNome: 'Arrigle Buster (M)' });
r = resolver(aposta({ bateu: 'sim', avb_escolhido: IGUAL, finishing_order_json: CHEGADA }));
t('apostando no MESMO sentido do motor, o selo nao acende', r.par_divergente === false);
t('e o resultado sai do seu par do mesmo jeito (T5 chegou antes do T1: red)',
  r.bateu === 'nao' && r.fonte_resultado === 'seu_par');

// Corrida que perdeu o tier fica com trap_fav/trap_und zerados. Sem o par do
// motor nao ha com o que comparar, e "nao sei" nao pode virar "e diferente".
r = resolver(aposta({ trap_fav: 0, trap_und: 0, bateu: 'sim',
  avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA }));
t('sem o par do motor gravado, o selo fica apagado', r.par_divergente === false);
t('mas o resultado continua saindo do SEU par', r.fonte_resultado === 'seu_par' && r.bateu === 'sim');

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
t('sem chegada: continua pendente', r.bateu === null);
t('e diz que a corrida ainda nao tem chegada', /ainda nao tem chegada/.test(r.motivo_pendente || ''));

r = resolver(aposta({ bateu: '', avb_escolhido: null, finishing_order_json: CHEGADA }));
t('sem par registrado: pendente', r.bateu === null);
t('e diz que a aposta nao tem par', /sem par registrado/.test(r.motivo_pendente || ''));

const FORA = JSON.stringify({ aTrap: 3, bTrap: 4 });
r = resolver(aposta({ bateu: '', avb_escolhido: FORA, finishing_order_json: CHEGADA }));
t('par que nao aparece na chegada: pendente, NUNCA "nao"', r.bateu === null);
t('e diz que um dos galgos nao esta na chegada', /nao aparece na chegada/.test(r.motivo_pendente || ''));

// CONSEQUENCIA DECLARADA da regra nova: uma linha que ANTES estava green pela
// coluna e cujo galgo seu nao aparece na chegada VOLTA a ser Pendente. E' pior
// de ver e e' honesto: ninguem sabe se a sua aposta ganhou, e a coluna responde
// por outra dupla.
const CHEGADA_CURTA = JSON.stringify([{ pos: 1, trap: 1 }, { pos: 2, trap: 6 }]);
r = resolver(aposta({ bateu: 'sim', avb_escolhido: ESCOLHA, finishing_order_json: CHEGADA_CURTA }));
t('green da coluna com galgo seu fora da chegada volta a Pendente', r.bateu === null);
t('e a linha diz por que, citando a SUA dupla',
  /SUA dupla/.test(r.motivo_pendente || ''));

r = resolver(aposta({ bateu: '', avb_escolhido: '{lixo', finishing_order_json: CHEGADA }));
t('JSON quebrado na escolha nao estoura — cai em pendente', r.bateu === null && !!r.motivo_pendente);

// Sem chegada, mas apostando no MESMO sentido do motor: a coluna responde a
// mesma pergunta, entao ela vale. E' o unico caso em que ela ainda manda com
// par escolhido — e existe pra chegada editada na mao nao virar Pendente.
r = resolver(aposta({ bateu: 'sim', avb_escolhido: IGUAL, finishing_order_json: null }));
t('sem chegada e no mesmo sentido, a coluna ainda vale', r.bateu === 'sim' && r.fonte_resultado === 'coluna');
r = resolver(aposta({ bateu: 'sim', avb_escolhido: ESCOLHA, finishing_order_json: null }));
t('mas no sentido diferente ela NAO vale: vira Pendente', r.bateu === null);

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
// ATUALIZADO EM 17/09: o green agora E recalculado. Nesta linha o par do Bruno
// (T5 bate T2) tambem ganhou, entao o numero coincide — mas a FONTE mudou, e e'
// a fonte que garante que da proxima vez, quando as respostas divergirem, quem
// manda e' a dupla dele.
t('o green agora sai do SEU par, nao da coluna', real.bateu === 'sim' && real.fonte_resultado === 'seu_par');
t('e a linha avisa que o sentido e diferente do motor', real.par_divergente === true);

// ── [6] uma fonte so pra "quem chegou na frente" ────────────────────────────
bloco('[6] A BANCA NAO REIMPLEMENTA O bateuPar');

t('ela importa a funcao do avbResultado', /require\('\.\.\/utils\/avbResultado'\)/.test(SRC));
t('e nao tem uma copia propria', !/function bateuPar/.test(SRC));
t('a query passou a ler o avb_escolhido, que ja estava no JOIN sem uso',
  /rud\.avb_escolhido AS avb_escolhido/.test(SRC));
t('e a chegada, pra poder resolver', /r\.finishing_order_json/.test(SRC));
t('toda aposta passa pelo resolverAposta', /\.all\(userId, CANONICO\)\.map\(resolverAposta\)/.test(SRC));

// ── [7] O BURACO FECHOU, E O PRECO ESTA ESCRITO ─────────────────────────────
// Ate 16/09 este bloco verificava que o buraco estava DECLARADO no fonte. Em
// 17/09 ele fechou, entao o bloco passa a verificar que a coluna do motor nao
// tem mais como decidir sozinha uma linha cujo par e' outro.
bloco('[7] A COLUNA DO MOTOR NAO DECIDE MAIS SOZINHA');

t('o caminho do seu par vem ANTES de qualquer olhada na coluna',
  /if \(esc && a\.finishing_order_json\)[\s\S]{0,400}?bateuPar\(a\.finishing_order_json/.test(SRC));
t('a coluna so entra com par escolhido se o sentido for o mesmo',
  /colunaDecidida && mesmoSentido/.test(SRC));
t('a comparacao de sentido e feita com direcao, contra o par do motor',
  /String\(esc\.aTrap\) === String\(a\.trap_fav\)/.test(SRC)
  && /String\(esc\.bTrap\) === String\(a\.trap_und\)/.test(SRC));
t('e o preco da correcao esta escrito no fonte',
  /numeros do passado se corrigem sozinhos/.test(SRC));
t('inclusive o efeito colateral de linha que volta a Pendente',
  /volta a ser Pendente/.test(SRC));
t('o selo da tela deixou de ser alerta ambar e virou informacao',
  !/#f59e0b[^']*O resultado desta linha foi calculado pelo par do motor/.test(SRC)
  && /seu par/.test(SRC));

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
