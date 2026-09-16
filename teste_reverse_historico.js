'use strict';
// teste_reverse_historico.js — O REGISTRO SEGUE A SUA APOSTA (Bruno, 15/09/2026)
//
// "quando inverto mudo a logica e meio que descarto a analise do motor,
// prevalecendo a minha. Entao nesse caso, deve ser alterado pra essa corrida
// exatamente como eu inverti... quando o resultado rodar, tem que entender que
// eu inverti e ganhando ou perdendo devera colocar o resultado correto."
//
// O DEFEITO: o idConfronto e' SEM DIRECAO (min x max), de proposito — e' assim
// que a aposta acha o confronto mesmo invertida. So que o confronto achado vem
// na direcao do MOTOR, e o `bateu` dele responde "o pick do motor chegou na
// frente?". Apostando 1 vence 4 num confronto montado como 4 vence 1, o
// Historico desenhava 4 vs 1 e contava o resultado ao contrario: green virava
// red, em silencio.
//
// O QUE ESTE TESTE PROTEGE:
//   1) que a linha invertida vira de verdade: par, nomes, pct e BATEU.
//   2) que o `bateu` sai da MESMA funcao de sempre. Nao existe regra nova de
//      resultado aqui — so o par certo entrando nela.
//   3) que a odd da BW SOME na linha invertida. Ela e' do outro sentido, e o
//      casamento de par e sem direcao: sem essa guarda, a coluna mostraria a
//      odd do lado contrario.
//   4) que quem NAO inverteu nao e tocado.
//
// Roda o bloco REAL do main.js, arrancado por marcador.
//
//   node teste_reverse_historico.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
const cd = require('./src/utils/camadasDoDia');
const { bateuPar } = require('./src/utils/avbResultado');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── arranca o bloco que vira a linha ────────────────────────────────────────
const INI = 'let reg = cd.registroDoHistorico(confs, escId);';
const FIM = '      if (reg) {';
const iA = SRC.indexOf(INI);
const iB = SRC.indexOf(FIM, iA);
if (iA < 0 || iB < 0) { console.error('ERRO: o bloco da inversao mudou de forma.'); process.exit(1); }
const BLOCO = SRC.slice(iA, iB);

const ctx = { cd: cd, bateuPar: bateuPar, Object: Object, String: String, Number: Number, console: console };
vm.createContext(ctx);
vm.runInContext('this.virar = function(confs, escId, esc, r){' + BLOCO + ' return reg; };', ctx);
const virar = ctx.virar;

// ── o cenario ───────────────────────────────────────────────────────────────
// Confronto do motor: T4 Headford Astrid vence T1 Glory Bono, 90%, TOP.
// Chegada: T1 chegou em 1o, T4 em 3o. Ou seja: o motor ERROU e quem inverteu
// acertou — que e exatamente o caso que o Historico contava trocado.
const CHEGADA = JSON.stringify([{ pos: 1, trap: 1 }, { pos: 2, trap: 2 }, { pos: 3, trap: 4 }]);
const CORRIDA = 'Star Pelaw A7', HORA = '8:16';
const ID = cd.idConfronto(CORRIDA, HORA, 4, 1);

function confronto(extra) {
  return Object.assign({
    id: ID, par: 'T4xT1',
    pick_trap: 4, pick_nome: 'Headford Astrid',
    outro_trap: 1, outro_nome: 'Glory Bono',
    pct: 90, camada: 'TOP', tier_motor: 'TOP',
    odd_bw: 1.5, razao_mercado: 1.2, market_pct: 60,
    bateu: bateuPar(CHEGADA, 4, 1),        // false: T4 chegou atras
    da_manha: true, melhor: true
  }, extra || {});
}
const R = { finishing_order_json: CHEGADA, abriu: null, odd_abertura: 1.5, abriu_par: '4x1' };

// ── [1] o caso que originou a entrega ───────────────────────────────────────
bloco('[1] APOSTEI NO SENTIDO CONTRARIO');

