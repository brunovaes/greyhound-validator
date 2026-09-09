'use strict';
// teste_sim_painel.js — O SIMULADOR NAO PODE MENTIR.
//
//   node teste_sim_painel.js
//
// Por que existe: um simulador serve pra decidir se uma mudanca esta certa. Se
// ele mostra uma coisa e o motor avalia outra, ele nao e' inutil — e' pior que
// nao ter simulador nenhum, porque voce aprova uma tela errada achando que
// conferiu.
//
// O risco concreto e' o HORARIO. O payload carrega a hora UK (o formato do PDF)
// e todo o resto do sistema deriva a hora BR dela, pelo horaBr(). O simulador
// faz o caminho contrario: parte do horario BR que quer simular e volta pra UK.
// Se essa volta nao for o inverso EXATO do horaBr, a corrida aparece na tela com
// um horario e e' avaliada com outro — e o corte de 1 minuto, que e' justamente
// o que se quer testar, mede a coisa errada.
//
// O inverso nao cobre o dia inteiro: o horaBr so consegue produzir horarios BR
// entre 6h e 20h (nao existe corrida inglesa de madrugada). Fora dessa janela o
// simulador ancora o cenario as 15:00 e AVISA. Este teste confere as duas
// coisas: coerencia dentro da janela, e ancoragem honesta fora dela.

const fs = require('fs');
const path = require('path');

const cd = require(path.join(__dirname, 'src', 'utils', 'camadasDoDia'));
const SRC = fs.readFileSync(path.join(__dirname, 'public', 'js', 'simPainel.js'), 'utf8');

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK   ' : '  FALHA') + ' | ' + msg);
  if (!cond) falhas++;
}
const norm = s => {
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? (parseInt(m[1], 10) + ':' + m[2]) : String(s);
};

// Carrega o simulador com o relogio congelado numa hora escolhida. E' o proprio
// arquivo que vai pro ar, lido do disco — nao uma copia da logica aqui.
function carregar(h, m) {
  const D = Date;
  const base = new D(2026, 8, 9, h, m || 0, 0).getTime();
  global.Date = class extends D {
    constructor(...a) { if (!a.length) super(base); else super(...a); }
    static now() { return base; }
  };
  const win = {
    results: [],
    location: { search: '?simpainel=1', pathname: '/greyhound/' },
    document: {
      readyState: 'complete',
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild() {} }),
      body: { appendChild() {} },
      addEventListener() {}
    },
    fetch: function () { return Promise.resolve('REAL'); },
    setTimeout: setTimeout
  };
  global.URLSearchParams = URLSearchParams;
  global.Response = class { constructor(b, o) { this.body = b; this.opts = o; this.status = 200; } };
  global.location = win.location;
  global.document = win.document;
  const log = console.log, err = console.error;
  const erros = [];
  console.log = () => {}; console.error = (...a) => erros.push(a.join(' '));
  new Function('window', SRC)(win);
  console.log = log; console.error = err;
  global.Date = D;
  return { sim: win._SIM_PAINEL, win: win, erros: erros };
}

// ── 1) a hora que a tela mostra e a que o motor avalia ──────────────────────
console.log('\n[1] A HORA DA TELA E A HORA DO MOTOR SAO A MESMA, O DIA INTEIRO\n');

let geradas = 0, incoerentes = 0, ancoradas = 0, comErro = 0;
for (let h = 0; h < 24; h++) {
  for (const m of [0, 1, 15, 30, 45, 58, 59]) {
    const { sim, erros } = carregar(h, m);
    if (erros.length) comErro++;
    if (sim.ancora.deslocado) ancoradas++;
    for (const c of sim.payload().corridas) {
      geradas++;
      // A prova: passar a hora UK do payload pelo horaBr REAL do sistema tem que
      // devolver exatamente o hora_br que o payload declara.
      if (norm(cd.horaBr(c.hora)) !== norm(c.hora_br)) {
        if (incoerentes < 3) {
          console.log('       ' + h + ':' + String(m).padStart(2, '0')
            + '  uk=' + c.hora + ' -> horaBr=' + cd.horaBr(c.hora) + '  mas hora_br=' + c.hora_br);
        }
        incoerentes++;
      }
    }
  }
}
console.log('    ' + geradas + ' corridas geradas em 168 horarios do dia');
ok(incoerentes === 0,
   'nenhuma hora UK incoerente com a hora BR  (achei ' + incoerentes + ')');
ok(comErro === 0,
   'o guarda interno nunca disparou — nenhum horario caiu fora da janela  (' + comErro + ' disparos)');
ok(ancoradas > 0 && ancoradas < 168,
   'a ancoragem acontece so PARTE do dia, como esperado  (' + ancoradas + ' de 168 horarios)');

