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
  // As cores sao as MESMAS do CORES_ALARME do app.js, de proposito: o sistema ja
  // tinha uma paleta e inventar outra deixaria dois azuis quase iguais na mesma
  // tela. TOP azul, HIGH laranja, GOOD roxo (Bruno, set/2026). Antes TOP era
  // verde — mas o verde passou a significar OUTRA coisa na lista de corridas:
  // "o motor da manha previu esta". Camada e procedencia sao perguntas
  // diferentes e nao podem dividir a mesma cor.
  var CAMADAS = {
    OPORTUNIDADE: { cor: '#8a94a6', rotulo: 'OPORTUNIDADE', som: null,     apita: false },
    TOP:          { cor: '#3b82f6', rotulo: 'TOP',          som: 'alarme', apita: true  },
    HIGH:         { cor: '#f97316', rotulo: 'HIGH',         som: 'sino',   apita: true  },
    GOOD:         { cor: '#8b5cf6', rotulo: 'GOOD',         som: 'beep',   apita: true  }
  };
  // Ordem de forca das camadas. Decide qual corrida ocupa a tela de disputa e
  // qual som toca quando varias promovem na mesma volta. Vivia copiada em tres
  // lugares; agora e' uma so, exportada.
  // CONFIGURAVEL (Bruno, 10/09/2026). Os valores acima viraram so o PADRAO de
  // fabrica: a aba Configuracoes > Alarme manda som, cor e liga/desliga de cada
  // camada. `aplicarConfig` altera o proprio CAMADAS em vez de guardar uma
  // copia — quem le CAMADAS de fora (a lista de corridas, o selo) passa a ver a
  // cor escolhida sem precisar saber que existe configuracao.
  var CFG = { ativo: true, repetir: true, vezes: 3, carregada: false };
  function aplicarConfig(c) {
    if (!c) return;
    CFG.ativo = c.avb_alarme_ativo == null ? true : !!Number(c.avb_alarme_ativo);
    CFG.repetir = c.avb_alarme_repetir == null ? true : !!Number(c.avb_alarme_repetir);
    var v = parseInt(c.avb_alarme_vezes, 10);
    CFG.vezes = (v > 0 && v <= 5) ? v : 3;
    [['TOP', 'top'], ['HIGH', 'high'], ['GOOD', 'good']].forEach(function (P) {
      var alvo = CAMADAS[P[0]];
      var som = c['avb_' + P[1] + '_som'];
      var cor = c['avb_' + P[1] + '_cor'];
      var at = c['avb_' + P[1] + '_ativo'];
      if (som) alvo.som = som;
      if (cor) alvo.cor = cor;
      if (at != null) alvo.apita = !!Number(at);
    });
    CFG.carregada = true;
  }
  function carregarConfig() {
    try {
      var base = (glob.BASE_PAINEL || glob.BASE || '');
      return fetch(base + '/api/config', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) { aplicarConfig(c); })
        // Falhar aqui nao pode calar o alarme: sem config, valem os padroes de
        // fabrica, que sao exatamente o comportamento anterior.
        .catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  var ORDEM = ['TOP', 'HIGH', 'GOOD'];
  function forcaDe(c) {
    var i = ORDEM.indexOf(String((c && c.camada) || '').trim().toUpperCase());
    return i < 0 ? 99 : i;
  }

  // UM lugar toca no modulo inteiro. Estava duplicado entre a promocao e (agora)
  // o repique; duas copias do fallback de audio e' como um dos dois fica mudo
  // numa mudanca futura sem ninguem perceber.
  function tocar(som) {
    if (!som) return;
    try {
      if (typeof glob.tocarSomAlertaGlobal === 'function') glob.tocarSomAlertaGlobal(som);
      else if (typeof glob.playSom === 'function') glob.playSom(som);
    } catch (e) {}
  }

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
    // Quantas vezes cada confronto ja repicou nesta aba. Nao vai pro
    // localStorage de proposito: e contagem da janela dos ultimos 5 minutos, e
    // guardar isso entre sessoes so criaria AvB que nasce sem direito a apitar.
    repiques: {},
    repiqueTimer: null,
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
          // Estado da CORRIDA, para o repique saber quando parar. Sem isto ele
          // teria que reabrir o payload por fora e as duas leituras poderiam
          // discordar. `expirado` vem do servidor de proposito: e o mesmo
          // relogio que tira a corrida da tela.
          ja_correu: !!c.ja_correu,
          expirado: !!c.expirado,
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

  // Chave de corrida. Hora e nome, normalizados: o payload traz "1:47" e a
  // lista pode ter "01:47", e sem normalizar as duas nunca casam.
  function chaveCorrida(x) {
    var h = String((x && x.hora) || '').match(/(\d{1,2}):(\d{2})/);
    return String((x && x.corrida) || '').trim().toLowerCase()
      + '|' + (h ? (String(parseInt(h[1], 10)) + ':' + h[2]) : '');
  }

  // TODOS os confrontos aguardando entrada, de todas as corridas, ordenados por
  // CAMADA e depois por largada. A lista de corridas usa esta lista inteira pra
  // destacar cada corrida que tem AvB esperando — mais de uma ao mesmo tempo,
  // se for o caso.
  //
  // A ordenacao deixou de ser por promovido_em (set/2026). Aquele campo e'
  // aproximado — vem do capturado_em do avb_abertos e se move enquanto o
  // mercado ainda enche — entao ele decidia qual corrida ocupava a tela por um
  // criterio que muda sozinho. Agora manda a camada, que e' o que voce usa pra
  // decidir, e a largada desempata.
  function aguardando(d) {
    return confrontos(d)
      .filter(function (x) { return x.aguardando_entrada === true; })
      .sort(function (a, b) {
        var f = forcaDe(a) - forcaDe(b);
        if (f !== 0) return f;
        return String(a.hora || '').localeCompare(String(b.hora || ''));
      });
  }

  // Os confrontos de UMA corrida, ja classificados e em ordem de merito.
  //
  // E' por aqui que a TELA DA CORRIDA (a dos galgos com gauges) pega os AvBs
  // que a BW abriu. Ate 09/09/2026 ela montava os cards de uma fonte propria,
  // com os baldes 'surpresas' e 'secundarios' — um modelo que o resto do
  // sistema ja tinha aposentado. O resultado era a mesma corrida classificada
  // de dois jeitos em duas telas.
  function daCorrida(corrida, hora, d) {
    const k = chaveCorrida({ corrida: corrida, hora: hora });
    return confrontos(d).filter(function (x) { return chaveCorrida(x) === k; });
  }

  // Tiles da Analisar: SO os AvBs da corrida VIGENTE — a de camada mais alta.
  //
  // Antes devolvia ate 4 confrontos de corridas DIFERENTES, e a tela mostrava
  // um AvB das 9:12 ao lado de um das 8:59. Dois relogios na mesma tela e' o
  // que faz voce entrar no AvB errado. Uma corrida por vez; as outras seguem
  // sinalizadas na lista e entram quando chegar a vez delas.
  function paraEntrar(d) {
    var todos = aguardando(d);
    if (!todos.length) return [];
    var k = chaveCorrida(todos[0]);
    return todos.filter(function (x) { return chaveCorrida(x) === k; }).slice(0, 4);
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
    // Liga/desliga geral. Nao dá pra sair antes de montar `vistas`: se saisse,
    // desligar e religar o alarme no meio do dia faria TODOS os AvBs ja abertos
    // parecerem promocoes novas e apitarem de uma vez.

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
    if (!CFG.ativo) return;

    // Toca UMA vez, mesmo com varias promocoes na mesma volta: quatro sons
    // sobrepostos viram ruido e ninguem distingue as camadas. A prioridade e'
    // TOP > HIGH > GOOD — a camada mais forte e' a que merece ser ouvida.
    novas.sort(function (a, b) { return forcaDe(a) - forcaDe(b); });
    // A confirmacao tambem conta no teto: sem isso um AvB que abre dentro dos 5
    // minutos apitaria 1 + CFG.vezes, e o numero da tela mentiria.
    novas.forEach(function (x) { st.repiques[x.id] = (st.repiques[x.id] || 0) + 1; });
    tocar(camadaDe(novas[0]).som);

    // PISCA A LINHA NA LISTA junto com o som. A cor diz DE ONDE veio o AvB:
    // verde pro que o motor da manha levantou e a BW abriu, azul pra pescada
    // (a BW abriu sem estar na lista da manha). Quem pinta e' a tela que tem a
    // lista, porque este modulo nao conhece o DOM dela — onde a funcao nao
    // existir, o alarme toca e nada pisca, sem erro.
    try {
      if (typeof glob.pintarPromocaoNaLista === 'function') glob.pintarPromocaoNaLista(novas);
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
  // ── REPIQUE (Bruno, 10/09/2026) ───────────────────────────────────────────
  // "de 1 em 1 minuto ate a hora da corrida tocar o ALARME". Um AvB confirmado
  // que voce ainda nao apostou volta a apitar a cada minuto enquanto faltarem
  // 5 minutos ou menos para a largada.
  //
  // TETO por AvB (`CFG.vezes`, no maximo 5): alarme que nao para vira ruido de
  // fundo e a pessoa deixa de reagir a ele — o oposto do objetivo. Contado por
  // confronto, entao dois AvBs na mesma janela nao consomem o teto um do outro.
  //
  // A JANELA usa o relogio do NAVEGADOR sobre o hora_br; o `expirado` vem do
  // servidor. Sao dois relogios de proposito: o do servidor decide o que sai de
  // cena (regra do sistema), o do navegador decide quando apitar (o seu relogio
  // e' o que voce esta olhando). Num PC fora do fuso de Brasilia os dois
  // divergem — e' a mesma limitacao ja conhecida do minutosParaLargada.
  var JANELA_MIN = 5;
  function minutosAteBr(horaBr) {
    var m = String(horaBr || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var agora = new Date();
    var alvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(),
                        parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    return Math.floor((alvo.getTime() - agora.getTime()) / 60000);
  }
  function repique() {
    if (!CFG.ativo || !CFG.repetir) return;
    if (document.hidden) return;
    var candidatos = [];
    confrontos().forEach(function (x) {
      if (!x.id) return;
      var cam = camadaDe(x);
      if (!cam.apita) return;              // OPORTUNIDADE e camada desligada
      if (x.entradaCorrida) return;        // ja apostou: nao ha o que chamar
      if (x.ja_correu || x.expirado) return;
      var min = minutosAteBr(x.hora_br);
      if (min === null || min < 0 || min > JANELA_MIN) return;
      if ((st.repiques[x.id] || 0) >= CFG.vezes) return;
      candidatos.push(x);
    });
    if (!candidatos.length) return;
    // Um toque por volta, na camada mais forte — mesma regra da promocao. Mas o
    // teto e debitado de TODOS os candidatos: senao um GOOD ficaria eternamente
    // com o contador zerado atras de um TOP e apitaria depois, sozinho, fora de
    // hora.
    candidatos.forEach(function (x) { st.repiques[x.id] = (st.repiques[x.id] || 0) + 1; });
    candidatos.sort(function (p, q) { return forcaDe(p) - forcaDe(q); });
    tocar(camadaDe(candidatos[0]).som);
    try {
      if (typeof glob.pintarPromocaoNaLista === 'function') glob.pintarPromocaoNaLista([candidatos[0]]);
    } catch (e) {}
  }

  function iniciar(opts) {
    opts = opts || {};
    carregarVistas();
    carregarConfig();
    buscar(opts.date);
    if (st.repiqueTimer) clearInterval(st.repiqueTimer);
    st.repiqueTimer = setInterval(repique, 60000);
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
    aplicarConfig: aplicarConfig,
    config: function () { return CFG; },
    repique: repique,
    iniciar: iniciar,
    buscar: buscar,
    assinar: assinar,
    confrontos: confrontos,
    doBoard: doBoard,
    aguardando: aguardando,
    daCorrida: daCorrida,
    dados: function () { return st.dados; },
    forcaDe: forcaDe,
    chaveCorrida: chaveCorrida,
    paraEntrar: paraEntrar,
    promovidosAgora: function () { return st.promovidosAgora || []; },
    erro: function () { return st.erro; }
  };

})(typeof window !== 'undefined' ? window : this);