const escInv = { aTrap: 1, bTrap: 4, aNome: 'Glory Bono', bNome: 'Headford Astrid' };
let cf = virar([confronto()], ID, escInv, R);

t('o motor dizia que o T4 batia o T1', confronto().bateu === false);
t('a linha passa a ser T1 vence T4', cf.pick_trap === 1 && cf.outro_trap === 4);
t('com os nomes no lado certo',
  cf.pick_nome === 'Glory Bono' && cf.outro_nome === 'Headford Astrid');
t('o par textual acompanha', cf.par === 'T1xT4');
t('e o BATEU vira true — era isto que vinha trocado', cf.bateu === true);
t('que e exatamente o que o bateuPar diz pro SEU par', cf.bateu === bateuPar(CHEGADA, 1, 4));

t('a camada vira REVERSE', cf.camada === 'REVERSE');
t('mas o que o motor tinha dito fica guardado', cf.camada_motor === 'TOP');
t('e a linha se identifica como invertida', cf.invertido === true);
t('a conviccao vira o complemento: 90% a favor do T4 e 10% a favor do T1', cf.pct === 10);
t('a odd da BW some — ela e do outro sentido', cf.odd_bw === null);
t('e o mercado junto, pra nada sobrar do lado errado',
  cf.razao_mercado === null && cf.market_pct === null);

// ── [2] sem inversao, nada muda ─────────────────────────────────────────────
bloco('[2] QUEM NAO INVERTEU NAO E TOCADO');

const escIgual = { aTrap: 4, bTrap: 1 };
cf = virar([confronto()], ID, escIgual, R);
t('apostando na MESMA direcao, a linha e a do motor',
  cf.camada === 'TOP' && !cf.invertido && cf.pick_trap === 4);
t('o bateu continua o do motor', cf.bateu === false);
t('a odd da BW continua la', cf.odd_bw === 1.5);
t('e o pct nao e complementado', cf.pct === 90);

cf = virar([confronto()], null, null, R);
t('sem aposta nenhuma, idem', cf.camada === 'TOP' && !cf.invertido);

// Aposta num par que nao virou o registro: o registroDoHistorico devolve o
// melhor, e o `reg.id === escId` falha — nao pode virar a linha de outro par.
const OUTRO = cd.idConfronto(CORRIDA, HORA, 2, 3);
cf = virar([confronto()], OUTRO, { aTrap: 3, bTrap: 2 }, R);
t('aposta em par que nao e o registro nao vira a linha errada',
  cf.camada === 'TOP' && !cf.invertido && cf.pick_trap === 4);

// ── [3] o bateu sai da fonte unica ──────────────────────────────────────────
bloco('[3] NENHUMA REGRA NOVA DE RESULTADO');

t('o bloco chama o bateuPar, nao reimplementa nada',
  /bateu: bateuPar\(r\.finishing_order_json, Number\(esc\.aTrap\), Number\(esc\.bTrap\)\)/.test(SRC));

// Par fora da chegada continua INDEFINIDO, nao vira false.
const CHEGADA_CURTA = JSON.stringify([{ pos: 1, trap: 1 }, { pos: 2, trap: 2 }]);
cf = virar([confronto()], ID, escInv, { finishing_order_json: CHEGADA_CURTA });
t('galgo fora da chegada deixa o bateu INDEFINIDO, nunca false', cf.bateu === null);

// Corrida sem resultado ainda.
cf = virar([confronto()], ID, escInv, { finishing_order_json: null });
t('corrida sem chegada idem', cf.bateu === null);

// ── [4] a coluna "AvB na BW" ────────────────────────────────────────────────
// Sem guarda, o casamento de par (que e sem direcao, de proposito) devolveria
// a odd_abertura do sentido contrario.
bloco('[4] A ODD DA BW NAO VAZA PELO OUTRO LADO');

