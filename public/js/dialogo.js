'use strict';
/* Greyhound Factory — caixas de dialogo no visual do app.
 *
 * Por que existe (Bruno, 16/09/2026): "consegue tratar essa mensagem no padrao
 * do APP?". O confirm() do navegador aparece colado na barra de endereco, com o
 * dominio do Railway no titulo e fonte do sistema — destoa de tudo e, pior, num
 * momento de decisao (resetar banca, apagar acesso) parece coisa de outro site.
 *
 * O app JA tinha uma caixa propria, o _confirmarNaTela do app.js. So que ela
 * vive dentro daquele arquivo, que so a tela Analisar carrega — e hoje esta sem
 * nenhum chamador. Copiar aquele bloco pra cada tela seria criar seis versoes
 * da mesma caixa pra divergirem com o tempo. Este arquivo e a versao unica.
 *
 *   await ghConfirmar('Apagar?')                         -> boolean
 *   await ghConfirmar({ titulo, texto, ok, perigo:true }) -> boolean
 *   await ghAviso({ titulo, texto, tom:'erro' })          -> undefined
 *
 * Devolve Promise de proposito: assim o call site troca
 *     if (!confirm('...')) return;
 * por
 *     if (!await ghConfirmar('...')) return;
 * sem reescrever a funcao em volta. `confirm()` e' bloqueante e isto nao e' —
 * essa e a unica diferenca real, e ela obriga a funcao chamadora a ser async.
 *
 * Autossuficiente: injeta o proprio CSS uma vez e nao depende de nada.
 */
