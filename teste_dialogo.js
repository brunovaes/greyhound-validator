'use strict';
// teste_dialogo.js — CAIXAS DE DIALOGO NO VISUAL DO APP (Bruno, 16/09/2026)
//
// "consegue tratar essa mensagem no padrao do APP?" — o confirm() do navegador
// aparece com o dominio do Railway no titulo e fonte do sistema. Num momento de
// decisao (resetar banca) parece dialogo de outro site.
//
// O QUE ESTE TESTE PROTEGE:
//   1) que clique fora e Esc CANCELAM. Numa caixa de confirmacao, clique fora
//      nunca pode valer como "sim" — e uma dessas acoes reseta banca.
//   2) que o texto vai por textContent, nao innerHTML: ele carrega valor
//      digitado pelo usuario (saldo, nome de galgo).
//   3) que a caixa NAO engole a pergunta se nao conseguir se montar: cai no
//      confirm do navegador. Feio e melhor que mudo — acao destrutiva nao pode
//      acontecer sem perguntar nem ser cancelada em silencio.
//   4) o escape do \\n dentro do template literal, que foi o defeito que me
//      pegou nesta propria entrega (ver bloco [4]).
//
//   node teste_dialogo.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const SRC = fs.readFileSync(path.join(__dirname, 'public', 'js', 'dialogo.js'), 'utf8');
const SRC_BANCA = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'banca.js'), 'utf8');

let ok = 0, fail = 0;
function t(nome, cond) {
  console.log((cond ? '  OK    | ' : '  FALHA | ') + nome);
  cond ? ok++ : fail++;
}
function bloco(n) { console.log('\n' + n + '\n'); }

// ── DOM de mentira: so o que o modulo toca ──────────────────────────────────
function novoDom() {
  const ouvintesDoc = {};
  function el(tag) {
    const o = {
      tag: tag, filhos: [], pai: null, style: {}, atributos: {},
      _cls: '', _txt: '', ouvintes: {},
      get className() { return o._cls; }, set className(v) { o._cls = v; },
      get textContent() { return o._txt; }, set textContent(v) { o._txt = String(v); },
      get innerHTML() { return o._html || ''; }, set innerHTML(v) { o._html = v; },
      setAttribute: function (k, v) { o.atributos[k] = v; },
      appendChild: function (f) { f.pai = o; o.filhos.push(f); return f; },
      addEventListener: function (ev, fn) { (o.ouvintes[ev] = o.ouvintes[ev] || []).push(fn); },
      remove: function () { if (o.pai) o.pai.filhos = o.pai.filhos.filter(x => x !== o); o.pai = null; },
      focus: function () { dom.focado = o; },
      disparar: function (ev, arg) { (o.ouvintes[ev] || []).forEach(fn => fn(arg)); },
      // busca em profundidade por classe
      achar: function (cls) {
        for (const f of o.filhos) {
          if (String(f._cls || '').split(/\s+/).indexOf(cls) >= 0) return f;
          const d = f.achar(cls); if (d) return d;
        }
        return null;
      }
    };
    return o;
  }
  const body = el('body'), head = el('head');
  const dom = {
    focado: null, confirmChamado: 0,
    document: {
      head: head, body: body,
      activeElement: null,
      createElement: el,
      getElementById: function (id) { return head.filhos.find(f => f.id === id) || null; },
      querySelector: function (sel) { return body.achar(String(sel).replace(/^\./, '')); },
      addEventListener: function (ev, fn) { (ouvintesDoc[ev] = ouvintesDoc[ev] || []).push(fn); },
      removeEventListener: function (ev, fn) {
        ouvintesDoc[ev] = (ouvintesDoc[ev] || []).filter(x => x !== fn);
      }
    },
    tecla: function (key) {
      (ouvintesDoc.keydown || []).slice().forEach(fn => fn({ key: key, preventDefault: function () {} }));
    },
    caixa: function () { return body.achar('gh-dlg-bg'); }
  };
  return dom;
}