function arranca(nome) {
  const ini = SRC.indexOf('function ' + nome + '(');
  if (ini < 0) { console.error('ERRO: ' + nome + ' sumiu do main.js'); process.exit(1); }
  let i = SRC.indexOf('{', ini), n = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') n++;
    else if (SRC[i] === '}') { n--; if (!n) return SRC.slice(ini, i + 1); }
  }
  console.error('ERRO: nao fechei ' + nome); process.exit(1);
}
const ctxC = { console: console, String: String, Number: Number };
vm.createContext(ctxC);
vm.runInContext(arranca('_abriuDaLinha') + '\n' + arranca('_celulaCamada')
  + '\nthis.abriu = _abriuDaLinha; this.camada = _celulaCamada;', ctxC);

const invertida = virar([confronto()], ID, escInv, R);
let ab = ctxC.abriu(R, invertida);
t('a linha invertida continua marcando que o par ABRIU', ab.abriu === 1);
t('mas SEM odd — a que temos e do sentido contrario', ab.odd === null);
t('e o par mostrado e o seu', ab.par === 'T1xT4');

ab = ctxC.abriu(R, confronto());
t('na linha normal a odd continua aparecendo', ab.abriu === 1 && ab.odd === 1.5);

// REVERSE sem a marca de invertida (nao deveria acontecer) nao pode cair no
// ramo "FORA" e passar a ler races.abriu, que e de outro par.
ab = ctxC.abriu({ abriu: 0, odd_abertura: 9.9, abriu_par: '9x9' },
  Object.assign(confronto(), { camada: 'REVERSE', camada_motor: 'TOP', invertido: false }));
t('REVERSE nao desanda a coluna: o camada_motor responde pela plumbing', ab.abriu === 1);

// ── [5] o selo ──────────────────────────────────────────────────────────────
bloco('[5] O SELO REVERSE');

const selo = String(ctxC.camada(invertida));
t('a celula desenha REVERSE', selo.indexOf('>REVERSE<') >= 0);
t('numa cor que nao e nenhuma das tres camadas',
  selo.indexOf('#14b8a6') >= 0
  && selo.indexOf('#3b82f6') < 0 && selo.indexOf('#f97316') < 0 && selo.indexOf('#8b5cf6') < 0);
t('e o tooltip lembra o que o motor tinha dito', selo.indexOf('o motor chamou de TOP') >= 0);
t('a celula continua devolvendo UMA so', (selo.match(/<td[\s>]/g) || []).length === 1);

// ── [6] o que a linha REVERSE faz com os cartoes ────────────────────────────
// Os quatro cartoes contam por data-camada. Com REVERSE, a linha invertida sai
// dos cartoes TOP/HIGH/GOOD e continua no Geral — e e' o certo: aqueles tres
// medem o MOTOR, e uma aposta invertida e justamente a que o descarta. Contar
// ali sujaria a taxa que voce usa pra julgar o motor.
bloco('[6] OS CARTOES POR TIPO MEDEM O MOTOR, E REVERSE NAO E DELE');

t('o filtro de Tipo deixa isolar as invertidas',
  /<option value="REVERSE">REVERSE<\/option>/.test(SRC));
t('os cartoes seguem sendo tres, por camada do motor',
  /doTipo\('top'\)|'top', 'high', 'good'/.test(SRC) || /kpi-' \+ id/.test(SRC));
t('a linha leva a camada no data-camada, que e o que filtro e cartao leem',
  /data-camada="' \+ \(cf\.camada\|\|''\) \+ '"/.test(SRC));

// O outro caminho: aposta em par que NAO esta entre os confrontos (o motor
// nunca montou aquele par). Ele ja montava a linha com o bateu na direcao
// certa, mas rotulava 'INVERSAO' — dois vocabularios pro mesmo conceito e como
// o filtro e os cartoes passam a discordar entre si.
t('o par fora da lista tambem se chama REVERSE quando veio de inversao',
  /\(String\(esc\.origem \|\| ''\) === 'inversao'\)\s*\r?\n\s*\? 'REVERSE'/.test(SRC));
t('e as outras origens continuam como estavam',
  /String\(esc\.origem \|\| esc\.origem_pick \|\| 'FORA'\)\.toUpperCase\(\)/.test(SRC));

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
