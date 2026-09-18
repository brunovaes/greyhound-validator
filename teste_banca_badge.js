'use strict';
// teste_banca_badge.js — A BOLINHA DO TRAP NA BANCA (Bruno, 18/09/2026)
//
// "consegue colocar o badge a bolinha antes do nome de cada galgo na banca?
//  outra coisa... mudar na tabela o cabecalho de Underdog para Desafiado"
//
// Duas coisas simples com uma armadilha cada:
//
//   1) QUAL trap mostrar. A linha da Banca mostra o nome do SEU par desde
//      16/09 (foi o conserto do R$ 16,75 pago numa aposta perdida). Se a
//      bolinha viesse de trap_fav/trap_und, ela mostraria o par do MOTOR ao
//      lado do nome do seu par — a mesma divergencia de antes, agora colorida,
//      e dificil de notar porque numero e nome parecem concordar.
//
//   2) ONDE a cor mora. As classes .trap-badge e .t1..t6 vivem no
//      public/css/shared.css, que a Banca NAO carrega. Sem uma copia local a
//      bolinha sai como um circulo sem cor nenhuma — e isso nao quebra nada,
//      nao aparece em log, so fica feio na tela do Bruno.
//
//   node teste_banca_badge.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'banca.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'main.js'), 'utf8');
const { bateuPar } = require('./src/utils/avbResultado');

// Os comentarios deste projeto explicam o PORQUE, e por isso citam os proprios
// termos que os testes procuram ("Underdog", "shared.css"). Ja me enganei seis
// vezes com regex batendo no meu comentario, entao aqui o texto sai antes.
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

// Mesmo arranque do teste_banca_par: o resolverAposta nao e exportado (ele e
// detalhe interno da rota), entao o teste le a funcao do arquivo e roda ela.
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

const ctx = { console: console, JSON: JSON, Object: Object, Number: Number, String: String, bateuPar: bateuPar };
vm.createContext(ctx);
vm.runInContext(arranca('_parEscolhido') + '\n' + arranca('resolverAposta')
  + '\nthis.f = resolverAposta;', ctx);
const resolver = ctx.f;

const CHEGADA = JSON.stringify([{ pos: 1, trap: 5 }, { pos: 2, trap: 2 }, { pos: 3, trap: 6 }, { pos: 4, trap: 1 }]);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[1] A BOLINHA SEGUE O SEU PAR, NUNCA O DO MOTOR');
// ═══════════════════════════════════════════════════════════════════════════

// Caso real de 16/09: o motor montou T1 x T3 de manha, voce apostou T5 x T2.
const seu = resolver({
  id: 1, corrida: 'Vlley A6', odd: 1.61, bet_unidades: 2,
  name_fav: 'Hawkfield Hugo', name_und: 'Arrigle Buster',
  trap_fav: 1, trap_und: 3,
  avb_escolhido: JSON.stringify({ aTrap: 5, bTrap: 2, aNome: 'Droopys Kiwi', bNome: 'Slaneyside Ann' }),
  finishing_order_json: CHEGADA, bateu: 'sim'
});
t('com par escolhido, trap_a e o SEU (5), nao o do motor (1)', Number(seu.trap_a) === 5);
t('com par escolhido, trap_b e o SEU (2), nao o do motor (3)', Number(seu.trap_b) === 2);
t('o nome anda junto com o numero: name_fav e o do seu par', seu.name_fav === 'Droopys Kiwi');
t('o nome anda junto com o numero: name_und e o do seu par', seu.name_und === 'Slaneyside Ann');
// trap_fav/trap_und NAO podem ser sobrescritos: o mesmoSentido (o selo
// "seu par") compara o seu par com o do motor, e se os dois virassem o mesmo
// numero o selo nunca mais acenderia.
t('trap_fav continua sendo o do motor (1)', Number(seu.trap_fav) === 1);
t('trap_und continua sendo o do motor (3)', Number(seu.trap_und) === 3);
t('e o selo de par divergente acende mesmo assim', seu.par_divergente === true);

const soMotor = resolver({
  id: 2, corrida: 'Hove R4', odd: 2.1, bet_unidades: 1,
  name_fav: 'Bar One Ace', name_und: 'Ballymac Sky',
  trap_fav: 4, trap_und: 6,
  avb_escolhido: null, finishing_order_json: CHEGADA, bateu: 'nao'
});
t('sem par escolhido, trap_a cai no trap_fav (4)', Number(soMotor.trap_a) === 4);
t('sem par escolhido, trap_b cai no trap_und (6)', Number(soMotor.trap_b) === 6);

