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

    // O aviso vem ANTES da lista de proposito: depois dela, com os numeros ja
    // lidos, vira rodape que ninguem le.
    var aviso = '<div class="vip-aviso">'
      + '<strong>Isto é um filtro de valor, não uma previsão.</strong> As taxas abaixo são o histórico deste '
      + 'filtro em corridas parecidas, não são a chance desta corrida específica. '
      + 'Corrida a corrida, qualquer uma pode perder.'
      + (d.aviso ? '<div style="margin-top:6px;color:#a3894a">' + esc(d.aviso) + '</div>' : '')
      + '</div>';

    // Legenda dos niveis: "niveis" e' um OBJETO por nivel ({criterio,
    // taxa_historica_pct}). Como cada linha ja mostra a taxa, aqui fica so o
    // CRITERIO, que e' o que a linha nao diz.
    var legenda = '';
    if (d.niveis && typeof d.niveis === 'object') {
      var partes = Object.keys(d.niveis).map(function (k) {
        var v = d.niveis[k] || {};
        var crit = (typeof v === 'object') ? v.criterio : v;
        if (!crit) return '';
        var cor = k.toLowerCase() === 'premium' ? '#eab308' : '#22c55e';
        return '<strong style="color:' + cor + '">' + esc(k) + '</strong>: ' + esc(crit);
      }).filter(Boolean);
      if (partes.length) legenda = '<div class="vip-legenda">' + partes.join('<br>') + '</div>';
    }

    if (!ent.length) {
      alvo.innerHTML = aviso + legenda
        + '<div class="vip-box" style="padding:30px 22px;text-align:center;color:#888;font-size:13px">'
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

      var nums = [];
      if (e.categoria) nums.push(esc(e.categoria));
      if (e.ratio_odd != null) nums.push('odd ' + esc(e.ratio_odd));
      if (e.dt_caltm != null) nums.push('&Delta;t ' + esc(e.dt_caltm));

      // Motivo do skip so aqui, na lista: e' onde voce decide se vale entrar.
      // Na Analisar o Bruno nao quer (pediria atencao no momento errado).
      var skipTag = e.skip
        ? '<div class="vip-skip">&#9888; ' + esc(MOTIVOS[e.skip_motivo] || ('skip: ' + (e.skip_motivo || 'motivo não informado'))) + '</div>'
        : '';

      var uk = e.hora || '';
      var br = e.hora_br || (uk ? horaBr(uk) : '');

      return '<div class="vip-lin' + (e.skip ? ' tem-skip' : '') + '"'
        + ' data-hora="' + esc(e.hora || '') + '" data-corrida="' + esc(e.corrida || '') + '"'
        + ' title="Clique para abrir esta corrida na tela Analisar">'
        // Hora nas duas linhas, no formato do Historico: BR grande, UK menor.
        + '<div class="vip-hora">'
        + '<div class="br">' + esc(br || uk || '-') + '</div>'
        + (br && uk && br !== uk ? '<div class="uk">' + esc(uk) + '</div>' : '')
        + '</div>'
        + '<div class="vip-meio">'
        + '<div class="par">T' + esc(e.pick_trap) + ' ' + esc(limpaNome(e.pick_nome))
        + ' <span class="vence">vence</span> T' + esc(e.outro_trap) + ' ' + esc(limpaNome(e.outro_nome)) + '</div>'
        + '<div class="det">' + esc(e.corrida || '') + (e.dist ? ' \u00b7 ' + esc(e.dist) : '') + (nums.length ? ' \u00b7 ' + nums.join(' \u00b7 ') : '') + '</div>'
        + (selos.length ? '<div class="selos">' + esc(selos.join(' \u00b7 ')) + '</div>' : '')
        + skipTag
        + '</div>'
        + '<div class="vip-taxa">'
        + '<div class="nivel" style="color:' + cor + '">' + esc(e.nivel || '') + '</div>'
        + (taxa != null
          ? '<div class="pct" style="color:' + cor + '">~' + esc(taxa) + '%</div><div class="rot">histórico do filtro</div>'
          : '')
        + '</div>'
        + '</div>';
    }).join('');

    alvo.innerHTML = aviso + legenda
      + '<div class="vip-box">' + linhas + '</div>'
      + '<div class="vip-rodape">Clique numa corrida para abri-la na tela Analisar.</div>';
  }

  // Delegacao em vez de onclick inline: nome de galgo com apostrofo (comum)
  // quebraria o atributo.
  document.addEventListener('click', function (ev) {
    var lin = ev.target && ev.target.closest ? ev.target.closest('.vip-lin') : null;
    if (!lin) return;
    var hora = lin.getAttribute('data-hora') || '';
    var corrida = lin.getAttribute('data-corrida') || '';
    location.href = BASE + '/?vip=' + encodeURIComponent(hora + '|' + corrida);
  });

  carregar();
})();