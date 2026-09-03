'use strict';
// ── Painel do Dia — camada compartilhada ─────────────────────────────────────
//
// Uma fonte só (GET /api/painel-dia) alimenta as DUAS telas:
//   Historico -> board dos TOP        (confrontos com no_board_top = true)
//   Analisar  -> tiles pra entrar     (confrontos com aguardando_entrada = true)
//
// Este arquivo cuida do que as duas precisam igual: buscar, distribuir, e
// disparar o alarme quando o robo promove um confronto. Duas copias disso
// tocariam o alarme duas vezes, e a divergencia entre elas só apareceria no
// pior momento — com uma corrida prestes a largar.
//
// A UI NAO decide camada, NAO promove e NAO calcula colagem: tudo isso vem
// pronto do robo. Aqui só reflete.

(function (glob) {

  // ── camadas ───────────────────────────────────────────────────────────────
  // Cor, som e rotulo de cada uma. OPORTUNIDADE nao apita: e' a lista de
  // espera, e apitar nela seria alarme o dia inteiro.
  var CAMADAS = {
    OPORTUNIDADE: { cor: '#8a94a6', rotulo: 'OPORTUNIDADE', som: null,     apita: false },
    TOP:          { cor: '#22e08a', rotulo: 'TOP',          som: 'alarme', apita: true  },
    HIGH:         { cor: '#ff8c1a', rotulo: 'HIGH',         som: 'sino',   apita: true  },
    GOOD:         { cor: '#4aa8ff', rotulo: 'GOOD',         som: 'beep',   apita: true  }
  };

  function camadaDe(c) {
    var k = String((c && c.camada) || '').trim().toUpperCase();
    return CAMADAS[k] || CAMADAS.OPORTUNIDADE;
  }

  // ── estado ────────────────────────────────────────────────────────────────
  var st = {
    dados: null,
    erro: null,
    timer: null,
    ouvintes: [],
    // Promocoes ja avisadas: id -> promovido_em. Guardar o TIMESTAMP, e nao um
    // booleano, e' o que permite um MESMO confronto ser promovido de novo
    // (ex.: reabriu na BW) e apitar outra vez, sem repetir a promocao antiga a
    // cada volta do polling.
    avisados: {}
  };

  function carregarAvisados() {
    try {
      var v = sessionStorage.getItem('gh_painel_avisados');
      st.avisados = v ? JSON.parse(v) : {};
    } catch (e) { st.avisados = {}; }
  }
  function gravarAvisados() {
    try { sessionStorage.setItem('gh_painel_avisados', JSON.stringify(st.avisados)); } catch (e) {}
  }

  // ── busca ─────────────────────────────────────────────────────────────────
  function urlPainel(data) {
    var base = (glob.BASE_PAINEL || glob.BASE || '');
    return base + '/api/painel-dia' + (data ? ('?date=' + encodeURIComponent(data)) : '');
  }

  function buscar(data) {
    return fetch(urlPainel(data), { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        st.dados = d; st.erro = null;
        dispararAlarmes(d);
        avisar();
        return d;
      })
      .catch(function (e) {
        // Guarda o erro em vez de engolir: a tela precisa poder dizer que esta
        // com dado velho. Painel silenciosamente parado, numa tela onde o
        // alarme e' o produto, e' pior que painel vazio.
        st.erro = e.message || 'falha';
        avisar();
      });
  }

  // ── distribuicao ──────────────────────────────────────────────────────────
  // Achata corridas -> confrontos, carregando os dados da corrida em cada um:
  // as duas telas mostram hora e nome junto do par, e sem isso cada uma teria
  // que reconstruir esse casamento por conta.
  function confrontos(d) {
    var out = [];
    ((d || st.dados || {}).corridas || []).forEach(function (c) {
      (c.confrontos || []).forEach(function (x) {
        out.push(Object.assign({}, x, {
          hora: c.hora, hora_br: c.hora_br, corrida: c.corrida,
          pista: c.pista, dist: c.dist
        }));
      });
    });
    return out;
  }

  // Board do Historico: so TOP (da manha ou mapeado depois).
  function doBoard(d) {
    return confrontos(d).filter(function (x) { return x.no_board_top === true; });
  }

  // Tiles da Analisar: promovidos e ainda sem aposta, os mais NOVOS primeiro,
  // no maximo 4 — e' o limite que o contrato fixa e o que a tela comporta.
  function paraEntrar(d) {
    return confrontos(d)
      .filter(function (x) { return x.aguardando_entrada === true; })
      .sort(function (a, b) {
        return String(b.promovido_em || '').localeCompare(String(a.promovido_em || ''));
      })
      .slice(0, 4);
  }

  // ── alarme ────────────────────────────────────────────────────────────────
  // Dispara uma vez por PROMOCAO. O gatilho e' o promovido_em ser novo pra
  // aquele id — nao a camada, nao a presenca na lista: o polling traz o mesmo
  // confronto a cada 15s, e qualquer outro criterio apitaria em loop.
  function dispararAlarmes(d) {
    var novas = [];
    confrontos(d).forEach(function (x) {
      if (!x.promovido_em || !x.id) return;
      // Ja apostado nao apita. O confronto continua vindo no polling depois da
      // entrada, e uma repromocao (a BW reabriu o mercado, por exemplo) faria
      // a tela chamar voce pra uma aposta que ja esta feita.
      if (x.entrada) return;
      var cam = camadaDe(x);
      if (!cam.apita) return;
      if (st.avisados[x.id] === x.promovido_em) return;
      st.avisados[x.id] = x.promovido_em;
      novas.push(x);
    });
    if (!novas.length) return;
    gravarAvisados();

    // Toca UMA vez, mesmo com varias promocoes na mesma volta: quatro sons
    // sobrepostos viram ruido e ninguem distingue as camadas. A prioridade e'
    // TOP > HIGH > GOOD — a camada mais forte e' a que merece ser ouvida.
    var ordem = ['TOP', 'HIGH', 'GOOD'];
    novas.sort(function (a, b) {
      return ordem.indexOf(String(a.camada).toUpperCase()) - ordem.indexOf(String(b.camada).toUpperCase());
    });
    var som = camadaDe(novas[0]).som;
    try {
      if (typeof glob.tocarSomAlertaGlobal === 'function') glob.tocarSomAlertaGlobal(som);
      else if (typeof glob.playSom === 'function') glob.playSom(som);
    } catch (e) {}

    // Avisa as telas quais confrontos foram promovidos AGORA: e' com isso que
    // a moldura na Analisar e a linha na lista piscam ao mesmo tempo.
    st.promovidosAgora = novas.map(function (x) { return x.id; });
    setTimeout(function () { st.promovidosAgora = []; }, 12000);
  }

  // ── assinatura ────────────────────────────────────────────────────────────
  function avisar() {
    st.ouvintes.forEach(function (fn) {
      try { fn(st.dados, st.erro); } catch (e) {}
    });
  }

  function assinar(fn) {
    st.ouvintes.push(fn);
    if (st.dados || st.erro) { try { fn(st.dados, st.erro); } catch (e) {} }
  }

  // Polling. Uma corrida promovida 15s antes da largada ainda da tempo, e um
  // intervalo menor multiplicaria a carga sem ganhar decisao.
  function iniciar(opts) {
    opts = opts || {};
    carregarAvisados();
    buscar(opts.date);
    if (st.timer) clearInterval(st.timer);
    st.timer = setInterval(function () {
      // Aba escondida nao precisa de polling: o alarme dispara igual quando ela
      // volta, e o navegador ja estrangula timers em segundo plano.
      if (document.hidden) return;
      buscar(opts.date);
    }, opts.intervalo || 18000);
  }

  glob.PainelDia = {
    CAMADAS: CAMADAS,
    camadaDe: camadaDe,
    iniciar: iniciar,
    buscar: buscar,
    assinar: assinar,
    confrontos: confrontos,
    doBoard: doBoard,
    paraEntrar: paraEntrar,
    promovidosAgora: function () { return st.promovidosAgora || []; },
    erro: function () { return st.erro; }
  };

})(typeof window !== 'undefined' ? window : this);