function carregar(dom) {
  const glob = {
    document: dom.document, Promise: Promise, String: String, Boolean: Boolean,
    confirm: function () { dom.confirmChamado++; return true; }
  };
  glob.window = glob;
  vm.createContext(glob);
  vm.runInContext(SRC, glob);
  return glob;
}

// ── [1] confirmar ───────────────────────────────────────────────────────────
bloco('[1] CONFIRMAR: SIM, NAO, ESC E CLIQUE FORA');

(async function () {
  let dom = novoDom(); let g = carregar(dom);
  let p = g.ghConfirmar({ titulo: 'Resetar?', texto: 'tem certeza', ok: 'Resetar' });
  let cx = dom.caixa();
  t('a caixa foi montada no body', !!cx);
  t('o botao primario leva o rotulo pedido', cx.achar('pri')._txt === 'Resetar');
  t('e o secundario nasce como Cancelar', cx.achar('sec')._txt === 'Cancelar');
  t('o foco vai pro botao de confirmar', dom.focado === cx.achar('pri'));
  cx.achar('pri').disparar('click');
  t('clicar em confirmar resolve TRUE', (await p) === true);
  t('e a caixa some do DOM', !dom.caixa());

  dom = novoDom(); g = carregar(dom);
  p = g.ghConfirmar('apagar?');
  dom.caixa().achar('sec').disparar('click');
  t('clicar em cancelar resolve FALSE', (await p) === false);

  dom = novoDom(); g = carregar(dom);
  p = g.ghConfirmar('apagar?');
  dom.tecla('Escape');
  t('Esc resolve FALSE', (await p) === false);

  dom = novoDom(); g = carregar(dom);
  p = g.ghConfirmar('apagar?');
  dom.tecla('Enter');
  t('Enter resolve TRUE', (await p) === true);

  // A propriedade de seguranca desta caixa.
  dom = novoDom(); g = carregar(dom);
  p = g.ghConfirmar('apagar?');
  cx = dom.caixa();
  cx.disparar('click', { target: cx });
  t('CLIQUE FORA cancela — nunca vale como "sim"', (await p) === false);

  dom = novoDom(); g = carregar(dom);
  p = g.ghConfirmar('apagar?');
  cx = dom.caixa();
  cx.disparar('click', { target: cx.achar('gh-dlg') });
  let resolveu = false;
  p.then(function () { resolveu = true; });
  await new Promise(function (r) { setTimeout(r, 0); });
  t('mas clique DENTRO da caixa nao fecha nada', resolveu === false);
  cx.achar('sec').disparar('click');
  await p;

  // ── [2] aviso ─────────────────────────────────────────────────────────────
  bloco('[2] AVISO: uma via so, sem Cancelar');

  dom = novoDom(); g = carregar(dom);
  let pa = g.ghAviso({ titulo: 'Pronto', texto: 'salvo' });
  cx = dom.caixa();
  t('o aviso nao tem botao de cancelar', !cx.achar('sec'));
  t('e o primario e "Entendi"', cx.achar('pri')._txt === 'Entendi');
  cx.achar('pri').disparar('click');
  await pa;
  t('fecha ao clicar', !dom.caixa());

  dom = novoDom(); g = carregar(dom);
  pa = g.ghErro('nao deu');
  cx = dom.caixa();
  t('ghErro marca o tom de erro (listra vermelha)',
    String(cx.achar('gh-dlg')._cls).indexOf('erro') >= 0);
  cx.achar('pri').disparar('click'); await pa;

  // ── [3] o texto e DADO, nao HTML ──────────────────────────────────────────
  bloco('[3] O TEXTO VAI POR textContent');

  dom = novoDom(); g = carregar(dom);
  p = g.ghConfirmar({ titulo: 'x', texto: '<img src=x onerror=1>' });
  cx = dom.caixa();
  t('o texto e escrito como TEXTO, nao interpretado',
    cx.achar('gh-dlg-txt')._txt === '<img src=x onerror=1>' && !cx.achar('gh-dlg-txt')._html);
  t('e o modulo nao usa innerHTML pro conteudo', !/\.innerHTML\s*=/.test(SRC));
  dom.tecla('Escape'); await p;

  // Duas caixas empilhadas deixariam a de baixo presa atras.
  dom = novoDom(); g = carregar(dom);
  const p1 = g.ghConfirmar('a'); const p2 = g.ghConfirmar('b');
  t('abrir outra caixa remove a anterior', dom.document.body.filhos.filter(f => f._cls === 'gh-dlg-bg').length === 1);
  dom.tecla('Escape'); await p2; await Promise.race([p1, Promise.resolve()]);

  // ── [4] O DEFEITO QUE ME PEGOU NESTA ENTREGA ──────────────────────────────
  // As telas sao HTML montado dentro de template literal no servidor. Escrever
  // \n ali e' uma quebra de linha DE VERDADE no que o navegador recebe, e ela
  // parte a string ao meio. Tem que ser \\n no fonte. O tools/valida.js pegou;
  // este bloco faz a suite pegar tambem, sem depender de eu lembrar de rodar.
  bloco('[4] O ESCAPE DENTRO DO TEMPLATE LITERAL');

  let saidaValida = '', okValida = true;
  try {
    saidaValida = execFileSync(process.execPath,
      [path.join(__dirname, 'tools', 'valida.js'),
       path.join(__dirname, 'src', 'routes', 'banca.js')],
      { encoding: 'utf8' });
  } catch (e) { okValida = false; saidaValida = (e.stdout || '') + (e.stderr || ''); }
  t('o tools/valida.js aprova os <script> da Banca', okValida && /Tudo certo/.test(saidaValida));
  if (!okValida) console.log(saidaValida.split('\n').slice(0, 4).join('\n'));
  t('a quebra de paragrafo esta escapada no fonte (\\\\n, nao \\n)',
    /a partir de hoje\.\\\\n\\\\n/.test(SRC_BANCA));

  // ── [5] a Banca nao usa mais o dialogo do navegador ───────────────────────
  bloco('[5] A BANCA TROCOU confirm() E alert()');

  // Tira os comentarios antes de procurar: o proprio comentario que explica a
  // troca cita confirm e alert, e acusava falso positivo.
  const BANCA_SEM_COMENT = SRC_BANCA
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  t('nao sobrou chamada a confirm() na Banca',
    !/[^a-zA-Z]confirm\s*\(/.test(BANCA_SEM_COMENT.replace(/ghConfirmar\s*\(/g, '')));
  t('nem a alert()', !/[^a-zA-Z]alert\s*\(/.test(BANCA_SEM_COMENT));
  t('ela carrega o modulo', /static\/js\/dialogo\.js/.test(SRC_BANCA));
  t('e usa ghConfirmar nos dois resets',
    (SRC_BANCA.match(/await ghConfirmar\(/g) || []).length === 2);
  // ESTA ASSERCAO CONTAVA 3 E QUEBROU no dia em que a Banca ganhou um quarto
  // tratamento de erro (a edicao de Odd/Unid., 18/09). Contagem exata e' um
  // RETRATO do arquivo, nao uma propriedade dele: ela reprova o autor por ter
  // escrito mais codigo certo. O que importa e' que os erros da Banca nao
  // voltem pro alert do navegador, e isso as duas linhas acima ja garantem.
  t('todo erro da Banca passa pelo ghErro (pelo menos os tres originais)',
    (SRC_BANCA.match(/ghErro\(/g) || []).length >= 3);

  // ── [6] se a caixa nao montar, a pergunta nao some ────────────────────────
  bloco('[6] FALHANDO, CAI NO confirm DO NAVEGADOR — nunca em silencio');

  dom = novoDom(); g = carregar(dom);
  dom.document.createElement = function () { throw new Error('sem DOM'); };
  const r = await g.ghConfirmar('apagar?');
  t('o confirm do navegador foi chamado', dom.confirmChamado === 1);
  t('e a resposta dele e respeitada', r === true);

  console.log('\n' + (fail ? 'FALHOU: ' + fail + ' de ' + (ok + fail) : 'TUDO OK — ' + ok + ' verificacoes') + '\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('\nERRO: ' + (e && e.stack || e) + '\n');
  process.exit(1);
});