// ── 2) dentro da janela, os minutos batem com o relogio ─────────────────────
// E' isso que permite ver a linha sumir sozinha 1 min depois da largada. Se o
// cenario for ancorado, esse teste especifico deixa de valer — por isso o
// banner avisa.
console.log('\n[2] DENTRO DA JANELA, O CENARIO SEGUE O SEU RELOGIO\n');

const meio = carregar(15, 0);
ok(meio.sim.ancora.deslocado === false, 'as 15:00 o cenario NAO e ancorado');
const P = meio.sim.payload();
ok(P.corridas.length === 5, 'o cenario tem 5 corridas  (' + P.corridas.length + ')');

// DOIS RELOGIOS, e vale entender a diferenca antes de ler o resultado:
//
//   o SIMULADOR roda no navegador e usa a hora LOCAL da maquina (getHours()).
//   o minutosParaLargada roda no SERVIDOR, que fica em UTC, e converte pra BR
//   subtraindo 3h fixas.
//
// No PC do Bruno os dois dao o mesmo numero, porque o fuso local dele E o de
// Brasilia. Aqui no teste a maquina roda em UTC, entao pra comparar as duas
// contas de forma justa o `agora` entra somado de 3h — desfazendo o -3 que o
// modulo aplica. Sem isso a diferenca daria exatos 180 minutos, que e' o fuso,
// nao um erro do cenario.
//
// CONSEQUENCIA REAL: se ele abrir a tela de um fuso diferente do de Brasilia, o
// simulador e o backend passam a discordar. Nao e' um problema hoje, mas e' o
// tipo de coisa que so aparece em viagem — fica registrado aqui.
const AGORA_BR = new Date(2026, 8, 9, 15, 0, 0).getTime();
const AGORA_SERVIDOR = AGORA_BR + 3 * 3600 * 1000;
// O esperado sai do proprio hora_br do payload, e nao do `_min` do cenario. A
// hora tem precisao de MINUTO: a corrida de "-0,5 min" e' gerada como 14:59 e o
// motor a le, corretamente, como tendo largado ha 1 minuto. Comparar com o -0,5
// original acusaria um erro que nao existe — e, pior, esconderia um de verdade
// atras de um arredondamento.
function minutosDe(hhmm) {
  const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
const AGORA_MIN = 15 * 60;
for (const c of P.corridas) {
  const dif = cd.minutosParaLargada(c.hora, AGORA_SERVIDOR);
  const esperado = minutosDe(c.hora_br) - AGORA_MIN;
  ok(dif === esperado,
     'a corrida de ' + c.hora_br + ' BR (' + String(c._min).padStart(5) + ' min no cenario)'
     + ' e avaliada como ' + esperado + ' min  (deu ' + dif + ')');
}

// E o que decide a permanencia na tela: a de -0,5 min do cenario vira 14:59 e
// AINDA vale, porque a graca e' de 1 minuto. A de -2 min ja nao.
ok(cd.expirou(P.corridas[2].hora, AGORA_SERVIDOR) === false,
   'a corrida que largou ha pouco AINDA nao expirou — e o que a mantem na lista');
ok(cd.expirou(P.corridas[3].hora, AGORA_SERVIDOR) === true,
   'a que largou ha 2 minutos expirou — e o que a tira');

// ── 3) o cenario cobre os casos que a vida real demora a dar ────────────────
console.log('\n[3] O CENARIO COBRE O QUE INTERESSA\n');

const porTipo = {};
let quatro = null, expirada = null, soOportunidade = null;
for (const c of P.corridas) {
  if (c.confrontos.length === 4) quatro = c;
  if (c.expirado) expirada = c;
  if (c.confrontos.every(x => x.camada === 'OPORTUNIDADE')) soOportunidade = c;
  for (const x of c.confrontos) porTipo[x.camada] = (porTipo[x.camada] || 0) + 1;
}
ok(!!quatro, 'ha uma corrida com QUATRO AvBs — o arranjo em quadrado');
ok(quatro && quatro.confrontos.filter(x => x.camada === 'TOP').length === 2,
   'e dois deles sao TOP — a regra de 09/09 de que o tipo pode repetir');
ok(quatro && quatro.confrontos.filter(x => x.melhor).length === 1,
   'so um dos quatro leva a marca `melhor`');
for (const t of ['TOP', 'HIGH', 'GOOD', 'OPORTUNIDADE']) {
  ok((porTipo[t] || 0) > 0, 'o cenario tem pelo menos um ' + t);
}
ok(!!expirada, 'ha uma corrida que passou da graca de 1 minuto');
ok(expirada && expirada.confrontos.every(x => x.aguardando_entrada === false),
   'e nela NENHUM AvB aguarda entrada — e o que faz a linha sumir da lista');
ok(!!soOportunidade, 'ha uma corrida so com OPORTUNIDADE');
ok(soOportunidade && soOportunidade.confrontos.every(x => x.aguardando_entrada === false),
   'e OPORTUNIDADE nunca aguarda entrada — nao da pra apostar no que a BW nao abriu');

const perto = P.corridas.filter(c => c._min < 0 && !c.expirado)[0];
ok(!!perto, 'ha uma corrida que JA LARGOU mas ainda esta dentro do minuto de graca');
ok(perto && perto.confrontos.some(x => x.aguardando_entrada),
   'e ela CONTINUA aguardando entrada — a BW ainda aceita');

// ── 4) o campo aguardando_entrada segue a MESMA conta do servidor ───────────
// Se o simulado for mais permissivo que o real, a tela passa no teste e falha
// em producao.
console.log('\n[4] O SIMULADO NAO E MAIS PERMISSIVO QUE O REAL\n');
for (const c of P.corridas) {
  for (const x of c.confrontos) {
    const real = (x.camada !== 'OPORTUNIDADE' && !c.expirado);
    ok(x.aguardando_entrada === real,
       c.corrida + ' ' + x.par + ' (' + x.camada + '): aguardando=' + x.aguardando_entrada);
  }
}

// ── 5) a simulacao nao grava aposta ─────────────────────────────────────────
// O risco mais caro deste arquivo: um "Entrei !" num AvB inventado virar aposta
// de verdade no Historico e na Banca.
console.log('\n[5] A SIMULACAO NAO GRAVA APOSTA\n');

const { win } = carregar(15, 0);
let respostaPut = null;
win.fetch('/greyhound/api/race/123', { method: 'PUT', body: '{"odd":1.9}' })
  .then(r => { respostaPut = r; });
ok(SRC.indexOf("String(opts.method).toUpperCase() === 'PUT'") !== -1,
   'o simulador intercepta o PUT que registra a aposta');
ok(SRC.indexOf('PUT bloqueado') !== -1, 'e o bloqueio deixa rastro no console');

// O fetch de verdade so e chamado pra quem NAO e painel-dia nem PUT de aposta.
let passouDireto = false;
carregar(15, 0).win.fetch('/greyhound/api/outra-coisa').then(v => { passouDireto = (v === 'REAL'); });

// ── 5b) A TELA COM O DIA ENCERRADO ─────────────────────────────────────────
//
// O ERRO da primeira versao: eu testei o payload e dei o simulador por pronto.
// Mas a lista de corridas nao vem do painel do dia — vem do `results`, que os
// PDFs carregam. Com a tela vazia, o payload chegava certinho e nao havia UMA
// LINHA pra destacar. O Bruno abriu e viu tela preta.
//
// Este bloco testa o que faltava: com `results` vazio, o simulador tem que
// semear as corridas ele mesmo.
console.log('\n[5b] COM A TELA VAZIA, O SIMULADOR SEMEIA AS CORRIDAS\n');

(function () {
  // O `carregar` roda o arquivo inteiro, e o arranque dele ja semeia — que e'
  // justamente o comportamento que faltava. Entao a lista chega aqui cheia.
  const { sim, win } = carregar(15, 0);
  ok(win.results.length === 5,
     'ao carregar com a tela vazia, o simulador JA semeou as 5 corridas  (' + win.results.length + ')');
  ok(win.results.every(r => r._simulado === true),
     'e todas vem marcadas como simuladas');

  // Os campos que o renderRaceListPanel e o shouldShowRace LEEM. Faltando
  // qualquer um deles a linha nao desenha, ou desenha sem o par.
  const r0 = win.results[0];
  for (const campo of ['tipo', 'nivel', 'hora', 'hora_br', 'corrida', 'dist', 'trapFav', 'trapUnd']) {
    ok(r0[campo] !== undefined && r0[campo] !== '',
       'a corrida semeada tem ' + campo + '  (' + r0[campo] + ')');
  }
  ok(r0.nivel !== 'skip' && r0.trapFav > 0,
     'e passa no filtro da lista (nivel != skip, trapFav > 0) — senao nunca apareceria');

  // A chave que casa a linha da lista com o AvB do painel. Se o hora/corrida
  // divergirem entre os dois, a linha existe mas nunca pisca.
  const P = sim.payload();
  const chave = x => String(x.corrida).trim().toLowerCase() + '|' + String(x.hora);
  const casam = P.corridas.filter(c => win.results.some(r => chave(r) === chave(c))).length;
  ok(casam === 5,
     'as 5 linhas da lista casam com as 5 corridas do painel  (' + casam + ')');

  // Semear DE NOVO nao pode acontecer. O painel bate a cada 18s; re-semear
  // reconstruiria a lista debaixo do cursor e fecharia sozinha a corrida que
  // voce acabou de abrir — o mesmo defeito que a tela de disputa tinha.
  ok(sim.semearResults() === false, 'chamado de novo, NAO semeia outra vez');
  ok(win.results.length === 5, 'e a lista continua com 5, sem duplicar');
})();

(function () {
  const { sim, win } = carregar(15, 0);
  win.results = [{ tipo: 'avb', nivel: 'alta', hora: '3:00', corrida: 'Real A1', trapFav: 1, trapUnd: 2 }];
  ok(sim.semearResults() === false,
     'com corrida DE VERDADE carregada, o simulador nao mexe no results');
  ok(win.results.length === 1 && win.results[0].corrida === 'Real A1',
     'as suas corridas mandam — misturar deixaria voce sem saber qual linha e real');
})();

// ── 5c) REINICIAR ──────────────────────────────────────────────────────────
//
// O cenario e' congelado no carregamento porque os minutos precisam andar de
// verdade — e' isso que permite ver a linha sumir sozinha 1 min depois da
// largada. O preco: passados uns minutos, todas as corridas ja largaram e a tela
// esvazia. Sem o botao, a saida era F5 na mao, toda vez.
console.log('\n[5c] REINICIAR TRAZ O CENARIO DE VOLTA, SEM F5\n');

(function () {
  const { sim, win } = carregar(15, 0);
  const antes = win.results.map(r => r.hora_br).join(',');
  ok(win.results.length === 5, 'cenario montado  (' + antes + ')');

  // Simula o tempo passando: as corridas largaram e a lista esvaziou.
  win.results = [];
  sim.reiniciar();
  ok(win.results.length === 5,
     'depois de reiniciar, as 5 corridas voltam  (' + win.results.length + ')');
  ok(win.results.every(r => r._simulado === true), 'e todas marcadas como simuladas');

  // Reiniciar DE NOVO nao pode duplicar: o filtro tem que tirar as antigas.
  sim.reiniciar();
  ok(win.results.length === 5,
     'reiniciando duas vezes seguidas continua com 5, sem empilhar  (' + win.results.length + ')');

  // E nao pode apagar corrida de verdade que voce tenha carregado.
  win.results = [{ tipo: 'avb', nivel: 'alta', hora: '3:00', corrida: 'Real A1', trapFav: 1, trapUnd: 2 }];
  sim.reiniciar();
  ok(win.results.length === 1 && win.results[0].corrida === 'Real A1',
     'e com corrida REAL carregada, reiniciar nao mexe nela');
})();

// A ancora tem que ser lida SEMPRE fresca. Ela e' trocada por outro objeto a
// cada reinicio; exportar o objeto em vez de um getter deixaria quem guardasse a
// referencia lendo o estado velho pra sempre.
(function () {
  const { sim } = carregar(15, 0);
  ok(sim.ancora.deslocado === false, 'as 15:00, nao ancorado');
  const antes = sim.ancora;
  sim.reiniciar();
  ok(sim.ancora !== antes || sim.ancora.ms != null,
     'depois de reiniciar, a ancora lida e a NOVA — o export e um getter');
})();

// ── 6) desligado, o arquivo nao existe pra ninguem ──────────────────────────
console.log('\n[6] SEM ?simpainel=1 O ARQUIVO NAO FAZ NADA\n');

(function () {
  const D = Date;
  const win = {
    results: [], location: { search: '', pathname: '/greyhound/' },
    document: { readyState: 'complete', getElementById: () => null,
                createElement: () => ({ style: {}, appendChild() {} }),
                body: { appendChild() {} }, addEventListener() {} },
    fetch: function () { return Promise.resolve('REAL'); },
    setTimeout: setTimeout
  };
  const fetchAntes = win.fetch;
  global.location = win.location; global.document = win.document;
  const log = console.log; console.log = () => {};
  new Function('window', SRC)(win);
  console.log = log;
  global.Date = D;
  ok(win.fetch === fetchAntes, 'o fetch NAO e trocado — producao segue intacta');
  ok(win._SIM_PAINEL === undefined, 'e nada e publicado no window');
})();

setTimeout(function () {
  ok(respostaPut && respostaPut.status === 200,
     'o PUT bloqueado responde 200 — a tela nao mostra erro pra uma aposta que ela nao devia ter feito');
  ok(passouDireto, 'e o resto das chamadas passa direto pro fetch de verdade');

  console.log('\n' + (falhas === 0
    ? 'TUDO OK — o simulador mostra o mesmo horario que o motor avalia, e nao grava nada.'
    : falhas + ' FALHA(S) — nao confiar na simulacao.'));
  process.exit(falhas === 0 ? 0 : 1);
}, 30);
