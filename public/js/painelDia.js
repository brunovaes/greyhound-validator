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
    // Camada vista de cada confronto na volta anterior: id -> 'TOP' | ...
    // E' a comparacao entre voltas que dispara o alarme.
    vistas: {},
    semBase: true
  };

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
          pista: c.pista, dist: c.dist,
          // A entrada e' da CORRIDA, nao do confronto: uma aposta por corrida.
          // Levar race_id e entradaCorrida em cada confronto e' o que permite
          // a tela saber "esta corrida ja foi apostada" olhando qualquer um
          // dos ate 4 confrontos dela.
          race_id: c.race_id,
          entradaCorrida: c.entrada || null
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
      // Ordena pelo promovido_em, que e' APROXIMADO — e aqui tudo bem: ele so
      // decide qual tile fica mais a esquerda. Pra disparar alarme ele nao
      // serve (o motor avisou que o valor se move), e por isso o alarme usa
      // transicao de camada.
      .sort(function (a, b) {
        return String(b.promovido_em || '').localeCompare(String(a.promovido_em || ''));
      })
      .slice(0, 4);
  }

  // ── alarme ────────────────────────────────────────────────────────────────
  //
  // O gatilho e' a TRANSICAO de camada entre uma volta e outra do polling, nao
  // o promovido_em. O motor avisou que aquele timestamp e' aproximado (vem do
  // capturado_em do avb_abertos) e pode se mover enquanto o mercado ainda esta
  // enchendo — deduplicar por ele faria o mesmo confronto apitar varias vezes.
  //
  // Duas coisas disparam:
  //   1) o confronto MUDOU de camada pra uma que apita (OPORTUNIDADE -> TOP)
  //   2) o confronto APARECEU ja apitando (HIGH e GOOD nascem assim)
  //
  // A camada vista de cada id fica na aba, entao trocar de tela nao reapita.
  function carregarVistas() {
    try {
      var v = sessionStorage.getItem('gh_painel_camadas');
      st.vistas = v ? JSON.parse(v) : {};
      // Aba nova (nada guardado) = primeira vez que esta aba ve o dia. A
      // primeira volta so registra o estado, sem apitar: abrir a tela com 3
      // confrontos ja promovidos dispararia tres alarmes de uma vez, pra
      // promocoes que aconteceram enquanto ninguem estava olhando.
      st.semBase = !v;
    } catch (e) { st.vistas = {}; st.semBase = true; }
  }
  function gravarVistas() {
    try { sessionStorage.setItem('gh_painel_camadas', JSON.stringify(st.vistas)); } catch (e) {}
  }

  function dispararAlarmes(d) {
    var novas = [];
    var vistasAgora = {};

    confrontos(d).forEach(function (x) {
      if (!x.id) return;
      var cam = camadaDe(x);
      var atual = String(x.camada || '').toUpperCase();
      vistasAgora[x.id] = atual;

      var antes = st.vistas[x.id];
      st.vistas[x.id] = atual;

      if (!cam.apita) return;
      // CORRIDA ja apostada nao apita — nem nos outros confrontos dela. Como
      // e' uma aposta por corrida, promover um segundo AvB da mesma prova
      // chamaria voce pra uma aposta que voce nao pode mais fazer.
      if (x.entradaCorrida) return;
      // Primeira volta desta aba: so registra.
      if (st.semBase) return;
      // Ja estava nesta camada: nao houve promocao agora.
      if (antes === atual) return;
      novas.push(x);
    });

    // Confronto que sumiu do payload some tambem da memoria: se ele voltar
    // depois, volta como novidade — e' o comportamento certo, porque para a
    // tela ele reapareceu.
    Object.keys(st.vistas).forEach(function (id) {
      if (!(id in vistasAgora)) delete st.vistas[id];
    });

    st.semBase = false;
    gravarVistas();
    if (!novas.length) return;

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
    carregarVistas();
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