// Corrida que perdeu o tier durante o dia: uma rotina zera trap_fav/trap_und.
// A bolinha tem que DESAPARECER, e nao virar T1 por falta de numero melhor.
const semTrap = resolver({
  id: 3, corrida: 'Romford A5', odd: 1.8, bet_unidades: 1,
  name_fav: null, name_und: null, trap_fav: 0, trap_und: 0,
  avb_escolhido: null, finishing_order_json: null, bateu: null
});
t('trap zerado chega na tela como zero (a tela esconde a bolinha)',
  Number(semTrap.trap_a) === 0 && Number(semTrap.trap_b) === 0);
t('trap ausente nao inventa um numero', resolver({
  id: 4, name_fav: 'X', name_und: 'Y', trap_fav: null, trap_und: null,
  avb_escolhido: null, finishing_order_json: null, bateu: null
}).trap_a == null);

// ═══════════════════════════════════════════════════════════════════════════
bloco('[2] A TELA DESENHA A BOLINHA E CHAMA O LADO DE DESAFIADO');
// ═══════════════════════════════════════════════════════════════════════════

t('a celula do favorito passa pelo helper com o trap_a', /galgo\(a\.trap_a,\s*a\.name_fav\)/.test(LIMPO));
t('a celula do desafiado passa pelo helper com o trap_b', /galgo\(a\.trap_b,\s*a\.name_und\)/.test(LIMPO));
t('o helper monta a classe trap-badge t<N>', /class="trap-badge t'\s*\+\s*t/.test(LIMPO));
t('sem trap conhecido o helper nao desenha bolinha nenhuma',
  /const t = Number\(trap\) > 0 \? Number\(trap\) : null/.test(LIMPO));
// <th[^>]*>: em 18/09 cada coluna ganhou o NOME dela no cabecalho
// (class="bc-..."), pra o celular poder esconder coluna por nome. A assertiva
// buscava o <th> sem atributo nenhum e reprovou codigo certo. O que ela quer
// travar e' o TEXTO da coluna, nao os atributos dela.
t('cabecalho diz Desafiado', /<th[^>]*>Desafiado<\/th>/.test(LIMPO));
t('e Underdog nao sobrou em nenhum lugar da tela', !/Underdog/.test(LIMPO));
t('Favorito continua do outro lado', /<th[^>]*>Favorito<\/th>/.test(LIMPO));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[3] A COR VIAJA COM A TELA (a Banca nao carrega o shared.css)');
// ═══════════════════════════════════════════════════════════════════════════

t('a Banca continua sem link pro shared.css', !/shared\.css/.test(LIMPO));
t('.trap-badge esta no <style> da propria Banca', /\.trap-badge\{/.test(LIMPO));
for (let n = 1; n <= 6; n++) {
  const re = new RegExp('\\.t' + n + '\\{[^}]*background:');
  t('.t' + n + ' tem fundo escrito aqui dentro', re.test(LIMPO));
}
// var(--grn) e companhia sao definidas no shared.css. Se a copia local usasse
// variavel, a bolinha sairia transparente e nada denunciaria isso.
const cssBadge = (LIMPO.match(/\.t[1-6]\{[^}]*\}/g) || []).join('');
t('nenhuma das seis cores depende de variavel do shared.css', !/var\(--/.test(cssBadge));

// ═══════════════════════════════════════════════════════════════════════════
bloco('[4] O DESENHO E O MESMO DA TELA ANALISAR');
// ═══════════════════════════════════════════════════════════════════════════

// A Analisar (main.js, celula de AvB) usa 20px/11px. Mesmo dado, mesma cara —
// duas bolinhas de tamanhos diferentes pra mesma coisa e o comeco de duas
// implementacoes do mesmo desenho.
const MEDIDA = 'width:20px;height:20px;font-size:11px';
t('a Analisar desenha a bolinha em ' + MEDIDA, MAIN.indexOf(MEDIDA) >= 0);
t('a Banca desenha na mesma medida', LIMPO.indexOf(MEDIDA) >= 0);

console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK: ' + ok + ' verificacoes') + '\n');
process.exit(fail ? 1 : 0);
