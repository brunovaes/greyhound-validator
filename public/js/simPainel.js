'use strict';
// ── SIMULADOR DO PAINEL DO DIA ───────────────────────────────────────────────
//
// Liga com ?simpainel=1 na URL. Desliga tirando o parametro.
//
// PARA QUE SERVE: o modelo de TIPOS (TOP/HIGH/GOOD) so acontece nos minutos em
// volta de cada corrida, e as corridas do dia acabam. Sem isto, conferir uma
// mudanca na tela significa esperar ate o dia seguinte e torcer pra acontecer o
// caso que voce queria ver — dois TOP na mesma corrida, por exemplo, pode levar
// dias pra aparecer sozinho.
//
// COMO FUNCIONA: ele NAO mexe em nada do app. Intercepta o fetch de
// /api/painel-dia e devolve um payload montado aqui, no mesmo formato que o
// servidor devolveria. Todo o resto — painelDia.js, a lista, os cards, as
// cores, o alarme — roda exatamente como roda em producao, sem saber que a
// resposta veio daqui. E' o caminho inteiro sendo testado, nao um pedaco.
//
// O QUE O CENARIO COBRE (os horarios sao relativos ao SEU relogio agora):
//   +4 min   uma corrida com QUATRO AvBs, sendo DOIS TOP -> a grade em quadrado
//            e a regra de 09/09 de que o tipo pode repetir
//   +1 min   um HIGH sozinho -> o pisca laranja na lista
//   -30 seg  um GOOD numa corrida que JA LARGOU -> tem que CONTINUAR na tela,
//            porque a graca e' de 1 minuto e a BW ainda aceita entrada
//   -2 min   um TOP numa corrida que largou ha mais tempo -> tem que ter SUMIDO
//   +9 min   uma corrida so com OPORTUNIDADE -> nao pisca, nao apita, nao entra
//            na lista de aguardando
//
// SEGURANCA: enquanto a simulacao esta ligada, o PUT que registra aposta e'
// BLOQUEADO. Sem isso, clicar em "Entrei !" num AvB inventado gravaria uma
// aposta de verdade no seu Historico e na sua Banca.