(function (glob) {

  var CSS_ID = 'gh-dlg-css';
  function garantirCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.gh-dlg-bg{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9500;',
      '  display:flex;align-items:center;justify-content:center;padding:20px;',
      '  animation:ghDlgFade .12s ease-out}',
      '@keyframes ghDlgFade{from{opacity:0}to{opacity:1}}',
      '.gh-dlg{background:#161B27;border:1px solid #2a3140;border-radius:12px;',
      '  padding:22px 24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);',
      '  animation:ghDlgSobe .14s ease-out}',
      '@keyframes ghDlgSobe{from{transform:translateY(6px)}to{transform:none}}',
      '.gh-dlg-tit{font-size:15px;font-weight:700;color:#f0f0f0;margin-bottom:8px}',
      '.gh-dlg-txt{font-size:12.5px;color:#9aa4b2;line-height:1.6;margin-bottom:18px;',
      '  white-space:pre-wrap}',
      '.gh-dlg-bts{display:flex;gap:8px;justify-content:flex-end}',
      '.gh-dlg-bt{padding:8px 18px;border-radius:6px;font-size:12px;cursor:pointer;',
      '  border:1px solid transparent;font-family:inherit}',
      '.gh-dlg-bt.sec{background:transparent;border-color:#2a3140;color:#9aa4b2}',
      '.gh-dlg-bt.sec:hover{border-color:#3a4354;color:#cbd5e1}',
      '.gh-dlg-bt.pri{background:#22c55e;color:#000;font-weight:700}',
      '.gh-dlg-bt.pri.perigo{background:#ef4444;color:#fff}',
      '.gh-dlg-bt.pri:hover{opacity:.88}',
      '.gh-dlg-bt:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}',
      /* Uma listra fina na esquerda diz o tom sem precisar de icone: vermelho
         pra erro, verde pra confirmacao, cinza pro resto. */
      '.gh-dlg.erro{border-left:3px solid #ef4444}',
      '.gh-dlg.ok{border-left:3px solid #22c55e}'
    ].join('');
    document.head.appendChild(s);
  }

  // Normaliza o atalho de string. ghConfirmar('Apagar?') tem que funcionar.
  function opts(o, padraoTitulo) {
    if (typeof o === 'string') o = { texto: o };
    o = o || {};
    return {
      titulo: o.titulo || padraoTitulo,
      texto: o.texto || '',
      ok: o.ok || 'Confirmar',
      cancelar: o.cancelar || 'Cancelar',
      perigo: !!o.perigo,
      tom: o.tom || ''
    };
  }

  function montar(o, comCancelar) {
    garantirCss();
    // Nunca deixa duas caixas empilhadas: a de baixo ficaria presa atras.
    var velha = document.querySelector('.gh-dlg-bg');
    if (velha) velha.remove();

    var bg = document.createElement('div');
    bg.className = 'gh-dlg-bg';
    var cx = document.createElement('div');
    cx.className = 'gh-dlg' + (o.tom ? ' ' + o.tom : '');
    cx.setAttribute('role', comCancelar ? 'alertdialog' : 'dialog');
    cx.setAttribute('aria-modal', 'true');

    var t = document.createElement('div');
    t.className = 'gh-dlg-tit';
    // textContent, nao innerHTML: o texto carrega valor digitado pelo usuario
    // (saldo, nome de galgo). HTML aqui seria porta aberta sem necessidade.
    t.textContent = o.titulo;
    cx.appendChild(t);

    if (o.texto) {
      var p = document.createElement('div');
      p.className = 'gh-dlg-txt';
      p.textContent = o.texto;
      cx.appendChild(p);
    }

    var bts = document.createElement('div');
    bts.className = 'gh-dlg-bts';
    var btNao = null;
    if (comCancelar) {
      btNao = document.createElement('button');
      btNao.type = 'button';
      btNao.className = 'gh-dlg-bt sec';
      btNao.textContent = o.cancelar;
      bts.appendChild(btNao);
    }
    var btSim = document.createElement('button');
    btSim.type = 'button';
    btSim.className = 'gh-dlg-bt pri' + (o.perigo ? ' perigo' : '');
    btSim.textContent = o.ok;
    bts.appendChild(btSim);
    cx.appendChild(bts);
    bg.appendChild(cx);
    document.body.appendChild(bg);

    return { bg: bg, btSim: btSim, btNao: btNao };
  }

  function abrir(o, comCancelar) {
    return new Promise(function (resolve) {
      var el;
      try { el = montar(o, comCancelar); }
      // Se por qualquer motivo nao der pra montar a caixa, NAO se engole a
      // pergunta: cai no confirm do navegador. Feio e' melhor que mudo — uma
      // acao destrutiva nao pode acontecer sem perguntar, nem ser cancelada
      // em silencio.
      catch (e) { resolve(comCancelar ? glob.confirm(o.titulo) : undefined); return; }

      var antes = document.activeElement;
      var fim = function (v) {
        document.removeEventListener('keydown', tecla, true);
        el.bg.remove();
        try { if (antes && antes.focus) antes.focus(); } catch (e2) {}
        resolve(v);
      };
      var tecla = function (ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); fim(comCancelar ? false : undefined); }
        else if (ev.key === 'Enter') { ev.preventDefault(); fim(comCancelar ? true : undefined); }
      };
      el.btSim.addEventListener('click', function () { fim(comCancelar ? true : undefined); });
      if (el.btNao) el.btNao.addEventListener('click', function () { fim(false); });
      // Clique fora CANCELA. Num dialogo de confirmacao o clique fora nunca
      // pode valer como "sim".
      el.bg.addEventListener('click', function (ev) {
        if (ev.target === el.bg) fim(comCancelar ? false : undefined);
      });
      document.addEventListener('keydown', tecla, true);
      try { el.btSim.focus(); } catch (e3) {}
    });
  }

  glob.ghConfirmar = function (o) { return abrir(opts(o, 'Confirmar'), true); };
  glob.ghAviso = function (o) {
    var x = opts(o, 'Aviso');
    if (!x.tom && x.titulo === 'Aviso') x.tom = '';
    x.ok = (typeof o === 'object' && o && o.ok) || 'Entendi';
    return abrir(x, false);
  };
  // Atalho pros varios `alert('Erro ao ...: ' + e.message)` espalhados pelo app.
  glob.ghErro = function (texto, titulo) {
    return abrir(opts({ titulo: titulo || 'Não deu certo', texto: texto, ok: 'Entendi', tom: 'erro' }, 'Não deu certo'), false);
  };

})(typeof window !== 'undefined' ? window : this);
