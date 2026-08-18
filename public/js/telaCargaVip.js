// ============================================================================
// public/js/telaCargaVip.js — monta a lista da tela Carga VIP.
//
// Antes esta lista era um modal desenhado pelo src/app.js, por cima da tela
// Analisar. Virou pagina propria (GET /carga-vip), entao o codigo saiu de la e
// veio pra ca. Arquivo estatico de proposito: nao passa por template literal
// do Express, entao aspas, \n e ${...} nao tem como se resolver errado no
// caminho — que e' a armadilha conhecida dos <script> embutidos.
//
// A pagina define window.VIP_BASE antes de carregar este arquivo.
// A fonte de dados continua sendo a MESMA rota de antes: GET /api/carga-vip.
// Clicar numa corrida leva pra tela Analisar com ?vip=hora|corrida, e o
// src/app.js foca a corrida ao abrir.
//
// NAO confundir com src/utils/cargaVip.js, que e' do MOTOR e roda no servidor
// (o api.js faz require dele na rota /api/carga-vip). Este aqui roda no
// NAVEGADOR. Sao dois arquivos diferentes, com donos diferentes; por isso o
// nome daqui e' telaCargaVip.js.
// ============================================================================
(function () {
  'use strict';

  var BASE = window.VIP_BASE || '/greyhound';
  // { "1": ["url", ...], ... } — as artes disponiveis por trap. Vem vazio se a
  // pasta public/img/dogs nao existir; a tela cai na bolinha com o numero.
  var DOGS = window.VIP_DOGS || {};
  // Codigo do Racing Post -> nome completo. Vem do servidor (src/utils/
  // nomesPistas.js), nao copiado aqui: mapa duplicado fica pra tras quando
  // alguem adiciona uma pista nova.
  var PISTAS = window.VIP_PISTAS || {};
  var alvo = document.getElementById('vip-conteudo');
  if (!alvo) return;

  // Copia da conversao UK->BR do app.js. E' de propostio uma copia: esta
  // pagina nao carrega o app.js (que so existe dentro da tela Analisar).
  function horaBr(h) {
    if (!h) return '';
    var p = String(h).split(':');
    var hr = parseInt(p[0], 10);
    if (hr >= 1 && hr <= 9) hr += 12;
    hr = hr - 4;
    if (hr < 0) hr += 24;
    return hr + ':' + p[1];
  }

  // Copia do _limpaNome() do app.js: em alguns casos o motor grava a linha de
  // pedigree inteira dentro do nome ("Whitewood Gigi (M) ltf b ... Oct24").
  function limpaNome(n) {
    if (!n) return '';
    var txt = String(n).trim();
    var mSexo = txt.match(/^(.*?\((?:M|W)\))/);
    if (mSexo) return mSexo[1].trim();
    var toks = txt.split(/\s+/);
    var CORES = /^(?:bk|bd|be|f|w|bkw|wbk|bdw|wbd|bew|wbe|bebdw|bkwtkd|bkbd|bebd|dkbd|lgbd|bkwbd)$/i;
    var MESANO = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{2}$/i;
    for (var k = 1; k < toks.length; k++) {
      var t = toks[k];
      if (CORES.test(t) || MESANO.test(t) || /^\(Ssn/i.test(t)) {
        return toks.slice(0, k).join(' ').trim();
      }
    }
    return txt;
  }

  // O que saiu da coluna Detalhes e nao cabe na de Corrida vai pro tooltip:
  // distancia, odd da analise e Delta t. Continua acessivel sem ocupar coluna.
  function tooltipCorrida(e) {
    var p = [];
    var dist = e.dist == null ? '' : String(e.dist);
    if (dist && !/m$/i.test(dist)) dist += 'm';
    if (dist) p.push(dist);
    if (e.ratio_odd != null) p.push('odd ' + e.ratio_odd);
    if (e.dt_caltm != null) p.push('\u0394t ' + e.dt_caltm);
    return p.join('  \u00b7  ');
  }

  // Escolhe a arte do galgo. O TRAP ja vem certo no nome do arquivo (a manga
  // e' da cor do trap); o que sorteamos e' a PELAGEM.
  //
  // O sorteio e' FIXO pelo nome do galgo, nao a cada carregamento: Ardera Dame
  // pega uma pelagem arbitraria, mas pega sempre a mesma. Figura trocando de
  // cara a cada F5 atrapalharia reconhecer a corrida de bate-pronto.
  function arteDoGalgo(trap, nome) {
    var lista = DOGS[String(trap)];
    if (!lista || !lista.length) return null;
    var h = 0, txt = String(nome || '');
    for (var i = 0; i < txt.length; i++) h = ((h << 5) - h + txt.charCodeAt(i)) | 0;
    return lista[Math.abs(h) % lista.length];
  }

  // A arte olha pra direita. Espelhando a da direita, os dois ficam de frente
  // um pro outro, como na arena da tela Analisar.
  function figura(trap, nome, espelha) {
    var src = arteDoGalgo(trap, nome);
    var cls = 'vip-dog' + (espelha ? ' espelha' : '');
    if (!src) return '<div class="' + cls + '"><span class="semarte">' + esc(trap) + '</span></div>';
    return '<div class="' + cls + '"><img src="' + esc(src) + '" alt="T' + esc(trap) + '" loading="lazy"></div>';
  }

  // So o primeiro nome. O nome completo continua no title, pra nao se perder.
  function primeiroNome(n) {
    var limpo = limpaNome(n);
    var p = String(limpo || '').trim().split(/\s+/);
    return p[0] || '';
  }

  // Um galgo da coluna AvB: figura em cima, primeiro nome embaixo, centralizado.
  function galgo(trap, nome, espelha) {
    var limpo = limpaNome(nome);
    return '<div class="vip-galgo" title="' + esc('T' + trap + ' ' + limpo) + '">'
      + figura(trap, nome, espelha)
      + '<div class="nome">' + esc(primeiroNome(nome)) + '</div>'
      + '</div>';
  }

  // Chegada completa: uma bolinha por posicao, na ordem 1o -> 6o.
  // A posicao autoritativa e' o campo pos, NAO a ordem do array (o motor avisou
  // que o array vem ordenado, mas que a fonte e' o pos).
  // Destaques: 1o lugar em dourado, os dois da disputa contornados.
  function bolinhasChegada(chegada, pickTrap, outroTrap, nomes) {
    if (!chegada || !chegada.length) return '<span class="aguarda">aguardando resultado</span>';
    var ord = chegada.slice().sort(function (a, b) { return Number(a.pos) - Number(b.pos); });
    return ord.map(function (f) {
      var t = Number(f.trap), pos = Number(f.pos);
      // trap-badge t1..t6 vem do designTokens: e' a cor real da manga daquele
      // trap, a mesma bolinha usada no Historico e na tela de sessao.
      var cls = 'trap-badge t' + t + (pos === 1 ? ' p1' : '')
        + ((t === Number(pickTrap) || t === Number(outroTrap)) ? ' nodisputa' : '');
      var nome = nomes && nomes[String(t)] ? ' ' + nomes[String(t)] : '';
      return '<span class="' + cls + '" title="' + esc(pos + 'o lugar: T' + t + nome) + '">' + esc(t) + '</span>';
    }).join('');
  }

  // "DunPk A4" -> "Dunstall Park A4". Troca so a primeira palavra; se o codigo
  // nao estiver no mapa, devolve como veio.
  function pistaCompleta(corrida) {
    var txt = String(corrida || '').trim();
    if (!txt) return '';
    var p = txt.split(' ');
    if (PISTAS[p[0]]) { p[0] = PISTAS[p[0]]; return p.join(' '); }
    return txt;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setSub(txt) {
    var el = document.getElementById('vip-sub');
    if (el) el.textContent = txt;
  }

  function erro(titulo, detalhe) {
    alvo.innerHTML =
      '<div class="vip-box" style="padding:22px;color:#ef4444;line-height:1.6">'
      + '<div style="font-weight:700;margin-bottom:6px">' + esc(titulo) + '</div>'
      + (detalhe ? '<div style="font-size:12px;color:#f59e0b">' + esc(detalhe) + '</div>' : '')
      + '</div>';
  }

  // Le como TEXTO antes do JSON: quando o servidor devolve HTML (rota ausente,
  // sessao expirada, 500), o .json() estoura com "Unexpected token '<'", que
  // nao diz nada a quem esta usando.
  function carregar() {
    fetch(BASE + '/api/carga-vip', { credentials: 'same-origin' })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, texto: t }; }); })
      .then(function (res) {
        var d = null;
        try { d = JSON.parse(res.texto); } catch (e) { /* nao era JSON */ }
        if (d) { pintar(d); return; }
        var motivo = res.status === 404 ? 'a rota /api/carga-vip não existe neste servidor'
          : (res.status === 401 || res.status === 403) ? 'sem permissão, ou a sessão expirou (recarregue a página)'
          : res.status >= 500 ? 'o servidor falhou ao montar a lista'
          : 'o servidor respondeu algo que não é JSON';
        erro('Não consegui carregar a Carga VIP', 'HTTP ' + res.status + ': ' + motivo + '.');
      })
      .catch(function (e) { erro('Erro de conexão', e.message); });
  }

  function pintar(d) {
    if (!d || d.error) { erro('Não consegui carregar a Carga VIP', (d && d.error) || 'resposta inesperada'); return; }
    var ent = d.entradas || [];
    setSub((d.date || '') + ' \u00b7 ' + (d.total != null ? d.total : ent.length) + ' corrida(s) no filtro');

    // Legenda dos niveis: "niveis" e' um OBJETO por nivel ({criterio,
    // taxa_historica_pct}). Como cada linha ja mostra a taxa, aqui fica so o
    // CRITERIO, que e' o que a linha nao diz.
    // A legenda vive fora do #vip-conteudo: ela divide a faixa com os KPIs.
    var legenda = '';
    if (d.niveis && typeof d.niveis === 'object') {
      var partes = Object.keys(d.niveis).map(function (k) {
        var v = d.niveis[k] || {};
        var crit = (typeof v === 'object') ? v.criterio : v;
        if (!crit) return '';
        var cor = k.toLowerCase() === 'premium' ? '#eab308' : '#22c55e';
        return '<strong style="color:' + cor + '">' + esc(k) + '</strong>: ' + esc(crit);
      }).filter(Boolean);
      if (partes.length) legenda = partes.join('<br>');
    }

    var boxLeg = document.getElementById('vip-legenda');
    if (boxLeg) boxLeg.innerHTML = legenda;

    if (!ent.length) {
      alvo.innerHTML = '<div class="vip-box" style="padding:30px 22px;text-align:center;color:#888;font-size:13px">'
        + 'Nenhuma corrida passou no filtro hoje.</div>';
      return;
    }

    // Ordena pelo horario BR. O motor entrega ordenado por relevancia (Premium
    // primeiro, maior delta no topo), mas na hora de operar o que importa e' a
    // sequencia do dia: a lista serve pra saber o que vem A SEGUIR.
    // A conversao UK->BR pode virar o dia (UK 11:04 = BR 07:04), entao ordenar
    // pela hora UK crua deixaria as corridas da manha no fim da lista.
    ent = ent.slice().sort(function (a, b) {
      var ha = a.hora_br || (a.hora ? horaBr(a.hora) : '');
      var hb = b.hora_br || (b.hora ? horaBr(b.hora) : '');
      var m = function (h) { var p = String(h || '').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); };
      return m(ha) - m(hb);
    });

    var MOTIVOS = {
      margem_insuficiente: 'o motor descartou por margem apertada',
      historico_insuficiente: 'o motor descartou por histórico insuficiente'
    };

    var linhas = ent.map(function (e) {
      var premium = String(e.nivel || '').toLowerCase() === 'premium';
      var cor = premium ? '#eab308' : '#22c55e';
      // taxa_nivel_pct e' o nome novo; taxa_estimada_pct o antigo. Lemos os
      // dois pra a tela nao ficar sem numero entre dois deploys.
      var taxa = (e.taxa_nivel_pct != null) ? e.taxa_nivel_pct : e.taxa_estimada_pct;

      var selos = [];
      if (e.selo_pick_frente) selos.push('sai na frente');
      if (e.selo_outro_fuma) selos.push('outro fuma');

      // Motivo do skip so aqui, na lista: e' onde voce decide se vale entrar.
      // Na Analisar o Bruno nao quer (pediria atencao no momento errado).
      var skipTag = e.skip
        ? '<div class="vip-skip">&#9888; ' + esc(MOTIVOS[e.skip_motivo] || ('skip: ' + (e.skip_motivo || 'motivo não informado'))) + '</div>'
        : '';

      var uk = e.hora || '';
      var br = e.hora_br || (uk ? horaBr(uk) : '');

      // bateu vem do motor, ja calculado com bateuPar sobre a chegada:
      //   true = a disputa bateu | false = nao bateu | null = INDEFINIDO
      // null acontece quando um dos dois ficou fora da chegada (retirada, nao
      // largou) ou em dead heat entre os dois. Fica NEUTRO, igual ao "-" do
      // Historico: nao e' acerto nem erro, e pintar de vermelho seria mentira.
      var vd = veredito(e.chegada, e.bateu, e.pick_trap, e.outro_trap);
      var marca = vd.classe ? ' ' + vd.classe : '';
      if (vd.aviso && window.console) console.warn('[carga-vip] ' + e.hora + '|' + e.corrida + ' -> ' + vd.aviso);

      var alvoBW = e.abriu === true
        ? '<div class="sim">' + (e.odd_abertura != null ? esc(e.odd_abertura) : 'sim') + '</div>'
          + (e.odd_abertura != null ? '<div class="rot">odd de abertura</div>' : '')
        // false = corrida monitorada e o par NAO abriu: o filtro apontou e nao
        // deu pra entrar. null = corrida nao monitorada, que e' outra coisa e
        // fica como "-": tratar os dois igual esconderia buraco de cobertura.
        : e.abriu === false ? '<div class="nao">não abriu</div>'
        : '<div class="nd">-</div>';

      return '<div class="vip-lin' + (e.skip ? ' tem-skip' : '') + marca + '"'
        + ' data-hora="' + esc(e.hora || '') + '" data-corrida="' + esc(e.corrida || '') + '"'
        + ' title="Clique para abrir esta corrida na tela Analisar">'
        // Hora nas duas linhas, no formato do Historico: BR grande, UK menor.
        // A de cima e' a de fonte maior. Hoje: UK em cima, BR embaixo.
        + '<div class="c-hora vip-hora">'
        + '<div class="grande">' + esc(uk || br || '-') + '</div>'
        + (br && uk && br !== uk ? '<div class="peq">' + esc(br) + '</div>' : '')
        + '</div>'
        + '<div class="c-cor vip-cor" title="' + esc(tooltipCorrida(e)) + '">'
        + esc(pistaCompleta(e.corrida))
        + (selos.length ? '<div class="selos">' + esc(selos.join(' \u00b7 ')) + '</div>' : '')
        + skipTag
        + '</div>'
        + '<div class="c-avb"><div class="vip-conf">'
        + galgo(e.pick_trap, e.pick_nome, false)
        + '<div class="vip-vence">vence</div>'
        + galgo(e.outro_trap, e.outro_nome, true)
        + '</div></div>'
        + '<div class="c-bw vip-bw">' + alvoBW + '</div>'
        + '<div class="c-pod"><div class="vip-chegada">'
        + bolinhasChegada(e.chegada, e.pick_trap, e.outro_trap, e.nomes_por_trap) + '</div>'
        + '<div class="vip-replay"></div></div>'
        + '<div class="c-cha vip-taxa" title="' + esc((e.nivel || '') + ': taxa histórica deste filtro em corridas parecidas, não a chance desta corrida') + '">'
        + (taxa != null ? '<div class="pct" style="color:' + cor + '">' + esc(taxa) + '%</div>' : '')
        + '</div>'
        + '<div class="c-aca vip-acao"><button type="button" class="btn" data-disputa="1"'
        + ' title="Analisar disputa"'
        + ' data-a="' + esc(e.pick_trap) + '" data-b="' + esc(e.outro_trap) + '">&#9876;</button></div>'
        + '</div>';
    }).join('');

    // Cabecalho com as MESMAS classes de largura das colunas da linha. Fica
    // colado no topo ao rolar (position:sticky no CSS).
    var cabecalho = '<div class="vip-cab">'
      + '<span class="c-hora">Hora BR</span>'
      + '<span class="c-cor">Corrida</span>'
      + '<span class="c-avb">AvB</span>'
      + '<span class="c-bw">Abriu na BW</span>'
      + '<span class="c-pod">Pódio</span>'
      + '<span class="c-cha">Chances</span>'
      + '<span class="c-aca"></span>'
      + '</div>';

    alvo.innerHTML = '<div class="vip-box">' + cabecalho + linhas + '</div>'
      + '<div class="vip-rodape">Clique numa corrida para abri-la na tela Analisar. '
      + 'Borda verde: a disputa bateu. Vermelha: não bateu. Sem cor: ainda não correu, ou a chegada não resolveu a disputa.</div>';

    ENTRADAS = ent;
    pintarKpis();

    // A lista ja esta na tela; agora busca a chegada e pinta por cima.
    buscarResultados(d, ent);
  }



  // ── KPIs do dia ────────────────────────────────────────────────────────────
  // Guardamos as entradas porque os KPIs sao recalculados quando a chegada
  // chega na segunda etapa. Sem isso, eles ficariam congelados no que a lista
  // sabia no primeiro instante.
  var ENTRADAS = [];

  function pintarKpis() {
    var box = document.getElementById('vip-kpis');
    if (!box) return;
    var total = ENTRADAS.length, vit = 0, der = 0, abriu = 0, medidas = 0;
    for (var i = 0; i < ENTRADAS.length; i++) {
      var e = ENTRADAS[i];
      var v = veredito(e.chegada, e.bateu, e.pick_trap, e.outro_trap);
      if (v.classe === 'bateu') vit++;
      else if (v.classe === 'errou') der++;
      if (e.abriu === true) abriu++;
      if (e.abriu === true || e.abriu === false) medidas++;
    }
    // A porcentagem sai sobre as corridas RESOLVIDAS, nao sobre o total: as que
    // nao correram, ou cuja chegada nao decidiu a disputa, nao sao acerto nem
    // erro, e conta-las no denominador empurraria os dois numeros pra baixo o
    // dia inteiro, dando a impressao de um desempenho pior do que o real.
    var resolvidas = vit + der;
    var pc = function (n) { return resolvidas ? Math.round(n / resolvidas * 100) + '%' : '-'; };

    var card = function (cls, rot, val, pct) {
      return '<div class="vip-kpi ' + cls + '"><div class="rot">' + rot + '</div>'
        + '<div class="val">' + val + (pct ? '<span class="pct">' + pct + '</span>' : '') + '</div></div>';
    };
    box.innerHTML =
        card('', 'Corridas', total, resolvidas < total ? '<span style="color:#666;font-weight:600">' + resolvidas + ' resolvidas</span>' : '')
      + card('ok', 'Vitórias', vit, pc(vit))
      + card('ruim', 'Derrotas', der, pc(der))
      + card('bw', 'Abriu na BW', abriu + (medidas ? '<span style="font-size:13px;color:#666">/' + medidas + '</span>' : ''), '');
  }

  // ── Chegada e resultado ────────────────────────────────────────────────────
  // O /api/carga-vip monta o card PRE corrida e nao traz a chegada. O dado ja
  // existe no banco (o robo de resultados grava finishing_order_json, e e' de
  // la que o Historico tira o "Bateu"), entao buscamos numa segunda chamada.
  //
  // Em duas etapas de proposito: a lista aparece na hora, sem esperar. Quando
  // o resultado chega, as linhas ja desenhadas sao atualizadas no lugar, em vez
  // de redesenhar tudo (redesenhar piscaria a tela inteira por causa de uma
  // borda).
  //
  // Se um dia o motor passar a mandar chegada/bateu junto da lista, o que veio
  // dele tem prioridade e estas linhas simplesmente nao sao pedidas.
  function buscarResultados(d, ent) {
    if (!d.date || !ent.length) return;
    // Pede pra TODAS as entradas, mesmo as que ja vieram com chegada do motor.
    // O link do replay (races.video_url) nao esta no payload deles, entao sem
    // esta chamada o botao nunca seria criado. O que vem do motor continua
    // tendo prioridade: daqui so aproveitamos o que falta.
    var pares = ent.map(function (e) {
      return { hora: e.hora, corrida: e.corrida, a: e.pick_trap, b: e.outro_trap };
    });
    fetch(BASE + '/carga-vip/resultados', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: d.date, pares: pares })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (mapa) { if (mapa && !mapa.error) aplicarResultados(mapa); })
      .catch(function () { /* sem resultado: as linhas ficam como estao */ });
  }

  // Posicao de um trap dentro da chegada. A fonte e' o campo pos, nao a ordem
  // do array (o motor avisou que o array vem ordenado, mas que o pos e' quem
  // manda).
  function posDoTrap(chegada, trap) {
    if (!chegada) return null;
    for (var i = 0; i < chegada.length; i++) {
      if (Number(chegada[i].trap) === Number(trap)) return Number(chegada[i].pos);
    }
    return null;
  }

  // Decide a cor da linha, CONFERINDO o bateu contra o podio que esta na tela.
  //
  // Por que conferir: o bateu vem pronto de fora (do motor, ou da rota
  // /carga-vip/resultados, que usa bateuPar). A tela nao recalcula por conta
  // propria de proposito, pra nao criar uma segunda versao da verdade. Mas
  // pintar de verde uma linha cujo podio na mesma tela mostra o contrario e'
  // pior do que nao pintar: passa confianca numa informacao errada.
  //
  // Entao: se o bateu contradiz as posicoes exibidas, a linha fica NEUTRA e o
  // tooltip denuncia a divergencia, em vez de escolher um dos dois.
  // Retorna { classe, aviso }.
  function veredito(chegada, bateu, pick, outro) {
    if (bateu !== true && bateu !== false) return { classe: '', aviso: '' };
    var pa = posDoTrap(chegada, pick), pb = posDoTrap(chegada, outro);
    // Sem chegada pra conferir: confia no que veio.
    if (pa == null || pb == null) return { classe: bateu ? 'bateu' : 'errou', aviso: '' };
    var esperado = pa < pb;
    if (esperado !== bateu) {
      return {
        classe: '',
        aviso: 'Divergência: a chegada mostra T' + pick + ' em ' + pa + 'o e T' + outro + ' em ' + pb
             + 'o, mas o resultado recebido diz o contrário. A linha ficou sem cor de propósito.'
      };
    }
    return { classe: bateu ? 'bateu' : 'errou', aviso: '' };
  }

  // Texto do tooltip: em que lugar cada um dos dois chegou e o veredito.
  function explicaResultado(r, pick, outro) {
    if (!r.chegada || !r.chegada.length) return 'Sem chegada registrada.';
    var pa = posDoTrap(r.chegada, pick), pb = posDoTrap(r.chegada, outro);
    var lugar = function (t, p) { return 'T' + t + ': ' + (p == null ? 'fora da chegada' : p + 'o lugar'); };
    var linha1 = lugar(pick, pa) + '  |  ' + lugar(outro, pb);
    var v = veredito(r.chegada, r.bateu, pick, outro);
    if (v.aviso) return linha1 + '\n' + v.aviso;
    if (r.bateu === true) return linha1 + '\nBateu: o pick chegou à frente do outro.';
    if (r.bateu === false) return linha1 + '\nNão bateu: o outro chegou à frente do pick.';
    if (pa == null || pb == null) return linha1 + '\nIndefinido: um dos dois não consta na chegada.';
    if (pa === pb) return linha1 + '\nIndefinido: empate entre os dois.';
    return linha1 + '\nIndefinido.';
  }

  function aplicarResultados(mapa) {
    var linhas = document.querySelectorAll('.vip-lin');
    for (var i = 0; i < linhas.length; i++) {
      var lin = linhas[i];
      var chave = (lin.getAttribute('data-hora') || '') + '|' + (lin.getAttribute('data-corrida') || '');

      var btn = lin.querySelector('[data-disputa]');
      var pick = btn && btn.getAttribute('data-a');
      var outro = btn && btn.getAttribute('data-b');
      // A chave inclui o PAR: a mesma corrida pode ter mais de uma entrada na
      // lista, com pares diferentes, e cada uma tem o seu proprio resultado.
      var r = mapa[chave + '|' + pick + 'x' + outro] || mapa[chave];
      if (!r) continue;

      // Acha a entrada correspondente pra saber o que o motor ja tinha mandado.
      var en = null;
      for (var j = 0; j < ENTRADAS.length; j++) {
        var c = ENTRADAS[j];
        if (c.hora === lin.getAttribute('data-hora') && c.corrida === lin.getAttribute('data-corrida')
            && String(c.pick_trap) === String(pick) && String(c.outro_trap) === String(outro)) { en = c; break; }
      }

      // Prioridade do motor: se ele mandou a chegada, e' a dele que vale, e a
      // rota daqui serve so pro que ele nao manda (hoje, o link do replay).
      var doMotor = !!(en && en.chegada);
      var chegada = doMotor ? en.chegada : r.chegada;
      var bateu = doMotor ? en.bateu : r.bateu;
      var nomes = (en && en.nomes_por_trap) || r.nomes;

      // Grava na entrada tambem, senao os KPIs ficariam com a foto antiga.
      if (en) { en.chegada = chegada; en.bateu = bateu; en.nomes_por_trap = nomes; }

      var alvoCheg = lin.querySelector('.vip-chegada');
      if (alvoCheg) {
        alvoCheg.innerHTML = bolinhasChegada(chegada, pick, outro, nomes);
        // Deixa a conta a vista. Verde NAO quer dizer "venceu a corrida", e sim
        // "o pick chegou a frente do outro do par", que e' o que o AvB aposta.
        // Sem isto, uma linha verde com o pick em 3o parece erro da tela.
        alvoCheg.title = explicaResultado({ chegada: chegada, bateu: bateu }, pick, outro);
      }

      // O video so existe depois que o robo de resultados passa, entao o botao
      // e' criado aqui e nao na primeira pintura.
      var alvoRep = lin.querySelector('.vip-replay');
      if (alvoRep) {
        alvoRep.innerHTML = r.video
          ? '<button type="button" data-replay="' + esc(r.video) + '"'
            + ' data-titulo="' + esc(lin.getAttribute('data-corrida') || 'Replay') + '">&#9654; Replay</button>'
          : '';
      }

      var v = veredito(chegada, bateu, pick, outro);
      lin.classList.remove('bateu', 'errou');
      if (v.classe) lin.classList.add(v.classe);
      if (v.aviso && window.console) console.warn('[carga-vip] ' + chave + ' -> ' + v.aviso);
    }
    pintarKpis();
  }

  // ── Painel "Analisar disputa" ──────────────────────────────────────────────
  // Mesmo card da tela Analisar e da /sessao: o svCard() vem de
  // public/js/cardGalgo.js, carregado pela pagina. Aqui so buscamos os dados e
  // desenhamos. Sem copiar a tabela pela terceira vez.
  function fecharDisputa() {
    var m = document.getElementById('gv-modal');
    if (m) m.classList.remove('open');
  }

  function abrirDisputa(hora, corrida, a, b) {
    var modal = document.getElementById('gv-modal');
    var titulo = document.getElementById('gv-title');
    var corpo = document.getElementById('gv-body');
    if (!modal || !corpo) return;
    titulo.textContent = 'T' + a + ' vs T' + b;
    corpo.innerHTML = '<p style="color:#888;font-size:12px;padding:20px;text-align:center">Carregando...</p>';
    modal.classList.add('open');

    var q = '?hora=' + encodeURIComponent(hora) + '&corrida=' + encodeURIComponent(corrida)
          + '&a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b);
    fetch(BASE + '/carga-vip/disputa' + q, { credentials: 'same-origin' })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, texto: t }; }); })
      .then(function (res) {
        var d = null;
        try { d = JSON.parse(res.texto); } catch (e) { /* nao era JSON */ }
        if (!d || d.error) {
          corpo.innerHTML = '<p style="color:#ef4444;font-size:12px;padding:20px;text-align:center">'
            + esc((d && d.error) || ('não consegui carregar (HTTP ' + res.status + ')')) + '</p>';
          return;
        }
        titulo.textContent = 'T' + d.a.trap + ' ' + (limpaNome(d.a.nome) || '?')
          + ' vs T' + d.b.trap + ' ' + (limpaNome(d.b.nome) || '?')
          + (d.corrida ? '  \u00b7  ' + d.corrida : '');
        // svCard ja trata hist vazio com "Sem histórico". Se o arquivo do card
        // nao tiver carregado, avisa em vez de estourar erro no console.
        if (typeof svCard !== 'function') {
          corpo.innerHTML = '<p style="color:#ef4444;font-size:12px;padding:20px;text-align:center">O card de histórico não carregou. Recarregue a página.</p>';
          return;
        }
        corpo.innerHTML = svCard(d.a.trap, limpaNome(d.a.nome), d.a.perfil, d.a.hist)
          + '<div class="sv-sep"></div>'
          + svCard(d.b.trap, limpaNome(d.b.nome), d.b.perfil, d.b.hist);
      })
      .catch(function (e) {
        corpo.innerHTML = '<p style="color:#ef4444;font-size:12px;padding:20px;text-align:center">Erro de conexão: ' + esc(e.message) + '</p>';
      });
  }

  function abrirReplay(url, titulo) {
    var m = document.getElementById('rv-modal');
    if (!m || !url) return;
    document.getElementById('rv-title').textContent = '\u25B6 ' + (titulo || 'Replay');
    document.getElementById('rv-newtab').href = url;
    document.getElementById('rv-frame').src = url;
    m.classList.add('open');
  }
  function fecharReplay() {
    var m = document.getElementById('rv-modal');
    if (!m) return;
    m.classList.remove('open');
    // Zera o src ao fechar: sem isso o video continua tocando por tras.
    document.getElementById('rv-frame').src = 'about:blank';
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t) return;
    if (t.id === 'rv-xbtn' || t.id === 'rv-modal') { fecharReplay(); return; }
    var rep = t.closest ? t.closest('[data-replay]') : null;
    if (rep) {
      ev.preventDefault();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      ev.stopPropagation();
      abrirReplay(rep.getAttribute('data-replay'), rep.getAttribute('data-titulo'));
      return;
    }
    if (t.id === 'gv-xbtn' || t.id === 'gv-modal') { fecharDisputa(); return; }
    var btn = t.closest ? t.closest('[data-disputa]') : null;
    if (!btn) return;
    // Impede que o clique caia tambem na delegacao da linha, que navega pra
    // Analisar. stopPropagation() NAO basta: os dois listeners estao no mesmo
    // nó (document), e stopPropagation so barra a subida pros nós de cima.
    // Quem barra outro listener do mesmo nó e' stopImmediatePropagation.
    ev.preventDefault();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    ev.stopPropagation();
    var lin = btn.closest('.vip-lin');
    if (!lin) return;
    abrirDisputa(lin.getAttribute('data-hora'), lin.getAttribute('data-corrida'),
      btn.getAttribute('data-a'), btn.getAttribute('data-b'));
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { fecharDisputa(); fecharReplay(); }
  });

  // Delegacao em vez de onclick inline: nome de galgo com apostrofo (comum)
  // quebraria o atributo.
  document.addEventListener('click', function (ev) {
    // O botao "Analisar disputa" e' um <a> de verdade: deixa o navegador levar.
    // Sem esta linha o clique nele cairia aqui tambem e a navegacao aconteceria
    // duas vezes.
    if (ev.target && ev.target.closest
        && (ev.target.closest('.vip-acao') || ev.target.closest('.vip-replay'))) return;
    var lin = ev.target && ev.target.closest ? ev.target.closest('.vip-lin') : null;
    if (!lin) return;
    var hora = lin.getAttribute('data-hora') || '';
    var corrida = lin.getAttribute('data-corrida') || '';
    location.href = BASE + '/?vip=' + encodeURIComponent(hora + '|' + corrida);
  });

  carregar();
})();