(function (glob) {

  var LIGADO = false;
  try { LIGADO = new URLSearchParams(location.search).get('simpainel') === '1'; } catch (e) {}
  if (!LIGADO) return;

  // ── relogio ────────────────────────────────────────────────────────────────
  //
  // O payload carrega a hora UK (o formato do PDF), e todo o resto do sistema
  // deriva a hora BR dela pelo horaBr(). Entao o simulador tem que produzir uma
  // hora UK que, passada pelo horaBr, de EXATAMENTE o horario que ele quer
  // simular — senao a corrida aparece na tela com um horario e e' avaliada com
  // outro, e o teste mente.
  //
  // O horaBr faz: uk 1..9 vira tarde (+12), depois -4h de fuso. O inverso disso
  // NAO cobre o dia inteiro: as horas BR que ele consegue produzir vao de 6h as
  // 20h, so. Nao existe hora UK que resulte em 21h, 22h ou madrugada — o que faz
  // sentido, porque nao ha corrida inglesa nesse horario.
  //
  // JANELA_INI/FIM sao esse limite. Fora dele o cenario e' ancorado num horario
  // valido e o banner avisa, em vez de gerar horas UK que nao existem.
  var JANELA_INI = 6, JANELA_FIM = 20;

  // Inverso exato do horaBr. null quando o horario BR nao e' alcancavel.
  function ukDeBr(hBr) {
    if (hBr >= 6 && hBr <= 8) return hBr + 4;      // uk 10..12
    if (hBr >= 9 && hBr <= 17) return hBr - 8;     // uk 1..9  (a faixa que vira tarde)
    if (hBr >= 18 && hBr <= 19) return hBr + 4;    // uk 22..23
    if (hBr === 20) return 0;
    return null;
  }

  // A folga do cenario: a corrida mais antiga esta 2 min atras e a mais futura 9
  // min a frente. As DUAS pontas tem que caber na janela, nao so o instante do
  // meio — as 6h em ponto o "agora" esta dentro, mas a corrida de -2 min cai em
  // 5:58, que nao existe em hora UK nenhuma.
  var FOLGA_ATRAS = -2, FOLGA_FRENTE = 9;

  // ANCORA do cenario. Normalmente e' o relogio de agora — e' o que permite
  // testar o corte de 1 minuto ao vivo, vendo a linha sumir sozinha. Quando as
  // pontas nao cabem, ancora as 15:00 e marca `deslocado`: os minutos relativos
  // deixam de bater com o seu relogio, entao o corte de 1 minuto nao pode ser
  // conferido ao vivo, e o banner diz isso em vez de fingir.
  function calcularAncora() {
    var agora = Date.now();
    var cabe = function (ms, off) {
      var h = new Date(ms + off * 60000).getHours();
      return h >= JANELA_INI && h <= JANELA_FIM;
    };
    if (cabe(agora, FOLGA_ATRAS) && cabe(agora, FOLGA_FRENTE)) {
      return { ms: agora, deslocado: false };
    }
    var d = new Date();
    d.setHours(15, 0, 0, 0);
    return { ms: d.getTime(), deslocado: true };
  }
  var _ancora = calcularAncora();

  function _instante(minutos) { return new Date(_ancora.ms + minutos * 60000); }

  function horaUkDaqui(minutos) {
    var d = _instante(minutos);
    var uk = ukDeBr(d.getHours());
    // Ancorado as 15:00 com no maximo 9 minutos de folga nos dois lados, isto
    // nunca deveria acontecer; o guarda existe pra falhar alto se alguem mexer
    // no cenario e passar do limite.
    if (uk == null) { console.error('[simpainel] hora BR fora da janela: ' + d.getHours() + 'h'); uk = 9; }
    return uk + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function horaBrDaqui(minutos) {
    var d = _instante(minutos);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ── de onde vem o par ──────────────────────────────────────────────────────
  // Corridas REAIS da sua tela quando ha alguma carregada (nomes e galgos
  // verdadeiros, mais fiel ao que voce ve todo dia); inventadas quando a tela
  // esta vazia, pra o simulador funcionar tambem com o dia encerrado.
  function fonte(i) {
    var reais = (glob.results || []).filter(function (r) {
      return r && r.nivel !== 'skip' && r.trapFav > 0;
    });
    if (reais.length) {
      var r = reais[i % reais.length];
      return {
        corrida: r.corrida || ('SIM A' + (i + 1)),
        dist: r.dist || 480,
        nome: function (t) {
          try { return glob._nomeDoTrap ? (glob._nomeDoTrap(r, t) || ('Galgo T' + t)) : ('Galgo T' + t); }
          catch (e) { return 'Galgo T' + t; }
        },
        real: true
      };
    }
    var INV = [
      ['SIM Newc A1', 480], ['SIM Hove A5', 500], ['SIM Romfd A5', 400],
      ['SIM Trlee A7', 525], ['SIM Sheff A2', 480]
    ];
    var f = INV[i % INV.length];
    var NOMES = ['Braemar Millie', 'Romeo On Point', 'Southwind Ned', 'Sporting Lovers',
                 'Heatseeker', 'Ballymac Elijah'];
    return {
      corrida: f[0], dist: f[1],
      nome: function (t) { return NOMES[(t - 1) % NOMES.length]; },
      real: false
    };
  }

  // ── montagem de um confronto no formato do contrato ────────────────────────
  var seq = 0;
  function cf(o, cfg) {
    seq++;
    var id = String(o.corrida).trim().toLowerCase() + '|' + o.horaKey + '|'
           + Math.min(cfg.a, cfg.b) + 'x' + Math.max(cfg.a, cfg.b);
    return {
      id: id, par: 'T' + cfg.a + 'xT' + cfg.b,
      pick_trap: cfg.a, pick_nome: o.f.nome(cfg.a),
      outro_trap: cfg.b, outro_nome: o.f.nome(cfg.b),
      pct: cfg.pct, sp_ratio: 1.2,
      camada: cfg.tipo,
      no_board_top: cfg.tipo === 'TOP',
      odd_bw: cfg.odd, razao_mercado: 1.12, market_pct: 52.8,
      promovido_em: cfg.tipo === 'OPORTUNIDADE' ? null : '2026-09-09 12:00:00',
      bateu: null,
      da_manha: cfg.manha !== false,
      tier_motor: cfg.tipo === 'TOP' ? 'TOP' : (cfg.tipo === 'HIGH' ? 'REGULAR' : null),
      split_dif: cfg.split, caltm_dif: cfg.caltm, sp_dif: 0.4,
      colada_mercado: true,
      melhor: !!cfg.melhor,
      // aguardando_entrada e' o campo que a tela le pra saber se ha o que fazer
      // com aquele AvB. O servidor o calcula; aqui a conta e' a MESMA, pra o
      // simulado nao ser mais permissivo que o real.
      aguardando_entrada: (cfg.tipo !== 'OPORTUNIDADE' && !o.expirado)
    };
  }

  function corrida(i, minutos, confs) {
    var f = fonte(i);
    var horaUk = horaUkDaqui(minutos);
    var o = {
      f: f, corrida: f.corrida,
      horaKey: (function () {
        var m = String(horaUk).match(/(\d{1,2}):(\d{2})/);
        return m ? (m[1].padStart(2, '0') + ':' + m[2]) : horaUk;
      })(),
      // A graca e' de 1 minuto: passou disso, o AvB nao aguarda mais nada.
      expirado: minutos < -1
    };
    return {
      race_id: 900000 + i, hora: horaUk, hora_br: horaBrDaqui(minutos),
      corrida: f.corrida, pista: String(f.corrida).split(/\s+/)[0], dist: f.dist,
      ja_correu: false, expirado: o.expirado, entrada: null,
      confrontos: confs.map(function (c) { return cf(o, c); }),
      _min: minutos
    };
  }

  // ── O CENARIO ──────────────────────────────────────────────────────────────
  function payload() {
    seq = 0;
    return {
      date: new Date().toISOString().slice(0, 10),
      atualizado_em: new Date().toISOString(),
      simulado: true,
      corridas: [
        // QUATRO AvBs, dois deles TOP. E' o caso que o Bruno descreveu em 09/09
        // e o que mais demora a acontecer sozinho na vida real.
        corrida(0, 4, [
          { a: 5, b: 2, tipo: 'TOP',  pct: 88, odd: 1.85, split: 0.30, caltm: 0.35, melhor: true },
          { a: 1, b: 6, tipo: 'TOP',  pct: 90, odd: 1.90, split: 0.22, caltm: 0.40 },
          { a: 5, b: 3, tipo: 'HIGH', pct: 82, odd: 1.95, split: 0.18, caltm: 0.18 },
          { a: 1, b: 4, tipo: 'GOOD', pct: 76, odd: 2.05, split: 0.10, caltm: 0.08 }
        ]),
        // HIGH sozinho, quase largando: o pisca laranja na lista.
        corrida(1, 1, [
          { a: 3, b: 6, tipo: 'HIGH', pct: 79, odd: 1.88, split: 0.20, caltm: 0.15, melhor: true }
        ]),
        // JA LARGOU ha 30 segundos: tem que CONTINUAR na tela.
        corrida(2, -0.5, [
          { a: 6, b: 2, tipo: 'GOOD', pct: 74, odd: 1.91, split: 0.12, caltm: 0.09,
            manha: false, melhor: true }
        ]),
        // Largou ha 2 minutos: passou da graca, tem que ter SUMIDO.
        corrida(3, -2, [
          { a: 4, b: 5, tipo: 'TOP', pct: 91, odd: 1.80, split: 0.35, caltm: 0.42, melhor: true }
        ]),
        // So OPORTUNIDADE: nao pisca, nao apita, nao entra na lista de aguardando.
        corrida(4, 9, [
          { a: 2, b: 4, tipo: 'OPORTUNIDADE', pct: 85, odd: null, split: 0.25, caltm: 0.20 }
        ])
      ]
    };
  }

  // ── AS CORRIDAS NA LISTA ───────────────────────────────────────────────────
  //
  // Isto NAO estava na primeira versao, e foi o erro que fez o simulador nao
  // mostrar nada com a tela vazia. A lista de corridas nao vem do painel do dia:
  // vem do `results`, que e' o que os PDFs carregaram. Com nenhum PDF na tela,
  // `results` esta vazio, nao ha linha nenhuma pra destacar — e o app ainda
  // mostra "ciclo do dia encerrado" e limpa a coluna.
  //
  // Injetar as corridas em `results` e' o que faz a tela viver. Sao os campos
  // MINIMOS que o renderRaceListPanel e o shouldShowRace leem; nao e' uma corrida
  // completa (nao tem historico de galgo, entao a arena fica sem gauges) — e' o
  // suficiente pra lista existir, piscar e responder ao clique.
  function corridaDaLista(c) {
    return {
      tipo: 'avb', nivel: 'alta',
      hora: c.hora, hora_br: c.hora_br,
      corrida: c.corrida, dist: c.dist,
      trapFav: c.confrontos[0] ? c.confrontos[0].pick_trap : 1,
      nameFav: c.confrontos[0] ? c.confrontos[0].pick_nome : '',
      trapUnd: c.confrontos[0] ? c.confrontos[0].outro_trap : 2,
      nameUnd: c.confrontos[0] ? c.confrontos[0].outro_nome : '',
      pct: c.confrontos[0] ? c.confrontos[0].pct : 0,
      obs: '', odd: '', valor: '', top3: '',
      avbNaoAberto: false, tier: 'top',
      histAll: [], histFull: [], eliminados: [],
      raceId: c.race_id, id: c.race_id,
      _simulado: true
    };
  }

  // Enche o `results` com as corridas do cenario. So quando ele esta VAZIO: se
  // voce tem corridas de verdade carregadas, elas mandam — misturar as duas
  // deixaria voce sem saber qual linha e' real.
  //
  // Semeia quando NAO ha corrida na tela — nem real, nem simulada. As duas
  // condicoes importam:
  //
  //   ha corrida REAL      -> nao mexe. Elas mandam; misturar deixaria voce sem
  //                           saber qual linha e' de verdade.
  //   as MINHAS ja estao la -> nao refaz. Reconstruir a lista a cada volta de 18s
  //                           fecharia sozinha a corrida que voce acabou de
  //                           abrir, que e' o defeito que a tela de disputa tinha.
  //
  // Antes isto era um `_semeado = true` que travava pra sempre. Nao servia: o
  // carregamento normal do app termina DEPOIS do simulador arrancar, nao acha
  // corrida do dia e zera o results — e o simulador, travado, nunca repunha.
  function semearResults() {
    var lista = glob.results || [];
    var reais = lista.filter(function (r) {
      return r && !r._simulado && r.nivel !== 'skip' && r.trapFav > 0;
    });
    if (reais.length) return false;
    if (lista.filter(function (r) { return r && r._simulado; }).length) return false;
    glob.results = payload().corridas.map(corridaDaLista);
    return true;
  }

  // GUARDA. O app tem varios caminhos que zeram o `results` — o carregamento do
  // dia, o "ciclo encerrado", a troca de sessao — e mapear todos pra interceptar
  // um por um daria uma lista que envelhece mal: basta alguem criar o proximo
  // caminho pra tela apagar de novo.
  //
  // Entao a checagem e' pelo EFEITO, nao pela causa: de 2 em 2 segundos, se nao
  // ha corrida nenhuma na tela, semeia de novo. Barato, e cobre inclusive os
  // caminhos que eu nao conheco.
  var _guarda = null;
  function guardar() {
    if (_guarda) return;
    _guarda = setInterval(function () {
      try {
        if (!semearResults()) return;
        if (typeof glob.refreshFocusMode === 'function') glob.refreshFocusMode();
        console.log('[simpainel] a tela tinha sido limpa; cenario reposto');
      } catch (e) { /* uma falha aqui nao pode derrubar a pagina */ }
    }, 2000);
  }

  // ── REINICIAR ──────────────────────────────────────────────────────────────
  //
  // O cenario e' congelado no carregamento, de proposito: os minutos precisam
  // andar de verdade pra dar pra ver a linha sumir sozinha 1 minuto depois da
  // largada. O preco e' que, passados uns minutos, todas as corridas ja
  // largaram e a tela esvazia — e ai era F5 na mao.
  //
  // Isto reancora no relogio de agora e reconstroi tudo, sem recarregar a
  // pagina: as mesmas 5 corridas, com horarios frescos.
  function reiniciar() {
    _ancora = calcularAncora();
    // Tira as corridas simuladas antigas antes de semear as novas. Sem isso o
    // semearResults ve a lista cheia e nao faz nada.
    glob.results = (glob.results || []).filter(function (r) { return r && !r._simulado; });
    semearResults();
    try {
      if (typeof glob.refreshFocusMode === 'function') glob.refreshFocusMode();
      if (glob.PainelDia && glob.PainelDia.buscar) glob.PainelDia.buscar();
    } catch (e) { console.error('[simpainel] falha ao reiniciar:', e.message); }
    atualizarBanner();
    aviso('Cenário reiniciado — horários novos a partir de agora.');
    console.log('%c[simpainel] cenario reiniciado', 'background:#991b1b;color:#fff;padding:2px 8px');
  }

  // ── a interceptacao ────────────────────────────────────────────────────────
  // Trocar o fetch, e nao o PainelDia, e' de proposito: o painelDia.js segue
  // rodando byte a byte igual ao de producao — busca, compara camadas entre
  // voltas, dispara alarme, avisa os assinantes. Se algo quebrar no simulado,
  // quebra em producao tambem.
  var fetchReal = glob.fetch;
  glob.fetch = function (url, opts) {
    var u = String((url && url.url) || url || '');

    if (u.indexOf('/api/painel-dia') !== -1) {
      // Semeia ANTES de responder: o assinante do painel redesenha a lista assim
      // que recebe, e a lista precisa ter de onde tirar as corridas.
      if (semearResults()) {
        try { if (typeof glob.refreshFocusMode === 'function') glob.refreshFocusMode(); } catch (e) {}
      }
      var corpo = JSON.stringify(payload());
      return Promise.resolve(new Response(corpo, {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }));
    }

    // BLOQUEIO DA APOSTA. Sem isto, clicar em "Entrei !" num AvB inventado
    // gravaria odd, stake e bet_entrou de verdade — e a aposta apareceria no
    // Historico e na Banca de um dia em que ela nunca existiu.
    if (u.indexOf('/api/race/') !== -1 && opts && String(opts.method).toUpperCase() === 'PUT') {
      console.warn('[simpainel] PUT bloqueado — a simulacao nao grava aposta:', u, opts.body);
      aviso('Aposta BLOQUEADA: a tela esta em simulacao.');
      return Promise.resolve(new Response('{"ok":true,"simulado":true}', {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }));
    }

    return fetchReal.apply(this, arguments);
  };

  // ── o aviso na tela ────────────────────────────────────────────────────────
  // Impossivel de confundir com o dia real. Uma tela de simulacao que parece a
  // de verdade e' pior do que nao ter simulacao nenhuma.
  function aviso(msg) {
    var el = document.getElementById('sim-flash');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(function () { el.style.opacity = '0'; }, 3500);
  }

  // Reescreve so o texto do estado (ancorado ou nao), sem recriar a tarja — o
  // botao tem listener e recriar a tarja o perderia.
  function atualizarBanner() {
    var el = document.getElementById('sim-estado');
    if (!el) return;
    el.textContent = _ancora.deslocado
      ? 'horários ancorados às 15:00 — fora da janela 6h-20h não dá pra testar o corte de 1 minuto ao vivo'
      : 'horários a partir de agora';
    el.style.background = _ancora.deslocado ? '#000' : 'transparent';
    el.style.padding = _ancora.deslocado ? '3px 10px' : '0';
  }

  function banner() {
    if (document.getElementById('sim-banner')) return;
    var d = document.createElement('div');
    d.id = 'sim-banner';
    d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;'
      + 'background:repeating-linear-gradient(45deg,#7f1d1d,#7f1d1d 12px,#991b1b 12px,#991b1b 24px);'
      + 'color:#fff;font:600 12px/1.5 system-ui,sans-serif;padding:8px 14px;'
      + 'display:flex;align-items:center;gap:14px;flex-wrap:wrap;'
      + 'box-shadow:0 -6px 20px rgba(0,0,0,.5)';
    var reais = (glob.results || []).filter(function (r) { return r && r.nivel !== 'skip' && r.trapFav > 0; });
    d.innerHTML =
      '<strong style="letter-spacing:1px">SIMULAÇÃO</strong>'
      + '<span>dados inventados &middot; nenhuma aposta é gravada</span>'
      + '<span style="opacity:.75">galgos: ' + (reais.length ? 'das corridas carregadas' : 'inventados (tela vazia)') + '</span>'
      + '<span id="sim-estado" style="border-radius:5px"></span>'
      + '<span id="sim-flash" style="margin-left:auto;opacity:0;transition:opacity .2s;'
      +   'background:#000;padding:3px 10px;border-radius:5px"></span>'
      // O cenario vence em poucos minutos (as corridas largam). Sem este botao a
      // saida era F5 na mao, toda vez.
      + '<button type="button" id="sim-reiniciar" style="background:#fff;color:#7f1d1d;'
      +   'border:none;border-radius:5px;padding:4px 12px;font-weight:700;font-size:12px;'
      +   'cursor:pointer">&#8635; reiniciar cenário</button>'
      + '<a href="' + location.pathname + '" style="color:#fff;text-decoration:underline">sair da simulação</a>';
    document.body.appendChild(d);
    var b = document.getElementById('sim-reiniciar');
    if (b) b.addEventListener('click', reiniciar);
    atualizarBanner();
  }

  function roteiro() {
    console.log('%c[simpainel] SIMULACAO LIGADA', 'background:#991b1b;color:#fff;padding:2px 8px');
    console.log('O que conferir na tela:');
    console.log('  1. a corrida de +4 min tem QUATRO AvBs, DOIS deles TOP (azuis)');
    console.log('  2. a de +1 min pisca LARANJA na lista (HIGH)');
    console.log('  3. a que largou ha 30s CONTINUA na lista (a graca e de 1 minuto)');
    console.log('  4. a que largou ha 2 min NAO aparece — passou da graca');
    console.log('  5. a de +9 min so tem OPORTUNIDADE: nao pisca e nao apita');
    console.log('  6. TOP azul, HIGH laranja, GOOD roxo — no selo E no pisca');
    console.log('  7. o aviso de 3 minutos pisca VERDE, e mudo');
    console.log('Clicar em "Entrei !" e seguro: o PUT e bloqueado.');
  }

  function arrancar() {
    banner();
    roteiro();
    // A coluna da lista so aparece com o layout em `focus-mode`, e quem liga
    // isso normalmente e' o carregamento de um PDF. Com a tela vazia ninguem
    // liga, entao a lista existiria no DOM e ficaria invisivel.
    semearResults();
    try {
      var main = document.getElementById('main-layout');
      if (main && !main.classList.contains('focus-mode')) main.classList.add('focus-mode');
      if (typeof glob.refreshFocusMode === 'function') glob.refreshFocusMode();
    } catch (e) { console.error('[simpainel] nao consegui montar a tela:', e.message); }
    // O carregamento normal do app roda DEPOIS disto e apaga o que acabamos de
    // semear. O guarda repoe.
    guardar();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else { arrancar(); }

  glob._SIM_PAINEL = { payload: payload, corrida: corrida, ukDeBr: ukDeBr,
                       corridaDaLista: corridaDaLista, semearResults: semearResults,
                       reiniciar: reiniciar, guardar: guardar,
                       // getter, e nao o objeto: depois de reiniciar, o _ancora
                       // e' OUTRO objeto, e quem tivesse guardado o antigo leria
                       // o estado velho pra sempre.
                       get ancora() { return _ancora; } };

})(typeof window !== 'undefined' ? window : this);
